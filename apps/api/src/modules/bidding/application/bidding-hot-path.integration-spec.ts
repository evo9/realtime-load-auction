import { randomUUID } from 'node:crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import type { AppConfigService } from '@src/config/app-config.service';
import { OutboxEntity } from '@src/platform/outbox/outbox.entity';
import { OutboxService } from '@src/platform/outbox/outbox.service';
import { IdempotencyService } from '@src/platform/idempotency/idempotency.service';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { CasService } from '@src/platform/redis/cas.service';
import { RateLimiter } from '@src/platform/redis/rate-limiter';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { LotEntity } from '@src/modules/auction/infrastructure/lot.entity';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';
import { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';
import {
  PlaceBidCommand,
  PlaceBidHandler,
} from '@src/modules/bidding/application/place-bid.handler';

function fakeConfig(
  overrides: Partial<{ rateLimit: number; rateWindowMs: number }> = {},
): AppConfigService {
  return {
    idempotency: {
      inProgressTtlMs: 30_000,
      doneTtlMs: 600_000,
      msgDedupTtlMs: 900_000,
    },
    bidding: { rateLimit: 10, rateWindowMs: 10_000, ...overrides },
  } as unknown as AppConfigService;
}

class FailOnceBidRepository extends BidRepository {
  private thrown = false;

  async insert(
    ...args: Parameters<BidRepository['insert']>
  ): ReturnType<BidRepository['insert']> {
    if (!this.thrown) {
      this.thrown = true;
      throw new Error('simulated TX failure after CAS acceptance');
    }
    return super.insert(...args);
  }
}

describe('PlaceBidHandler hot path (integration)', () => {
  let pg: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let dataSource: DataSource;
  let redis: Redis;
  let lots: LotRepository;
  let bids: BidRepository;
  let uow: UnitOfWork;
  let cas: CasService;
  let rateLimiter: RateLimiter;

  beforeAll(async () => {
    [pg, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);

    dataSource = new DataSource({
      type: 'postgres',
      host: pg.getHost(),
      port: pg.getMappedPort(5432),
      username: pg.getUsername(),
      password: pg.getPassword(),
      database: pg.getDatabase(),
      entities: [LotEntity, BidEntity, OutboxEntity],
      synchronize: true,
    });
    await dataSource.initialize();

    redis = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
    });

    lots = new LotRepository(dataSource);
    bids = new BidRepository(dataSource);
    uow = new UnitOfWork(dataSource, new OutboxService());
    cas = new CasService(redis);
    rateLimiter = new RateLimiter(redis);
  }, 120_000);

  afterAll(async () => {
    await redis.quit();
    await dataSource.destroy();
    await Promise.all([pg.stop(), redisContainer.stop()]);
  });

  async function insertOpenLot(): Promise<string> {
    const lotId = randomUUID();
    await dataSource.getRepository(LotEntity).insert({
      id: lotId,
      shipperId: randomUUID(),
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      equipmentType: 'van',
      weightKg: 12000,
      pickupFrom: new Date(Date.now() + 3_600_000),
      pickupTo: new Date(Date.now() + 7_200_000),
      reservePrice: 150000,
      targetPrice: null,
      openAt: new Date(Date.now() - 60_000),
      closeAt: new Date(Date.now() + 3_600_000),
      antiSnipeWindowSec: 0,
      status: 'open',
      winningBidId: null,
      winningAmount: null,
    });
    await redis.set(RedisKeys.lotStatus(lotId), 'open');
    return lotId;
  }

  function makeHandler(
    bidsRepo: BidRepository = bids,
    config: AppConfigService = fakeConfig(),
  ): PlaceBidHandler {
    return new PlaceBidHandler(
      rateLimiter,
      new IdempotencyService(redis, config),
      cas,
      uow,
      bidsRepo,
      lots,
      config,
    );
  }

  it('accepts a valid best bid, persists it, writes the outbox row, and updates the Redis candidate (DoD 1)', async () => {
    const lotId = await insertOpenLot();
    const handler = makeHandler();
    const cmd: PlaceBidCommand = {
      lotId,
      carrierId: randomUUID(),
      amount: 100000,
      idempotencyKey: randomUUID(),
    };

    const outcome = await handler.execute(cmd);
    expect(outcome.status).toBe('accepted');
    const bidId = outcome.status === 'accepted' ? outcome.bid.id : undefined;

    const row = await dataSource.getRepository(BidEntity).findOneBy({
      lotId,
    });
    expect(row).not.toBeNull();
    expect(row?.id).toBe(bidId);
    expect(row?.amount).toBe(100000);
    expect(row?.carrierId).toBe(cmd.carrierId);

    const outboxRows = await dataSource
      .getRepository(OutboxEntity)
      .createQueryBuilder('outbox')
      .where("outbox.payload->>'lotId' = :lotId", { lotId })
      .andWhere('outbox.routing_key = :key', { key: 'bid.placed' })
      .getMany();
    expect(outboxRows).toHaveLength(1);

    const high = await redis.hgetall(RedisKeys.lotHigh(lotId));
    expect(high).toEqual({
      amount: '100000',
      carrierId: cmd.carrierId,
      bidId,
    });
  });

  it('rejects a bid that does not beat the current best, and rejects once the lot is closing (DoD 2)', async () => {
    const lotId = await insertOpenLot();
    const handler = makeHandler();
    const first: PlaceBidCommand = {
      lotId,
      carrierId: randomUUID(),
      amount: 100000,
      idempotencyKey: randomUUID(),
    };
    await handler.execute(first);

    const worse = await handler.execute({
      lotId,
      carrierId: randomUUID(),
      amount: 100000,
      idempotencyKey: randomUUID(),
    });
    expect(worse).toEqual({ status: 'rejected', reason: 'too_low' });

    const rows = await dataSource.getRepository(BidEntity).findBy({ lotId });
    expect(rows).toHaveLength(1);
    const high = await redis.hgetall(RedisKeys.lotHigh(lotId));
    expect(high.amount).toBe('100000');

    await redis.set(RedisKeys.lotStatus(lotId), 'closing');
    const closed = await handler.execute({
      lotId,
      carrierId: randomUUID(),
      amount: 50000,
      idempotencyKey: randomUUID(),
    });
    expect(closed).toEqual({ status: 'rejected', reason: 'closed' });
  });

  it('replays the identical result for the same carrier+idempotency-key without a second insert (DoD 3)', async () => {
    const lotId = await insertOpenLot();
    const handler = makeHandler();
    const cmd: PlaceBidCommand = {
      lotId,
      carrierId: randomUUID(),
      amount: 100000,
      idempotencyKey: randomUUID(),
    };

    const first = await handler.execute(cmd);
    const second = await handler.execute(cmd);

    expect(second).toEqual(first);
    if (first.status === 'accepted') {
      expect((second as typeof first).bid.id).toBe(first.bid.id);
    }

    const rows = await dataSource.getRepository(BidEntity).findBy({ lotId });
    expect(rows).toHaveLength(1);
  });

  it('never replays across carriers even when they reuse the same Idempotency-Key value', async () => {
    const lotId = await insertOpenLot();
    const handler = makeHandler();
    const sharedKey = randomUUID();

    const first = await handler.execute({
      lotId,
      carrierId: randomUUID(),
      amount: 100000,
      idempotencyKey: sharedKey,
    });
    const second = await handler.execute({
      lotId,
      carrierId: randomUUID(),
      amount: 90000,
      idempotencyKey: sharedKey,
    });

    expect(first.status).toBe('accepted');
    expect(second.status).toBe('accepted');
    if (first.status === 'accepted' && second.status === 'accepted') {
      expect(second.bid.id).not.toBe(first.bid.id);
    }

    const rows = await dataSource.getRepository(BidEntity).findBy({ lotId });
    expect(rows).toHaveLength(2);
  });

  it('lets only the globally lowest concurrent bid win, consistent between Postgres and Redis (DoD 4)', async () => {
    const lotId = await insertOpenLot();
    const handler = makeHandler();
    const amounts = [90000, 70000, 120000, 60000, 150000];

    const outcomes = await Promise.all(
      amounts.map((amount) =>
        handler.execute({
          lotId,
          carrierId: randomUUID(),
          amount,
          idempotencyKey: randomUUID(),
        }),
      ),
    );

    // CAS accepts every bid that beats the standing candidate at the moment
    // it runs, so more than one concurrent bid can transiently win as the
    // best-so-far improves — that's the audit trail, not a bug. What must
    // hold is that the bid with the globally lowest amount is the one left
    // standing, and Postgres/Redis agree on it.
    const accepted = outcomes.filter(
      (o): o is Extract<typeof o, { status: 'accepted' }> =>
        o.status === 'accepted',
    );
    expect(accepted.length).toBeGreaterThanOrEqual(1);
    const winner = accepted.find((o) => o.bid.amount === 60000);
    expect(winner).toBeDefined();
    if (!winner) throw new Error('unreachable');

    const best = await bids.findCurrentBest(lotId);
    expect(best?.amount).toBe(60000);
    expect(best?.bidId).toBe(winner.bid.id);

    const high = await redis.hgetall(RedisKeys.lotHigh(lotId));
    expect(high.amount).toBe('60000');
    expect(high.bidId).toBe(winner.bid.id);

    const rows = await dataSource.getRepository(BidEntity).findBy({ lotId });
    expect(rows).toHaveLength(accepted.length);
  });

  it('rate-limits a burst of bids from a single carrier on one lot (DoD 5)', async () => {
    const lotId = await insertOpenLot();
    const config = fakeConfig({ rateLimit: 3, rateWindowMs: 10_000 });
    const handler = makeHandler(bids, config);
    const carrierId = randomUUID();

    const outcomes: Array<Awaited<ReturnType<PlaceBidHandler['execute']>>> = [];
    for (let i = 0; i < 5; i += 1) {
      outcomes.push(
        await handler.execute({
          lotId,
          carrierId,
          amount: 100000 - i * 1000,
          idempotencyKey: randomUUID(),
        }),
      );
    }

    const limited = outcomes.filter((o) => o.status === 'rate_limited');
    expect(limited.length).toBeGreaterThanOrEqual(1);
  });

  it('reconciles the Redis candidate to the Postgres fact after the TX fails post-CAS (§6 reconciliation)', async () => {
    const lotId = await insertOpenLot();
    const failing = new FailOnceBidRepository(dataSource);
    const handler = makeHandler(failing);

    await expect(
      handler.execute({
        lotId,
        carrierId: randomUUID(),
        amount: 100000,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow('simulated TX failure after CAS acceptance');

    const factAfterFailure = await bids.findCurrentBest(lotId);
    expect(factAfterFailure).toBeNull();
    await expect(redis.exists(RedisKeys.lotHigh(lotId))).resolves.toBe(0);

    const successful = await handler.execute({
      lotId,
      carrierId: randomUUID(),
      amount: 80000,
      idempotencyKey: randomUUID(),
    });
    expect(successful.status).toBe('accepted');

    const best = await bids.findCurrentBest(lotId);
    const high = await redis.hgetall(RedisKeys.lotHigh(lotId));
    expect(high.bidId).toBe(best?.bidId);
    expect(high.amount).toBe(String(best?.amount));
  });
});
