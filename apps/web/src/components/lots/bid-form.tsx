'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { placeBid } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { upsertLiveBid, type LiveBidHistory } from '@/lib/lot-bids-cache';
import type { PlaceBidRejectionReason } from '@/types/contracts';

const REASON_MESSAGES: Record<
  Exclude<PlaceBidRejectionReason, 'idempotency_in_progress'>,
  string
> = {
  too_low: 'Ставка должна быть ниже текущей лучшей — предложите меньшую сумму.',
  closed: 'Лот больше не принимает ставки.',
  rate_limited: 'Слишком много попыток подряд — подождите немного.',
};

interface BidAttempt {
  amountCents: number;
  idempotencyKey: string;
}

const MAX_IN_PROGRESS_RETRIES = 5;

interface BidFormProps {
  lotId: string;
  carrierId: string;
  disabled?: boolean;
}

export function BidForm({ lotId, carrierId, disabled }: BidFormProps) {
  const queryClient = useQueryClient();
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inProgressRetriesRef = useRef(0);

  function removePendingBid() {
    queryClient.setQueryData<LiveBidHistory>(['lot', lotId, 'bids'], (old) => ({
      items: (old?.items ?? []).filter((item) => !item.pending),
      nextCursor: old?.nextCursor,
    }));
  }

  const mutation = useMutation({
    mutationFn: ({ amountCents, idempotencyKey }: BidAttempt) =>
      placeBid(lotId, amountCents, idempotencyKey),
    onMutate: ({ amountCents, idempotencyKey }) => {
      queryClient.setQueryData<LiveBidHistory>(['lot', lotId, 'bids'], (old) =>
        upsertLiveBid(old, {
          id: `temp:${idempotencyKey}`,
          carrierId,
          amount: amountCents,
          createdAt: new Date().toISOString(),
          isCurrentBest: false,
          pending: true,
        }),
      );
    },
    onSuccess: (bid) => {
      queryClient.setQueryData<LiveBidHistory>(['lot', lotId, 'bids'], (old) =>
        upsertLiveBid(
          old,
          {
            id: bid.id,
            carrierId: bid.carrierId,
            amount: bid.amount,
            createdAt: bid.createdAt,
            isCurrentBest: false,
          },
          { carrierId: bid.carrierId, amount: bid.amount },
        ),
      );
      inProgressRetriesRef.current = 0;
      setAmountInput('');
      setError(null);
    },
    onError: (err, attempt) => {
      if (err instanceof ApiError && err.status === 409) {
        const reason = (err.body as { reason?: PlaceBidRejectionReason } | undefined)
          ?.reason;
        if (reason === 'idempotency_in_progress') {
          // Same request is still being processed server-side — not a user
          // error, just retry shortly with the identical attempt (same key).
          // Capped so a request that's genuinely stuck server-side surfaces
          // as an error instead of retrying forever.
          if (inProgressRetriesRef.current < MAX_IN_PROGRESS_RETRIES) {
            inProgressRetriesRef.current += 1;
            setTimeout(() => mutation.mutate(attempt), 300);
            return;
          }
          inProgressRetriesRef.current = 0;
          removePendingBid();
          setError('Не удалось разместить ставку — попробуйте ещё раз.');
          return;
        }
        removePendingBid();
        setError(reason ? REASON_MESSAGES[reason] : 'Не удалось разместить ставку.');
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        removePendingBid();
        setError(REASON_MESSAGES.rate_limited);
        return;
      }
      removePendingBid();
      setError('Не удалось разместить ставку.');
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const dollars = Number(amountInput);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError('Введите сумму ставки.');
      return;
    }
    setError(null);
    // Every user-initiated submit is a genuinely new attempt and gets a fresh
    // idempotency key — reusing one here (even for a resubmit at the same
    // amount) would make the server replay a stale cached outcome instead of
    // re-evaluating against the current lot state.
    mutation.mutate({
      amountCents: Math.round(dollars * 100),
      idempotencyKey: crypto.randomUUID(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Ваша ставка ($)
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amountInput}
          disabled={disabled || mutation.isPending}
          onChange={(event) => setAmountInput(event.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || mutation.isPending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {mutation.isPending ? 'Отправка…' : 'Сделать ставку'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
