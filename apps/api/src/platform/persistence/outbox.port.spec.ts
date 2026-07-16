import { NullOutboxPort } from './outbox.port';

describe('NullOutboxPort', () => {
  it('throws a clear error explaining the outbox is not configured yet', () => {
    const outbox = new NullOutboxPort();

    expect(() => outbox.add()).toThrow(/outbox/i);
    expect(() => outbox.add()).toThrow(/M2-03/);
  });
});
