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
  'lot.extended',
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

export type LotDetailStatus =
  | 'draft'
  | 'scheduled'
  | 'open'
  | 'closing'
  | 'settled'
  | 'cancelled';

export interface PickupWindow {
  from: string;
  to: string;
}

export interface LotResponseDto {
  id: string;
  shipperId: string;
  origin: string;
  destination: string;
  equipmentType: EquipmentType;
  weightKg: number;
  pickupWindow: PickupWindow;
  reservePrice: number;
  targetPrice?: number;
  openAt: string;
  closeAt: string;
  antiSnipeWindowSec: number;
  status: LotDetailStatus;
  winningBidId?: string;
  winningAmount?: number;
  createdAt: string;
}

export interface BidHistoryItemDto {
  id: string;
  carrierId: string;
  amount: number;
  createdAt: string;
  isCurrentBest: boolean;
}

export interface BidHistoryResponse {
  items: BidHistoryItemDto[];
  nextCursor?: string;
}

export interface GetLotBidsQuery {
  sort?: 'amount' | 'time';
  cursor?: string;
  limit?: number;
}

export interface BidView {
  id: string;
  lotId: string;
  carrierId: string;
  amount: number;
  createdAt: string;
}

export type PlaceBidRejectionReason =
  | 'too_low'
  | 'closed'
  | 'idempotency_in_progress'
  | 'rate_limited';

export type MyBidStatus = 'leading' | 'outbid' | 'won' | 'lost';

export interface MyBidDto {
  id: string;
  lotId: string;
  amount: number;
  createdAt: string;
  status: MyBidStatus;
}

export interface MyBidsResponse {
  items: MyBidDto[];
  nextCursor?: string;
}

export interface GetMyBidsQuery {
  cursor?: string;
  limit?: number;
}
