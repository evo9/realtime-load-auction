import { Lot } from '@src/modules/auction/domain/lot';
import { OpenLotHandler } from './open-lot.handler';

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

describe('OpenLotHandler', () => {
  let uow: { transaction: jest.Mock };
  let lots: { lockForUpdate: jest.Mock; update: jest.Mock };
  let cas: { setStatus: jest.Mock; reconcile: jest.Mock };
  let outboxAdd: jest.Mock;
  let calls: string[];
  let handler: OpenLotHandler;

  beforeEach(() => {
    calls = [];
    outboxAdd = jest.fn(() => {
      calls.push('outbox.add');
      return Promise.resolve();
    });
    uow = {
      transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => {
        calls.push('transaction.start');
        const result = await work({ manager: {}, outbox: { add: outboxAdd } });
        calls.push('transaction.end');
        return result;
      }),
    };
    lots = {
      lockForUpdate: jest.fn(),
      update: jest.fn((_tx, lot) => {
        calls.push('update');
        return Promise.resolve(lot);
      }),
    };
    cas = {
      reconcile: jest.fn(() => {
        calls.push('cas.reconcile');
        return Promise.resolve();
      }),
      setStatus: jest.fn(() => {
        calls.push('cas.setStatus');
        return Promise.resolve();
      }),
    };
    handler = new OpenLotHandler(uow as never, lots as never, cas as never);
  });

  it('transitions a scheduled lot to open, writes the outbox row, then sets Redis status after commit', async () => {
    lots.lockForUpdate.mockResolvedValue(makeLot({ status: 'scheduled' }));

    await handler.execute('lot-1');

    expect(lots.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'open' }),
    );
    expect(outboxAdd).toHaveBeenCalledWith(
      expect.anything(),
      'lot.opened',
      expect.objectContaining({ lotId: 'lot-1' }),
    );
    expect(cas.reconcile).toHaveBeenCalledWith('lot-1', null);
    expect(cas.setStatus).toHaveBeenCalledWith('lot-1', 'open');
    expect(calls).toEqual([
      'transaction.start',
      'update',
      'outbox.add',
      'transaction.end',
      'cas.reconcile',
      'cas.setStatus',
    ]);
  });

  it('is a silent no-op when the lot is not found', async () => {
    lots.lockForUpdate.mockResolvedValue(null);

    await handler.execute('missing-lot');

    expect(lots.update).not.toHaveBeenCalled();
    expect(cas.reconcile).not.toHaveBeenCalled();
    expect(cas.setStatus).not.toHaveBeenCalled();
  });

  it('is a silent no-op when the lot is no longer scheduled', async () => {
    lots.lockForUpdate.mockResolvedValue(makeLot({ status: 'open' }));

    await handler.execute('lot-1');

    expect(lots.update).not.toHaveBeenCalled();
    expect(cas.reconcile).not.toHaveBeenCalled();
    expect(cas.setStatus).not.toHaveBeenCalled();
  });
});
