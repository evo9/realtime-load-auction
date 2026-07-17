import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { ZSetScheduler } from './zset-scheduler';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ZSetScheduler (integration)', () => {
  let container: StartedRedisContainer;
  let client: Redis;
  let scheduler: ZSetScheduler;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    client = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
    });
    scheduler = new ZSetScheduler(client);
  }, 60_000);

  afterAll(async () => {
    await client.quit();
    await container.stop();
  });

  it('dispatches a member only once its due time has passed', async () => {
    const key = 'scheduler:test:due';
    const dispatch = jest.fn().mockResolvedValue(undefined);

    await scheduler.schedule(key, Date.now() + 150, 'lot-1');

    const early = await scheduler.tick(key, dispatch);
    expect(early).toEqual({ claimed: 0, dispatched: 0, requeued: 0 });
    expect(dispatch).not.toHaveBeenCalled();

    await sleep(250);

    const late = await scheduler.tick(key, dispatch);
    expect(late).toEqual({ claimed: 1, dispatched: 1, requeued: 0 });
    expect(dispatch).toHaveBeenCalledWith('lot-1');
    expect(dispatch).toHaveBeenCalledTimes(1);
    await expect(client.zcard(key)).resolves.toBe(0);
  });

  it('re-scheduling the same payload extends the deadline instead of duplicating the member (anti-snipe)', async () => {
    const key = 'scheduler:test:anti-snipe';
    const dispatch = jest.fn().mockResolvedValue(undefined);

    await scheduler.schedule(key, Date.now() + 120, 'lot-1');
    await scheduler.schedule(key, Date.now() + 10_000, 'lot-1');

    await sleep(250);

    const staleTick = await scheduler.tick(key, dispatch);
    expect(staleTick).toEqual({ claimed: 0, dispatched: 0, requeued: 0 });
    expect(dispatch).not.toHaveBeenCalled();
    await expect(client.zcard(key)).resolves.toBe(1);

    await scheduler.schedule(key, Date.now() - 1, 'lot-1');

    const dueTick = await scheduler.tick(key, dispatch);
    expect(dueTick).toEqual({ claimed: 1, dispatched: 1, requeued: 0 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith('lot-1');
    await expect(client.zcard(key)).resolves.toBe(0);
  });

  it('claims each due member exactly once under concurrent ticks', async () => {
    const key = 'scheduler:test:concurrency';
    const now = Date.now();
    const members = Array.from({ length: 50 }, (_, i) => `lot-${i}`);

    await client.zadd(key, ...members.flatMap((member) => [now - 1, member]));

    const seen: string[] = [];
    const dispatch = async (payload: string) => {
      await sleep(10);
      seen.push(payload);
    };

    const [resultA, resultB] = await Promise.all([
      scheduler.tick(key, dispatch),
      scheduler.tick(key, dispatch),
    ]);

    expect(resultA.dispatched + resultB.dispatched).toBe(50);
    expect(new Set(seen).size).toBe(50);
    await expect(client.zcard(key)).resolves.toBe(0);
  });

  it('requeues a payload with a GT delay after a dispatch failure, then delivers it exactly once', async () => {
    const key = 'scheduler:test:retry';
    const dispatch = jest
      .fn()
      .mockRejectedValueOnce(new Error('dispatch failed'))
      .mockResolvedValueOnce(undefined);

    await scheduler.schedule(key, Date.now() - 1, 'lot-1');

    const now = Date.now();
    const failedTick = await scheduler.tick(key, dispatch, {
      retryDelayMs: 50,
    });
    expect(failedTick).toEqual({ claimed: 1, dispatched: 0, requeued: 1 });

    const score = await client.zscore(key, 'lot-1');
    expect(score).not.toBeNull();
    expect(Number(score)).toBeGreaterThanOrEqual(now + 40);

    await sleep(80);

    const retryTick = await scheduler.tick(key, dispatch);
    expect(retryTick).toEqual({ claimed: 1, dispatched: 1, requeued: 0 });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(2, 'lot-1');
    await expect(client.zcard(key)).resolves.toBe(0);
  });
});
