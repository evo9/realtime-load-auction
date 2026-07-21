import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@src/config/app-config.service';
import { RoutingKeys } from '@src/platform/messaging/messaging.constants';
import { IdempotencyService } from '@src/platform/idempotency/idempotency.service';
import { CasService } from '@src/platform/redis/cas.service';
import { RateLimiter } from '@src/platform/redis/rate-limiter';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { Money } from '@src/modules/bidding/domain/bid';
import { LotNotOpenError } from '@src/modules/bidding/domain/errors';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';

export interface PlaceBidCommand {
  lotId: string;
  carrierId: string;
  amount: Money;
  idempotencyKey: string;
}

export interface BidView {
  id: string;
  lotId: string;
  carrierId: string;
  amount: Money;
  createdAt: string;
}

export type PlaceBidOutcome =
  | { status: 'accepted'; bid: BidView }
  | { status: 'rejected'; reason: 'too_low' | 'closed' }
  | { status: 'rate_limited' }
  | { status: 'in_progress' };

@Injectable()
export class PlaceBidHandler {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly idem: IdempotencyService,
    private readonly cas: CasService,
    private readonly uow: UnitOfWork,
    private readonly bids: BidRepository,
    private readonly lots: LotRepository,
    private readonly config: AppConfigService,
  ) {}

  async execute(cmd: PlaceBidCommand): Promise<PlaceBidOutcome> {
    const rate = await this.rateLimiter.hit(
      RedisKeys.rateLimit(cmd.carrierId, cmd.lotId),
      {
        limit: this.config.bidding.rateLimit,
        windowMs: this.config.bidding.rateWindowMs,
      },
    );
    if (!rate.allowed) return { status: 'rate_limited' };

    const scopedKey = `${cmd.carrierId}:${cmd.idempotencyKey}`;
    const outcome = await this.idem.begin<PlaceBidOutcome>(scopedKey);
    if (outcome.status === 'replay') return outcome.result;
    if (outcome.status === 'in_progress') return { status: 'in_progress' };

    const bidId = randomUUID();
    const verdict = await this.cas.tryBeatHighBid(
      cmd.lotId,
      cmd.amount,
      cmd.carrierId,
      bidId,
    );
    if (!verdict.accepted) {
      return this.idem.complete(scopedKey, {
        status: 'rejected',
        reason: verdict.reason as 'too_low' | 'closed',
      });
    }

    try {
      const result = await this.uow.transaction(async (tx) => {
        const status = await this.lots.readStatus(tx, cmd.lotId);
        if (status !== 'open') throw new LotNotOpenError(cmd.lotId);

        const bid = await this.bids.insert(tx, {
          id: bidId,
          lotId: cmd.lotId,
          carrierId: cmd.carrierId,
          amount: cmd.amount,
          idempotencyKey: cmd.idempotencyKey,
        });
        await tx.outbox.add(tx.manager, RoutingKeys.bidPlaced, {
          lotId: bid.lotId,
          bidId: bid.id,
          carrierId: bid.carrierId,
          amount: bid.amount,
          createdAt: bid.createdAt.toISOString(),
        });
        return {
          status: 'accepted' as const,
          bid: {
            id: bid.id,
            lotId: bid.lotId,
            carrierId: bid.carrierId,
            amount: bid.amount,
            createdAt: bid.createdAt.toISOString(),
          },
        };
      });
      return this.idem.complete(scopedKey, result);
    } catch (err) {
      // The CAS write above already made bidId the Redis candidate. If the
      // TX never commits, that candidate is a lie the DB never recorded —
      // reconcile it back to whatever Postgres actually holds, fenced so a
      // newer legitimate bid (which raced in after this one) is left alone.
      const best = await this.bids.findCurrentBest(cmd.lotId);
      await this.cas.reconcileIfCurrent(cmd.lotId, bidId, best);
      if (err instanceof LotNotOpenError) {
        return this.idem.complete(scopedKey, {
          status: 'rejected',
          reason: 'closed',
        });
      }
      throw err;
    }
  }
}
