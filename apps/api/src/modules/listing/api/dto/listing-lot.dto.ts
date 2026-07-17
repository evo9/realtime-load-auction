import type {
  ListingLot,
  ListingLotStatus,
} from '@src/modules/listing/domain/listing-lot';

export class ListingLotDto {
  id!: string;
  shipperId!: string;
  origin!: string;
  destination!: string;
  equipmentType!: string;
  weightKg!: number;
  reservePrice!: number;
  targetPrice?: number;
  status!: ListingLotStatus;
  openAt!: Date;
  closeAt!: Date;
  currentBest?: number;
}

export class ListLotsResponseDto {
  items!: ListingLotDto[];
  nextCursor?: string;
}

export function toListingLotDto(lot: ListingLot): ListingLotDto {
  return {
    id: lot.id,
    shipperId: lot.shipperId,
    origin: lot.origin,
    destination: lot.destination,
    equipmentType: lot.equipmentType,
    weightKg: lot.weightKg,
    reservePrice: lot.reservePrice,
    targetPrice: lot.targetPrice,
    status: lot.status,
    openAt: lot.openAt,
    closeAt: lot.closeAt,
    currentBest: lot.currentBest,
  };
}
