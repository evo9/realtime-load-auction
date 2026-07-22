'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const STATUS_OPTIONS = [
  { value: '', label: 'Любой статус' },
  { value: 'open', label: 'Открыт' },
  { value: 'closing', label: 'Закрывается' },
];

const EQUIPMENT_OPTIONS = [
  { value: '', label: 'Любой тип' },
  { value: 'van', label: 'Фургон' },
  { value: 'reefer', label: 'Рефрижератор' },
  { value: 'flatbed', label: 'Платформа' },
];

const inputClassName =
  'rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

export function LotFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [equipmentType, setEquipmentType] = useState(
    searchParams.get('equipmentType') ?? '',
  );
  const [origin, setOrigin] = useState(searchParams.get('origin') ?? '');
  const [destination, setDestination] = useState(
    searchParams.get('destination') ?? '',
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.delete('cursor');
    const next: Record<string, string> = { status, equipmentType, origin, destination };
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/lots${params.size > 0 ? `?${params.toString()}` : ''}`);
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
        Тип техники
        <select
          value={equipmentType}
          onChange={(event) => setEquipmentType(event.target.value)}
          className={inputClassName}
        >
          {EQUIPMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Откуда
        <input
          value={origin}
          onChange={(event) => setOrigin(event.target.value)}
          className={inputClassName}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Куда
        <input
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          className={inputClassName}
        />
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
