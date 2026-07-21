import type {
  MyBidItem,
  MyBidStatus,
} from '@src/modules/bidding/application/get-my-bids.handler';
import type { Money } from '@src/modules/bidding/domain/bid';

export class MyBidDto {
  id!: string;
  lotId!: string;
  amount!: Money;
  createdAt!: Date;
  status!: MyBidStatus;
}

export class MyBidsResponseDto {
  items!: MyBidDto[];
  nextCursor?: string;
}

export function toMyBidDto(item: MyBidItem): MyBidDto {
  return {
    id: item.id,
    lotId: item.lotId,
    amount: item.amount,
    createdAt: item.createdAt,
    status: item.status,
  };
}
