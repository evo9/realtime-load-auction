import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { RateLimiter } from '@src/platform/redis/rate-limiter';

describe('RateLimiter (integration)', () => {
  let container: StartedRedisContainer;
  let client: Redis;
  let rateLimiter: RateLimiter;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    client = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
    });
    rateLimiter = new RateLimiter(client);
  }, 60_000);

  afterAll(async () => {
    await client.quit();
    await container.stop();
  });

  it('allows hits under the limit within the window, then blocks, then resets after the window passes', async () => {
    const key = 'ratelimit:sliding-window';
    const opts = { limit: 3, windowMs: 200 };

    await expect(rateLimiter.hit(key, opts)).resolves.toEqual({
      allowed: true,
      remaining: 2,
    });
    await expect(rateLimiter.hit(key, opts)).resolves.toEqual({
      allowed: true,
      remaining: 1,
    });
    await expect(rateLimiter.hit(key, opts)).resolves.toEqual({
      allowed: true,
      remaining: 0,
    });
    await expect(rateLimiter.hit(key, opts)).resolves.toEqual({
      allowed: false,
      remaining: 0,
    });

    await new Promise((resolve) => setTimeout(resolve, 250));

    await expect(rateLimiter.hit(key, opts)).resolves.toEqual({
      allowed: true,
      remaining: 2,
    });
  });
});
