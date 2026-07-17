// KEYS[1]=zset  ARGV[1]=now(ms)  ARGV[2]=batchSize
export const SCHEDULER_CLAIM_DUE = `
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[2]))
if #due > 0 then
  -- remove in the same atomic step so a concurrent tick can never claim the same member twice
  redis.call('ZREM', KEYS[1], unpack(due))
end
return due
`;
