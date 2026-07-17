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
import {
  Queues,
  RoutingKeys,
} from '@src/platform/messaging/messaging.constants';
import type {
  LotClosedPayload,
  LotOpenedPayload,
} from '@src/modules/listing/domain/listing-lot';
import { ListingLotRepository } from '@src/modules/listing/infrastructure/listing-lot.repository';

@Injectable()
export class ListingProjectionConsumer extends BaseConsumer<
  LotOpenedPayload | LotClosedPayload
> {
  protected readonly queue = Queues.listing;
  protected readonly prefetch = 10;
  private readonly logger = new Logger(ListingProjectionConsumer.name);

  constructor(
    @Inject(AMQP_CONNECTION) connection: AmqpConnectionManager,
    publisher: Publisher,
    @Inject(MESSAGING_CONFIG) config: MessagingConfig,
    @Inject(DEDUP_PORT) dedup: DedupPort,
    private readonly repository: ListingLotRepository,
  ) {
    super(connection, publisher, config, dedup);
  }

  protected async process(
    msg: RmqMessage<LotOpenedPayload | LotClosedPayload>,
  ): Promise<void> {
    switch (msg.routingKey) {
      case RoutingKeys.lotOpened:
        await this.repository.upsertOpened(msg.payload as LotOpenedPayload);
        return;
      case RoutingKeys.lotClosed: {
        const payload = msg.payload;
        const affected = await this.repository.markClosing(
          payload.lotId,
          new Date(payload.closeAt),
        );
        if (affected === 0) {
          throw new Error(
            `ListingProjection: lot.closed for unknown lot ${payload.lotId} (opened event not yet projected) — will retry`,
          );
        }
        return;
      }
      default:
        this.logger.warn(
          `ListingProjection: unexpected routing key ${msg.routingKey}, skipping`,
        );
        return;
    }
  }
}
