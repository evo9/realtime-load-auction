export const LOCK_RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

// KEYS[1]=lot:{id}:high  KEYS[2]=lot:{id}:status
// ARGV[1]=amount  ARGV[2]=carrierId  ARGV[3]=bidId
export const CAS_BEAT_HIGH_BID = `
if redis.call('GET', KEYS[2]) ~= 'open' then return {0, 'closed'} end
local amount = tonumber(ARGV[1])
-- NaN is the only Lua number that isn't equal to itself; left unguarded it
-- would poison every future comparison on this lot ('cur >= NaN' is always
-- false, so every later bid would bypass the reverse-auction check).
if amount ~= amount then return {0, 'too_low'} end
local cur = tonumber(redis.call('HGET', KEYS[1], 'amount'))
if cur and amount >= cur then return {0, 'too_low'} end
redis.call('HSET', KEYS[1], 'amount', ARGV[1], 'carrierId', ARGV[2], 'bidId', ARGV[3])
return {1, 'accepted'}
`;

// KEYS[1]=lot:{id}:high
// ARGV[1]=expectedBidId  ARGV[2]=hasFact(0/1)  ARGV[3]=amount  ARGV[4]=carrierId  ARGV[5]=bidId
export const RECONCILE_IF_CURRENT = `
if redis.call('HGET', KEYS[1], 'bidId') ~= ARGV[1] then return 0 end
if ARGV[2] == '1' then
  redis.call('HSET', KEYS[1], 'amount', ARGV[3], 'carrierId', ARGV[4], 'bidId', ARGV[5])
else
  redis.call('DEL', KEYS[1])
end
return 1
`;

// KEYS[1]=idem:{key}  ARGV[1]=in-progress envelope JSON  ARGV[2]=inProgressTtlMs
export const IDEM_BEGIN = `
local existing = redis.call('GET', KEYS[1])
if existing then
  return existing
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', tonumber(ARGV[2]))
return false
`;

// KEYS[1]=zset  ARGV[1]=now(ms)  ARGV[2]=window(ms)  ARGV[3]=limit  ARGV[4]=member
export const RATE_LIMIT_HIT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
-- drop entries that fell out of the sliding window before counting
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
local count = redis.call('ZCARD', KEYS[1])
if count < limit then
  redis.call('ZADD', KEYS[1], now, ARGV[4])
  redis.call('PEXPIRE', KEYS[1], window)
  return {1, limit - count - 1}
end
return {0, 0}
`;
