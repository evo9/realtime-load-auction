import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSagaInstances1784900000000 implements MigrationInterface {
  name = 'CreateSagaInstances1784900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'saga_instances',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'lot_id', type: 'uuid' },
          { name: 'step', type: 'varchar' },
          { name: 'status', type: 'varchar' },
          { name: 'payload', type: 'jsonb' },
          { name: 'attempts', type: 'int', default: 0 },
          { name: 'version', type: 'int', default: 1 },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.query(
      'ALTER TABLE saga_instances ADD CONSTRAINT uq_saga_instances_lot UNIQUE (lot_id)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_saga_instances_status ON saga_instances (status)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('saga_instances');
  }
}
