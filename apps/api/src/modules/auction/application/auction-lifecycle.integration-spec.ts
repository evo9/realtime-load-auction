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
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import type { AppConfigService } from '@src/config/app-config.service';
import { Exchanges } from '@src/platform/messaging/messaging.constants';
import { Publisher } from '@src/platform/messaging/publisher';
import { OutboxEntity } from '@src/platform/outbox/outbox.entity';
import { OutboxRelay } from '@src/platform/outbox/outbox.relay';
import { OutboxRepository } from '@src/platform/outbox/outbox.repository';
import { OutboxService } from '@src/platform/outbox/outbox.service';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { CasService } from '@src/platform/redis/cas.service';
import { LockService } from '@src/platform/redis/lock.service';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { SchedulerTicker } from '@src/platform/scheduler/scheduler.ticker';
import { ZSetScheduler } from '@src/platform/scheduler/zset-scheduler';
import { LotEntity } from '@src/modules/auction/infrastructure/lot.entity';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';
import { AuctionSchedulerDispatcher } from '@src/modules/auction/infrastructure/auction-scheduler.dispatcher';
import { CreateLotHandler } from '@src/modules/auction/application/create-lot.handler';
import { OpenLotHandler } from '@src/modules/auction/application/open-lot.handler';
import { CloseLotHandler } from '@src/modules/auction/application/close-lot.handler';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  predicate: () => Promise<boolean>,
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

function fakeSchedulerConfig(tickIntervalMs: number): AppConfigService {
  return {
    scheduler: { tickIntervalMs, batchSize: 100, retryDelayMs: 2000 },
  } as unknown as AppConfigService;
}

function fakeOutboxConfig(pollIntervalMs: number): AppConfigService {
  return {
    outbox: { pollIntervalMs, batchSize: 100 },
  } as unknown as AppConfigService;
}

describe('auction lot lifecycle (integration)', () => {
  let pg: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let rmq: StartedRabbitMQContainer;
  let dataSource: DataSource;
  let redis: Redis;
  let connection: amqp.AmqpConnectionManager;
  let publisher: Publisher;
  let consumerChannel: amqp.ChannelWrapper;
  let received: { routingKey: string; payload: { lotId?: string } }[];

  let lots: LotRepository;
  let uow: UnitOfWork;
  let cas: CasService;
  let lock: LockService;
  let scheduler: ZSetScheduler;
  let ticker: SchedulerTicker;
  let relay: OutboxRelay;

  beforeAll(async () => {
    [pg, redisContainer, rmq] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
      new RabbitMQContainer('rabbitmq:3.13-management-alpine').start(),
    ]);

    dataSource = new DataSource({
      type: 'postgres',
      host: pg.getHost(),
      port: pg.getMappedPort(5432),
      username: pg.getUsername(),
      password: pg.getPassword(),
      database: pg.getDatabase(),
      entities: [LotEntity, OutboxEntity],
      synchronize: true,
    });
    await dataSource.initialize();

    redis = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
    });

    connection = amqp.connect([rmq.getAmqpUrl()]);
    await connection.connect();
    publisher = new Publisher(connection);

    received = [];
    consumerChannel = connection.createChannel({
      json: false,
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(Exchanges.events, 'topic', { durable: true });
        const q = await ch.assertQueue('', {
          exclusive: true,
          autoDelete: true,
        });
        for (const key of ['lot.opened', 'lot.closing', 'lot.closed']) {
          await ch.bindQueue(q.queue, Exchanges.events, key);
        }
        await ch.consume(q.queue, (msg: ConsumeMessage | null) => {
          if (!msg) return;
          received.push({
            routingKey: msg.fields.routingKey,
            payload: JSON.parse(msg.content.toString('utf8')) as {
              lotId?: string;
            },
          });
          ch.ack(msg);
        });
      },
    });
    await consumerChannel.waitForConnect();

    lots = new LotRepository(dataSource);
    uow = new UnitOfWork(dataSource, new OutboxService());
    cas = new CasService(redis);
    lock = new LockService(redis);
    scheduler = new ZSetScheduler(redis);

    const openLot = new OpenLotHandler(uow, lots, cas);
    const closeLot = new CloseLotHandler(uow, lots, cas, scheduler, lock);
    const dispatcher = new AuctionSchedulerDispatcher(openLot, closeLot);

    ticker = new SchedulerTicker(
      scheduler,
      fakeSchedulerConfig(150),
      dispatcher,
    );
    relay = new OutboxRelay(
      dataSource,
      new OutboxRepository(),
      publisher,
      fakeOutboxConfig(100),
    );

    ticker.onModuleInit();
    relay.onModuleInit();
  }, 180_000);

  afterAll(async () => {
    ticker.onModuleDestroy();
    relay.onModuleDestroy();
    await consumerChannel.close();
    await connection.close();
    await redis.quit();
    await dataSource.destroy();
    await Promise.all([pg.stop(), redisContainer.stop(), rmq.stop()]);
  });

  it('opens then closes a scheduled lot on its own timers, reconciling Redis status and publishing outbox events', async () => {
    const createLot = new CreateLotHandler(uow, lots, scheduler);
    const now = Date.now();

    const lot = await createLot.execute({
      shipperId: randomUUID(),
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      equipmentType: 'van',
      weightKg: 12000,
      pickupWindow: {
        from: new Date(now + 3_600_000),
        to: new Date(now + 7_200_000),
      },
      reservePrice: 150000,
      openAt: new Date(now + 1_000),
      closeAt: new Date(now + 2_500),
      antiSnipeWindowSec: 0,
    });

    const statusesSeen = new Set<string>();

    await waitFor(async () => {
      const status = await redis.get(RedisKeys.lotStatus(lot.id));
      if (status) statusesSeen.add(status);
      const row = await dataSource
        .getRepository(LotEntity)
        .findOneBy({ id: lot.id });
      return row?.status === 'closing';
    }, 20_000);

    expect(statusesSeen.has('open')).toBe(true);

    // The DB commit and the Redis status write happen in that order inside
    // CloseLotHandler, so there's a brief gap after the DB flips to 'closing'
    // before Redis catches up — poll it separately instead of relying on
    // catching both in the same iteration above.
    await waitFor(
      async () => {
        const status = await redis.get(RedisKeys.lotStatus(lot.id));
        if (status) statusesSeen.add(status);
        return status === 'closing';
      },
      2_000,
      20,
    );

    expect(statusesSeen.has('closing')).toBe(true);

    await waitFor(
      () =>
        Promise.resolve(
          received.filter((m) => m.payload.lotId === lot.id).length >= 3,
        ),
      10_000,
    );

    const events = received.filter((m) => m.payload.lotId === lot.id);
    expect(events.map((e) => e.routingKey).sort()).toEqual(
      ['lot.closed', 'lot.closing', 'lot.opened'].sort(),
    );
  }, 40_000);
});
