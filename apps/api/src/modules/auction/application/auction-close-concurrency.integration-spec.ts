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

describe('CloseLotHandler concurrent close (integration)', () => {
  let pg: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let dataSource: DataSource;
  let redis: Redis;
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
    const scheduler = new ZSetScheduler(redis);
    handler = new CloseLotHandler(uow, lots, cas, scheduler, lock);
  }, 120_000);

  afterAll(async () => {
    await redis.quit();
    await dataSource.destroy();
    await Promise.all([pg.stop(), redisContainer.stop()]);
  });

  it('closes a lot exactly once when two dispatches race for the same lot', async () => {
    const lotId = randomUUID();
    const closeAt = new Date();

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
      closeAt,
      antiSnipeWindowSec: 0,
      status: 'open',
      winningBidId: null,
      winningAmount: null,
    });
    await redis.set(RedisKeys.lotStatus(lotId), 'open');

    await expect(
      Promise.all([handler.execute(lotId), handler.execute(lotId)]),
    ).resolves.toEqual([undefined, undefined]);

    const row = await dataSource
      .getRepository(LotEntity)
      .findOneBy({ id: lotId });
    expect(row?.status).toBe('closing');
    expect(row?.version).toBe(2);

    const outboxRows = await dataSource
      .getRepository(OutboxEntity)
      .createQueryBuilder('outbox')
      .where("outbox.payload->>'lotId' = :lotId", { lotId })
      .getMany();

    const closingRows = outboxRows.filter(
      (r) => r.routingKey === 'lot.closing',
    );
    const closedRows = outboxRows.filter((r) => r.routingKey === 'lot.closed');
    expect(closingRows).toHaveLength(1);
    expect(closedRows).toHaveLength(1);

    await expect(redis.get(RedisKeys.lotStatus(lotId))).resolves.toBe(
      'closing',
    );
  });
});
