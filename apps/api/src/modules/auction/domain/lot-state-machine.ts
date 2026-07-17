import { Lot, LotStatus } from '@src/modules/auction/domain/lot';

export const LOT_TRANSITIONS: Record<LotStatus, readonly LotStatus[]> = {
  draft: ['scheduled'],
  scheduled: ['open', 'cancelled'],
  open: ['closing', 'cancelled'],
  closing: ['settled', 'cancelled'],
  settled: [],
  cancelled: [],
};

export class LotTransitionError extends Error {
  constructor(
    readonly from: LotStatus,
    readonly to: LotStatus,
  ) {
    super(`Cannot transition lot from "${from}" to "${to}"`);
  }
}

export function canTransitionLot(from: LotStatus, to: LotStatus): boolean {
  return LOT_TRANSITIONS[from].includes(to);
}

export function transitionLot(lot: Lot, to: LotStatus): Lot {
  if (!canTransitionLot(lot.status, to)) {
    throw new LotTransitionError(lot.status, to);
  }
  return { ...lot, status: to };
}
