import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Lot } from '@src/modules/auction/domain/lot';
import { CancelLotHandler } from './cancel-lot.handler';

function makeLot(overrides: Partial<Lot> = {}): Lot {
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
    status: 'scheduled',
    version: 1,
    createdAt: new Date('2026-07-17T00:00:00Z'),
    ...overrides,
  };
}

describe('CancelLotHandler', () => {
  let uow: { transaction: jest.Mock };
  let lots: { lockForUpdate: jest.Mock; update: jest.Mock };
  let cas: { clear: jest.Mock };
  let outboxAdd: jest.Mock;
  let handler: CancelLotHandler;

  beforeEach(() => {
    outboxAdd = jest.fn().mockResolvedValue(undefined);
    uow = {
      transaction: jest.fn((work: (tx: unknown) => Promise<unknown>) =>
        work({ manager: {}, outbox: { add: outboxAdd } }),
      ),
    };
    lots = {
      lockForUpdate: jest.fn(),
      update: jest.fn((_tx, lot) => Promise.resolve(lot)),
    };
    cas = { clear: jest.fn().mockResolvedValue(undefined) };
    handler = new CancelLotHandler(uow as never, lots as never, cas as never);
  });

  it('rejects a cancel request from a shipper who does not own the lot', async () => {
    lots.lockForUpdate.mockResolvedValue(makeLot({ shipperId: 'shipper-1' }));

    await expect(
      handler.execute('lot-1', { requestedBy: 'shipper-2' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(lots.update).not.toHaveBeenCalled();
  });

  it('rejects when the lot does not exist', async () => {
    lots.lockForUpdate.mockResolvedValue(null);

    await expect(
      handler.execute('missing-lot', { requestedBy: 'shipper-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancels the lot, writes the outbox row, and clears Redis state', async () => {
    lots.lockForUpdate.mockResolvedValue(makeLot({ shipperId: 'shipper-1' }));

    await handler.execute('lot-1', {
      requestedBy: 'shipper-1',
      reason: 'no longer needed',
    });

    expect(lots.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'cancelled' }),
    );
    expect(outboxAdd).toHaveBeenCalledWith(expect.anything(), 'lot.cancelled', {
      lotId: 'lot-1',
      reason: 'no longer needed',
    });
    expect(cas.clear).toHaveBeenCalledWith('lot-1');
  });
});
