import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@src/platform/redis/redis-client.token';
import { SCHEDULER_CLAIM_DUE } from './scheduler.lua';

export interface TickResult {
  readonly claimed: number;
  readonly dispatched: number;
  readonly requeued: number;
}

export interface TickOptions {
  batchSize?: number;
  retryDelayMs?: number;
}

interface SchedulerCommands {
  schedulerClaimDue(
    setKey: string,
    now: string,
    batchSize: string,
  ): Promise<string[]>;
}

@Injectable()
export class ZSetScheduler {
  private readonly commands: SchedulerCommands;

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    client.defineCommand('schedulerClaimDue', {
      numberOfKeys: 1,
      lua: SCHEDULER_CLAIM_DUE,
    });
    this.commands = client as unknown as SchedulerCommands;
  }

  /**
   * payload обязан быть стабильным идентификатором на (лот, действие) — например, просто lotId.
   * Повторный schedule того же payload обновляет score существующего члена (продление/анти-снайп),
   * а не создаёт второй элемент. Включение временных меток/случайных суффиксов в payload сломает
   * анти-снайп и приведёт к дублирующимся диспатчам.
   */
  async schedule(
    setKey: string,
    dueAtMs: number,
    payload: string,
  ): Promise<void> {
    await this.client.zadd(setKey, dueAtMs, payload);
  }

  async tick(
    setKey: string,
    dispatch: (payload: string) => Promise<void>,
    opts: TickOptions = {},
  ): Promise<TickResult> {
    const batchSize = opts.batchSize ?? 100;
    const retryDelayMs = opts.retryDelayMs ?? 5000;
    const now = Date.now();

    const claimed = await this.commands.schedulerClaimDue(
      setKey,
      String(now),
      String(batchSize),
    );

    let dispatched = 0;
    let requeued = 0;
    for (const payload of claimed) {
      try {
        await dispatch(payload);
        dispatched += 1;
      } catch {
        // GT: don't roll back a later due date if a concurrent schedule() already extended it
        await this.client.zadd(setKey, 'GT', now + retryDelayMs, payload);
        requeued += 1;
      }
    }

    return { claimed: claimed.length, dispatched, requeued };
  }
}
