import {
  EquipmentType,
  Lot,
  LotStatus,
  PickupWindow,
} from '@src/modules/auction/domain/lot';

export class LotResponseDto {
  id!: string;
  shipperId!: string;
  origin!: string;
  destination!: string;
  equipmentType!: EquipmentType;
  weightKg!: number;
  pickupWindow!: PickupWindow;
  reservePrice!: number;
  targetPrice?: number;
  openAt!: Date;
  closeAt!: Date;
  antiSnipeWindowSec!: number;
  status!: LotStatus;
  winningBidId?: string;
  winningAmount?: number;
  createdAt!: Date;
}

export function toLotResponseDto(lot: Lot): LotResponseDto {
  return {
    id: lot.id,
    shipperId: lot.shipperId,
    origin: lot.origin,
    destination: lot.destination,
    equipmentType: lot.equipmentType,
    weightKg: lot.weightKg,
    pickupWindow: lot.pickupWindow,
    reservePrice: lot.reservePrice,
    targetPrice: lot.targetPrice,
    openAt: lot.openAt,
    closeAt: lot.closeAt,
    antiSnipeWindowSec: lot.antiSnipeWindowSec,
    status: lot.status,
    winningBidId: lot.winningBidId,
    winningAmount: lot.winningAmount,
    createdAt: lot.createdAt,
  };
}
