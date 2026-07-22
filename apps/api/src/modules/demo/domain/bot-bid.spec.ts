import { nextBidAmount } from '@src/modules/demo/domain/bot-bid';

describe('nextBidAmount', () => {
  it('places a first bid below reservePrice when there is no current best', () => {
    const amount = nextBidAmount({
      currentBest: null,
      reservePrice: 100000,
      targetPrice: null,
      rng: () => 0.5,
    });

    expect(amount).not.toBeNull();
    expect(amount).toBeLessThan(100000);
    expect(Number.isInteger(amount)).toBe(true);
  });

  it('decrements strictly below the current best (reverse auction)', () => {
    const amount = nextBidAmount({
      currentBest: 90000,
      reservePrice: 100000,
      targetPrice: null,
      rng: () => 0.5,
    });

    expect(amount).not.toBeNull();
    expect(amount as number).toBeLessThan(90000);
  });

  it('never bids below the floor set by targetPrice', () => {
    const amount = nextBidAmount({
      currentBest: 50001,
      reservePrice: 100000,
      targetPrice: 50000,
      rng: () => 0.99,
    });

    expect(amount).toBeNull();
  });

  it('never bids below the reservePrice-derived floor when no targetPrice is set', () => {
    const amount = nextBidAmount({
      currentBest: 60001,
      reservePrice: 100000,
      targetPrice: null,
      rng: () => 0.99,
    });

    expect(amount).toBeNull();
  });

  it('returns null once currentBest has already reached the floor', () => {
    const amount = nextBidAmount({
      currentBest: 50000,
      reservePrice: 100000,
      targetPrice: 50000,
      rng: () => 0.5,
    });

    expect(amount).toBeNull();
  });
});
