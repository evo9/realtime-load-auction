import { randomUUID } from 'node:crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { NullOutboxPort } from '@src/platform/persistence/outbox.port';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { SagaInstanceEntity } from '@src/modules/settlement/infrastructure/saga-instance.entity';
import { SagaRepository } from '@src/modules/settlement/infrastructure/saga.repository';
import {
  SagaStatus,
  SagaStep,
  nextStep,
} from '@src/modules/settlement/domain/saga';

function dataSourceOptions(container: StartedPostgreSqlContainer) {
  return {
    type: 'postgres' as const,
    host: container.getHost(),
    port: container.getMappedPort(5432),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    entities: [SagaInstanceEntity],
  };
}

describe('SagaRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const bootstrap = new DataSource({
      ...dataSourceOptions(container),
      synchronize: true,
    });
    await bootstrap.initialize();
    await bootstrap.destroy();
  }, 60_000);

  afterAll(async () => {
    await container.stop();
  });

  it('create is idempotent per lot and update survives across a fresh DataSource', async () => {
    const dataSourceA = new DataSource(dataSourceOptions(container));
    await dataSourceA.initialize();
    const sagasA = new SagaRepository(dataSourceA);
    const uowA = new UnitOfWork(dataSourceA, new NullOutboxPort());

    const lotId = randomUUID();
    const created = await uowA.transaction((tx) =>
      sagasA.create(tx, {
        lotId,
        payload: { closeAt: '2026-07-21T00:00:00.000Z' },
      }),
    );
    expect(created.step).toBe(SagaStep.Lock);
    expect(created.status).toBe(SagaStatus.Running);
    expect(created.attempts).toBe(0);

    // Redelivery of the triggering event calls create() again for the same
    // lot — ON CONFLICT DO NOTHING must return the original row, not throw
    // or duplicate it.
    const createdAgain = await uowA.transaction((tx) =>
      sagasA.create(tx, {
        lotId,
        payload: { closeAt: '2099-01-01T00:00:00.000Z' },
      }),
    );
    expect(createdAgain.id).toBe(created.id);
    expect(createdAgain.payload).toEqual(created.payload);

    const updated = await uowA.transaction((tx) =>
      sagasA.update(tx, {
        ...created,
        step: SagaStep.Reserve,
        attempts: 1,
        payload: { closeAt: created.payload.closeAt, reserved: true },
      }),
    );
    expect(updated.step).toBe(SagaStep.Reserve);
    expect(updated.attempts).toBe(1);
    expect(updated.version).toBeGreaterThan(created.version);

    await dataSourceA.destroy();

    const dataSourceB = new DataSource(dataSourceOptions(container));
    await dataSourceB.initialize();
    const sagasB = new SagaRepository(dataSourceB);
    const uowB = new UnitOfWork(dataSourceB, new NullOutboxPort());

    const reread = await sagasB.findByLotId(lotId);
    expect(reread?.step).toBe(SagaStep.Reserve);
    expect(reread?.attempts).toBe(1);
    expect(reread?.payload).toEqual({
      closeAt: created.payload.closeAt,
      reserved: true,
    });
    expect(reread?.version).toBe(updated.version);

    const advanced = await uowB.transaction((tx) =>
      sagasB.update(tx, { ...reread!, step: nextStep(reread!.step)! }),
    );
    expect(advanced.step).toBe(SagaStep.Invoice);

    const rereadAgain = await sagasB.findByLotId(lotId);
    expect(rereadAgain?.step).toBe(SagaStep.Invoice);

    await dataSourceB.destroy();
  }, 60_000);

  it('findById returns null for an unknown id', async () => {
    const dataSource = new DataSource(dataSourceOptions(container));
    await dataSource.initialize();
    const sagas = new SagaRepository(dataSource);

    await expect(sagas.findById(randomUUID())).resolves.toBeNull();
    await expect(sagas.findByLotId(randomUUID())).resolves.toBeNull();

    await dataSource.destroy();
  }, 30_000);

  // TypeORM's Repository#save() only auto-increments @VersionColumn when the
  // entity being saved carries the *current* DB version unchanged (the
  // ordinary read-then-write flow: fetch, mutate other fields, save). It does
  // not condition the UPDATE's WHERE clause on that version, and if the
  // saved entity carries a stale version value, save() treats it like any
  // other explicitly-set column and overwrites it verbatim instead of
  // incrementing — there is no CAS check on the write path. (The one place
  // TypeORM does check a version is QueryBuilder#setLock('optimistic', v) on
  // a read, which is a different mechanism this repository doesn't use.)
  // LotRepository.update() — the pattern this mirrors — never hits that
  // gap because its callers always lockForUpdate() and save() inside the
  // same transaction, so the version they pass back is never stale.
  it('save() auto-increments version on a fresh read but overwrites it verbatim from a stale object', async () => {
    const dataSource = new DataSource(dataSourceOptions(container));
    await dataSource.initialize();
    const sagas = new SagaRepository(dataSource);
    const uow = new UnitOfWork(dataSource, new NullOutboxPort());

    const lotId = randomUUID();
    const created = await uow.transaction((tx) =>
      sagas.create(tx, { lotId, payload: {} }),
    );

    const firstUpdate = await uow.transaction((tx) =>
      sagas.update(tx, { ...created, step: SagaStep.Winner }),
    );
    expect(firstUpdate.version).toBeGreaterThan(created.version);
    expect(firstUpdate.step).toBe(SagaStep.Winner);

    // `created` still carries the pre-update version and step — a stale
    // snapshot racing against the update above.
    const secondUpdate = await uow.transaction((tx) =>
      sagas.update(tx, { ...created, step: SagaStep.Reserve }),
    );
    expect(secondUpdate.step).toBe(SagaStep.Reserve);
    expect(secondUpdate.version).toBe(created.version);

    const final = await sagas.findByLotId(lotId);
    expect(final?.step).toBe(SagaStep.Reserve);
    expect(final?.version).toBe(created.version);

    await dataSource.destroy();
  }, 30_000);
});
