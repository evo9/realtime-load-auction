import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { ApiError } from '@/lib/api/client';
import { listLots } from '@/lib/api/endpoints';
import { LotCard } from '@/components/lots/lot-card';
import { LotFilters } from '@/components/lots/lot-filters';
import { LotPagination } from '@/components/lots/lot-pagination';
import type {
  EquipmentType,
  ListLotsResponse,
  LotStatus,
} from '@/types/contracts';

interface LotsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LotsPage({ searchParams }: LotsPageProps) {
  const rawParams = await searchParams;
  const params: Record<string, string | undefined> = {
    status: first(rawParams.status),
    equipmentType: first(rawParams.equipmentType),
    origin: first(rawParams.origin),
    destination: first(rawParams.destination),
    cursor: first(rawParams.cursor),
  };
  const cookieStore = await cookies();
  const token = cookieStore.get('auth.token')?.value;

  if (!token) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Лоты
        </h1>
        <p className="mt-2 text-zinc-500">Войдите, чтобы увидеть список лотов.</p>
      </div>
    );
  }

  let response: ListLotsResponse | undefined;
  let loadError: string | null = null;
  try {
    response = await listLots(
      {
        status: params.status as LotStatus | undefined,
        equipmentType: params.equipmentType as EquipmentType | undefined,
        origin: params.origin,
        destination: params.destination,
        cursor: params.cursor,
      },
      token,
    );
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : 'Не удалось загрузить список лотов';
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Лоты
      </h1>
      <Suspense>
        <LotFilters />
      </Suspense>
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {response && response.items.length === 0 && (
        <p className="text-zinc-500">Лоты не найдены.</p>
      )}
      {response && response.items.length > 0 && (
        <div className="grid gap-3">
          {response.items.map((lot) => (
            <LotCard key={lot.id} lot={lot} />
          ))}
        </div>
      )}
      {response && (
        <LotPagination searchParams={params} nextCursor={response.nextCursor} />
      )}
    </div>
  );
}
