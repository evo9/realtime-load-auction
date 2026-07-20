import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '@src/config/app-config.service';
import { REDIS_CLIENT } from '@src/platform/redis/redis-client.token';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { IDEM_BEGIN } from '@src/platform/redis/lua-scripts';

export type IdempotencyOutcome<R> =
  | { status: 'new' }
  | { status: 'replay'; result: R }
  | { status: 'in_progress' };

type IdempotencyEnvelope<R> =
  | { status: 'in_progress' }
  | { status: 'done'; result: R };

interface IdempotencyCommands {
  idemBegin(
    key: string,
    envelope: string,
    inProgressTtlMs: string,
  ): Promise<string | null>;
}

/**
 * Platform-level cache/lock on the client-supplied `Idempotency-Key`. It has
 * no notion of "user" or "route" — callers own scoping. Compose `key` from
 * the authenticated principal (e.g. `${carrierId}:${idempotencyKey}`) before
 * calling `begin`/`complete`, otherwise two different callers reusing the
 * same header value would replay each other's cached result. `result` is
 * cached verbatim for up to `doneTtlMs`; callers must not pass secrets/PII.
 */
@Injectable()
export class IdempotencyService {
  private readonly commands: IdempotencyCommands;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    private readonly config: AppConfigService,
  ) {
    client.defineCommand('idemBegin', {
      numberOfKeys: 1,
      lua: IDEM_BEGIN,
    });
    this.commands = client as unknown as IdempotencyCommands;
  }

  async begin<R>(key: string): Promise<IdempotencyOutcome<R>> {
    const envelope: IdempotencyEnvelope<R> = { status: 'in_progress' };
    const existing = await this.commands.idemBegin(
      RedisKeys.idem(key),
      JSON.stringify(envelope),
      String(this.config.idempotency.inProgressTtlMs),
    );

    // a Lua `false` reply arrives here as `null` (RESP nil) via ioredis
    if (existing === null) {
      return { status: 'new' };
    }

    const parsed = JSON.parse(existing) as IdempotencyEnvelope<R>;
    if (parsed.status === 'done') {
      return { status: 'replay', result: parsed.result };
    }
    return { status: 'in_progress' };
  }

  async complete<R>(key: string, result: R): Promise<R> {
    const envelope: IdempotencyEnvelope<R> = { status: 'done', result };
    await this.client.set(
      RedisKeys.idem(key),
      JSON.stringify(envelope),
      'PX',
      this.config.idempotency.doneTtlMs,
    );
    return result;
  }
}
