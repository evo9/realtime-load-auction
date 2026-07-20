import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import type { AppConfigService } from '@src/config/app-config.service';
import { RedisDedupPort } from './redis-dedup.port';

function fakeIdempotencyConfig(): AppConfigService {
  return {
    idempotency: {
      inProgressTtlMs: 30_000,
      doneTtlMs: 600_000,
      msgDedupTtlMs: 900_000,
    },
  } as unknown as AppConfigService;
}

describe('RedisDedupPort (integration)', () => {
  let container: StartedRedisContainer;
  let client: Redis;
  let dedup: RedisDedupPort;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    client = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
    });
    dedup = new RedisDedupPort(client, fakeIdempotencyConfig());
  }, 60_000);

  afterAll(async () => {
    await client.quit();
    await container.stop();
  });

  it('reports unseen messages as not seen, then seen after marking', async () => {
    const messageId = 'msg-1';

    await expect(dedup.seen('notification.q', messageId)).resolves.toBe(false);

    await dedup.mark('notification.q', messageId);

    await expect(dedup.seen('notification.q', messageId)).resolves.toBe(true);
  });

  it('tracks the same messageId independently per queue', async () => {
    const messageId = 'msg-fanout';

    await dedup.mark('notification.q', messageId);

    await expect(dedup.seen('notification.q', messageId)).resolves.toBe(true);
    await expect(dedup.seen('settlement.q', messageId)).resolves.toBe(false);
    await expect(dedup.seen('listing.q', messageId)).resolves.toBe(false);
  });
});
