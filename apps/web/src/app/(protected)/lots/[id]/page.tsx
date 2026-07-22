import { cookies } from 'next/headers';
import { getLot, getLotBids, getMe } from '@/lib/api/endpoints';
import { LiveLot } from '@/components/lots/live-lot';

const EQUIPMENT_LABELS: Record<string, string> = {
  van: 'Фургон',
  reefer: 'Рефрижератор',
  flatbed: 'Платформа',
};

interface LotPageProps {
  params: Promise<{ id: string }>;
}

export default async function LotPage({ params }: LotPageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('auth.token')?.value;

  if (!token) {
    return (
      <div className="p-8">
        <p className="text-zinc-500">Войдите, чтобы увидеть лот.</p>
      </div>
    );
  }

  let data;
  try {
    data = await Promise.all([
      getLot(id, token),
      getLotBids(id, { sort: 'amount' }, token),
      getMe(token),
    ]);
  } catch {
    return (
      <div className="p-8">
        <p className="text-red-600">Не удалось загрузить лот.</p>
      </div>
    );
  }
  const [lot, bids, me] = data;

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {lot.origin} → {lot.destination}
        </h1>
        <p className="text-sm text-zinc-500">
          {EQUIPMENT_LABELS[lot.equipmentType] ?? lot.equipmentType} ·{' '}
          {lot.weightKg} кг
        </p>
      </div>
      <LiveLot lotId={id} initialLot={lot} initialBids={bids} carrierId={me.sub} />
    </div>
  );
}
