import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateInvoices1785100000000 implements MigrationInterface {
  name = 'CreateInvoices1785100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'invoices',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'lot_id', type: 'uuid' },
          { name: 'saga_id', type: 'uuid' },
          { name: 'bid_id', type: 'uuid' },
          { name: 'amount', type: 'int' },
          { name: 'carrier_id', type: 'uuid' },
          { name: 'status', type: 'varchar' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.query(
      'ALTER TABLE invoices ADD CONSTRAINT uq_invoices_lot UNIQUE (lot_id)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_invoices_saga ON invoices (saga_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('invoices');
  }
}
