import { Mapper } from '@src/platform/persistence/mapper';
import { Lot } from '@src/modules/auction/domain/lot';
import { LotEntity } from '@src/modules/auction/infrastructure/lot.entity';

export class LotMapper implements Mapper<Lot, LotEntity> {
  toDomain(entity: LotEntity): Lot {
    return {
      id: entity.id,
      shipperId: entity.shipperId,
      origin: entity.origin,
      destination: entity.destination,
      equipmentType: entity.equipmentType,
      weightKg: entity.weightKg,
      pickupWindow: { from: entity.pickupFrom, to: entity.pickupTo },
      reservePrice: entity.reservePrice,
      targetPrice: entity.targetPrice ?? undefined,
      openAt: entity.openAt,
      closeAt: entity.closeAt,
      antiSnipeWindowSec: entity.antiSnipeWindowSec,
      status: entity.status,
      version: entity.version,
      winningBidId: entity.winningBidId ?? undefined,
      winningAmount: entity.winningAmount ?? undefined,
      createdAt: entity.createdAt,
    };
  }

  toEntity(domain: Lot): LotEntity {
    const entity = new LotEntity();
    entity.id = domain.id;
    entity.shipperId = domain.shipperId;
    entity.origin = domain.origin;
    entity.destination = domain.destination;
    entity.equipmentType = domain.equipmentType;
    entity.weightKg = domain.weightKg;
    entity.pickupFrom = domain.pickupWindow.from;
    entity.pickupTo = domain.pickupWindow.to;
    entity.reservePrice = domain.reservePrice;
    entity.targetPrice = domain.targetPrice ?? null;
    entity.openAt = domain.openAt;
    entity.closeAt = domain.closeAt;
    entity.antiSnipeWindowSec = domain.antiSnipeWindowSec;
    entity.status = domain.status;
    entity.version = domain.version;
    entity.winningBidId = domain.winningBidId ?? null;
    entity.winningAmount = domain.winningAmount ?? null;
    entity.createdAt = domain.createdAt;
    return entity;
  }
}
