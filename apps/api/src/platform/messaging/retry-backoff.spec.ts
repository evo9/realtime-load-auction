import { computeRetryDelayMs } from '@src/platform/messaging/retry-backoff';

describe('computeRetryDelayMs', () => {
  const config = {
    retryBaseTtlMs: 1000,
    retryMultiplier: 3,
    retryMaxTtlMs: 20_000,
  };

  it('computes the base delay on the first attempt', () => {
    expect(computeRetryDelayMs(1, config)).toBe(1000);
  });

  it('grows exponentially with the attempt number', () => {
    expect(computeRetryDelayMs(2, config)).toBe(3000);
    expect(computeRetryDelayMs(3, config)).toBe(9000);
  });

  it('produces a strictly increasing sequence while multiplier > 1', () => {
    const delays = [1, 2, 3, 4].map((attempt) =>
      computeRetryDelayMs(attempt, config),
    );
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });

  it('caps the delay at retryMaxTtlMs however large the attempt gets', () => {
    expect(computeRetryDelayMs(5, config)).toBe(20_000);
    expect(computeRetryDelayMs(50, config)).toBe(20_000);
  });

  it('stays flat when multiplier is 1 (fast test configs)', () => {
    const flat = {
      retryBaseTtlMs: 150,
      retryMultiplier: 1,
      retryMaxTtlMs: 1000,
    };
    expect(computeRetryDelayMs(1, flat)).toBe(150);
    expect(computeRetryDelayMs(3, flat)).toBe(150);
  });
});
