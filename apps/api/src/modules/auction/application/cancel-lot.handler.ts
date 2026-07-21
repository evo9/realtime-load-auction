import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { CasService } from '@src/platform/redis/cas.service';
import { RoutingKeys } from '@src/platform/messaging/messaging.constants';
import { transitionLot } from '@src/modules/auction/domain/lot-state-machine';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';

export interface CancelLotOptions {
  requestedBy: string;
  reason?: string;
}

@Injectable()
export class CancelLotHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly lots: LotRepository,
    private readonly cas: CasService,
  ) {}

  async execute(lotId: string, opts: CancelLotOptions): Promise<void> {
    const cancelled = await this.uow.transaction(async (tx) => {
      const lot = await this.lots.lockForUpdate(tx, lotId);
      if (!lot) {
        throw new NotFoundException(`Lot ${lotId} not found`);
      }
      if (lot.shipperId !== opts.requestedBy) {
        throw new ForbiddenException(
          'Only the owning shipper can cancel this lot',
        );
      }

      const next = transitionLot(lot, 'cancelled');
      await this.lots.update(tx, next);
      await tx.outbox.add(tx.manager, RoutingKeys.lotCancelled, {
        lotId: next.id,
        reason: opts.reason ?? null,
      });
      return next;
    });

    await this.cas.clear(cancelled.id);
  }
}
