import { randomUUID } from 'node:crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { ListingLotEntity } from '@src/modules/listing/infrastructure/listing-lot.entity';
import { ListingLotRepository } from '@src/modules/listing/infrastructure/listing-lot.repository';
import type { LotOpenedPayload } from '@src/modules/listing/domain/listing-lot';

function makeOpenedPayload(
  overrides: Partial<LotOpenedPayload> = {},
): LotOpenedPayload {
  return {
    lotId: randomUUID(),
    shipperId: randomUUID(),
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    equipmentType: 'van',
    weightKg: 12000,
    reservePrice: 150000,
    targetPrice: null,
    openAt: new Date().toISOString(),
    closeAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  };
}

describe('ListingLotRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let repository: ListingLotRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getMappedPort(5432),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: [ListingLotEntity],
      synchronize: true,
    });
    await dataSource.initialize();
    repository = new ListingLotRepository(dataSource);
  }, 60_000);

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  it('upsertOpened called twice with the same lotId does not duplicate the row', async () => {
    const payload = makeOpenedPayload();

    await repository.upsertOpened(payload);
    await repository.upsertOpened(payload);

    const count = await dataSource
      .getRepository(ListingLotEntity)
      .countBy({ id: payload.lotId });
    expect(count).toBe(1);
  });

  it('markClosing on an unknown lotId returns 0', async () => {
    const affected = await repository.markClosing(randomUUID(), new Date());
    expect(affected).toBe(0);
  });

  it('markClosing on an existing lot updates the row to status=closing', async () => {
    const payload = makeOpenedPayload();
    await repository.upsertOpened(payload);

    const newCloseAt = new Date(Date.now() + 7_200_000);
    const affected = await repository.markClosing(payload.lotId, newCloseAt);
    expect(affected).toBe(1);

    const row = await dataSource
      .getRepository(ListingLotEntity)
      .findOneByOrFail({ id: payload.lotId });
    expect(row.status).toBe('closing');
    expect(row.closeAt.getTime()).toBe(newCloseAt.getTime());
  });

  it('upsertOpened after markClosing does not roll status or closeAt back', async () => {
    const payload = makeOpenedPayload();
    await repository.upsertOpened(payload);

    const closingCloseAt = new Date(Date.now() + 7_200_000);
    await repository.markClosing(payload.lotId, closingCloseAt);

    await repository.upsertOpened(payload);

    const row = await dataSource
      .getRepository(ListingLotEntity)
      .findOneByOrFail({ id: payload.lotId });
    expect(row.status).toBe('closing');
    expect(row.closeAt.getTime()).toBe(closingCloseAt.getTime());
    expect(row.shipperId).toBe(payload.shipperId);
  });

  it('list filters by status, equipmentType, origin and destination', async () => {
    const openVan = makeOpenedPayload({
      equipmentType: 'van',
      origin: 'Filter Origin A',
      destination: 'Filter Destination A',
    });
    const openReefer = makeOpenedPayload({
      equipmentType: 'reefer',
      origin: 'Filter Origin A',
      destination: 'Filter Destination A',
    });
    const closingVan = makeOpenedPayload({
      equipmentType: 'van',
      origin: 'Filter Origin B',
      destination: 'Filter Destination B',
    });

    await repository.upsertOpened(openVan);
    await repository.upsertOpened(openReefer);
    await repository.upsertOpened(closingVan);
    await repository.markClosing(closingVan.lotId, new Date());

    const byStatus = await repository.list({ status: 'closing', limit: 50 });
    expect(byStatus.map((r) => r.id)).toEqual(
      expect.arrayContaining([closingVan.lotId]),
    );
    expect(byStatus.some((r) => r.id === openVan.lotId)).toBe(false);

    const byEquipment = await repository.list({
      equipmentType: 'reefer',
      limit: 50,
    });
    expect(byEquipment.map((r) => r.id)).toContain(openReefer.lotId);
    expect(byEquipment.some((r) => r.id === openVan.lotId)).toBe(false);

    const byRoute = await repository.list({
      origin: 'Filter Origin A',
      destination: 'Filter Destination A',
      limit: 50,
    });
    const routeIds = byRoute.map((r) => r.id);
    expect(routeIds).toEqual(
      expect.arrayContaining([openVan.lotId, openReefer.lotId]),
    );
    expect(routeIds).not.toContain(closingVan.lotId);
  });

  it('list paginates by cursor in (close_at, id) order without overlap between pages', async () => {
    const base = Date.now() + 10_000_000;
    const payloads = Array.from({ length: 4 }, (_, i) =>
      makeOpenedPayload({
        origin: 'Cursor Origin',
        destination: 'Cursor Destination',
        closeAt: new Date(base + i * 1000).toISOString(),
      }),
    );

    for (const payload of payloads) {
      await repository.upsertOpened(payload);
    }

    const filter = {
      origin: 'Cursor Origin',
      destination: 'Cursor Destination',
      limit: 2,
    };

    const page1 = await repository.list(filter);
    expect(page1).toHaveLength(3); // limit+1, extra row signals "has more"
    const firstPageIds = page1.slice(0, 2).map((r) => r.id);
    expect(firstPageIds).toEqual([payloads[0].lotId, payloads[1].lotId]);

    const cursor = { closeAt: page1[1].closeAt, id: page1[1].id };
    const page2 = await repository.list({ ...filter, cursor });
    const secondPageIds = page2.map((r) => r.id);

    expect(secondPageIds).toEqual([payloads[2].lotId, payloads[3].lotId]);
    expect(secondPageIds.some((id) => firstPageIds.includes(id))).toBe(false);
  });

  it('updateCurrentBest sets the first bid, ignores a worse one, and accepts a better one', async () => {
    const payload = makeOpenedPayload();
    await repository.upsertOpened(payload);

    const first = await repository.updateCurrentBest(payload.lotId, 100000);
    expect(first).toBe(1);

    const worse = await repository.updateCurrentBest(payload.lotId, 120000);
    expect(worse).toBe(0);

    const rowAfterWorse = await dataSource
      .getRepository(ListingLotEntity)
      .findOneByOrFail({ id: payload.lotId });
    expect(rowAfterWorse.currentBest).toBe(100000);

    const better = await repository.updateCurrentBest(payload.lotId, 80000);
    expect(better).toBe(1);

    const rowAfterBetter = await dataSource
      .getRepository(ListingLotEntity)
      .findOneByOrFail({ id: payload.lotId });
    expect(rowAfterBetter.currentBest).toBe(80000);
  });

  it('updateCurrentBest on an unknown lotId returns 0', async () => {
    const affected = await repository.updateCurrentBest(randomUUID(), 50000);
    expect(affected).toBe(0);
  });

  it('exists returns true for a projected lot and false for an unknown one', async () => {
    const payload = makeOpenedPayload();
    await repository.upsertOpened(payload);

    await expect(repository.exists(payload.lotId)).resolves.toBe(true);
    await expect(repository.exists(randomUUID())).resolves.toBe(false);
  });
});
