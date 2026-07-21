import type { BidHistoryItem } from '@src/modules/bidding/application/get-lot-bids.handler';
import type { Money } from '@src/modules/bidding/domain/bid';

export class BidHistoryItemDto {
  id!: string;
  carrierId!: string;
  amount!: Money;
  createdAt!: Date;
  isCurrentBest!: boolean;
}

export class BidHistoryResponseDto {
  items!: BidHistoryItemDto[];
  nextCursor?: string;
}

export function toBidHistoryItemDto(item: BidHistoryItem): BidHistoryItemDto {
  return {
    id: item.id,
    carrierId: item.carrierId,
    amount: item.amount,
    createdAt: item.createdAt,
    isCurrentBest: item.isCurrentBest,
  };
}
