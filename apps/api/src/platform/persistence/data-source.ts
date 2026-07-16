import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

loadEnv({ path: resolve(__dirname, '../../..', '.env'), quiet: true });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [resolve(__dirname, '../../**/*.entity.ts')],
  migrations: [resolve(__dirname, 'migrations/*.ts')],
});
