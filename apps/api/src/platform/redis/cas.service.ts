import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@src/platform/redis/redis-client.token';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { CAS_BEAT_HIGH_BID } from '@src/platform/redis/lua-scripts';

export interface CasResult {
  readonly accepted: boolean;
  readonly reason: string;
}

interface CasCommands {
  casBeatHighBid(
    highKey: string,
    statusKey: string,
    amount: string,
    carrierId: string,
    bidId: string,
  ): Promise<[number, string]>;
}

@Injectable()
export class CasService {
  private readonly commands: CasCommands;

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    client.defineCommand('casBeatHighBid', {
      numberOfKeys: 2,
      lua: CAS_BEAT_HIGH_BID,
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
}
