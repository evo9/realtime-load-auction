export type NotificationType =
  | 'lot_opened'
  | 'new_bid'
  | 'outbid'
  | 'lot_closed';

export interface Notification {
  recipientId: string;
  type: NotificationType;
  lotId: string;
  message: string;
  detail: Record<string, unknown>;
}
