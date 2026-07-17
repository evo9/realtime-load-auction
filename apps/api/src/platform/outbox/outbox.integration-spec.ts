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
import { Column, DataSource, Entity, In, PrimaryColumn } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type { AppConfigService } from '@src/config/app-config.service';
import {
  BaseConsumer,
  RmqMessage,
} from '@src/platform/messaging/base.consumer';
import { NullDedupPort } from '@src/platform/messaging/dedup.port';
import { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import { Queues } from '@src/platform/messaging/messaging.constants';
import { Publisher } from '@src/platform/messaging/publisher';
import { OutboxEntity } from './outbox.entity';
import { OutboxRelay } from './outbox.relay';
import { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';

@Entity('outbox_test_probe')
class TestProbe {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  label!: string;
}

const testMessagingConfig: MessagingConfig = {
  prefetch: 10,
  retryLimit: 3,
  retryBaseTtlMs: 5000,
  retryMultiplier: 3,
  retryMaxTtlMs: 60_000,
};

function fakeOutboxConfig(batchSize: number): AppConfigService {
  return {
    outbox: { pollIntervalMs: 1_000_000, batchSize },
  } as unknown as AppConfigService;
}

function insertRow(
  id: string,
  routingKey = 'bid.placed',
): QueryDeepPartialEntity<OutboxEntity> {
  return { id, routingKey, payload: { id } };
}

class RecordingConsumer extends BaseConsumer {
  protected readonly queue = Queues.notification;
  protected readonly prefetch = 10;
  readonly received: RmqMessage[] = [];
  private readonly waiters: Array<{ count: number; resolve: () => void }> = [];

  constructor(connection: amqp.AmqpConnectionManager, publisher: Publisher) {
    super(connection, publisher, testMessagingConfig, new NullDedupPort());
  }

  protected process(msg: RmqMessage): Promise<void> {
    this.received.push(msg);
    for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
      if (this.received.length >= this.waiters[i].count) {
        this.waiters[i].resolve();
        this.waiters.splice(i, 1);
      }
    }
    return Promise.resolve();
  }

  waitForCount(count: number, timeoutMs = 10_000): Promise<void> {
    if (this.received.length >= count) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `timed out waiting for ${count} messages, got ${this.received.length}`,
          ),
        );
      }, timeoutMs);
      this.waiters.push({
        count,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
  }
}

describe('outbox relay (integration)', () => {
  let pg: StartedPostgreSqlContainer;
  let rmq: StartedRabbitMQContainer;
  let dataSource: DataSource;
  let connection: amqp.AmqpConnectionManager;
  let publisher: Publisher;
  let consumer: RecordingConsumer;
  let outboxService: OutboxService;
  let repository: OutboxRepository;
  let relay: OutboxRelay;

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
      entities: [OutboxEntity, TestProbe],
      synchronize: true,
    });
    await dataSource.initialize();

    connection = amqp.connect([rmq.getAmqpUrl()]);
    await connection.connect();
    publisher = new Publisher(connection);

    consumer = new RecordingConsumer(connection, publisher);
    await consumer.onModuleInit();

    outboxService = new OutboxService();
    repository = new OutboxRepository();
    relay = new OutboxRelay(
      dataSource,
      repository,
      publisher,
      fakeOutboxConfig(100),
    );
  }, 120_000);

  afterAll(async () => {
    await dataSource.destroy();
    await connection.close();
    await pg.stop();
    await rmq.stop();
  });

  it('does not persist the outbox row when the surrounding transaction rolls back', async () => {
    const id = randomUUID();

    await expect(
      dataSource.transaction(async (manager) => {
        await manager.insert(TestProbe, { id, label: 'atomic' });
        await outboxService.add(manager, 'bid.placed', { foo: 'atomic' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const probeRow = await dataSource
      .getRepository(TestProbe)
      .findOneBy({ id });
    expect(probeRow).toBeNull();

    const outboxRow = await dataSource
      .getRepository(OutboxEntity)
      .findOneBy({ id });
    expect(outboxRow).toBeNull();
  });

  it('publishes each unpublished row exactly once and marks it published', async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await dataSource.manager.insert(
      OutboxEntity,
      ids.map((id) => insertRow(id)),
    );

    const before = consumer.received.length;
    await relay.tick();
    await consumer.waitForCount(before + 3);

    const receivedIds = consumer.received
      .slice(before)
      .map((m) => m.messageId)
      .sort();
    expect(receivedIds).toEqual([...ids].sort());

    const rows = await dataSource
      .getRepository(OutboxEntity)
      .findBy({ id: In(ids) });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.publishedAt !== null)).toBe(true);
  });

  it('keeps a row unpublished when markPublished fails and republishes it on the next tick (at-least-once)', async () => {
    const id = randomUUID();
    await dataSource.manager.insert(OutboxEntity, insertRow(id));

    const before = consumer.received.length;
    const markPublishedSpy = jest
      .spyOn(repository, 'markPublished')
      .mockImplementationOnce(() => {
        throw new Error('boom-mark-published');
      });

    // publish succeeds and reaches the broker, but markPublished throws
    // before published_at is persisted — the row is picked up again on the
    // next tick, so the consumer ends up seeing it twice (at-least-once).
    await relay.tick();
    await consumer.waitForCount(before + 1);

    let row = await dataSource.getRepository(OutboxEntity).findOneBy({ id });
    expect(row?.publishedAt).toBeNull();

    await relay.tick();
    await consumer.waitForCount(before + 2);

    row = await dataSource.getRepository(OutboxEntity).findOneBy({ id });
    expect(row?.publishedAt).not.toBeNull();

    const deliveries = consumer.received
      .slice(before)
      .filter((m) => m.messageId === id);
    expect(deliveries).toHaveLength(2);

    markPublishedSpy.mockRestore();
  });

  it('does not produce duplicate deliveries when two relays tick concurrently', async () => {
    const ids = Array.from({ length: 5 }, () => randomUUID());
    await dataSource.manager.insert(
      OutboxEntity,
      ids.map((id) => insertRow(id)),
    );

    // Two independent relay instances (standing in for two app processes)
    // race on the same batch — FOR UPDATE SKIP LOCKED, held for the whole
    // fetch+publish+mark transaction, is what keeps them from both claiming
    // the same row. A single relay's own `ticking` guard would trivially
    // serialize two calls on itself, so it can't exercise that path.
    const relayA = new OutboxRelay(
      dataSource,
      new OutboxRepository(),
      publisher,
      fakeOutboxConfig(10),
    );
    const relayB = new OutboxRelay(
      dataSource,
      new OutboxRepository(),
      publisher,
      fakeOutboxConfig(10),
    );

    const before = consumer.received.length;
    await Promise.all([relayA.tick(), relayB.tick()]);
    await consumer.waitForCount(before + 5);

    const deliveredIds = consumer.received
      .slice(before)
      .map((m) => m.messageId);
    expect(deliveredIds.sort()).toEqual([...ids].sort());
    expect(new Set(deliveredIds).size).toBe(5);

    const rows = await dataSource
      .getRepository(OutboxEntity)
      .findBy({ id: In(ids) });
    expect(rows.every((r) => r.publishedAt !== null)).toBe(true);
  });
});
