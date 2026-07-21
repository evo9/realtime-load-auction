import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { CasService } from '@src/platform/redis/cas.service';
import { RoutingKeys } from '@src/platform/messaging/messaging.constants';
import { transitionLot } from '@src/modules/auction/domain/lot-state-machine';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';

@Injectable()
export class OpenLotHandler {
  private readonly logger = new Logger(OpenLotHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly lots: LotRepository,
    private readonly cas: CasService,
  ) {}

  async execute(lotId: string): Promise<void> {
    const opened = await this.uow.transaction(async (tx) => {
      const lot = await this.lots.lockForUpdate(tx, lotId);
      if (!lot) {
        this.logger.warn(`OpenLot: lot ${lotId} not found`);
        return null;
      }
      if (lot.status !== 'scheduled') {
        this.logger.log(
          `OpenLot: lot ${lotId} already past scheduled (status=${lot.status}), skipping`,
        );
        return null;
      }

      const next = transitionLot(lot, 'open');
      await this.lots.update(tx, next);
      await tx.outbox.add(tx.manager, RoutingKeys.lotOpened, {
        lotId: next.id,
        shipperId: next.shipperId,
        origin: next.origin,
        destination: next.destination,
        equipmentType: next.equipmentType,
        weightKg: next.weightKg,
        reservePrice: next.reservePrice,
        targetPrice: next.targetPrice,
        openAt: next.openAt.toISOString(),
        closeAt: next.closeAt.toISOString(),
      });
      return next;
    });

    // Postgres is the source of truth; the Redis status is only set once the
    // commit above is durable — a candidate, not a lead. Clearing the
    // high-bid hash before flipping status closes the window where a bid
    // could CAS against a stale candidate left by a prior run.
    if (opened) {
      await this.cas.reconcile(lotId, null);
      await this.cas.setStatus(lotId, 'open');
    }
  }
}
