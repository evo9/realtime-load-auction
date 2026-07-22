import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLotLastBidAt1785200000000 implements MigrationInterface {
  name = 'AddLotLastBidAt1785200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE lots ADD COLUMN last_bid_at TIMESTAMPTZ',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE lots DROP COLUMN last_bid_at');
  }
}
