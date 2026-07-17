import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateUsers1784227185000 implements MigrationInterface {
  name = 'CreateUsers1784227185000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'email', type: 'varchar', isUnique: true },
          { name: 'password_hash', type: 'varchar' },
          { name: 'role', type: 'varchar' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
