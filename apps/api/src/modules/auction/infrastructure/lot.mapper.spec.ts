import { Lot } from '@src/modules/auction/domain/lot';
import { LotMapper } from '@src/modules/auction/infrastructure/lot.mapper';

const FULL_LOT: Lot = {
  id: '11111111-1111-1111-1111-111111111111',
  shipperId: '22222222-2222-2222-2222-222222222222',
  origin: 'Chicago, IL',
  destination: 'Dallas, TX',
  equipmentType: 'reefer',
  weightKg: 18500,
  pickupWindow: {
    from: new Date('2026-07-20T08:00:00.000Z'),
    to: new Date('2026-07-20T18:00:00.000Z'),
  },
  reservePrice: 125000,
  targetPrice: 110000,
  openAt: new Date('2026-07-18T00:00:00.000Z'),
  closeAt: new Date('2026-07-19T00:00:00.000Z'),
  antiSnipeWindowSec: 60,
  status: 'open',
  version: 3,
  winningBidId: '33333333-3333-3333-3333-333333333333',
  winningAmount: 118000,
  createdAt: new Date('2026-07-17T00:00:00.000Z'),
};

const MINIMAL_LOT: Lot = {
  id: '44444444-4444-4444-4444-444444444444',
  shipperId: '55555555-5555-5555-5555-555555555555',
  origin: 'Atlanta, GA',
  destination: 'Miami, FL',
  equipmentType: 'van',
  weightKg: 9000,
  pickupWindow: {
    from: new Date('2026-07-21T08:00:00.000Z'),
    to: new Date('2026-07-21T18:00:00.000Z'),
  },
  reservePrice: 90000,
  openAt: new Date('2026-07-19T00:00:00.000Z'),
  closeAt: new Date('2026-07-20T00:00:00.000Z'),
  antiSnipeWindowSec: 30,
  status: 'draft',
  version: 1,
  createdAt: new Date('2026-07-17T00:00:00.000Z'),
};

describe('LotMapper', () => {
  const mapper = new LotMapper();

  it('round-trips a fully populated lot', () => {
    const roundTripped = mapper.toDomain(mapper.toEntity(FULL_LOT));
    expect(roundTripped).toEqual(FULL_LOT);
  });

  it('keeps optional fields as undefined (not null) after a round-trip', () => {
    const roundTripped = mapper.toDomain(mapper.toEntity(MINIMAL_LOT));

    expect(roundTripped).toEqual(MINIMAL_LOT);
    expect(roundTripped.targetPrice).toBeUndefined();
    expect(roundTripped.winningBidId).toBeUndefined();
    expect(roundTripped.winningAmount).toBeUndefined();
  });

  it('preserves exact Money integers and pickup window dates', () => {
    const roundTripped = mapper.toDomain(mapper.toEntity(FULL_LOT));

    expect(roundTripped.reservePrice).toBe(125000);
    expect(roundTripped.winningAmount).toBe(118000);
    expect(roundTripped.pickupWindow.from).toEqual(FULL_LOT.pickupWindow.from);
    expect(roundTripped.pickupWindow.to).toEqual(FULL_LOT.pickupWindow.to);
  });
});
