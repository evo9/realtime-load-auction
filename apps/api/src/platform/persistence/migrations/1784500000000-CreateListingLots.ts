import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateListingLots1784500000000 implements MigrationInterface {
  name = 'CreateListingLots1784500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'listing_lots',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'shipper_id', type: 'uuid' },
          { name: 'origin', type: 'varchar' },
          { name: 'destination', type: 'varchar' },
          { name: 'equipment_type', type: 'varchar' },
          { name: 'weight_kg', type: 'int' },
          { name: 'reserve_price', type: 'int' },
          { name: 'target_price', type: 'int', isNullable: true },
          { name: 'status', type: 'varchar' },
          { name: 'open_at', type: 'timestamptz' },
          { name: 'close_at', type: 'timestamptz' },
          { name: 'current_best', type: 'int', isNullable: true },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.query(
      'CREATE INDEX idx_listing_lots_close_at_id ON listing_lots (close_at, id)',
    );

    await queryRunner.query(
      'CREATE INDEX idx_listing_lots_status_close_at_id ON listing_lots (status, close_at, id)',
    );

    await queryRunner.query(
      "ALTER TABLE listing_lots ADD CONSTRAINT chk_listing_lots_status CHECK (status IN ('open', 'closing'))",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('listing_lots');
  }
}
