import { randomUUID } from 'node:crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';

function makeRow(overrides: Partial<BidEntity> = {}): Partial<BidEntity> {
  return {
    id: randomUUID(),
    lotId: randomUUID(),
    carrierId: randomUUID(),
    amount: 100000,
    idempotencyKey: randomUUID(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('BidRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let repository: BidRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getMappedPort(5432),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: [BidEntity],
      synchronize: true,
    });
    await dataSource.initialize();
    repository = new BidRepository(dataSource);
  }, 60_000);

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  it('listByLot(sort=amount) paginates in ascending amount order with no gaps or duplicates', async () => {
    const lotId = randomUUID();
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({ lotId, amount: (i + 1) * 10000 }),
    );
    // Insert out of amount order to make sure the ORDER BY, not insertion
    // order, drives the result.
    for (const row of [rows[2], rows[0], rows[4], rows[1], rows[3]]) {
      await dataSource.getRepository(BidEntity).insert(row);
    }

    const seen: string[] = [];
    let cursor: { value: string; id: string } | undefined;
    for (let i = 0; i < 10; i += 1) {
      const page = await repository.listByLot(lotId, {
        sort: 'amount',
        cursor,
        limit: 2,
      });
      const kept = page.slice(0, 2);
      seen.push(...kept.map((r) => r.id));
      if (page.length <= 2) break;
      const last = kept[kept.length - 1];
      cursor = { value: String(last.amount), id: last.id };
    }

    expect(seen).toEqual(rows.map((r) => r.id));
    expect(new Set(seen).size).toBe(rows.length);
  });

  it('listByLot(sort=time) paginates in descending created_at order with no gaps or duplicates', async () => {
    const lotId = randomUUID();
    const base = Date.now();
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({ lotId, createdAt: new Date(base + i * 1000) }),
    );
    for (const row of rows) {
      await dataSource.getRepository(BidEntity).insert(row);
    }
    const expectedOrder = [...rows].reverse().map((r) => r.id);

    const seen: string[] = [];
    let cursor: { value: string; id: string } | undefined;
    for (let i = 0; i < 10; i += 1) {
      const page = await repository.listByLot(lotId, {
        sort: 'time',
        cursor,
        limit: 2,
      });
      const kept = page.slice(0, 2);
      seen.push(...kept.map((r) => r.id));
      if (page.length <= 2) break;
      const last = kept[kept.length - 1];
      cursor = { value: last.createdAt.toISOString(), id: last.id };
    }

    expect(seen).toEqual(expectedOrder);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it('listByLot(sort=time) keeps a stable order via id when created_at collides', async () => {
    const lotId = randomUUID();
    const sameInstant = new Date();
    const rows = Array.from({ length: 4 }, () =>
      makeRow({ lotId, createdAt: sameInstant }),
    ).sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1));
    for (const row of rows) {
      await dataSource.getRepository(BidEntity).insert(row);
    }
    const expectedOrder = [...rows].reverse().map((r) => r.id);

    const seen: string[] = [];
    let cursor: { value: string; id: string } | undefined;
    for (let i = 0; i < 10; i += 1) {
      const page = await repository.listByLot(lotId, {
        sort: 'time',
        cursor,
        limit: 2,
      });
      const kept = page.slice(0, 2);
      seen.push(...kept.map((r) => r.id));
      if (page.length <= 2) break;
      const last = kept[kept.length - 1];
      cursor = { value: last.createdAt.toISOString(), id: last.id };
    }

    expect(seen).toEqual(expectedOrder);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it('listByCarrier returns only the requested carrier, newest first, and paginates without overlap', async () => {
    const carrierA = randomUUID();
    const carrierB = randomUUID();
    const base = Date.now();
    const carrierARows = Array.from({ length: 4 }, (_, i) =>
      makeRow({
        carrierId: carrierA,
        lotId: randomUUID(),
        createdAt: new Date(base + i * 1000),
      }),
    );
    const carrierBRows = Array.from({ length: 2 }, (_, i) =>
      makeRow({
        carrierId: carrierB,
        lotId: randomUUID(),
        createdAt: new Date(base + i * 1000),
      }),
    );
    for (const row of [...carrierARows, ...carrierBRows]) {
      await dataSource.getRepository(BidEntity).insert(row);
    }
    const expectedOrder = [...carrierARows].reverse().map((r) => r.id);

    const seen: string[] = [];
    let cursor: { value: string; id: string } | undefined;
    for (let i = 0; i < 10; i += 1) {
      const page = await repository.listByCarrier(carrierA, {
        cursor,
        limit: 2,
      });
      const kept = page.slice(0, 2);
      seen.push(...kept.map((r) => r.id));
      if (page.length <= 2) break;
      const last = kept[kept.length - 1];
      cursor = { value: last.createdAt.toISOString(), id: last.id };
    }

    expect(seen).toEqual(expectedOrder);
    expect(seen.some((id) => carrierBRows.some((r) => r.id === id))).toBe(
      false,
    );
  });

  it('findCurrentBest still returns the lowest amount for a lot (regression check)', async () => {
    const lotId = randomUUID();
    const rows = [
      makeRow({ lotId, amount: 90000 }),
      makeRow({ lotId, amount: 70000 }),
      makeRow({ lotId, amount: 120000 }),
    ];
    for (const row of rows) {
      await dataSource.getRepository(BidEntity).insert(row);
    }

    const best = await repository.findCurrentBest(lotId);
    expect(best?.amount).toBe(70000);
  });

  it('findCurrentBestForLots returns the lowest bid per lot in one batched query', async () => {
    const lotA = randomUUID();
    const lotB = randomUUID();
    const lotWithoutBids = randomUUID();
    const rows = [
      makeRow({ lotId: lotA, amount: 90000 }),
      makeRow({ lotId: lotA, amount: 70000 }),
      makeRow({ lotId: lotB, amount: 120000 }),
    ];
    for (const row of rows) {
      await dataSource.getRepository(BidEntity).insert(row);
    }

    const best = await repository.findCurrentBestForLots([
      lotA,
      lotB,
      lotWithoutBids,
    ]);

    expect(best.get(lotA)?.amount).toBe(70000);
    expect(best.get(lotB)?.amount).toBe(120000);
    // Lots with no bids simply don't appear in the map.
    expect(best.has(lotWithoutBids)).toBe(false);
  });

  it('findCurrentBestForLots breaks amount ties by earliest createdAt (same rule as findCurrentBest)', async () => {
    const lotId = randomUUID();
    const base = Date.parse('2026-07-20T12:00:00.000Z');
    const earlier = makeRow({
      lotId,
      amount: 80000,
      createdAt: new Date(base),
    });
    const later = makeRow({
      lotId,
      amount: 80000,
      createdAt: new Date(base + 1000),
    });
    // Insert the later one first so insertion order can't stand in for the tie-break.
    for (const row of [later, earlier]) {
      await dataSource.getRepository(BidEntity).insert(row);
    }

    const best = await repository.findCurrentBestForLots([lotId]);
    expect(best.get(lotId)?.bidId).toBe(earlier.id);
  });

  it('findCurrentBestForLots returns an empty map when given no lot ids (no query issued)', async () => {
    const best = await repository.findCurrentBestForLots([]);
    expect(best.size).toBe(0);
  });
});
