export type ListingLotStatus = 'open' | 'closing';

// A narrow union of its own, not the auction module's LotStatus: this consumer
// only ever sees lot.opened/lot.closed, so a projected row can only ever be in
// these two states. Importing the full write-model status would advertise
// values ('draft'/'scheduled'/'settled'/'cancelled') this projection can never
// reach and couple the read schema to the write model's evolution.
export interface ListingLot {
  id: string;
  shipperId: string;
  origin: string;
  destination: string;
  equipmentType: string;
  weightKg: number;
  reservePrice: number;
  targetPrice?: number;
  status: ListingLotStatus;
  openAt: Date;
  closeAt: Date;
  currentBest?: number;
  updatedAt: Date;
}

export interface LotOpenedPayload {
  lotId: string;
  shipperId: string;
  origin: string;
  destination: string;
  equipmentType: string;
  weightKg: number;
  reservePrice: number;
  targetPrice: number | null;
  openAt: string;
  closeAt: string;
}

export interface LotClosedPayload {
  lotId: string;
  closeAt: string;
}
