import { Injectable } from '@nestjs/common';
import type { HighBidCandidate } from '@src/platform/redis/cas.service';
import {
  decodeCursor,
  encodeCursor,
} from '@src/modules/bidding/application/bid-cursor';
import { Money } from '@src/modules/bidding/domain/bid';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';
import { Lot } from '@src/modules/auction/domain/lot';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';

export type MyBidStatus = 'leading' | 'outbid' | 'won' | 'lost';

export interface GetMyBidsQuery {
  carrierId: string;
  cursor?: string;
  limit?: number;
}

export interface MyBidItem {
  id: string;
  lotId: string;
  amount: Money;
  createdAt: Date;
  status: MyBidStatus;
}

const DEFAULT_LIMIT = 20;

@Injectable()
export class GetMyBidsHandler {
  constructor(
    private readonly bids: BidRepository,
    private readonly lots: LotRepository,
  ) {}

  async execute(
    query: GetMyBidsQuery,
  ): Promise<{ items: MyBidItem[]; nextCursor?: string }> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const rows = await this.bids.listByCarrier(query.carrierId, {
      cursor,
      limit,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const uniqueLotIds = [...new Set(page.map((r) => r.lotId))];
    const [lots, bests] = await Promise.all([
      Promise.all(uniqueLotIds.map((id) => this.lots.findById(id))),
      Promise.all(uniqueLotIds.map((id) => this.bids.findCurrentBest(id))),
    ]);
    const lotById = new Map(uniqueLotIds.map((id, i) => [id, lots[i]]));
    const bestByLot = new Map(uniqueLotIds.map((id, i) => [id, bests[i]]));

    const items = page.map((entity) => {
      const lot = lotById.get(entity.lotId);
      const best = bestByLot.get(entity.lotId);
      return {
        id: entity.id,
        lotId: entity.lotId,
        amount: entity.amount,
        createdAt: entity.createdAt,
        status: this.deriveStatus(lot, best, entity.id),
      };
    });

    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor(last.createdAt.toISOString(), last.id)
        : undefined;

    return { items, nextCursor };
  }

  private deriveStatus(
    lot: Lot | null | undefined,
    best: HighBidCandidate | null | undefined,
    bidId: string,
  ): MyBidStatus {
    if (!lot) return 'outbid';
    if (lot.status === 'open' || lot.status === 'closing') {
      return best?.bidId === bidId ? 'leading' : 'outbid';
    }
    if (lot.status === 'settled') {
      return lot.winningBidId === bidId ? 'won' : 'lost';
    }
    return 'outbid';
  }
}
