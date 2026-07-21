import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { LockService } from '@src/platform/redis/lock.service';

describe('LockService (integration)', () => {
  let container: StartedRedisContainer;
  let client: Redis;
  let locks: LockService;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    client = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
    });
    locks = new LockService(client);
  }, 60_000);

  afterAll(async () => {
    await client.quit();
    await container.stop();
  });

  it('grants a lock to exactly one of two concurrent acquirers', async () => {
    const key = 'lock:concurrent';

    const [a, b] = await Promise.all([
      locks.acquire(key, 5_000),
      locks.acquire(key, 5_000),
    ]);

    const granted = [a, b].filter((lock) => lock !== null);
    expect(granted).toHaveLength(1);
  });

  it('releases with the correct token and allows re-acquisition', async () => {
    const key = 'lock:release-correct-token';
    const lock = await locks.acquire(key, 5_000);
    expect(lock).not.toBeNull();

    await expect(locks.release(lock!)).resolves.toBe(true);
    await expect(locks.acquire(key, 5_000)).resolves.not.toBeNull();
  });

  it('refuses to release with the wrong token, leaving the key locked', async () => {
    const key = 'lock:release-wrong-token';
    const lock = await locks.acquire(key, 5_000);
    expect(lock).not.toBeNull();

    await expect(locks.release({ key, token: 'wrong-token' })).resolves.toBe(
      false,
    );
    await expect(locks.acquire(key, 5_000)).resolves.toBeNull();
  });

  it('allows re-acquisition once the TTL expires', async () => {
    const key = 'lock:ttl-expiry';
    const first = await locks.acquire(key, 100);
    expect(first).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 200));

    await expect(locks.acquire(key, 5_000)).resolves.not.toBeNull();
  });

  it('acquireOwned grants the lock when the key is free', async () => {
    const key = 'lock:owned-free';
    await expect(locks.acquireOwned(key, 'token-a', 5_000)).resolves.toBe(true);
  });

  it('acquireOwned is reentrant for the same token', async () => {
    const key = 'lock:owned-reentrant';
    await expect(locks.acquireOwned(key, 'token-a', 5_000)).resolves.toBe(true);
    await expect(locks.acquireOwned(key, 'token-a', 5_000)).resolves.toBe(true);
  });

  it('acquireOwned refuses a different token while the key is held', async () => {
    const key = 'lock:owned-conflict';
    await expect(locks.acquireOwned(key, 'token-a', 5_000)).resolves.toBe(true);
    await expect(locks.acquireOwned(key, 'token-b', 5_000)).resolves.toBe(
      false,
    );
  });
});
