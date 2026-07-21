interface RenderedNotification {
  message: string;
  detail: Record<string, unknown>;
}

export function renderLotOpened(): RenderedNotification {
  return { message: 'Your lot is now open for bids', detail: {} };
}

export function renderNewBid(
  amount: number,
  carrierId: string,
  bidId: string,
): RenderedNotification {
  return {
    message: `New bid of ${amount} on your lot`,
    detail: { amount, carrierId, bidId },
  };
}

export function renderOutbid(
  newAmount: number,
  previousAmount: number,
): RenderedNotification {
  return {
    message: `You've been outbid — new best is ${newAmount}`,
    detail: { newAmount, previousAmount },
  };
}

export function renderLotClosed(closeAt: string): RenderedNotification {
  return { message: 'Your lot has closed', detail: { closeAt } };
}
