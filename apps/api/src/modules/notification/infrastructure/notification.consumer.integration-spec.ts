import { randomUUID } from 'node:crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import * as amqp from 'amqp-connection-manager';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import { Publisher } from '@src/platform/messaging/publisher';
import { NullDedupPort } from '@src/platform/messaging/dedup.port';
import { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import {
  Exchanges,
  RoutingKeys,
} from '@src/platform/messaging/messaging.constants';
import { PubSub } from '@src/platform/redis/pub-sub';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { LotEntity } from '@src/modules/auction/infrastructure/lot.entity';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';
import { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';
import { NotificationEntity } from '@src/modules/notification/infrastructure/notification.entity';
import { NotificationLogRepository } from '@src/modules/notification/infrastructure/notification-log.repository';
import { NotificationConsumer } from '@src/modules/notification/infrastructure/notification.consumer';
import type { Notification } from '@src/modules/notification/domain/notification';
import type { RealtimeEnvelope } from '@src/modules/realtime/domain/realtime-event';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error('timed out waiting for condition');
}

const fastConfig: MessagingConfig = {
  prefetch: 10,
  retryLimit: 2,
  retryBaseTtlMs: 150,
  retryMultiplier: 1,
  retryMaxTtlMs: 1000,
};

function makeLotRow(overrides: Partial<LotEntity> = {}): Partial<LotEntity> {
  return {
    id: randomUUID(),
    shipperId: randomUUID(),
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    equipmentType: 'van',
    weightKg: 12000,
    pickupFrom: new Date(Date.now() + 3_600_000),
    pickupTo: new Date(Date.now() + 7_200_000),
    reservePrice: 150000,
    targetPrice: null,
    openAt: new Date(Date.now() - 60_000),
    closeAt: new Date(Date.now() + 3_600_000),
    antiSnipeWindowSec: 0,
    status: 'open',
    winningBidId: null,
    winningAmount: null,
    ...overrides,
  };
}

function makeBidRow(overrides: Partial<BidEntity> = {}): Partial<BidEntity> {
  return {
    id: randomUUID(),
    lotId: randomUUID(),
    carrierId: randomUUID(),
    amount: 100000,
    idempotencyKey: randomUUID(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('NotificationConsumer (integration)', () => {
  let pg: StartedPostgreSqlContainer;
  let rmq: StartedRabbitMQContainer;
  let redisContainer: StartedRedisContainer;
  let dataSource: DataSource;
  let redisClient: Redis;
  let connection: amqp.AmqpConnectionManager;
  let publisher: Publisher;
  let pubSub: PubSub;
  let lots: LotRepository;
  let bids: BidRepository;
  let log: NotificationLogRepository;
  let consumer: NotificationConsumer;

  beforeAll(async () => {
    [pg, rmq, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RabbitMQContainer('rabbitmq:3.13-management-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);

    dataSource = new DataSource({
      type: 'postgres',
      host: pg.getHost(),
      port: pg.getMappedPort(5432),
      username: pg.getUsername(),
      password: pg.getPassword(),
      database: pg.getDatabase(),
      entities: [LotEntity, BidEntity, NotificationEntity],
      synchronize: true,
    });
    await dataSource.initialize();

    redisClient = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
    });
    pubSub = new PubSub(redisClient);

    connection = amqp.connect([rmq.getAmqpUrl()]);
    await connection.connect();
    publisher = new Publisher(connection);

    lots = new LotRepository(dataSource);
    bids = new BidRepository(dataSource);
    log = new NotificationLogRepository(dataSource);

    consumer = new NotificationConsumer(
      connection,
      publisher,
      fastConfig,
      new NullDedupPort(),
      pubSub,
      log,
      lots,
      bids,
    );
    await consumer.onModuleInit();
  }, 180_000);

  afterAll(async () => {
    await pubSub.onModuleDestroy();
    await redisClient.quit();
    await connection.close();
    await dataSource.destroy();
    await Promise.all([pg.stop(), rmq.stop(), redisContainer.stop()]);
  });

  it('bid.placed with an existing leader notifies the shipper (new_bid) and the outbid carrier, and dedups on redelivery', async () => {
    const lotRow = makeLotRow();
    await dataSource.getRepository(LotEntity).insert(lotRow);

    const carrierA = randomUUID();
    const existingBid = makeBidRow({
      lotId: lotRow.id,
      carrierId: carrierA,
      amount: 100000,
    });
    await dataSource.getRepository(BidEntity).insert(existingBid);

    const received: RealtimeEnvelope[] = [];
    const unsubscribe = await pubSub.subscribe<RealtimeEnvelope>(
      RedisKeys.lotChannel(lotRow.id as string),
      (envelope) => {
        received.push(envelope);
      },
    );

    const bidPayload = {
      lotId: lotRow.id as string,
      bidId: randomUUID(),
      carrierId: randomUUID(),
      amount: 90000,
      createdAt: new Date().toISOString(),
    };
    const messageId = randomUUID();
    await publisher.publish(
      Exchanges.events,
      RoutingKeys.bidPlaced,
      bidPayload,
      { messageId },
    );

    await waitFor(() => received.length >= 2, 10_000);

    const notificationTypes = received
      .map((e) => (e.payload as Notification).type)
      .sort();
    expect(notificationTypes).toEqual(['new_bid', 'outbid']);
    expect(received.every((e) => e.type === 'notification')).toBe(true);
    expect(received.every((e) => e.lotId === (lotRow.id as string))).toBe(true);

    const newBidEnvelope = received.find(
      (e) => (e.payload as Notification).type === 'new_bid',
    );
    expect((newBidEnvelope?.payload as Notification).recipientId).toBe(
      lotRow.shipperId,
    );
    const outbidEnvelope = received.find(
      (e) => (e.payload as Notification).type === 'outbid',
    );
    expect((outbidEnvelope?.payload as Notification).recipientId).toBe(
      carrierA,
    );

    await waitFor(async () => {
      const count = await log.countByMessage(messageId);
      return count === 2;
    }, 10_000);
    await expect(log.countByMessage(messageId)).resolves.toBe(2);

    // Redelivery of the same messageId must not duplicate the two rows.
    await publisher.publish(
      Exchanges.events,
      RoutingKeys.bidPlaced,
      bidPayload,
      { messageId },
    );
    await sleep(1_000);
    await expect(log.countByMessage(messageId)).resolves.toBe(2);

    await unsubscribe();
  }, 30_000);

  it('bid.placed with no existing bids only notifies the shipper (new_bid)', async () => {
    const lotRow = makeLotRow();
    await dataSource.getRepository(LotEntity).insert(lotRow);

    const bidPayload = {
      lotId: lotRow.id as string,
      bidId: randomUUID(),
      carrierId: randomUUID(),
      amount: 120000,
      createdAt: new Date().toISOString(),
    };
    const messageId = randomUUID();
    await publisher.publish(
      Exchanges.events,
      RoutingKeys.bidPlaced,
      bidPayload,
      { messageId },
    );

    await waitFor(async () => {
      const count = await log.countByMessage(messageId);
      return count === 1;
    }, 10_000);

    const rows = await dataSource
      .getRepository(NotificationEntity)
      .findBy({ messageId });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('new_bid');
    expect(rows[0].recipientId).toBe(lotRow.shipperId);
  }, 20_000);

  it('lot.closed notifies the shipper exactly once', async () => {
    const lotRow = makeLotRow();
    await dataSource.getRepository(LotEntity).insert(lotRow);

    const closedPayload = {
      lotId: lotRow.id as string,
      closeAt: new Date().toISOString(),
    };
    const messageId = randomUUID();
    await publisher.publish(
      Exchanges.events,
      RoutingKeys.lotClosed,
      closedPayload,
      { messageId },
    );

    await waitFor(async () => {
      const count = await log.countByMessage(messageId);
      return count === 1;
    }, 10_000);

    const rows = await dataSource
      .getRepository(NotificationEntity)
      .findBy({ messageId });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('lot_closed');
    expect(rows[0].recipientId).toBe(lotRow.shipperId);
  }, 20_000);
});
