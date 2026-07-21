import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateFundReservations1785000000000 implements MigrationInterface {
  name = 'CreateFundReservations1785000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'fund_reservations',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'lot_id', type: 'uuid' },
          { name: 'saga_id', type: 'uuid' },
          { name: 'amount', type: 'int' },
          { name: 'status', type: 'varchar' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.query(
      'ALTER TABLE fund_reservations ADD CONSTRAINT uq_fund_reservations_lot UNIQUE (lot_id)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_fund_reservations_saga ON fund_reservations (saga_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('fund_reservations');
  }
}
