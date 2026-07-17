export const RedisKeys = {
  lotHigh: (lotId: string) => `lot:${lotId}:high`,
  lotStatus: (lotId: string) => `lot:${lotId}:status`,
  lotLock: (lotId: string) => `lot:${lotId}:lock`,
  idem: (key: string) => `idem:${key}`,
  msgDedup: (messageId: string) => `msg:dedup:${messageId}`,
  scheduleOpen: () => `auction:schedule:open`,
  scheduleClose: () => `auction:schedule:close`,
  rateLimit: (carrierId: string, lotId: string) =>
    `ratelimit:${carrierId}:${lotId}`,
} as const;
