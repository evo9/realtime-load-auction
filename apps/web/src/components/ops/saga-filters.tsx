'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const STATUS_OPTIONS = [
  { value: '', label: 'Любой статус' },
  { value: 'running', label: 'В процессе' },
  { value: 'compensating', label: 'Компенсация' },
  { value: 'completed', label: 'Завершена' },
  { value: 'failed', label: 'Провалена' },
];

const STEP_OPTIONS = [
  { value: '', label: 'Любой шаг' },
  { value: 'lock', label: 'lock' },
  { value: 'winner', label: 'winner' },
  { value: 'reserve', label: 'reserve' },
  { value: 'invoice', label: 'invoice' },
  { value: 'notify', label: 'notify' },
  { value: 'settle', label: 'settle' },
];

const inputClassName =
  'rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

export function SagaFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [step, setStep] = useState(searchParams.get('step') ?? '');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.delete('offset');
    const next: Record<string, string> = { status, step };
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/ops${params.size > 0 ? `?${params.toString()}` : ''}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Статус
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className={inputClassName}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Шаг
        <select
          value={step}
          onChange={(event) => setStep(event.target.value)}
          className={inputClassName}
        >
          {STEP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Применить
      </button>
    </form>
  );
}
