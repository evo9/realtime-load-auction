import { AppConfigService } from '@src/config/app-config.service';
import { Lot } from '@src/modules/auction/domain/lot';
import { CreateLotCommand } from '@src/modules/auction/domain/lot-factory';
import {
  PlaceBidCommand,
  PlaceBidOutcome,
} from '@src/modules/bidding/application/place-bid.handler';
import { ListingLotEntity } from '@src/modules/listing/infrastructure/listing-lot.entity';
import { ListLotsFilter } from '@src/modules/listing/infrastructure/listing-lot.repository';
import { Role, User } from '@src/modules/identity/domain/user';
import { DemoGeneratorService } from './demo-generator.service';

function makeConfig(overrides: Partial<AppConfigService['demo']> = {}) {
  return {
    demo: {
      enabled: true,
      lotIntervalMs: 30000,
      bidIntervalMs: 2500,
      maxOpenLots: 12,
      lotDurationMs: 120000,
      antiSnipeWindowSec: 20,
      bidProbability: 0.35,
      burstProbability: 0.9,
      ...overrides,
    },
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash',
    role: 'carrier',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeLot(overrides: Partial<ListingLotEntity> = {}): ListingLotEntity {
  return {
    id: 'lot-1',
    shipperId: 'shipper-1',
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    equipmentType: 'van',
    weightKg: 12000,
    reservePrice: 100000,
    targetPrice: null,
    status: 'open',
    openAt: new Date(),
    closeAt: new Date(Date.now() + 3_600_000),
    currentBest: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DemoGeneratorService', () => {
  let config: ReturnType<typeof makeConfig>;
  let scheduler: { addInterval: jest.Mock<void, [string, NodeJS.Timeout]> };
  let createLot: { execute: jest.Mock<Promise<Lot>, [CreateLotCommand]> };
  let placeBid: {
    execute: jest.Mock<Promise<PlaceBidOutcome>, [PlaceBidCommand]>;
  };
  let listingLots: {
    list: jest.Mock<Promise<ListingLotEntity[]>, [ListLotsFilter]>;
  };
  let users: { findByRole: jest.Mock<Promise<User[]>, [Role]> };
  let service: DemoGeneratorService;
  let randomSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    config = makeConfig();
    scheduler = { addInterval: jest.fn<void, [string, NodeJS.Timeout]>() };
    createLot = {
      execute: jest.fn<Promise<Lot>, [CreateLotCommand]>(() =>
        Promise.resolve({} as Lot),
      ),
    };
    placeBid = {
      execute: jest.fn<Promise<PlaceBidOutcome>, [PlaceBidCommand]>(() =>
        Promise.resolve({ status: 'accepted', bid: {} as never }),
      ),
    };
    listingLots = {
      list: jest.fn<Promise<ListingLotEntity[]>, [ListLotsFilter]>(() =>
        Promise.resolve([]),
      ),
    };
    users = {
      findByRole: jest.fn<Promise<User[]>, [Role]>((role) =>
        Promise.resolve(
          role === 'shipper'
            ? [makeUser({ id: 'shipper-1', role: 'shipper' })]
            : [makeUser({ id: 'carrier-1', role: 'carrier' })],
        ),
      ),
    };

    service = new DemoGeneratorService(
      config as never,
      scheduler as never,
      createLot as never,
      placeBid as never,
      listingLots as never,
      users as never,
    );
  });

  afterEach(() => {
    randomSpy?.mockRestore();
  });

  describe('onModuleInit', () => {
    it('registers no timers when disabled', () => {
      config.demo.enabled = false;

      service.onModuleInit();

      expect(scheduler.addInterval).not.toHaveBeenCalled();
    });

    it('registers a create-lots and a place-bids interval when enabled', () => {
      service.onModuleInit();

      expect(scheduler.addInterval).toHaveBeenCalledTimes(2);
      expect(scheduler.addInterval).toHaveBeenNthCalledWith(
        1,
        'demo:create-lots',
        expect.anything(),
      );
      expect(scheduler.addInterval).toHaveBeenNthCalledWith(
        2,
        'demo:place-bids',
        expect.anything(),
      );

      for (const call of scheduler.addInterval.mock.calls) {
        clearInterval(call[1]);
      }
    });
  });

  describe('tickCreateLots', () => {
    const tick = () =>
      (
        service as never as { tickCreateLots(): Promise<void> }
      ).tickCreateLots();

    it('does nothing when there are no shipper accounts', async () => {
      users.findByRole.mockResolvedValue([]);

      await tick();

      expect(createLot.execute).not.toHaveBeenCalled();
    });

    it('skips creating a lot once the open-lot cap is reached', async () => {
      config.demo.maxOpenLots = 2;
      listingLots.list.mockResolvedValue([makeLot(), makeLot({ id: 'lot-2' })]);

      await tick();

      expect(createLot.execute).not.toHaveBeenCalled();
    });

    it('creates a synthetic lot for a known shipper when under the cap', async () => {
      listingLots.list.mockResolvedValue([]);

      await tick();

      expect(createLot.execute).toHaveBeenCalledWith(
        expect.objectContaining({ shipperId: 'shipper-1' }),
      );
    });
  });

  describe('tickPlaceBids', () => {
    const tick = () =>
      (service as never as { tickPlaceBids(): Promise<void> }).tickPlaceBids();

    it('does nothing when there are no carrier accounts', async () => {
      users.findByRole.mockResolvedValue([]);
      listingLots.list.mockResolvedValue([makeLot()]);

      await tick();

      expect(placeBid.execute).not.toHaveBeenCalled();
    });

    it('bids on every open lot with a fresh idempotency key per attempt', async () => {
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      listingLots.list.mockResolvedValue([makeLot(), makeLot({ id: 'lot-2' })]);

      await tick();

      expect(placeBid.execute).toHaveBeenCalledTimes(2);
      expect(placeBid.execute).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ lotId: 'lot-1', carrierId: 'carrier-1' }),
      );
      const keys = placeBid.execute.mock.calls.map(
        ([cmd]) => cmd.idempotencyKey,
      );
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('skips the lot when the bid roll misses (below the probability threshold)', async () => {
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);
      listingLots.list.mockResolvedValue([makeLot()]);

      await tick();

      expect(placeBid.execute).not.toHaveBeenCalled();
    });

    it('skips the lot when the computed amount would fall at or below the floor', async () => {
      randomSpy = jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0) // passes the bid-probability roll
        .mockReturnValueOnce(0.99); // pushes nextBidAmount to (or below) the floor
      listingLots.list.mockResolvedValue([
        makeLot({
          currentBest: 60001,
          reservePrice: 100000,
          targetPrice: null,
        }),
      ]);

      await tick();

      expect(placeBid.execute).not.toHaveBeenCalled();
    });

    it('treats a non-accepted outcome as a normal skip, not an error', async () => {
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      placeBid.execute.mockResolvedValue({
        status: 'rejected',
        reason: 'too_low',
      });
      listingLots.list.mockResolvedValue([makeLot()]);

      await expect(tick()).resolves.toBeUndefined();
    });

    it('gives lots inside the anti-snipe window the burst probability instead of the base one', async () => {
      // 0.5 is below burstProbability (0.9) but above bidProbability (0.35),
      // so only the anti-snipe lot should get a bid.
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
      listingLots.list.mockResolvedValue([
        makeLot({ id: 'far', closeAt: new Date(Date.now() + 3_600_000) }),
        makeLot({ id: 'near', closeAt: new Date(Date.now() + 5_000) }),
      ]);

      await tick();

      expect(placeBid.execute).toHaveBeenCalledTimes(1);
      expect(placeBid.execute).toHaveBeenCalledWith(
        expect.objectContaining({ lotId: 'near' }),
      );
    });
  });
});
