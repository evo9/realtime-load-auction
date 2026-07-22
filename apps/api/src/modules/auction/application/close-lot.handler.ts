import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { CasService } from '@src/platform/redis/cas.service';
import { LockService } from '@src/platform/redis/lock.service';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { ZSetScheduler } from '@src/platform/scheduler/zset-scheduler';
import { RoutingKeys } from '@src/platform/messaging/messaging.constants';
import { transitionLot } from '@src/modules/auction/domain/lot-state-machine';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';

type CloseResult =
  | { kind: 'noop' }
  | { kind: 'extended'; closeAt: Date }
  | { kind: 'closed' };

@Injectable()
export class CloseLotHandler {
  private readonly logger = new Logger(CloseLotHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly lots: LotRepository,
    private readonly cas: CasService,
    private readonly scheduler: ZSetScheduler,
    private readonly lock: LockService,
  ) {}

  async execute(lotId: string): Promise<void> {
    const result = await this.lock.withLock<CloseResult>(
      RedisKeys.lotLock(lotId),
      10_000,
      async () => {
        return this.uow.transaction(async (tx) => {
          const lot = await this.lots.lockForUpdate(tx, lotId);
          if (!lot) {
            this.logger.warn(`CloseLot: lot ${lotId} not found`);
            return { kind: 'noop' };
          }
          if (lot.status === 'scheduled') {
            throw new Error(
              `CloseLot: lot ${lotId} has not opened yet (status=scheduled)`,
            );
          }
          if (lot.status !== 'open') {
            this.logger.log(
              `CloseLot: lot ${lotId} already past open (status=${lot.status}), skipping`,
            );
            return { kind: 'noop' };
          }

          const windowMs = lot.antiSnipeWindowSec * 1000;
          const withinAntiSnipe =
            lot.lastBidAt &&
            lot.closeAt.getTime() - lot.lastBidAt.getTime() <= windowMs;

          if (withinAntiSnipe && lot.lastBidAt) {
            // Anti-snipe: the new deadline is measured from the actual last
            // bid, not from the current closeAt or from now — this guarantees
            // a full quiet window after the bid that triggered the extension.
            const extendedCloseAt = new Date(
              lot.lastBidAt.getTime() + windowMs,
            );
            if (extendedCloseAt.getTime() > lot.closeAt.getTime()) {
              const extended = { ...lot, closeAt: extendedCloseAt };
              await this.lots.update(tx, extended);
              await tx.outbox.add(tx.manager, RoutingKeys.lotExtended, {
                lotId: extended.id,
                closeAt: extendedCloseAt.toISOString(),
              });
              return { kind: 'extended', closeAt: extendedCloseAt };
            }
          }

          const closing = transitionLot(lot, 'closing');
          await this.lots.update(tx, closing);
          await tx.outbox.add(tx.manager, RoutingKeys.lotClosing, {
            lotId: closing.id,
            closeAt: closing.closeAt.toISOString(),
          });
          await tx.outbox.add(tx.manager, RoutingKeys.lotClosed, {
            lotId: closing.id,
            closeAt: closing.closeAt.toISOString(),
          });
          return { kind: 'closed' };
        });
      },
    );

    if (result === null) {
      // Lock held by a concurrent close — that call owns the close, this one
      // is a no-op. This IS the "closed exactly once" guarantee.
      this.logger.log(
        `CloseLot: lot ${lotId} is being closed concurrently, skipping`,
      );
      return;
    }

    if (result.kind === 'extended') {
      await this.scheduler.schedule(
        RedisKeys.scheduleClose(),
        result.closeAt.getTime(),
        lotId,
      );
    } else if (result.kind === 'closed') {
      await this.cas.setStatus(lotId, 'closing');
    }
  }
}
