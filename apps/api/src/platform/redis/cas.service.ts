import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@src/platform/redis/redis-client.token';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import {
  CAS_BEAT_HIGH_BID,
  RECONCILE_IF_CURRENT,
} from '@src/platform/redis/lua-scripts';

export interface CasResult {
  readonly accepted: boolean;
  readonly reason: string;
}

export interface HighBidCandidate {
  readonly amount: number;
  readonly carrierId: string;
  readonly bidId: string;
}

interface CasCommands {
  casBeatHighBid(
    highKey: string,
    statusKey: string,
    amount: string,
    carrierId: string,
    bidId: string,
  ): Promise<[number, string]>;
  reconcileIfCurrent(
    highKey: string,
    expectedBidId: string,
    hasFact: string,
    amount: string,
    carrierId: string,
    bidId: string,
  ): Promise<number>;
}

@Injectable()
export class CasService {
  private readonly commands: CasCommands;

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    client.defineCommand('casBeatHighBid', {
      numberOfKeys: 2,
      lua: CAS_BEAT_HIGH_BID,
    });
    client.defineCommand('reconcileIfCurrent', {
      numberOfKeys: 1,
      lua: RECONCILE_IF_CURRENT,
    });
    this.commands = client as unknown as CasCommands;
  }

  async tryBeatHighBid(
    lotId: string,
    amount: number,
    carrierId: string,
    bidId: string,
  ): Promise<CasResult> {
    const [accepted, reason] = await this.commands.casBeatHighBid(
      RedisKeys.lotHigh(lotId),
      RedisKeys.lotStatus(lotId),
      String(amount),
      carrierId,
      bidId,
    );

    return { accepted: accepted === 1, reason };
  }

  async setStatus(lotId: string, status: 'open' | 'closing'): Promise<void> {
    await this.client.set(RedisKeys.lotStatus(lotId), status);
  }

  async clear(lotId: string): Promise<void> {
    await this.client.del(RedisKeys.lotStatus(lotId), RedisKeys.lotHigh(lotId));
  }

  /**
   * Race-safe compensation: replaces the Redis high-bid candidate with the
   * Postgres fact only if it still matches `expectedBidId` — the candidate
   * this caller itself wrote and is now rolling back. A newer legitimate bid
   * changes `bidId`, so the fence fails and that candidate is left alone.
   */
  async reconcileIfCurrent(
    lotId: string,
    expectedBidId: string,
    candidate: HighBidCandidate | null,
  ): Promise<boolean> {
    const replaced = await this.commands.reconcileIfCurrent(
      RedisKeys.lotHigh(lotId),
      expectedBidId,
      candidate ? '1' : '0',
      String(candidate?.amount ?? ''),
      candidate?.carrierId ?? '',
      candidate?.bidId ?? '',
    );
    return replaced === 1;
  }

  /**
   * Unconditional rebuild for cold start / lot-open init, where no
   * concurrent writer exists by construction — unlike `reconcileIfCurrent`,
   * this does not fence against a newer candidate.
   */
  async reconcile(
    lotId: string,
    candidate: HighBidCandidate | null,
  ): Promise<void> {
    if (candidate) {
      await this.client.hset(RedisKeys.lotHigh(lotId), {
        amount: candidate.amount,
        carrierId: candidate.carrierId,
        bidId: candidate.bidId,
      });
    } else {
      await this.client.del(RedisKeys.lotHigh(lotId));
    }
  }
}
