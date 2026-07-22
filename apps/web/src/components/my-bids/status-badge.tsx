import type { MyBidStatus } from '@/types/contracts';

const STATUS_LABELS: Record<MyBidStatus, string> = {
  leading: 'Лидирует',
  outbid: 'Перебита',
  won: 'Выиграна',
  lost: 'Лот закрыт',
};

const STATUS_CLASSES: Record<MyBidStatus, string> = {
  leading:
    'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  won: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  outbid:
    'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400',
  lost: 'border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400',
};

export function StatusBadge({ status }: { status: MyBidStatus }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
