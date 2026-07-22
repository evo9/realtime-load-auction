export type Role = 'shipper' | 'carrier' | 'admin';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
}

export const REALTIME_EVENT_TYPES = [
  'bid.placed',
  'lot.opened',
  'lot.closing',
  'lot.closed',
  'lot.cancelled',
  'settlement.completed',
  'settlement.failed',
  'notification',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

export interface RealtimeEnvelope {
  type: RealtimeEventType;
  lotId: string;
  payload: unknown;
}

export type LotStatus = 'open' | 'closing';
export type EquipmentType = 'van' | 'reefer' | 'flatbed';

export interface ListingLotDto {
  id: string;
  shipperId: string;
  origin: string;
  destination: string;
  equipmentType: EquipmentType;
  weightKg: number;
  reservePrice: number;
  targetPrice?: number;
  status: LotStatus;
  openAt: string;
  closeAt: string;
  currentBest?: number;
}

export interface ListLotsQuery {
  status?: LotStatus;
  equipmentType?: EquipmentType;
  origin?: string;
  destination?: string;
  cursor?: string;
  limit?: number;
}

export interface ListLotsResponse {
  items: ListingLotDto[];
  nextCursor?: string;
}
