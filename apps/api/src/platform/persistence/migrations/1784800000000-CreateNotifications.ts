import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateNotifications1784800000000 implements MigrationInterface {
  name = 'CreateNotifications1784800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'message_id', type: 'varchar' },
          { name: 'recipient_id', type: 'uuid' },
          { name: 'type', type: 'varchar' },
          { name: 'channel', type: 'varchar', default: "'email'" },
          { name: 'lot_id', type: 'uuid' },
          { name: 'payload', type: 'jsonb' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.query(
      'ALTER TABLE notifications ADD CONSTRAINT uq_notifications_dedup UNIQUE (message_id, recipient_id, type, channel)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, created_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notifications');
  }
}
