import { formatMoney } from '@/lib/format-money';
import type { LiveBid } from '@/lib/lot-bids-cache';

export function BidHistory({
  bids,
  carrierId,
}: {
  bids: LiveBid[];
  carrierId: string;
}) {
  if (bids.length === 0) {
    return <p className="text-zinc-500">Ставок пока нет.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {bids.map((bid) => (
        <li
          key={bid.id}
          className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
            bid.isCurrentBest
              ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950'
              : 'border-zinc-200 dark:border-zinc-800'
          }`}
        >
          <span>
            {formatMoney(bid.amount)}
            {bid.carrierId === carrierId && (
              <span className="ml-2 text-xs text-zinc-500">(вы)</span>
            )}
            {bid.pending && (
              <span className="ml-2 text-xs text-zinc-500">
                отправляется…
              </span>
            )}
          </span>
          {bid.isCurrentBest && (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              лидирует
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
