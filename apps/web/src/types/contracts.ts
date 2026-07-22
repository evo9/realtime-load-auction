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
