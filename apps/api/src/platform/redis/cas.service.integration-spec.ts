import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { CasService } from '@src/platform/redis/cas.service';
import { RedisKeys } from '@src/platform/redis/redis-keys';

describe('CasService (integration)', () => {
  let container: StartedRedisContainer;
  let client: Redis;
  let cas: CasService;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    client = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
    });
    cas = new CasService(client);
  }, 60_000);

  afterAll(async () => {
    await client.quit();
    await container.stop();
  });

  it('accepts a bid and writes the high-bid hash', async () => {
    const lotId = 'lot-cas-1';

    await expect(
      cas.tryBeatHighBid(lotId, 100, 'carrier-1', 'bid-1'),
    ).resolves.toEqual({ accepted: true, reason: 'accepted' });

    await expect(client.hgetall(RedisKeys.lotHigh(lotId))).resolves.toEqual({
      amount: '100',
      carrierId: 'carrier-1',
      bidId: 'bid-1',
    });
  });
});
