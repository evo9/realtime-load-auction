import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateOutbox1784300000000 implements MigrationInterface {
  name = 'CreateOutbox1784300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'outbox',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'routing_key', type: 'varchar' },
          { name: 'payload', type: 'jsonb' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          {
            name: 'published_at',
            type: 'timestamptz',
            isNullable: true,
          },
          { name: 'attempts', type: 'int', default: 0 },
        ],
      }),
    );

    await queryRunner.query(
      'CREATE INDEX idx_outbox_unpublished ON outbox (created_at) WHERE published_at IS NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('outbox');
  }
}
