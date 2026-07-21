import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '@src/config/app-config.service';
import { REDIS_CLIENT } from '@src/platform/redis/redis-client.token';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import type { DedupPort } from '@src/platform/messaging/dedup.port';

@Injectable()
export class RedisDedupPort implements DedupPort {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    private readonly config: AppConfigService,
  ) {}

  async seen(queue: string, messageId: string): Promise<boolean> {
    const exists = await this.client.exists(
      RedisKeys.msgDedup(queue, messageId),
    );
    return exists === 1;
  }

  async mark(queue: string, messageId: string): Promise<void> {
    await this.client.set(
      RedisKeys.msgDedup(queue, messageId),
      '1',
      'PX',
      this.config.idempotency.msgDedupTtlMs,
    );
  }
}
