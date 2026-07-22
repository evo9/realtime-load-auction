export type Money = number; // integer-центы, не float-доллары — согласовано с CasService/Lua CAS
export type EquipmentType = 'van' | 'reefer' | 'flatbed';
export type LotStatus =
  | 'draft'
  | 'scheduled'
  | 'open'
  | 'closing'
  | 'settled'
  | 'cancelled';

export interface PickupWindow {
  from: Date;
  to: Date;
}

export interface Lot {
  id: string;
  shipperId: string;
  origin: string;
  destination: string;
  equipmentType: EquipmentType;
  weightKg: number;
  pickupWindow: PickupWindow;
  reservePrice: Money;
  targetPrice?: Money;
  openAt: Date;
  closeAt: Date;
  antiSnipeWindowSec: number;
  status: LotStatus;
  version: number;
  winningBidId?: string;
  winningAmount?: Money;
  lastBidAt?: Date;
  createdAt: Date;
}
