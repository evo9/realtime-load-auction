import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@src/platform/redis/redis-client.token';
import { LOCK_RELEASE } from '@src/platform/redis/lua-scripts';

export interface Lock {
  readonly key: string;
  readonly token: string;
}

@Injectable()
export class LockService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async acquire(key: string, ttlMs: number): Promise<Lock | null> {
    const token = randomUUID();
    const result = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? { key, token } : null;
  }

  async release(lock: Lock): Promise<boolean> {
    const result = await this.client.eval(
      LOCK_RELEASE,
      1,
      lock.key,
      lock.token,
    );
    return result === 1;
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const lock = await this.acquire(key, ttlMs);
    if (!lock) return null;

    try {
      return await fn();
    } finally {
      await this.release(lock);
    }
  }
}
