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

  it('rejects a bid when the lot has no open status set', async () => {
    const lotId = 'lot-cas-no-status';

    await expect(
      cas.tryBeatHighBid(lotId, 100, 'carrier-1', 'bid-1'),
    ).resolves.toEqual({ accepted: false, reason: 'closed' });
  });

  it('accepts a bid once the lot is open and writes the high-bid hash', async () => {
    const lotId = 'lot-cas-1';
    await cas.setStatus(lotId, 'open');

    await expect(
      cas.tryBeatHighBid(lotId, 100, 'carrier-1', 'bid-1'),
    ).resolves.toEqual({ accepted: true, reason: 'accepted' });

    await expect(client.hgetall(RedisKeys.lotHigh(lotId))).resolves.toEqual({
      amount: '100',
      carrierId: 'carrier-1',
      bidId: 'bid-1',
    });
  });

  it('accepts a strictly lower bid and rejects an equal or higher one', async () => {
    const lotId = 'lot-cas-reverse-auction';
    await cas.setStatus(lotId, 'open');
    await cas.tryBeatHighBid(lotId, 100, 'carrier-1', 'bid-1');

    await expect(
      cas.tryBeatHighBid(lotId, 100, 'carrier-2', 'bid-2'),
    ).resolves.toEqual({ accepted: false, reason: 'too_low' });
    await expect(
      cas.tryBeatHighBid(lotId, 150, 'carrier-2', 'bid-2'),
    ).resolves.toEqual({ accepted: false, reason: 'too_low' });

    await expect(
      cas.tryBeatHighBid(lotId, 90, 'carrier-3', 'bid-3'),
    ).resolves.toEqual({ accepted: true, reason: 'accepted' });
    await expect(client.hgetall(RedisKeys.lotHigh(lotId))).resolves.toEqual({
      amount: '90',
      carrierId: 'carrier-3',
      bidId: 'bid-3',
    });
  });

  it('rejects a NaN bid instead of letting it poison future comparisons', async () => {
    const lotId = 'lot-cas-nan';
    await cas.setStatus(lotId, 'open');

    await expect(
      cas.tryBeatHighBid(lotId, NaN, 'carrier-1', 'bid-1'),
    ).resolves.toEqual({ accepted: false, reason: 'too_low' });
    await expect(client.exists(RedisKeys.lotHigh(lotId))).resolves.toBe(0);

    // a legitimate bid afterwards must still be gated normally, proving the
    // NaN attempt left no residue for a later bid to compare against
    await expect(
      cas.tryBeatHighBid(lotId, 100, 'carrier-2', 'bid-2'),
    ).resolves.toEqual({ accepted: true, reason: 'accepted' });
    await expect(
      cas.tryBeatHighBid(lotId, 150, 'carrier-3', 'bid-3'),
    ).resolves.toEqual({ accepted: false, reason: 'too_low' });
  });

  it('rejects a bid once the lot has moved to closing', async () => {
    const lotId = 'lot-cas-closing';
    await cas.setStatus(lotId, 'open');
    await cas.tryBeatHighBid(lotId, 100, 'carrier-1', 'bid-1');
    await cas.setStatus(lotId, 'closing');

    await expect(
      cas.tryBeatHighBid(lotId, 50, 'carrier-2', 'bid-2'),
    ).resolves.toEqual({ accepted: false, reason: 'closed' });
  });

  it('lets only the globally best of several concurrent bids win', async () => {
    const lotId = 'lot-cas-concurrent';
    await cas.setStatus(lotId, 'open');

    const amounts = [500, 300, 700, 100, 900, 200];
    await Promise.all(
      amounts.map((amount, i) =>
        cas.tryBeatHighBid(lotId, amount, `carrier-${i}`, `bid-${i}`),
      ),
    );

    const high = await client.hgetall(RedisKeys.lotHigh(lotId));
    expect(high.amount).toBe('100');
    expect(high.bidId).toBe('bid-3');
  });

  it('reconciles the high-bid hash to a DB fact after a lost commit', async () => {
    const lotId = 'lot-cas-reconcile';
    await cas.setStatus(lotId, 'open');
    await cas.tryBeatHighBid(lotId, 100, 'carrier-1', 'bid-1');

    await expect(cas.reconcileIfCurrent(lotId, 'bid-1', null)).resolves.toBe(
      true,
    );
    await expect(client.exists(RedisKeys.lotHigh(lotId))).resolves.toBe(0);

    await cas.tryBeatHighBid(lotId, 100, 'carrier-1', 'bid-1');
    await expect(
      cas.reconcileIfCurrent(lotId, 'bid-1', {
        amount: 120,
        carrierId: 'carrier-0',
        bidId: 'bid-0',
      }),
    ).resolves.toBe(true);
    await expect(client.hgetall(RedisKeys.lotHigh(lotId))).resolves.toEqual({
      amount: '120',
      carrierId: 'carrier-0',
      bidId: 'bid-0',
    });
  });

  it('does not clobber a newer legitimate candidate during reconciliation', async () => {
    const lotId = 'lot-cas-fence';
    await cas.setStatus(lotId, 'open');
    await cas.tryBeatHighBid(lotId, 100, 'carrier-1', 'bid-1');
    await cas.tryBeatHighBid(lotId, 90, 'carrier-2', 'bid-2');

    await expect(cas.reconcileIfCurrent(lotId, 'bid-1', null)).resolves.toBe(
      false,
    );
    await expect(client.hgetall(RedisKeys.lotHigh(lotId))).resolves.toEqual({
      amount: '90',
      carrierId: 'carrier-2',
      bidId: 'bid-2',
    });
  });

  it('reconcile unconditionally rebuilds or clears the high-bid hash', async () => {
    const lotId = 'lot-cas-cold-start';

    await cas.reconcile(lotId, {
      amount: 250,
      carrierId: 'carrier-1',
      bidId: 'bid-1',
    });
    await expect(client.hgetall(RedisKeys.lotHigh(lotId))).resolves.toEqual({
      amount: '250',
      carrierId: 'carrier-1',
      bidId: 'bid-1',
    });

    await cas.reconcile(lotId, null);
    await expect(client.exists(RedisKeys.lotHigh(lotId))).resolves.toBe(0);
  });
});
