import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import * as amqp from 'amqp-connection-manager';
import { Redis } from 'ioredis';
import type { AppConfigService } from '@src/config/app-config.service';
import { RedisDedupPort } from '@src/platform/idempotency/redis-dedup.port';
import { BaseConsumer } from '@src/platform/messaging/base.consumer';
import { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import { Exchanges, Queues } from '@src/platform/messaging/messaging.constants';
import { Publisher } from '@src/platform/messaging/publisher';

// Queues.settlementSteps is bound to the settlementCommands exchange only —
// no overlap with the events-exchange bindings used by the fan-out test's
// still-live consumers, so the two tests can't race on the same messageId
// through unrelated queues sharing a routing key.
const settlementStepRoutingKey = 'settlement.step';

function fakeIdempotencyConfig(): AppConfigService {
  return {
    idempotency: {
      inProgressTtlMs: 30_000,
      doneTtlMs: 600_000,
      msgDedupTtlMs: 900_000,
    },
  } as unknown as AppConfigService;
}

const fastRetryConfig: MessagingConfig = {
  prefetch: 10,
  retryLimit: 2,
  retryBaseTtlMs: 150,
  retryMultiplier: 1,
  retryMaxTtlMs: 1000,
};

class RecordingConsumer extends BaseConsumer {
  protected readonly prefetch = 10;
  processedCalls = 0;

  constructor(
    connection: amqp.AmqpConnectionManager,
    publisher: Publisher,
    protected readonly queue: string,
    dedup: RedisDedupPort,
  ) {
    super(connection, publisher, fastRetryConfig, dedup);
  }

  protected process(): Promise<void> {
    this.processedCalls += 1;
    return Promise.resolve();
  }
}

class FailOnceConsumer extends BaseConsumer {
  protected readonly prefetch = 10;
  processedCalls = 0;
  private failed = false;

  constructor(
    connection: amqp.AmqpConnectionManager,
    publisher: Publisher,
    protected readonly queue: string,
    dedup: RedisDedupPort,
  ) {
    super(connection, publisher, fastRetryConfig, dedup);
  }

  protected process(): Promise<void> {
    this.processedCalls += 1;
    if (!this.failed) {
      this.failed = true;
      return Promise.reject(new Error('boom'));
    }
    return Promise.resolve();
  }
}

describe('BaseConsumer message dedup (integration)', () => {
  let rabbitContainer: StartedRabbitMQContainer;
  let redisContainer: StartedRedisContainer;
  let connection: amqp.AmqpConnectionManager;
  let publisher: Publisher;
  let redisClient: Redis;

  beforeAll(async () => {
    [rabbitContainer, redisContainer] = await Promise.all([
      new RabbitMQContainer('rabbitmq:3.13-management-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);
    connection = amqp.connect([rabbitContainer.getAmqpUrl()]);
    await connection.connect();
    publisher = new Publisher(connection);
    redisClient = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
    });
  }, 120_000);

  afterAll(async () => {
    await redisClient.quit();
    await connection.close();
    await Promise.all([rabbitContainer.stop(), redisContainer.stop()]);
  });

  // A consumer never tears down its channel once onModuleInit() runs, so a
  // queue used by an earlier test keeps a live, competing consumer for the
  // rest of the file. Each of the four topology queues is therefore claimed
  // by exactly one test below — never reused — to keep delivery
  // deterministic instead of racing two consumers on the same queue.
  it('dedups both duplicate delivery and cross-queue fan-out for the same messageId', async () => {
    // lot.closed is bound to notification.q, settlement.q and listing.q — a
    // single outbox row/messageId is delivered to all three. A dedup key
    // scoped only by messageId would let whichever consumer wins the race
    // mark it "seen" first and starve the others. Publishing twice on top of
    // that also proves DoD (iii): redelivery of the same messageId is only
    // processed once per queue.
    const dedup = new RedisDedupPort(redisClient, fakeIdempotencyConfig());
    const notification = new RecordingConsumer(
      connection,
      publisher,
      Queues.notification,
      dedup,
    );
    const settlement = new RecordingConsumer(
      connection,
      publisher,
      Queues.settlement,
      dedup,
    );
    const listing = new RecordingConsumer(
      connection,
      publisher,
      Queues.listing,
      dedup,
    );
    await Promise.all([
      notification.onModuleInit(),
      settlement.onModuleInit(),
      listing.onModuleInit(),
    ]);

    const messageId = 'dedup-fanout-1';
    await publisher.publish(
      Exchanges.events,
      'lot.closed',
      { n: 1 },
      { messageId },
    );
    await publisher.publish(
      Exchanges.events,
      'lot.closed',
      { n: 1 },
      { messageId },
    );

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(notification.processedCalls).toBe(1);
    expect(settlement.processedCalls).toBe(1);
    expect(listing.processedCalls).toBe(1);
  }, 20_000);

  it('still processes the message after a failed attempt is retried with the same messageId', async () => {
    const dedup = new RedisDedupPort(redisClient, fakeIdempotencyConfig());
    const consumer = new FailOnceConsumer(
      connection,
      publisher,
      Queues.settlementSteps,
      dedup,
    );
    await consumer.onModuleInit();

    const messageId = 'dedup-retry-1';
    await publisher.publish(
      Exchanges.settlementCommands,
      settlementStepRoutingKey,
      { n: 1 },
      { messageId },
    );

    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(consumer.processedCalls).toBe(2);
    await expect(dedup.seen(Queues.settlementSteps, messageId)).resolves.toBe(
      true,
    );
  }, 20_000);
});
