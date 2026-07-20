import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import type { AppConfigService } from '@src/config/app-config.service';
import { IdempotencyService } from './idempotency.service';

function fakeIdempotencyConfig(
  inProgressTtlMs: number,
  doneTtlMs = 600_000,
): AppConfigService {
  return {
    idempotency: { inProgressTtlMs, doneTtlMs, msgDedupTtlMs: 900_000 },
  } as unknown as AppConfigService;
}

describe('IdempotencyService (integration)', () => {
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

  it('returns new on the first call and replays the cached result afterwards', async () => {
    const service = new IdempotencyService(
      client,
      fakeIdempotencyConfig(30_000),
    );
    const key = 'replay-key';

    await expect(service.begin(key)).resolves.toEqual({ status: 'new' });

    const result = { bidId: 'bid-1' };
    await service.complete(key, result);

    await expect(service.begin(key)).resolves.toEqual({
      status: 'replay',
      result,
    });
  });

  it('lets exactly one of several concurrent begins through as new', async () => {
    const service = new IdempotencyService(
      client,
      fakeIdempotencyConfig(30_000),
    );
    const key = 'concurrent-key';

    const outcomes = await Promise.all([
      service.begin(key),
      service.begin(key),
      service.begin(key),
      service.begin(key),
    ]);

    const fresh = outcomes.filter((o) => o.status === 'new');
    const inProgress = outcomes.filter((o) => o.status === 'in_progress');
    expect(fresh).toHaveLength(1);
    expect(inProgress).toHaveLength(3);
  });

  it('allows a new begin once the in-progress TTL expires without completion', async () => {
    const service = new IdempotencyService(client, fakeIdempotencyConfig(100));
    const key = 'ttl-expiry-key';

    await expect(service.begin(key)).resolves.toEqual({ status: 'new' });

    await new Promise((resolve) => setTimeout(resolve, 200));

    await expect(service.begin(key)).resolves.toEqual({ status: 'new' });
  });
});
