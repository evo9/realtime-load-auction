import Link from 'next/link';
import { cookies } from 'next/headers';
import { ApiError } from '@/lib/api/client';
import { getMyBids } from '@/lib/api/endpoints';
import { LotPagination } from '@/components/lots/lot-pagination';
import { StatusBadge } from '@/components/my-bids/status-badge';
import { formatMoney } from '@/lib/format-money';
import type { MyBidsResponse } from '@/types/contracts';

interface MyBidsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// TODO: live-обновление статуса через WS. Требует мультиплексации useLotChannel
// на несколько лотов одновременно (эта страница может показывать ставки на
// разных лотах сразу) — сейчас статус освежается только при повторном заходе
// на страницу, тем же SSR-фетчем, что и при первом рендере.
export default async function MyBidsPage({ searchParams }: MyBidsPageProps) {
  const rawParams = await searchParams;
  const params: Record<string, string | undefined> = {
    cursor: first(rawParams.cursor),
  };
  const cookieStore = await cookies();
  const token = cookieStore.get('auth.token')?.value;

  if (!token) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Мои ставки
        </h1>
        <p className="mt-2 text-zinc-500">Войдите, чтобы увидеть свои ставки.</p>
      </div>
    );
  }

  let response: MyBidsResponse | undefined;
  let loadError: string | null = null;
  try {
    response = await getMyBids({ cursor: params.cursor }, token);
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : 'Не удалось загрузить ставки';
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Мои ставки
      </h1>
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {response && response.items.length === 0 && (
        <p className="text-zinc-500">Вы ещё не делали ставок.</p>
      )}
      {response && response.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {response.items.map((bid) => (
            <li key={bid.id}>
              <Link
                href={`/lots/${bid.lotId}`}
                className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 text-sm transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <div className="flex flex-col">
                  <span>{formatMoney(bid.amount)}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(bid.createdAt).toLocaleString('ru-RU')}
                  </span>
                </div>
                <StatusBadge status={bid.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {response && (
        <LotPagination
          basePath="/me/bids"
          searchParams={params}
          nextCursor={response.nextCursor}
        />
      )}
    </div>
  );
}
