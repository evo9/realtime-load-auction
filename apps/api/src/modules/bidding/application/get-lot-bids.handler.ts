import { Injectable } from '@nestjs/common';
import {
  decodeCursor,
  encodeCursor,
} from '@src/modules/bidding/application/bid-cursor';
import { Money } from '@src/modules/bidding/domain/bid';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';

export interface GetLotBidsQuery {
  lotId: string;
  sort?: 'amount' | 'time';
  cursor?: string;
  limit?: number;
}

export interface BidHistoryItem {
  id: string;
  carrierId: string;
  amount: Money;
  createdAt: Date;
  isCurrentBest: boolean;
}

const DEFAULT_LIMIT = 20;

@Injectable()
export class GetLotBidsHandler {
  constructor(private readonly bids: BidRepository) {}

  async execute(
    query: GetLotBidsQuery,
  ): Promise<{ items: BidHistoryItem[]; nextCursor?: string }> {
    const sort = query.sort ?? 'amount';
    const limit = query.limit ?? DEFAULT_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const [rows, best] = await Promise.all([
      this.bids.listByLot(query.lotId, { sort, cursor, limit }),
      this.bids.findCurrentBest(query.lotId),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = page.map((entity) => ({
      id: entity.id,
      carrierId: entity.carrierId,
      amount: entity.amount,
      createdAt: entity.createdAt,
      isCurrentBest: best !== null && best.bidId === entity.id,
    }));

    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor(
            sort === 'amount'
              ? String(last.amount)
              : last.createdAt.toISOString(),
            last.id,
          )
        : undefined;

    return { items, nextCursor };
  }
}
