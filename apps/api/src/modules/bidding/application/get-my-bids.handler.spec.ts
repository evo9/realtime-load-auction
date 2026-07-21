import { BadRequestException } from '@nestjs/common';
import {
  decodeCursor,
  encodeCursor,
} from '@src/modules/bidding/application/bid-cursor';
import { GetMyBidsHandler } from '@src/modules/bidding/application/get-my-bids.handler';
import type { Lot } from '@src/modules/auction/domain/lot';
import type { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';
import type { HighBidCandidate } from '@src/platform/redis/cas.service';

function makeRow(overrides: Partial<BidEntity> = {}): BidEntity {
  return {
    id: 'bid-1',
    lotId: 'lot-1',
    carrierId: 'carrier-1',
    amount: 90000,
    idempotencyKey: 'idem-1',
    createdAt: new Date('2026-07-20T12:00:00Z'),
    ...overrides,
  };
}

function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 'lot-1',
    shipperId: 'shipper-1',
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    equipmentType: 'van',
    weightKg: 12000,
    pickupWindow: {
      from: new Date('2026-07-21T00:00:00Z'),
      to: new Date('2026-07-21T06:00:00Z'),
    },
    reservePrice: 150000,
    openAt: new Date('2026-07-20T00:00:00Z'),
    closeAt: new Date('2026-07-20T13:00:00Z'),
    antiSnipeWindowSec: 30,
    status: 'open',
    version: 1,
    createdAt: new Date('2026-07-19T00:00:00Z'),
    ...overrides,
  };
}

function bestMap(
  entries: Array<[string, HighBidCandidate]>,
): Map<string, HighBidCandidate> {
  return new Map(entries);
}

describe('GetMyBidsHandler', () => {
  let bids: {
    listByCarrier: jest.Mock;
    findCurrentBestForLots: jest.Mock;
  };
  let lots: { findByIds: jest.Mock };
  let handler: GetMyBidsHandler;

  beforeEach(() => {
    bids = {
      listByCarrier: jest.fn().mockResolvedValue([]),
      findCurrentBestForLots: jest.fn().mockResolvedValue(new Map()),
    };
    lots = { findByIds: jest.fn().mockResolvedValue([]) };
    handler = new GetMyBidsHandler(bids as never, lots as never);
  });

  it('passes cursor/limit through to repository.listByCarrier as-is', async () => {
    await handler.execute({ carrierId: 'carrier-1', limit: 5 });

    expect(bids.listByCarrier).toHaveBeenCalledWith('carrier-1', {
      cursor: undefined,
      limit: 5,
    });
  });

  it('applies the default limit of 20 when none is given', async () => {
    await handler.execute({ carrierId: 'carrier-1' });

    expect(bids.listByCarrier).toHaveBeenCalledWith(
      'carrier-1',
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('reports "leading" when the bid is the current best on an open lot', async () => {
    bids.listByCarrier.mockResolvedValue([makeRow({ id: 'bid-1' })]);
    lots.findByIds.mockResolvedValue([makeLot({ status: 'open' })]);
    bids.findCurrentBestForLots.mockResolvedValue(
      bestMap([
        ['lot-1', { amount: 90000, carrierId: 'carrier-1', bidId: 'bid-1' }],
      ]),
    );

    const result = await handler.execute({ carrierId: 'carrier-1' });

    expect(result.items[0].status).toBe('leading');
  });

  it('reports "outbid" when another bid is the current best on an open/closing lot', async () => {
    bids.listByCarrier.mockResolvedValue([makeRow({ id: 'bid-1' })]);
    lots.findByIds.mockResolvedValue([makeLot({ status: 'closing' })]);
    bids.findCurrentBestForLots.mockResolvedValue(
      bestMap([
        ['lot-1', { amount: 80000, carrierId: 'carrier-2', bidId: 'bid-2' }],
      ]),
    );

    const result = await handler.execute({ carrierId: 'carrier-1' });

    expect(result.items[0].status).toBe('outbid');
  });

  it('reports "won" when the lot is settled and winningBidId matches', async () => {
    bids.listByCarrier.mockResolvedValue([makeRow({ id: 'bid-1' })]);
    lots.findByIds.mockResolvedValue([
      makeLot({ status: 'settled', winningBidId: 'bid-1' }),
    ]);

    const result = await handler.execute({ carrierId: 'carrier-1' });

    expect(result.items[0].status).toBe('won');
  });

  it('reports "lost" when the lot is settled and winningBidId does not match', async () => {
    bids.listByCarrier.mockResolvedValue([makeRow({ id: 'bid-1' })]);
    lots.findByIds.mockResolvedValue([
      makeLot({ status: 'settled', winningBidId: 'bid-9' }),
    ]);

    const result = await handler.execute({ carrierId: 'carrier-1' });

    expect(result.items[0].status).toBe('lost');
  });

  it('reports "outbid" when the lot cannot be found', async () => {
    bids.listByCarrier.mockResolvedValue([makeRow({ id: 'bid-1' })]);
    lots.findByIds.mockResolvedValue([]);

    const result = await handler.execute({ carrierId: 'carrier-1' });

    expect(result.items[0].status).toBe('outbid');
  });

  it('batches lot + current-best lookups into one call per unique lotId set', async () => {
    bids.listByCarrier.mockResolvedValue([
      makeRow({ id: 'bid-1', lotId: 'lot-1' }),
      makeRow({ id: 'bid-2', lotId: 'lot-1' }),
      makeRow({ id: 'bid-3', lotId: 'lot-2' }),
    ]);
    lots.findByIds.mockResolvedValue([makeLot({ status: 'open' })]);

    await handler.execute({ carrierId: 'carrier-1' });

    expect(lots.findByIds).toHaveBeenCalledTimes(1);
    expect(bids.findCurrentBestForLots).toHaveBeenCalledTimes(1);
    expect(lots.findByIds).toHaveBeenCalledWith(['lot-1', 'lot-2']);
    expect(bids.findCurrentBestForLots).toHaveBeenCalledWith([
      'lot-1',
      'lot-2',
    ]);
  });

  it('sets nextCursor from the last retained row (not the limit+1th)', async () => {
    bids.listByCarrier.mockResolvedValue([
      makeRow({ id: 'bid-1', createdAt: new Date('2026-07-20T12:02:00Z') }),
      makeRow({ id: 'bid-2', createdAt: new Date('2026-07-20T12:01:00Z') }),
      makeRow({ id: 'bid-3', createdAt: new Date('2026-07-20T12:00:00Z') }),
    ]);
    lots.findByIds.mockResolvedValue([makeLot({ status: 'open' })]);

    const result = await handler.execute({ carrierId: 'carrier-1', limit: 2 });

    expect(result.items.map((i) => i.id)).toEqual(['bid-1', 'bid-2']);
    expect(decodeCursor(result.nextCursor as string)).toEqual({
      value: '2026-07-20T12:01:00.000Z',
      id: 'bid-2',
    });
  });

  it('leaves nextCursor unset when repository returns exactly limit rows', async () => {
    bids.listByCarrier.mockResolvedValue([
      makeRow({ id: 'bid-1' }),
      makeRow({ id: 'bid-2' }),
    ]);
    lots.findByIds.mockResolvedValue([makeLot({ status: 'open' })]);

    const result = await handler.execute({ carrierId: 'carrier-1', limit: 2 });

    expect(result.nextCursor).toBeUndefined();
  });

  it('decodes the incoming cursor and forwards it to the repository', async () => {
    const cursor = encodeCursor('2026-07-20T12:00:00.000Z', 'bid-9');

    await handler.execute({ carrierId: 'carrier-1', cursor });

    expect(bids.listByCarrier).toHaveBeenCalledWith(
      'carrier-1',
      expect.objectContaining({
        cursor: { value: '2026-07-20T12:00:00.000Z', id: 'bid-9' },
      }),
    );
  });

  it('throws BadRequestException for an invalid cursor', async () => {
    await expect(
      handler.execute({
        carrierId: 'carrier-1',
        cursor: 'not-a-valid-cursor!!!',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
