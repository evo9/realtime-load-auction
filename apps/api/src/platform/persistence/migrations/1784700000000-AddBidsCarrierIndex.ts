import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBidsCarrierIndex1784700000000 implements MigrationInterface {
  name = 'AddBidsCarrierIndex1784700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX idx_bids_carrier_created ON bids (carrier_id, created_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_bids_carrier_created');
  }
}
