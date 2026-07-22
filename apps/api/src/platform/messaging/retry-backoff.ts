import type { MessagingConfig } from '@src/platform/messaging/messaging.config.token';

export function computeRetryDelayMs(
  attempt: number,
  config: Pick<
    MessagingConfig,
    'retryBaseTtlMs' | 'retryMultiplier' | 'retryMaxTtlMs'
  >,
): number {
  const ttl =
    config.retryBaseTtlMs * Math.pow(config.retryMultiplier, attempt - 1);
  return Math.min(ttl, config.retryMaxTtlMs);
}
