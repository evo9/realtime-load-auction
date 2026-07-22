import { Money } from '@src/modules/auction/domain/lot';

const FLOOR_RATIO = 0.6;
const FIRST_BID_MIN_RATIO = 0.96;
const FIRST_BID_MAX_RATIO = 0.99;
const MIN_STEP: Money = 50; // 50 cents
const STEP_MIN_RATIO = 0.005;
const STEP_MAX_RATIO = 0.02;

export interface NextBidAmountInput {
  currentBest: Money | null;
  reservePrice: Money;
  targetPrice: Money | null;
  rng?: () => number;
}

// Reverse auction: a strictly lower amount than currentBest wins. Bots never
// bid below the floor — near it, this returns null so anti-snipe extension
// chains terminate instead of looping forever at a price no one would accept.
export function nextBidAmount(input: NextBidAmountInput): Money | null {
  const rng = input.rng ?? Math.random;
  const floor =
    input.targetPrice ?? Math.round(input.reservePrice * FLOOR_RATIO);

  if (input.currentBest === null) {
    const ratio =
      FIRST_BID_MIN_RATIO + rng() * (FIRST_BID_MAX_RATIO - FIRST_BID_MIN_RATIO);
    const amount = Math.round(input.reservePrice * ratio);
    return amount > floor ? amount : null;
  }

  const stepRatio = STEP_MIN_RATIO + rng() * (STEP_MAX_RATIO - STEP_MIN_RATIO);
  const step = Math.max(MIN_STEP, Math.round(input.currentBest * stepRatio));
  const amount = input.currentBest - step;
  return amount > floor ? amount : null;
}
