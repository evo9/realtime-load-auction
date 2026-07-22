import { formatMoney } from '@/lib/format-money';
import type { BidHistoryItemDto } from '@/types/contracts';

export function BestBid({ bids }: { bids: BidHistoryItemDto[] }) {
  const best = bids.find((bid) => bid.isCurrentBest);

  return (
    <div>
      <div className="text-sm text-zinc-500">Текущая лучшая ставка</div>
      <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {best ? formatMoney(best.amount) : 'Ставок нет'}
      </div>
    </div>
  );
}
