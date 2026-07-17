import { Lot, LotStatus } from '@src/modules/auction/domain/lot';
import {
  LOT_TRANSITIONS,
  LotTransitionError,
  canTransitionLot,
  transitionLot,
} from '@src/modules/auction/domain/lot-state-machine';

const STATUSES: readonly LotStatus[] = [
  'draft',
  'scheduled',
  'open',
  'closing',
  'settled',
  'cancelled',
];

const VALID: [LotStatus, LotStatus][] = [
  ['draft', 'scheduled'],
  ['scheduled', 'open'],
  ['scheduled', 'cancelled'],
  ['open', 'closing'],
  ['open', 'cancelled'],
  ['closing', 'settled'],
  ['closing', 'cancelled'],
];

const ALL: [LotStatus, LotStatus][] = STATUSES.flatMap((from) =>
  STATUSES.map((to): [LotStatus, LotStatus] => [from, to]),
);

const INVALID: [LotStatus, LotStatus][] = ALL.filter(
  ([from, to]) => !VALID.some(([vf, vt]) => vf === from && vt === to),
);

function makeLot(status: LotStatus): Lot {
  return {
    id: 'lot-1',
    shipperId: 'shipper-1',
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    equipmentType: 'van',
    weightKg: 12000,
    pickupWindow: {
      from: new Date('2026-07-20T08:00:00Z'),
      to: new Date('2026-07-20T18:00:00Z'),
    },
    reservePrice: 150000,
    openAt: new Date('2026-07-18T00:00:00Z'),
    closeAt: new Date('2026-07-19T00:00:00Z'),
    antiSnipeWindowSec: 60,
    status,
    version: 1,
    createdAt: new Date('2026-07-17T00:00:00Z'),
  };
}

describe('lot state machine', () => {
  it('covers the full 6x6 transition matrix', () => {
    expect(VALID).toHaveLength(7);
    expect(ALL).toHaveLength(36);
    expect(INVALID).toHaveLength(29);
  });

  it.each(VALID)('allows %s → %s', (from, to) => {
    expect(canTransitionLot(from, to)).toBe(true);

    const lot = makeLot(from);
    const result = transitionLot(lot, to);

    expect(result).not.toBe(lot);
    expect(lot.status).toBe(from);
    expect(result.status).toBe(to);
  });

  it.each(INVALID)('rejects %s → %s', (from, to) => {
    expect(canTransitionLot(from, to)).toBe(false);

    const lot = makeLot(from);
    expect(() => transitionLot(lot, to)).toThrow(LotTransitionError);

    try {
      transitionLot(lot, to);
      throw new Error('expected transitionLot to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LotTransitionError);
      const transitionError = error as LotTransitionError;
      expect(transitionError.from).toBe(from);
      expect(transitionError.to).toBe(to);
    }
  });

  it('has no transitions out of terminal states', () => {
    expect(LOT_TRANSITIONS.settled).toEqual([]);
    expect(LOT_TRANSITIONS.cancelled).toEqual([]);
  });

  it('does not allow draft → cancelled', () => {
    expect(canTransitionLot('draft', 'cancelled')).toBe(false);
  });
});
