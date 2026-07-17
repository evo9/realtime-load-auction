import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateLots1784400000000 implements MigrationInterface {
  name = 'CreateLots1784400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'lots',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'shipper_id', type: 'uuid' },
          { name: 'origin', type: 'varchar' },
          { name: 'destination', type: 'varchar' },
          { name: 'equipment_type', type: 'varchar' },
          { name: 'weight_kg', type: 'int' },
          { name: 'pickup_from', type: 'timestamptz' },
          { name: 'pickup_to', type: 'timestamptz' },
          { name: 'reserve_price', type: 'int' },
          { name: 'target_price', type: 'int', isNullable: true },
          { name: 'open_at', type: 'timestamptz' },
          { name: 'close_at', type: 'timestamptz' },
          { name: 'anti_snipe_window_sec', type: 'int' },
          { name: 'status', type: 'varchar' },
          { name: 'version', type: 'int', default: 1 },
          { name: 'winning_bid_id', type: 'uuid', isNullable: true },
          { name: 'winning_amount', type: 'int', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.query(
      'CREATE INDEX idx_lots_status_close_at ON lots (status, close_at)',
    );

    await queryRunner.query(
      "ALTER TABLE lots ADD CONSTRAINT chk_lots_status CHECK (status IN ('draft','scheduled','open','closing','settled','cancelled'))",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('lots');
  }
}
