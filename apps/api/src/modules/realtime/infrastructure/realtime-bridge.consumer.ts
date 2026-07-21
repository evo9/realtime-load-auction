import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { AMQP_CONNECTION } from '@src/platform/messaging/amqp-connection.token';
import { MESSAGING_CONFIG } from '@src/platform/messaging/messaging.config.token';
import type { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import { Publisher } from '@src/platform/messaging/publisher';
import { DEDUP_PORT } from '@src/platform/messaging/dedup.port';
import type { DedupPort } from '@src/platform/messaging/dedup.port';
import { BaseConsumer } from '@src/platform/messaging/base.consumer';
import type { RmqMessage } from '@src/platform/messaging/base.consumer';
import { Queues } from '@src/platform/messaging/messaging.constants';
import { PubSub } from '@src/platform/redis/pub-sub';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import type { RealtimeEnvelope } from '@src/modules/realtime/domain/realtime-event';

@Injectable()
export class RealtimeBridgeConsumer extends BaseConsumer<{ lotId: string }> {
  protected readonly queue = Queues.realtime;
  protected readonly prefetch = 20;
  private readonly logger = new Logger(RealtimeBridgeConsumer.name);

  constructor(
    @Inject(AMQP_CONNECTION) connection: AmqpConnectionManager,
    publisher: Publisher,
    @Inject(MESSAGING_CONFIG) config: MessagingConfig,
    @Inject(DEDUP_PORT) dedup: DedupPort,
    private readonly pubSub: PubSub,
  ) {
    super(connection, publisher, config, dedup);
  }

  protected async process(msg: RmqMessage<{ lotId: string }>): Promise<void> {
    const lotId = msg.payload?.lotId;
    // A payload missing lotId will never gain one on retry — skip rather than
    // publish to a bogus channel (no subscriber's UUID pattern could ever
    // match it) or loop it through the retry/DLQ cycle for nothing.
    if (typeof lotId !== 'string' || lotId.length === 0) {
      this.logger.warn(
        `RealtimeBridge: ${msg.routingKey} payload has no lotId, skipping`,
      );
      return;
    }
    const envelope: RealtimeEnvelope = {
      type: msg.routingKey,
      lotId,
      payload: msg.payload,
    };
    await this.pubSub.publish(RedisKeys.lotChannel(lotId), envelope);
  }
}
