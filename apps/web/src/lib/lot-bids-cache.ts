import type { BidHistoryItemDto } from '@/types/contracts';

export interface LiveBid extends BidHistoryItemDto {
  pending?: boolean;
}

export interface LiveBidHistory {
  items: LiveBid[];
  nextCursor?: string;
}

// Reverse auction: the lowest amount wins, so isCurrentBest is recomputed
// across the merged set rather than trusted from any single incoming item.
// `resolvePending` lets a real bid (from the 201 response or from the WS
// bid.placed, whichever lands first) collapse the matching optimistic
// placeholder instead of appearing as a second row.
export function upsertLiveBid(
  current: LiveBidHistory | undefined,
  incoming: LiveBid,
  resolvePending?: { carrierId: string; amount: number },
): LiveBidHistory {
  const items = (current?.items ?? []).filter((item) => {
    if (item.id === incoming.id) return false;
    if (
      resolvePending &&
      item.pending &&
      item.carrierId === resolvePending.carrierId &&
      item.amount === resolvePending.amount
    ) {
      return false;
    }
    return true;
  });
  const merged = [...items, incoming];
  const minAmount = Math.min(...merged.map((item) => item.amount));
  const withBestFlag = merged
    .map((item) => ({ ...item, isCurrentBest: item.amount === minAmount }))
    .sort((a, b) => a.amount - b.amount || a.id.localeCompare(b.id));
  return { items: withBestFlag, nextCursor: current?.nextCursor };
}
