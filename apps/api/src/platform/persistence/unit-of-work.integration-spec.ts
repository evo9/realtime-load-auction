import { randomUUID } from 'node:crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Column, DataSource, Entity, PrimaryColumn } from 'typeorm';
import { NullOutboxPort } from './outbox.port';
import { UnitOfWork } from './unit-of-work';

@Entity('uow_test_probe')
class TestProbe {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  label!: string;
}

describe('UnitOfWork (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let uow: UnitOfWork;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getMappedPort(5432),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: [TestProbe],
      synchronize: true,
    });
    await dataSource.initialize();
    uow = new UnitOfWork(dataSource, new NullOutboxPort());
  }, 60_000);

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  it('commits the transaction when the work resolves', async () => {
    const id = randomUUID();

    await uow.transaction(async (tx) => {
      await tx.manager.insert(TestProbe, { id, label: 'commit' });
    });

    const row = await dataSource.getRepository(TestProbe).findOneBy({ id });
    expect(row?.label).toBe('commit');
  });

  it('rolls back the transaction when the work throws', async () => {
    const id = randomUUID();

    await expect(
      uow.transaction(async (tx) => {
        await tx.manager.insert(TestProbe, { id, label: 'rollback' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const row = await dataSource.getRepository(TestProbe).findOneBy({ id });
    expect(row).toBeNull();
  });

  it('lockForUpdate returns the row from inside the transaction', async () => {
    const id = randomUUID();
    await dataSource.getRepository(TestProbe).insert({ id, label: 'lockable' });

    const found = await uow.transaction((tx) =>
      tx.lockForUpdate(TestProbe, id),
    );

    expect(found?.label).toBe('lockable');
  });
});
