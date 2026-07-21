import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@src/platform/redis/redis-client.token';
import {
  LOCK_ACQUIRE_OWNED,
  LOCK_RELEASE,
} from '@src/platform/redis/lua-scripts';

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

  // Unlike acquire(), the token is caller-supplied and persisted (e.g. in a
  // saga's payload) so a step that crashes after acquiring but before
  // committing can safely retry: it re-presents the same token and gets the
  // lock back instead of being fenced out by its own earlier attempt.
  async acquireOwned(
    key: string,
    token: string,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.client.eval(
      LOCK_ACQUIRE_OWNED,
      1,
      key,
      token,
      ttlMs,
    );
    return result === 1;
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
