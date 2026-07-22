import { Lot } from '@src/modules/auction/domain/lot';
import { CloseLotHandler } from './close-lot.handler';

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
    status: 'open',
    version: 2,
    createdAt: new Date('2026-07-17T00:00:00Z'),
    ...overrides,
  };
}

describe('CloseLotHandler', () => {
  let uow: { transaction: jest.Mock };
  let lots: { lockForUpdate: jest.Mock; update: jest.Mock };
  let cas: { setStatus: jest.Mock };
  let scheduler: { schedule: jest.Mock };
  let lock: { withLock: jest.Mock };
  let outboxAdd: jest.Mock;
  let handler: CloseLotHandler;

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
    cas = { setStatus: jest.fn().mockResolvedValue(undefined) };
    scheduler = { schedule: jest.fn().mockResolvedValue(undefined) };
    lock = {
      withLock: jest.fn((_key, _ttl, fn: () => Promise<unknown>) => fn()),
    };
    handler = new CloseLotHandler(
      uow as never,
      lots as never,
      cas as never,
      scheduler as never,
      lock as never,
    );
  });

  it('extends closeAt within the anti-snipe window and publishes lot.extended', async () => {
    const closeAt = new Date('2026-07-19T00:00:10.000Z');
    const lastBidAt = new Date('2026-07-19T00:00:00.000Z');
    lots.lockForUpdate.mockResolvedValue(
      makeLot({ closeAt, antiSnipeWindowSec: 60, lastBidAt }),
    );

    await handler.execute('lot-1');

    const expectedCloseAt = new Date(lastBidAt.getTime() + 60_000);
    expect(lots.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'open', closeAt: expectedCloseAt }),
    );
    expect(outboxAdd).toHaveBeenCalledTimes(1);
    expect(outboxAdd).toHaveBeenCalledWith(expect.anything(), 'lot.extended', {
      lotId: 'lot-1',
      closeAt: expectedCloseAt.toISOString(),
    });
    expect(cas.setStatus).not.toHaveBeenCalled();
    expect(scheduler.schedule).toHaveBeenCalledWith(
      'auction:schedule:close',
      expectedCloseAt.getTime(),
      'lot-1',
    );
  });

  it('closes the lot outside the anti-snipe window, writing both outbox rows and the Redis status', async () => {
    lots.lockForUpdate.mockResolvedValue(makeLot({ status: 'open' }));

    await handler.execute('lot-1');

    expect(lots.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'closing' }),
    );
    expect(outboxAdd).toHaveBeenCalledTimes(2);
    expect(outboxAdd).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'lot.closing',
      expect.objectContaining({ lotId: 'lot-1' }),
    );
    expect(outboxAdd).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'lot.closed',
      expect.objectContaining({ lotId: 'lot-1' }),
    );
    expect(cas.setStatus).toHaveBeenCalledWith('lot-1', 'closing');
    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it('throws when close is dispatched before the lot has opened', async () => {
    lots.lockForUpdate.mockResolvedValue(makeLot({ status: 'scheduled' }));

    await expect(handler.execute('lot-1')).rejects.toThrow(/has not opened/);
    expect(lots.update).not.toHaveBeenCalled();
  });

  it('is a silent no-op when the distributed lock is already held', async () => {
    lock.withLock.mockResolvedValue(null);

    await expect(handler.execute('lot-1')).resolves.toBeUndefined();
    expect(uow.transaction).not.toHaveBeenCalled();
    expect(cas.setStatus).not.toHaveBeenCalled();
  });
});
