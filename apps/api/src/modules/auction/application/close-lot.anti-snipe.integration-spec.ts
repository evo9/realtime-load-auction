import { randomUUID } from 'node:crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import { OutboxEntity } from '@src/platform/outbox/outbox.entity';
import { OutboxService } from '@src/platform/outbox/outbox.service';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { CasService } from '@src/platform/redis/cas.service';
import { LockService } from '@src/platform/redis/lock.service';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { ZSetScheduler } from '@src/platform/scheduler/zset-scheduler';
import { LotEntity } from '@src/modules/auction/infrastructure/lot.entity';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';
import { CloseLotHandler } from '@src/modules/auction/application/close-lot.handler';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('CloseLotHandler anti-snipe extension (integration)', () => {
  let pg: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let dataSource: DataSource;
  let redis: Redis;
  let scheduler: ZSetScheduler;
  let handler: CloseLotHandler;

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
      entities: [LotEntity, OutboxEntity],
      synchronize: true,
    });
    await dataSource.initialize();

    redis = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
    });

    const lots = new LotRepository(dataSource);
    const uow = new UnitOfWork(dataSource, new OutboxService());
    const cas = new CasService(redis);
    const lock = new LockService(redis);
    scheduler = new ZSetScheduler(redis);
    handler = new CloseLotHandler(uow, lots, cas, scheduler, lock);
  }, 120_000);

  afterAll(async () => {
    await redis.quit();
    await dataSource.destroy();
    await Promise.all([pg.stop(), redisContainer.stop()]);
  });

  function baseLotRow(overrides: Partial<LotEntity> = {}) {
    return {
      id: randomUUID(),
      shipperId: randomUUID(),
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      equipmentType: 'van' as const,
      weightKg: 12000,
      pickupFrom: new Date(Date.now() + 3_600_000),
      pickupTo: new Date(Date.now() + 7_200_000),
      reservePrice: 150000,
      targetPrice: null,
      openAt: new Date(Date.now() - 60_000),
      antiSnipeWindowSec: 2,
      status: 'open' as const,
      winningBidId: null,
      winningAmount: null,
      lastBidAt: null,
      ...overrides,
    };
  }

  it('extends closeAt when the lot row carries a lastBidAt inside the anti-snipe window, then closes once the extended deadline passes', async () => {
    const lotId = randomUUID();
    const antiSnipeWindowSec = 2;
    const initialCloseAt = new Date(Date.now() + 1_000);
    const lastBidAt = new Date();

    // lastBidAt now lives on the lot row itself (set by PlaceBidHandler in
    // production) — CloseLotHandler reads it from the same locked row it
    // already fetches, no opts parameter needed.
    await dataSource.getRepository(LotEntity).insert(
      baseLotRow({
        id: lotId,
        closeAt: initialCloseAt,
        antiSnipeWindowSec,
        lastBidAt,
      }),
    );

    await handler.execute(lotId);

    const expectedCloseAt = new Date(
      lastBidAt.getTime() + antiSnipeWindowSec * 1000,
    );

    const afterExtension = await dataSource
      .getRepository(LotEntity)
      .findOneBy({ id: lotId });
    expect(afterExtension?.status).toBe('open');
    expect(afterExtension?.closeAt.getTime()).toBe(expectedCloseAt.getTime());

    const score = await redis.zscore(RedisKeys.scheduleClose(), lotId);
    expect(score).not.toBeNull();
    expect(Number(score)).toBe(expectedCloseAt.getTime());

    const extendedOutboxRows = (
      await dataSource
        .getRepository(OutboxEntity)
        .find({ where: { routingKey: 'lot.extended' } })
    ).filter((row) => (row.payload as { lotId: string }).lotId === lotId);
    expect(extendedOutboxRows).toHaveLength(1);
    expect(extendedOutboxRows[0]?.payload).toEqual({
      lotId,
      closeAt: expectedCloseAt.toISOString(),
    });

    await sleep(expectedCloseAt.getTime() - Date.now() + 200);

    await handler.execute(lotId);

    const afterClose = await dataSource
      .getRepository(LotEntity)
      .findOneBy({ id: lotId });
    expect(afterClose?.status).toBe('closing');

    const closedOutboxRows = (
      await dataSource
        .getRepository(OutboxEntity)
        .find({ where: { routingKey: 'lot.closed' } })
    ).filter((row) => (row.payload as { lotId: string }).lotId === lotId);
    expect(closedOutboxRows).toHaveLength(1);
  }, 30_000);

  it('closes immediately when lastBidAt is outside the anti-snipe window (or absent)', async () => {
    const lotId = randomUUID();
    const closeAt = new Date(Date.now() - 1_000);

    await dataSource
      .getRepository(LotEntity)
      .insert(baseLotRow({ id: lotId, closeAt, lastBidAt: null }));

    await handler.execute(lotId);

    const afterClose = await dataSource
      .getRepository(LotEntity)
      .findOneBy({ id: lotId });
    expect(afterClose?.status).toBe('closing');

    const extendedRows = (
      await dataSource
        .getRepository(OutboxEntity)
        .find({ where: { routingKey: 'lot.extended' } })
    ).filter((row) => (row.payload as { lotId: string }).lotId === lotId);
    expect(extendedRows).toHaveLength(0);
  });
});
