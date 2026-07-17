import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';

describe('RedisModule (integration)', () => {
  let container: StartedRedisContainer;
  let client: Redis;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    client = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
    });
  }, 60_000);

  afterAll(async () => {
    await client.quit();
    await container.stop();
  });

  it('connects and responds to ping', async () => {
    await expect(client.ping()).resolves.toBe('PONG');
  });
});
