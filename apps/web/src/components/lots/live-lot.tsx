'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLotChannel } from '@/lib/ws/use-lot-channel';
import { getLot, getLotBids } from '@/lib/api/endpoints';
import { upsertLiveBid, type LiveBidHistory } from '@/lib/lot-bids-cache';
import { BestBid } from '@/components/lots/best-bid';
import { BidHistory } from '@/components/lots/bid-history';
import { BidForm } from '@/components/lots/bid-form';
import { Countdown } from '@/components/lots/countdown';
import type { LotResponseDto } from '@/types/contracts';

interface LiveLotProps {
  lotId: string;
  initialLot: LotResponseDto;
  initialBids: LiveBidHistory;
  carrierId: string;
}

interface Outcome {
  tone: 'success' | 'neutral';
  message: string;
}

export function LiveLot({ lotId, initialLot, initialBids, carrierId }: LiveLotProps) {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const { data: lot } = useQuery({
    queryKey: ['lot', lotId],
    queryFn: () => getLot(lotId),
    initialData: initialLot,
    staleTime: Infinity,
  });

  const { data: bids } = useQuery({
    queryKey: ['lot', lotId, 'bids'],
    queryFn: () => getLotBids(lotId, { sort: 'amount' }),
    initialData: initialBids,
    staleTime: Infinity,
  });

  const handleBidPlaced = useCallback(
    (payload: unknown) => {
      const bid = payload as {
        bidId: string;
        carrierId: string;
        amount: number;
        createdAt: string;
      };
      queryClient.setQueryData<LiveBidHistory>(['lot', lotId, 'bids'], (old) =>
        upsertLiveBid(
          old,
          {
            id: bid.bidId,
            carrierId: bid.carrierId,
            amount: bid.amount,
            createdAt: bid.createdAt,
            isCurrentBest: false,
          },
          { carrierId: bid.carrierId, amount: bid.amount },
        ),
      );
    },
    [queryClient, lotId],
  );

  const handleExtended = useCallback(
    (payload: unknown) => {
      const { closeAt } = payload as { closeAt: string };
      queryClient.setQueryData<LotResponseDto>(
        ['lot', lotId],
        (old) => old && { ...old, closeAt },
      );
    },
    [queryClient, lotId],
  );

  const handleClosing = useCallback(
    (payload: unknown) => {
      const { closeAt } = payload as { closeAt: string };
      queryClient.setQueryData<LotResponseDto>(
        ['lot', lotId],
        (old) => old && { ...old, status: 'closing', closeAt },
      );
    },
    [queryClient, lotId],
  );

  const handleCancelled = useCallback(
    (payload: unknown) => {
      const { reason } = payload as { reason: string | null };
      queryClient.setQueryData<LotResponseDto>(
        ['lot', lotId],
        (old) => old && { ...old, status: 'cancelled' },
      );
      setOutcome({
        tone: 'neutral',
        message: reason ? `Лот отменён: ${reason}` : 'Лот отменён.',
      });
    },
    [queryClient, lotId],
  );

  const handleSettlementCompleted = useCallback(
    (payload: unknown) => {
      const { winningBidId, winningAmount } = payload as {
        winningBidId: string;
        winningAmount: number;
      };
      queryClient.setQueryData<LotResponseDto>(
        ['lot', lotId],
        (old) => old && { ...old, status: 'settled', winningBidId, winningAmount },
      );
      const currentBids = queryClient.getQueryData<LiveBidHistory>([
        'lot',
        lotId,
        'bids',
      ]);
      const won = currentBids?.items.some(
        (item) => item.id === winningBidId && item.carrierId === carrierId,
      );
      setOutcome({
        tone: won ? 'success' : 'neutral',
        message: won
          ? 'Вы выиграли торги!'
          : 'Торги завершены — победила другая ставка.',
      });
    },
    [queryClient, lotId, carrierId],
  );

  const handleSettlementFailed = useCallback((payload: unknown) => {
    const { reason } = payload as { reason: string | null };
    setOutcome({
      tone: 'neutral',
      message: reason
        ? `Торги завершились без сделки: ${reason}`
        : 'Торги завершились без сделки.',
    });
  }, []);

  const handleConnect = useCallback(() => {
    // Runs on the initial connect too (harmless — SSR data is already
    // fresh) and, more importantly, on every reconnect after a dropped
    // socket, so a missed event window is healed by a real refetch instead
    // of leaving the cache stale forever under staleTime: Infinity.
    queryClient.invalidateQueries({ queryKey: ['lot', lotId] });
    queryClient.invalidateQueries({ queryKey: ['lot', lotId, 'bids'] });
  }, [queryClient, lotId]);

  useLotChannel(
    lotId,
    {
      'bid.placed': handleBidPlaced,
      'lot.extended': handleExtended,
      'lot.closing': handleClosing,
      'lot.closed': handleClosing,
      'lot.cancelled': handleCancelled,
      'settlement.completed': handleSettlementCompleted,
      'settlement.failed': handleSettlementFailed,
    },
    { onConnect: handleConnect },
  );

  const currentLot = lot ?? initialLot;
  const currentBids = bids?.items ?? initialBids.items;
  const biddingOpen = currentLot.status === 'open';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <BestBid bids={currentBids} />
        <div className="text-sm text-zinc-500">
          Торги: <Countdown closeAt={currentLot.closeAt} />
        </div>
      </div>

      {outcome && (
        <p
          className={
            outcome.tone === 'success'
              ? 'rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
              : 'rounded-md bg-zinc-100 px-4 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
          }
        >
          {outcome.message}
        </p>
      )}

      {biddingOpen ? (
        <BidForm lotId={lotId} carrierId={carrierId} />
      ) : (
        <p className="text-zinc-500">Приём ставок завершён.</p>
      )}

      <BidHistory bids={currentBids} carrierId={carrierId} />
    </div>
  );
}
