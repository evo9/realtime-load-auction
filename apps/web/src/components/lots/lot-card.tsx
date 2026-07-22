import Link from 'next/link';
import { Countdown } from '@/components/lots/countdown';
import type { ListingLotDto } from '@/types/contracts';

const EQUIPMENT_LABELS: Record<string, string> = {
  van: 'Фургон',
  reefer: 'Рефрижератор',
  flatbed: 'Платформа',
};

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function LotCard({ lot }: { lot: ListingLotDto }) {
  return (
    <Link
      href={`/lots/${lot.id}`}
      className="block rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">
          {lot.origin} → {lot.destination}
        </span>
        <span className="text-sm text-zinc-500">
          {EQUIPMENT_LABELS[lot.equipmentType] ?? lot.equipmentType}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
        <span>
          {lot.currentBest !== undefined
            ? `Лучшая ставка: ${currencyFormatter.format(lot.currentBest)}`
            : 'Ставок нет'}
        </span>
        <span>
          Торги: <Countdown closeAt={lot.closeAt} />
        </span>
      </div>
    </Link>
  );
}
