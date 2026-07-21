export type NotificationType =
  | 'lot_opened'
  | 'new_bid'
  | 'outbid'
  | 'lot_closed'
  | 'lot_won'
  | 'lot_settled';

export interface Notification {
  recipientId: string;
  type: NotificationType;
  lotId: string;
  message: string;
  detail: Record<string, unknown>;
}
