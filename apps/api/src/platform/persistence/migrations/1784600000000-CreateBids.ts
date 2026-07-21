import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateBids1784600000000 implements MigrationInterface {
  name = 'CreateBids1784600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // lot_id intentionally has no FK to lots: an INSERT into a referencing
    // table takes FOR KEY SHARE on the parent row, which would contend with
    // CloseLotHandler's FOR UPDATE and stall the hot path during a close.
    // Referential integrity is upheld by the write path instead — a bid row
    // is only ever created after the CAS + status check pass.
    await queryRunner.createTable(
      new Table({
        name: 'bids',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'lot_id', type: 'uuid' },
          { name: 'carrier_id', type: 'uuid' },
          { name: 'amount', type: 'int' },
          // scoped by ${carrierId}:${idempotencyKey} in Redis, not unique
          // here: two carriers may legitimately reuse the same header value,
          // and a bare DB constraint would turn a post-TTL replay into a
          // constraint-violation 500 instead of a clean idempotent response
          { name: 'idempotency_key', type: 'varchar' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.query(
      'CREATE INDEX idx_bids_lot_amount ON bids (lot_id, amount, created_at)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_bids_lot_created ON bids (lot_id, created_at)',
    );

    await queryRunner.query(
      'ALTER TABLE bids ADD CONSTRAINT chk_bids_amount_positive CHECK (amount > 0)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('bids');
  }
}
