import { randomUUID } from 'node:crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import * as amqp from 'amqp-connection-manager';
import { DataSource } from 'typeorm';
import { Publisher } from '@src/platform/messaging/publisher';
import { NullDedupPort } from '@src/platform/messaging/dedup.port';
import { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import {
  Exchanges,
  RoutingKeys,
} from '@src/platform/messaging/messaging.constants';
import { ListingLotEntity } from '@src/modules/listing/infrastructure/listing-lot.entity';
import { ListingLotRepository } from '@src/modules/listing/infrastructure/listing-lot.repository';
import { ListingProjectionConsumer } from '@src/modules/listing/infrastructure/listing-projection.consumer';
import type { LotOpenedPayload } from '@src/modules/listing/domain/listing-lot';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 100,
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

describe('ListingProjectionConsumer (integration)', () => {
  let pg: StartedPostgreSqlContainer;
  let rmq: StartedRabbitMQContainer;
  let dataSource: DataSource;
  let connection: amqp.AmqpConnectionManager;
  let publisher: Publisher;
  let repository: ListingLotRepository;
  let consumer: ListingProjectionConsumer;

  beforeAll(async () => {
    [pg, rmq] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RabbitMQContainer('rabbitmq:3.13-management-alpine').start(),
    ]);

    dataSource = new DataSource({
      type: 'postgres',
      host: pg.getHost(),
      port: pg.getMappedPort(5432),
      username: pg.getUsername(),
      password: pg.getPassword(),
      database: pg.getDatabase(),
      entities: [ListingLotEntity],
      synchronize: true,
    });
    await dataSource.initialize();

    connection = amqp.connect([rmq.getAmqpUrl()]);
    await connection.connect();
    publisher = new Publisher(connection);

    repository = new ListingLotRepository(dataSource);
    consumer = new ListingProjectionConsumer(
      connection,
      publisher,
      fastConfig,
      new NullDedupPort(),
      repository,
    );
    await consumer.onModuleInit();
  }, 180_000);

  afterAll(async () => {
    await connection.close();
    await dataSource.destroy();
    await Promise.all([pg.stop(), rmq.stop()]);
  });

  it('projects lot.opened into listing_lots with status=open', async () => {
    const payload: LotOpenedPayload = {
      lotId: randomUUID(),
      shipperId: randomUUID(),
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      equipmentType: 'van',
      weightKg: 12000,
      reservePrice: 150000,
      targetPrice: 140000,
      openAt: new Date().toISOString(),
      closeAt: new Date(Date.now() + 3_600_000).toISOString(),
    };

    await publisher.publish(Exchanges.events, RoutingKeys.lotOpened, payload, {
      messageId: randomUUID(),
    });

    await waitFor(async () => {
      const row = await dataSource
        .getRepository(ListingLotEntity)
        .findOneBy({ id: payload.lotId });
      return row !== null;
    }, 10_000);

    const row = await dataSource
      .getRepository(ListingLotEntity)
      .findOneByOrFail({ id: payload.lotId });

    expect(row.status).toBe('open');
    expect(row.shipperId).toBe(payload.shipperId);
    expect(row.origin).toBe(payload.origin);
    expect(row.destination).toBe(payload.destination);
    expect(row.equipmentType).toBe(payload.equipmentType);
    expect(row.weightKg).toBe(payload.weightKg);
    expect(row.reservePrice).toBe(payload.reservePrice);
    expect(row.targetPrice).toBe(payload.targetPrice);

    // Anti-snipe extension: closeAt on lot.closed differs from the original
    // lot.opened closeAt, so a rollback on redelivery is observable below.
    const closedCloseAt = new Date(
      new Date(payload.closeAt).getTime() + 900_000,
    ).toISOString();

    await publisher.publish(
      Exchanges.events,
      RoutingKeys.lotClosed,
      { lotId: payload.lotId, closeAt: closedCloseAt },
      { messageId: randomUUID() },
    );

    await waitFor(async () => {
      const closed = await dataSource
        .getRepository(ListingLotEntity)
        .findOneBy({ id: payload.lotId });
      return closed?.status === 'closing';
    }, 10_000);

    const closingCloseAt = await dataSource
      .getRepository(ListingLotEntity)
      .findOneByOrFail({ id: payload.lotId })
      .then((r) => r.closeAt.getTime());
    expect(closingCloseAt).toBe(new Date(closedCloseAt).getTime());

    // Redelivery without a real consumer-level dedup layer: same lotId,
    // different messageId, simulating an at-least-once redelivery. Repository
    // idempotency comes from the upsert-by-PK, not from message dedup.
    await publisher.publish(Exchanges.events, RoutingKeys.lotOpened, payload, {
      messageId: randomUUID(),
    });

    await sleep(1_000);

    const count = await dataSource
      .getRepository(ListingLotEntity)
      .countBy({ id: payload.lotId });
    expect(count).toBe(1);

    const afterRedelivery = await dataSource
      .getRepository(ListingLotEntity)
      .findOneByOrFail({ id: payload.lotId });
    expect(afterRedelivery.shipperId).toBe(payload.shipperId);
    expect(afterRedelivery.origin).toBe(payload.origin);

    // The redelivered lot.opened must not roll a closing lot back to open,
    // and must not restore the pre-close closeAt — status and closeAt only
    // move forward via lot.closed.
    expect(afterRedelivery.status).toBe('closing');
    expect(afterRedelivery.closeAt.getTime()).toBe(closingCloseAt);
  }, 30_000);
});
