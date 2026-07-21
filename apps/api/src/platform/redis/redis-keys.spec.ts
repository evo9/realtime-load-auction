import { RedisKeys } from '@src/platform/redis/redis-keys';

describe('RedisKeys', () => {
  it('lotHigh', () => {
    expect(RedisKeys.lotHigh('lot-1')).toBe('lot:lot-1:high');
  });

  it('lotStatus', () => {
    expect(RedisKeys.lotStatus('lot-1')).toBe('lot:lot-1:status');
  });

  it('lotLock', () => {
    expect(RedisKeys.lotLock('lot-1')).toBe('lot:lot-1:lock');
  });

  it('lotChannel', () => {
    expect(RedisKeys.lotChannel('lot-1')).toBe('lot:lot-1:channel');
  });

  it('idem', () => {
    expect(RedisKeys.idem('abc-123')).toBe('idem:abc-123');
  });

  it('msgDedup', () => {
    expect(RedisKeys.msgDedup('notification.q', 'msg-42')).toBe(
      'msg:dedup:notification.q:msg-42',
    );
  });

  it('scheduleOpen', () => {
    expect(RedisKeys.scheduleOpen()).toBe('auction:schedule:open');
  });

  it('scheduleClose', () => {
    expect(RedisKeys.scheduleClose()).toBe('auction:schedule:close');
  });

  it('rateLimit', () => {
    expect(RedisKeys.rateLimit('carrier-1', 'lot-1')).toBe(
      'ratelimit:carrier-1:lot-1',
    );
  });
});
