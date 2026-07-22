import Link from 'next/link';
import { formatMoney } from '@/lib/format-money';
import type { SagaOpsDto, SagaStatus } from '@/types/contracts';

const STATUS_CLASSES: Record<SagaStatus, string> = {
  running:
    'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-400',
  compensating:
    'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400',
  completed:
    'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  failed:
    'border-red-400 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-400',
};

function SagaStatusBadge({ status }: { status: SagaStatus }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}

export function SagaTable({ sagas }: { sagas: SagaOpsDto[] }) {
  if (sagas.length === 0) {
    return <p className="text-zinc-500">Саг не найдено.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <th className="py-2 pr-4 font-medium">Лот</th>
            <th className="py-2 pr-4 font-medium">Шаг</th>
            <th className="py-2 pr-4 font-medium">Статус</th>
            <th className="py-2 pr-4 font-medium">Попытки</th>
            <th className="py-2 pr-4 font-medium">Обновлено</th>
            <th className="py-2 pr-4 font-medium">Детали</th>
          </tr>
        </thead>
        <tbody>
          {sagas.map((saga) => (
            <tr
              key={saga.id}
              className="border-b border-zinc-100 dark:border-zinc-900"
            >
              <td className="py-2 pr-4">
                <Link
                  href={`/lots/${saga.lotId}`}
                  className="font-medium hover:underline"
                >
                  {saga.lotId.slice(0, 8)}…
                </Link>
              </td>
              <td className="py-2 pr-4 font-mono text-xs">{saga.step}</td>
              <td className="py-2 pr-4">
                <SagaStatusBadge status={saga.status} />
              </td>
              <td className="py-2 pr-4">{saga.attempts}</td>
              <td className="py-2 pr-4 text-zinc-500">
                {new Date(saga.updatedAt).toLocaleString('ru-RU')}
              </td>
              <td className="flex flex-col gap-1 py-2 pr-4 text-zinc-500">
                {saga.payload.failureReason && (
                  <span>Причина: {saga.payload.failureReason}</span>
                )}
                {saga.payload.winningAmount !== undefined && (
                  <span>Победа: {formatMoney(saga.payload.winningAmount)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
