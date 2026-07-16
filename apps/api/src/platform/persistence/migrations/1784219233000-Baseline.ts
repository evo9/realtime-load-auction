import { MigrationInterface } from 'typeorm';

export class Baseline1784219233000 implements MigrationInterface {
  name = 'Baseline1784219233000';

  // Intentionally empty — proves the migration pipeline (CLI, migrations
  // table, connection) works before any real schema exists.
  async up(): Promise<void> {}

  async down(): Promise<void> {}
}
