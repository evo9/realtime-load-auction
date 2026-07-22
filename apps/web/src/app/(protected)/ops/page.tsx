import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { ApiError } from '@/lib/api/client';
import { getOpsDlq, getOpsSagas } from '@/lib/api/endpoints';
import { SagaFilters } from '@/components/ops/saga-filters';
import { SagaTable } from '@/components/ops/saga-table';
import { DlqPanel } from '@/components/ops/dlq-panel';
import type { DlqQueueSummaryDto, SagaOpsDto, SagaStatus, SagaStep } from '@/types/contracts';

const SAGA_STATUSES: SagaStatus[] = ['running', 'compensating', 'completed', 'failed'];
const SAGA_STEPS: SagaStep[] = [
  'lock',
  'winner',
  'reserve',
  'invoice',
  'notify',
  'settle',
];

interface OpsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// A hand-typed ?status=garbage would otherwise reach the backend, fail its
// @IsIn validation with 400, and surface as a generic load-failure message —
// dropping unknown values here keeps a bad filter silently inert instead.
function asSagaStatus(value: string | undefined): SagaStatus | undefined {
  return SAGA_STATUSES.find((status) => status === value);
}

function asSagaStep(value: string | undefined): SagaStep | undefined {
  return SAGA_STEPS.find((step) => step === value);
}

export default async function OpsPage({ searchParams }: OpsPageProps) {
  const rawParams = await searchParams;
  const status = asSagaStatus(first(rawParams.status));
  const step = asSagaStep(first(rawParams.step));
  const cookieStore = await cookies();
  const token = cookieStore.get('auth.token')?.value;

  if (!token) {
    return (
      <div className="p-8">
        <p className="text-zinc-500">Войдите, чтобы увидеть ops-экран.</p>
      </div>
    );
  }

  let sagas: SagaOpsDto[] | undefined;
  let dlq: DlqQueueSummaryDto[] | undefined;
  let loadError: 'forbidden' | 'unknown' | null = null;
  try {
    [sagas, dlq] = await Promise.all([
      getOpsSagas({ status, step }, token),
      getOpsDlq(undefined, token),
    ]);
  } catch (err) {
    loadError = err instanceof ApiError && err.status === 403 ? 'forbidden' : 'unknown';
  }

  if (loadError === 'forbidden') {
    return (
      <div className="p-8">
        <p className="text-zinc-500">Доступ к ops-экрану есть только у роли admin.</p>
      </div>
    );
  }

  if (loadError === 'unknown' || !sagas || !dlq) {
    return (
      <div className="p-8">
        <p className="text-red-600">Не удалось загрузить ops-данные.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Саги закрытия
        </h1>
        <Suspense>
          <SagaFilters />
        </Suspense>
        <SagaTable sagas={sagas} />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">DLQ</h2>
        <DlqPanel queues={dlq} />
      </section>
    </div>
  );
}
