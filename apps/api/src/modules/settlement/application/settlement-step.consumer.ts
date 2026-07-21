import { Inject, Injectable } from '@nestjs/common';
import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { AMQP_CONNECTION } from '@src/platform/messaging/amqp-connection.token';
import { MESSAGING_CONFIG } from '@src/platform/messaging/messaging.config.token';
import type { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import { Publisher } from '@src/platform/messaging/publisher';
import { DEDUP_PORT } from '@src/platform/messaging/dedup.port';
import type { DedupPort } from '@src/platform/messaging/dedup.port';
import { BaseConsumer } from '@src/platform/messaging/base.consumer';
import type { RmqMessage } from '@src/platform/messaging/base.consumer';
import {
  Queues,
  RoutingKeys,
} from '@src/platform/messaging/messaging.constants';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import { LockService } from '@src/platform/redis/lock.service';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { transitionLot } from '@src/modules/auction/domain/lot-state-machine';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';
import { SagaRepository } from '@src/modules/settlement/infrastructure/saga.repository';
import { ReservationService } from '@src/modules/settlement/infrastructure/reservation.service';
import { InvoiceService } from '@src/modules/settlement/infrastructure/invoice.service';
import { SettlementNotifier } from '@src/modules/settlement/infrastructure/settlement-notifier';
import { StepCommandPublisher } from '@src/modules/settlement/infrastructure/step-command.publisher';
import {
  SagaInstance,
  SagaPayload,
  SagaStatus,
  SagaStep,
  previousStep,
} from '@src/modules/settlement/domain/saga';
import type {
  SettlementStepCommand,
  StepDirection,
} from '@src/modules/settlement/domain/settlement-command';

const LOCK_TTL_MS = 30_000;

interface ForwardOptions {
  patch?: Partial<SagaPayload>;
  action?: (tx: TransactionContext, locked: SagaInstance) => Promise<void>;
}

@Injectable()
export class SettlementStepConsumer extends BaseConsumer<SettlementStepCommand> {
  protected readonly queue = Queues.settlementSteps;
  protected readonly prefetch = 5;

  constructor(
    @Inject(AMQP_CONNECTION) connection: AmqpConnectionManager,
    publisher: Publisher,
    @Inject(MESSAGING_CONFIG) private readonly stepConfig: MessagingConfig,
    @Inject(DEDUP_PORT) dedup: DedupPort,
    private readonly uow: UnitOfWork,
    private readonly sagas: SagaRepository,
    private readonly lots: LotRepository,
    private readonly bids: BidRepository,
    private readonly reservations: ReservationService,
    private readonly invoices: InvoiceService,
    private readonly notifier: SettlementNotifier,
    private readonly lock: LockService,
    private readonly stepPublisher: StepCommandPublisher,
  ) {
    super(connection, publisher, stepConfig, dedup);
  }

  // The saga row is the source of truth; the command is only a kick. If the
  // kick disagrees with where the saga actually is (redelivery, a duplicate
  // publish, a crash between commit and ack), republish what the saga says
  // should happen next instead of acting on stale instructions.
  protected async process(
    msg: RmqMessage<SettlementStepCommand>,
  ): Promise<void> {
    const cmd = msg.payload;
    const saga = await this.sagas.findById(cmd.sagaId);
    if (!saga) return;

    if (
      saga.status === SagaStatus.Completed ||
      saga.status === SagaStatus.Failed
    ) {
      return;
    }

    const expectedDirection: StepDirection =
      saga.status === SagaStatus.Running ? 'forward' : 'compensate';
    if (cmd.step !== saga.step || cmd.direction !== expectedDirection) {
      await this.stepPublisher.publishStep({
        sagaId: saga.id,
        lotId: saga.lotId,
        step: saga.step,
        direction: expectedDirection,
      });
      return;
    }

    try {
      if (saga.status === SagaStatus.Running) {
        await this.forward(saga);
      } else {
        await this.compensate(saga);
      }
    } catch (err) {
      if (msg.attempt < this.stepConfig.retryLimit) {
        throw err;
      }
      await this.beginCompensation(saga, `step_failed:${saga.step}`);
    }
  }

  private forward(saga: SagaInstance): Promise<void> {
    switch (saga.step) {
      case SagaStep.Lock:
        return this.stepLock(saga);
      case SagaStep.Winner:
        return this.stepWinner(saga);
      case SagaStep.Reserve:
        return this.stepReserve(saga);
      case SagaStep.Invoice:
        return this.stepInvoice(saga);
      case SagaStep.Notify:
        return this.stepNotify(saga);
      case SagaStep.Settle:
        return this.stepSettle(saga);
    }
  }

  private async stepLock(saga: SagaInstance): Promise<void> {
    const token = saga.payload.lockToken!;
    const acquired = await this.lock.acquireOwned(
      RedisKeys.lotLock(saga.lotId),
      token,
      LOCK_TTL_MS,
    );
    if (!acquired) {
      throw new Error(
        `SettlementStep: lot ${saga.lotId} lock held by another owner`,
      );
    }
    await this.advanceForward(saga, SagaStep.Winner);
  }

  private async stepWinner(saga: SagaInstance): Promise<void> {
    const best = await this.bids.findCurrentBest(saga.lotId);
    if (!best) {
      await this.beginCompensation(saga, 'no_valid_bids');
      return;
    }
    await this.advanceForward(saga, SagaStep.Reserve, {
      patch: {
        winningBidId: best.bidId,
        winningAmount: best.amount,
        winningCarrierId: best.carrierId,
      },
    });
  }

  private async stepReserve(saga: SagaInstance): Promise<void> {
    const amount = saga.payload.winningAmount!;
    await this.advanceForward(saga, SagaStep.Invoice, {
      action: (tx) =>
        this.reservations.reserve(tx, {
          lotId: saga.lotId,
          sagaId: saga.id,
          amount,
        }),
    });
  }

  private async stepInvoice(saga: SagaInstance): Promise<void> {
    const bidId = saga.payload.winningBidId!;
    const amount = saga.payload.winningAmount!;
    const carrierId = saga.payload.winningCarrierId!;
    await this.advanceForward(saga, SagaStep.Notify, {
      action: (tx) =>
        this.invoices.create(tx, {
          lotId: saga.lotId,
          sagaId: saga.id,
          bidId,
          amount,
          carrierId,
        }),
    });
  }

  private async stepNotify(saga: SagaInstance): Promise<void> {
    const lot = await this.lots.findById(saga.lotId);
    if (!lot) {
      throw new Error(`SettlementStep: lot ${saga.lotId} not found at notify`);
    }
    // Own write, outside the advance transaction — same shape as the regular
    // event consumers, and safe on redelivery because the notification log
    // dedups on a deterministic messageId (see SettlementNotifier).
    await this.notifier.notifyWinnerAndShipper(saga, lot);
    await this.advanceForward(saga, SagaStep.Settle);
  }

  private async stepSettle(saga: SagaInstance): Promise<void> {
    const winningBidId = saga.payload.winningBidId!;
    const winningAmount = saga.payload.winningAmount!;

    const settled = await this.uow.transaction(async (tx) => {
      const locked = await this.sagas.lockForUpdate(tx, saga.id);
      if (
        !locked ||
        locked.step !== SagaStep.Settle ||
        locked.status !== SagaStatus.Running
      ) {
        return false;
      }

      const lot = await this.lots.lockForUpdate(tx, locked.lotId);
      if (!lot) {
        throw new Error(
          `SettlementStep: lot ${locked.lotId} not found at settle`,
        );
      }

      // A settle kick can be redelivered after the lot already settled (the
      // ack was lost, the process crashed after commit) — recognize that
      // case explicitly instead of re-running transitionLot, which would
      // reject settled->settled as an invalid transition.
      if (!(lot.status === 'settled' && lot.winningBidId === winningBidId)) {
        const next = {
          ...transitionLot(lot, 'settled'),
          winningBidId,
          winningAmount,
        };
        await this.lots.update(tx, next);
        await tx.outbox.add(tx.manager, RoutingKeys.settlementCompleted, {
          lotId: next.id,
          winningBidId,
          winningAmount,
        });
      }

      await this.sagas.update(tx, { ...locked, status: SagaStatus.Completed });
      return true;
    });

    if (settled) {
      await this.lock.release({
        key: RedisKeys.lotLock(saga.lotId),
        token: saga.payload.lockToken!,
      });
    }
  }

  private async advanceForward(
    saga: SagaInstance,
    toStep: SagaStep,
    opts: ForwardOptions = {},
  ): Promise<void> {
    const advanced = await this.uow.transaction(async (tx) => {
      const locked = await this.sagas.lockForUpdate(tx, saga.id);
      if (
        !locked ||
        locked.step !== saga.step ||
        locked.status !== SagaStatus.Running
      ) {
        return null;
      }
      if (opts.action) await opts.action(tx, locked);
      return this.sagas.update(tx, {
        ...locked,
        step: toStep,
        payload: { ...locked.payload, ...opts.patch },
      });
    });

    if (advanced) {
      await this.stepPublisher.publishStep({
        sagaId: advanced.id,
        lotId: advanced.lotId,
        step: advanced.step,
        direction: 'forward',
      });
    }
  }

  private compensate(saga: SagaInstance): Promise<void> {
    switch (saga.step) {
      case SagaStep.Settle:
      case SagaStep.Notify:
      case SagaStep.Winner:
        return this.compensateStep(saga, async () => {});
      case SagaStep.Invoice:
        return this.compensateStep(saga, (tx) =>
          this.invoices.void(tx, saga.lotId),
        );
      case SagaStep.Reserve:
        return this.compensateStep(saga, (tx) =>
          this.reservations.release(tx, saga.lotId),
        );
      case SagaStep.Lock:
        return this.compensateLock(saga);
    }
  }

  // Walks the chain backward one step at a time via previousStep — every
  // step gets its own compensating action (even where it's a no-op) and its
  // own kick, so a crash mid-compensation resumes at the right place rather
  // than skipping ahead.
  private async compensateStep(
    saga: SagaInstance,
    action: (tx: TransactionContext) => Promise<void>,
  ): Promise<void> {
    const toStep = previousStep(saga.step);
    if (!toStep) return;

    const advanced = await this.uow.transaction(async (tx) => {
      const locked = await this.sagas.lockForUpdate(tx, saga.id);
      if (
        !locked ||
        locked.step !== saga.step ||
        locked.status !== SagaStatus.Compensating
      ) {
        return null;
      }
      await action(tx);
      return this.sagas.update(tx, { ...locked, step: toStep });
    });

    if (advanced) {
      await this.stepPublisher.publishStep({
        sagaId: advanced.id,
        lotId: advanced.lotId,
        step: advanced.step,
        direction: 'compensate',
      });
    }
  }

  private async compensateLock(saga: SagaInstance): Promise<void> {
    // Advisory only — an unlocked read, not a correctness guard. The
    // authoritative check (row-locked, re-verifying status) happens inside
    // finalizeCancel's own transaction; this just avoids releasing an
    // already-released lock for a stray or duplicate compensate-lock kick.
    const current = await this.sagas.findById(saga.id);
    if (
      !current ||
      current.step !== SagaStep.Lock ||
      current.status !== SagaStatus.Compensating
    ) {
      return;
    }

    await this.lock.release({
      key: RedisKeys.lotLock(saga.lotId),
      token: saga.payload.lockToken!,
    });
    await this.finalizeCancel(current);
  }

  private async finalizeCancel(saga: SagaInstance): Promise<void> {
    await this.uow.transaction(async (tx) => {
      const locked = await this.sagas.lockForUpdate(tx, saga.id);
      if (!locked || locked.status !== SagaStatus.Compensating) {
        return;
      }

      const lot = await this.lots.lockForUpdate(tx, locked.lotId);
      if (lot && lot.status === 'closing') {
        await this.lots.update(tx, transitionLot(lot, 'cancelled'));
      }

      await tx.outbox.add(tx.manager, RoutingKeys.settlementFailed, {
        lotId: locked.lotId,
        reason: locked.payload.failureReason ?? null,
      });

      await this.sagas.update(tx, { ...locked, status: SagaStatus.Failed });
    });
  }

  private async beginCompensation(
    saga: SagaInstance,
    reason: string,
  ): Promise<void> {
    const advanced = await this.uow.transaction(async (tx) => {
      const locked = await this.sagas.lockForUpdate(tx, saga.id);
      if (!locked || locked.status !== SagaStatus.Running) {
        return null;
      }
      return this.sagas.update(tx, {
        ...locked,
        status: SagaStatus.Compensating,
        payload: { ...locked.payload, failureReason: reason },
      });
    });

    if (advanced) {
      await this.stepPublisher.publishStep({
        sagaId: advanced.id,
        lotId: advanced.lotId,
        step: advanced.step,
        direction: 'compensate',
      });
    }
  }
}
