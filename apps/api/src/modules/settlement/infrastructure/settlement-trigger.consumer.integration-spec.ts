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
import { NullOutboxPort } from '@src/platform/persistence/outbox.port';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { SagaInstanceEntity } from '@src/modules/settlement/infrastructure/saga-instance.entity';
import { SagaRepository } from '@src/modules/settlement/infrastructure/saga.repository';
import { SettlementTriggerConsumer } from '@src/modules/settlement/infrastructure/settlement-trigger.consumer';
import { SagaStatus, SagaStep } from '@src/modules/settlement/domain/saga';

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

describe('SettlementTriggerConsumer (integration)', () => {
  let pg: StartedPostgreSqlContainer;
  let rmq: StartedRabbitMQContainer;
  let dataSource: DataSource;
  let connection: amqp.AmqpConnectionManager;
  let publisher: Publisher;
  let sagas: SagaRepository;
  let uow: UnitOfWork;
  let consumer: SettlementTriggerConsumer;

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
      entities: [SagaInstanceEntity],
      synchronize: true,
    });
    await dataSource.initialize();

    connection = amqp.connect([rmq.getAmqpUrl()]);
    await connection.connect();
    publisher = new Publisher(connection);

    sagas = new SagaRepository(dataSource);
    uow = new UnitOfWork(dataSource, new NullOutboxPort());

    consumer = new SettlementTriggerConsumer(
      connection,
      publisher,
      fastConfig,
      new NullDedupPort(),
      uow,
      sagas,
    );
    await consumer.onModuleInit();
  }, 180_000);

  afterAll(async () => {
    await connection.close();
    await dataSource.destroy();
    await Promise.all([pg.stop(), rmq.stop()]);
  });

  it('lot.closed creates a saga instance at the first step', async () => {
    const lotId = randomUUID();
    const closeAt = new Date().toISOString();

    await publisher.publish(
      Exchanges.events,
      RoutingKeys.lotClosed,
      { lotId, closeAt },
      { messageId: randomUUID() },
    );

    let saga = await sagas.findByLotId(lotId);
    await waitFor(async () => {
      saga = await sagas.findByLotId(lotId);
      return saga !== null;
    }, 10_000);

    expect(saga?.step).toBe(SagaStep.Lock);
    expect(saga?.status).toBe(SagaStatus.Running);
    expect(saga?.attempts).toBe(0);
    expect(saga?.payload).toEqual({ closeAt });
  }, 30_000);

  it('redelivery of the same messageId does not create a second saga row', async () => {
    const lotId = randomUUID();
    const closeAt = new Date().toISOString();
    const messageId = randomUUID();

    await publisher.publish(
      Exchanges.events,
      RoutingKeys.lotClosed,
      { lotId, closeAt },
      { messageId },
    );

    await waitFor(
      async () => (await sagas.findByLotId(lotId)) !== null,
      10_000,
    );

    await publisher.publish(
      Exchanges.events,
      RoutingKeys.lotClosed,
      { lotId, closeAt },
      { messageId },
    );
    await sleep(1_000);

    const rows = await dataSource
      .getRepository(SagaInstanceEntity)
      .findBy({ lotId });
    expect(rows).toHaveLength(1);
  }, 30_000);
});
