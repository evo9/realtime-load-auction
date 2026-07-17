export const MESSAGING_CONFIG = Symbol('MESSAGING_CONFIG');

export interface MessagingConfig {
  prefetch: number;
  retryLimit: number;
  retryBaseTtlMs: number;
  retryMultiplier: number;
  retryMaxTtlMs: number;
}
