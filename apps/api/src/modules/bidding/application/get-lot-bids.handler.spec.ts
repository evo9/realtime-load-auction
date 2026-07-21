import { BadRequestException } from '@nestjs/common';
import {
  decodeCursor,
  encodeCursor,
} from '@src/modules/bidding/application/bid-cursor';
import { GetLotBidsHandler } from '@src/modules/bidding/application/get-lot-bids.handler';
import type { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';

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

describe('GetLotBidsHandler', () => {
  let bids: { listByLot: jest.Mock; findCurrentBest: jest.Mock };
  let handler: GetLotBidsHandler;

  beforeEach(() => {
    bids = { listByLot: jest.fn(), findCurrentBest: jest.fn() };
    handler = new GetLotBidsHandler(bids as never);
  });

  it('passes sort/limit through to repository.listByLot as-is', async () => {
    bids.listByLot.mockResolvedValue([]);
    bids.findCurrentBest.mockResolvedValue(null);

    await handler.execute({ lotId: 'lot-1', sort: 'time', limit: 5 });

    expect(bids.listByLot).toHaveBeenCalledWith('lot-1', {
      sort: 'time',
      cursor: undefined,
      limit: 5,
    });
  });

  it('defaults to sort=amount and limit=20 when none is given', async () => {
    bids.listByLot.mockResolvedValue([]);
    bids.findCurrentBest.mockResolvedValue(null);

    await handler.execute({ lotId: 'lot-1' });

    expect(bids.listByLot).toHaveBeenCalledWith(
      'lot-1',
      expect.objectContaining({ sort: 'amount', limit: 20 }),
    );
  });

  it('marks isCurrentBest true only for the row matching findCurrentBest.bidId', async () => {
    const rows = [
      makeRow({ id: 'bid-1', amount: 80000 }),
      makeRow({ id: 'bid-2', amount: 90000 }),
    ];
    bids.listByLot.mockResolvedValue(rows);
    bids.findCurrentBest.mockResolvedValue({
      amount: 80000,
      carrierId: 'carrier-1',
      bidId: 'bid-1',
    });

    const result = await handler.execute({ lotId: 'lot-1' });

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'bid-1', isCurrentBest: true }),
      expect.objectContaining({ id: 'bid-2', isCurrentBest: false }),
    ]);
  });

  it('marks every row isCurrentBest false when there is no current best', async () => {
    bids.listByLot.mockResolvedValue([makeRow()]);
    bids.findCurrentBest.mockResolvedValue(null);

    const result = await handler.execute({ lotId: 'lot-1' });

    expect(result.items[0].isCurrentBest).toBe(false);
  });

  it('sets nextCursor from the last retained row (not the limit+1th) for sort=amount', async () => {
    const rows = [
      makeRow({ id: 'bid-1', amount: 10000 }),
      makeRow({ id: 'bid-2', amount: 20000 }),
      makeRow({ id: 'bid-3', amount: 30000 }),
    ];
    bids.listByLot.mockResolvedValue(rows);
    bids.findCurrentBest.mockResolvedValue(null);

    const result = await handler.execute({ lotId: 'lot-1', limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.id)).toEqual(['bid-1', 'bid-2']);
    expect(result.nextCursor).toBeDefined();
    expect(decodeCursor(result.nextCursor as string)).toEqual({
      value: '20000',
      id: 'bid-2',
    });
  });

  it('sets nextCursor from the last retained row for sort=time', async () => {
    const rows = [
      makeRow({ id: 'bid-1', createdAt: new Date('2026-07-20T12:02:00Z') }),
      makeRow({ id: 'bid-2', createdAt: new Date('2026-07-20T12:01:00Z') }),
      makeRow({ id: 'bid-3', createdAt: new Date('2026-07-20T12:00:00Z') }),
    ];
    bids.listByLot.mockResolvedValue(rows);
    bids.findCurrentBest.mockResolvedValue(null);

    const result = await handler.execute({
      lotId: 'lot-1',
      sort: 'time',
      limit: 2,
    });

    expect(result.items.map((i) => i.id)).toEqual(['bid-1', 'bid-2']);
    expect(decodeCursor(result.nextCursor as string)).toEqual({
      value: '2026-07-20T12:01:00.000Z',
      id: 'bid-2',
    });
  });

  it('leaves nextCursor unset when repository returns exactly limit rows', async () => {
    bids.listByLot.mockResolvedValue([
      makeRow({ id: 'bid-1' }),
      makeRow({ id: 'bid-2' }),
    ]);
    bids.findCurrentBest.mockResolvedValue(null);

    const result = await handler.execute({ lotId: 'lot-1', limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeUndefined();
  });

  it('decodes the incoming cursor and forwards it to the repository', async () => {
    bids.listByLot.mockResolvedValue([]);
    bids.findCurrentBest.mockResolvedValue(null);
    const cursor = encodeCursor('50000', 'bid-9');

    await handler.execute({ lotId: 'lot-1', cursor });

    expect(bids.listByLot).toHaveBeenCalledWith(
      'lot-1',
      expect.objectContaining({ cursor: { value: '50000', id: 'bid-9' } }),
    );
  });

  it('throws BadRequestException for an invalid cursor', async () => {
    bids.listByLot.mockResolvedValue([]);
    bids.findCurrentBest.mockResolvedValue(null);

    await expect(
      handler.execute({ lotId: 'lot-1', cursor: 'not-a-valid-cursor!!!' }),
    ).rejects.toThrow(BadRequestException);
  });
});
