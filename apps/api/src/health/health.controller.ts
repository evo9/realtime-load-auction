import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@src/platform/redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.allSettled([
      this.dataSource.query('SELECT 1'),
      this.redis.ping(),
    ]);

    const status = {
      db: db.status === 'fulfilled' ? 'ok' : 'unreachable',
      redis: redis.status === 'fulfilled' ? 'ok' : 'unreachable',
    };

    if (db.status === 'rejected' || redis.status === 'rejected') {
      throw new ServiceUnavailableException({ status: 'error', ...status });
    }

    return { status: 'ok', ...status };
  }
}
