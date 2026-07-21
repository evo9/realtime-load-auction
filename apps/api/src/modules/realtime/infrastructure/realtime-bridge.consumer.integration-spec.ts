import { randomUUID } from 'node:crypto';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import * as amqp from 'amqp-connection-manager';
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
import { RealtimeBridgeConsumer } from '@src/modules/realtime/infrastructure/realtime-bridge.consumer';
import type { RealtimeEnvelope } from '@src/modules/realtime/domain/realtime-event';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
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

describe('RealtimeBridgeConsumer (integration)', () => {
  let rmq: StartedRabbitMQContainer;
  let redisContainer: StartedRedisContainer;
  let connection: amqp.AmqpConnectionManager;
  let publisher: Publisher;
  let redisClient: Redis;
  let pubSub: PubSub;
  let consumer: RealtimeBridgeConsumer;

  beforeAll(async () => {
    [rmq, redisContainer] = await Promise.all([
      new RabbitMQContainer('rabbitmq:3.13-management-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);

    connection = amqp.connect([rmq.getAmqpUrl()]);
    await connection.connect();
    publisher = new Publisher(connection);

    redisClient = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
    });
    pubSub = new PubSub(redisClient);

    consumer = new RealtimeBridgeConsumer(
      connection,
      publisher,
      fastConfig,
      new NullDedupPort(),
      pubSub,
    );
    await consumer.onModuleInit();
  }, 180_000);

  afterAll(async () => {
    await pubSub.onModuleDestroy();
    await redisClient.quit();
    await connection.close();
    await Promise.all([rmq.stop(), redisContainer.stop()]);
  });

  it('bridges a bid.placed event from RabbitMQ onto the lot channel in Redis Pub/Sub', async () => {
    const lotId = randomUUID();
    const payload = {
      lotId,
      bidId: randomUUID(),
      carrierId: randomUUID(),
      amount: 90000,
      createdAt: new Date().toISOString(),
    };

    const received: RealtimeEnvelope[] = [];
    const unsubscribe = await pubSub.subscribe<RealtimeEnvelope>(
      RedisKeys.lotChannel(lotId),
      (envelope) => {
        received.push(envelope);
      },
    );

    await publisher.publish(Exchanges.events, RoutingKeys.bidPlaced, payload, {
      messageId: randomUUID(),
    });

    await waitFor(() => received.length > 0, 10_000);

    expect(received[0]).toEqual({
      type: RoutingKeys.bidPlaced,
      lotId,
      payload,
    });

    await unsubscribe();
  }, 20_000);

  it('skips a payload with no lotId instead of publishing to a bogus channel', async () => {
    const received: RealtimeEnvelope[] = [];
    const unsubscribe = await pubSub.subscribe<RealtimeEnvelope>(
      'lot:undefined:channel',
      (envelope) => {
        received.push(envelope);
      },
    );

    await publisher.publish(
      Exchanges.events,
      RoutingKeys.settlementCompleted,
      { foo: 'bar' },
      { messageId: randomUUID() },
    );

    // no lotId in the payload means nothing to wait for succeeding — give the
    // consumer a fair window to (wrongly) publish before asserting it didn't
    await sleep(500);
    expect(received).toHaveLength(0);

    await unsubscribe();
  }, 20_000);
});
