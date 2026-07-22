import { Bid } from '@src/modules/bidding/domain/bid';
import { PlaceBidCommand, PlaceBidHandler } from './place-bid.handler';

function makeCommand(
  overrides: Partial<PlaceBidCommand> = {},
): PlaceBidCommand {
  return {
    lotId: 'lot-1',
    carrierId: 'carrier-1',
    amount: 90000,
    idempotencyKey: 'idem-1',
    ...overrides,
  };
}

function makeBid(overrides: Partial<Bid> = {}): Bid {
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

describe('PlaceBidHandler', () => {
  let rateLimiter: { hit: jest.Mock };
  let idem: { begin: jest.Mock; complete: jest.Mock };
  let cas: { tryBeatHighBid: jest.Mock; reconcileIfCurrent: jest.Mock };
  let uow: { transaction: jest.Mock };
  let bids: { insert: jest.Mock; findCurrentBest: jest.Mock };
  let lots: { readStatus: jest.Mock; touchLastBidAt: jest.Mock };
  let config: { bidding: { rateLimit: number; rateWindowMs: number } };
  let outboxAdd: jest.Mock;
  let calls: string[];
  let handler: PlaceBidHandler;

  beforeEach(() => {
    calls = [];
    outboxAdd = jest.fn(() => {
      calls.push('outbox.add');
      return Promise.resolve();
    });
    rateLimiter = {
      hit: jest.fn(() => {
        calls.push('rate.hit');
        return Promise.resolve({ allowed: true, remaining: 9 });
      }),
    };
    idem = {
      begin: jest.fn(() => {
        calls.push('idem.begin');
        return Promise.resolve({ status: 'new' });
      }),
      complete: jest.fn((_key: string, result: unknown) => {
        calls.push('idem.complete');
        return Promise.resolve(result);
      }),
    };
    cas = {
      tryBeatHighBid: jest.fn(() => {
        calls.push('cas.tryBeatHighBid');
        return Promise.resolve({ accepted: true, reason: 'accepted' });
      }),
      reconcileIfCurrent: jest.fn(() => {
        calls.push('cas.reconcileIfCurrent');
        return Promise.resolve(true);
      }),
    };
    uow = {
      transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => {
        calls.push('transaction.start');
        const result = await work({ manager: {}, outbox: { add: outboxAdd } });
        calls.push('transaction.end');
        return result;
      }),
    };
    bids = {
      insert: jest.fn((_tx: unknown, bid: Partial<Bid>) => {
        calls.push('bids.insert');
        return Promise.resolve(makeBid(bid));
      }),
      findCurrentBest: jest.fn(() => {
        calls.push('bids.findCurrentBest');
        return Promise.resolve(null);
      }),
    };
    lots = {
      readStatus: jest.fn(() => {
        calls.push('lots.readStatus');
        return Promise.resolve('open');
      }),
      touchLastBidAt: jest.fn(() => {
        calls.push('lots.touchLastBidAt');
        return Promise.resolve();
      }),
    };
    config = { bidding: { rateLimit: 10, rateWindowMs: 10000 } };

    handler = new PlaceBidHandler(
      rateLimiter as never,
      idem as never,
      cas as never,
      uow as never,
      bids as never,
      lots as never,
      config as never,
    );
  });

  it('accepts a valid bid: rate check, idem, CAS, TX insert+outbox, then idem.complete in order', async () => {
    const outcome = await handler.execute(makeCommand());

    expect(outcome.status).toBe('accepted');
    if (outcome.status !== 'accepted') throw new Error('unreachable');
    expect(outcome.bid).toEqual(
      expect.objectContaining({
        lotId: 'lot-1',
        carrierId: 'carrier-1',
        amount: 90000,
      }),
    );
    expect(calls).toEqual([
      'rate.hit',
      'idem.begin',
      'cas.tryBeatHighBid',
      'transaction.start',
      'lots.readStatus',
      'bids.insert',
      'lots.touchLastBidAt',
      'outbox.add',
      'transaction.end',
      'idem.complete',
    ]);
  });

  it('scopes the idempotency key by carrier so two carriers reusing the same header never collide', async () => {
    await handler.execute(makeCommand({ carrierId: 'carrier-1' }));
    await handler.execute(
      makeCommand({ carrierId: 'carrier-2', idempotencyKey: 'idem-1' }),
    );

    expect(idem.begin).toHaveBeenNthCalledWith(1, 'carrier-1:idem-1');
    expect(idem.begin).toHaveBeenNthCalledWith(2, 'carrier-2:idem-1');
  });

  it('replays the cached result without touching CAS or the TX', async () => {
    const cached = { status: 'accepted' as const, bid: makeBid() as never };
    idem.begin.mockImplementation(() => {
      calls.push('idem.begin');
      return Promise.resolve({ status: 'replay', result: cached });
    });

    const outcome = await handler.execute(makeCommand());

    expect(outcome).toBe(cached);
    expect(cas.tryBeatHighBid).not.toHaveBeenCalled();
    expect(uow.transaction).not.toHaveBeenCalled();
    expect(idem.complete).not.toHaveBeenCalled();
  });

  it('returns in_progress without touching CAS or the TX', async () => {
    idem.begin.mockImplementation(() => {
      calls.push('idem.begin');
      return Promise.resolve({ status: 'in_progress' });
    });

    const outcome = await handler.execute(makeCommand());

    expect(outcome).toEqual({ status: 'in_progress' });
    expect(cas.tryBeatHighBid).not.toHaveBeenCalled();
    expect(uow.transaction).not.toHaveBeenCalled();
    expect(idem.complete).not.toHaveBeenCalled();
  });

  it('returns rate_limited without touching idempotency, CAS, or the TX', async () => {
    rateLimiter.hit.mockImplementation(() => {
      calls.push('rate.hit');
      return Promise.resolve({ allowed: false, remaining: 0 });
    });

    const outcome = await handler.execute(makeCommand());

    expect(outcome).toEqual({ status: 'rate_limited' });
    expect(idem.begin).not.toHaveBeenCalled();
    expect(cas.tryBeatHighBid).not.toHaveBeenCalled();
    expect(uow.transaction).not.toHaveBeenCalled();
  });

  it.each(['too_low', 'closed'] as const)(
    'rejects with reason %s from CAS without ever opening the TX',
    async (reason) => {
      cas.tryBeatHighBid.mockImplementation(() => {
        calls.push('cas.tryBeatHighBid');
        return Promise.resolve({ accepted: false, reason });
      });

      const outcome = await handler.execute(makeCommand());

      expect(outcome).toEqual({ status: 'rejected', reason });
      expect(uow.transaction).not.toHaveBeenCalled();
      expect(idem.complete).toHaveBeenCalledWith(expect.any(String), {
        status: 'rejected',
        reason,
      });
    },
  );

  it('reconciles and rejects as closed when the lot is no longer open inside the TX', async () => {
    lots.readStatus.mockImplementation(() => {
      calls.push('lots.readStatus');
      return Promise.resolve('closing');
    });
    bids.findCurrentBest.mockImplementation(() => {
      calls.push('bids.findCurrentBest');
      return Promise.resolve({
        amount: 80000,
        carrierId: 'carrier-2',
        bidId: 'bid-2',
      });
    });

    const outcome = await handler.execute(makeCommand());

    expect(outcome).toEqual({ status: 'rejected', reason: 'closed' });
    expect(bids.insert).not.toHaveBeenCalled();
    expect(outboxAdd).not.toHaveBeenCalled();
    expect(bids.findCurrentBest).toHaveBeenCalledWith('lot-1');
    expect(cas.reconcileIfCurrent).toHaveBeenCalledWith(
      'lot-1',
      expect.any(String),
      { amount: 80000, carrierId: 'carrier-2', bidId: 'bid-2' },
    );
    expect(idem.complete).toHaveBeenCalledWith(expect.any(String), {
      status: 'rejected',
      reason: 'closed',
    });
  });

  it('reconciles and rethrows without completing idempotency when the TX fails for an unrelated reason', async () => {
    const boom = new Error('boom');
    bids.insert.mockImplementation(() => {
      calls.push('bids.insert');
      return Promise.reject(boom);
    });

    await expect(handler.execute(makeCommand())).rejects.toBe(boom);

    expect(bids.findCurrentBest).toHaveBeenCalledWith('lot-1');
    expect(cas.reconcileIfCurrent).toHaveBeenCalledWith(
      'lot-1',
      expect.any(String),
      null,
    );
    expect(idem.complete).not.toHaveBeenCalled();
  });
});
