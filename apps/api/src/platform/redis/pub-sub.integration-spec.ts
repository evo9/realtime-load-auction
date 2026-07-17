import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { PubSub } from '@src/platform/redis/pub-sub';

describe('PubSub (integration)', () => {
  let container: StartedRedisContainer;
  let client: Redis;
  let pubSub: PubSub;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    client = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
    });
    pubSub = new PubSub(client);
  }, 60_000);

  afterAll(async () => {
    await pubSub.onModuleDestroy();
    await client.quit();
    await container.stop();
  });

  it('delivers published payloads to a subscribed handler', async () => {
    const channel = 'pubsub:delivers';
    const message = { lotId: 'lot-1', amount: 100 };

    let resolveReceived!: (payload: unknown) => void;
    const received = new Promise((resolve) => {
      resolveReceived = resolve;
    });

    await pubSub.subscribe(channel, resolveReceived);
    await pubSub.publish(channel, message);

    await expect(received).resolves.toEqual(message);
  });

  it('stops delivering to a handler after it unsubscribes', async () => {
    const channel = 'pubsub:unsubscribe';
    let callCount = 0;

    const unsubscribe = await pubSub.subscribe(channel, () => {
      callCount += 1;
    });
    await unsubscribe();

    await pubSub.publish(channel, { ping: true });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(callCount).toBe(0);
  });
});
