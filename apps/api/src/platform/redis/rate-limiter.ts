import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@src/platform/redis/redis-client.token';
import { RATE_LIMIT_HIT } from '@src/platform/redis/lua-scripts';

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
}

interface RateLimiterCommands {
  rateLimitHit(
    key: string,
    now: string,
    windowMs: string,
    limit: string,
    member: string,
  ): Promise<[number, number]>;
}

@Injectable()
export class RateLimiter {
  private readonly commands: RateLimiterCommands;

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    client.defineCommand('rateLimitHit', {
      numberOfKeys: 1,
      lua: RATE_LIMIT_HIT,
    });
    this.commands = client as unknown as RateLimiterCommands;
  }

  async hit(
    key: string,
    opts: { limit: number; windowMs: number },
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const member = `${now}-${randomUUID()}`;

    const [allowed, remaining] = await this.commands.rateLimitHit(
      key,
      String(now),
      String(opts.windowMs),
      String(opts.limit),
      member,
    );

    return { allowed: allowed === 1, remaining };
  }
}
