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
import { PubSub } from '@src/platform/redis/pub-sub';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';
import { NotificationLogRepository } from '@src/modules/notification/infrastructure/notification-log.repository';
import type { Notification } from '@src/modules/notification/domain/notification';
import {
  renderLotOpened,
  renderNewBid,
  renderOutbid,
  renderLotClosed,
} from '@src/modules/notification/domain/notification-templates';
import type {
  LotOpenedPayload,
  LotClosedPayload,
  BidPlacedPayload,
} from '@src/modules/listing/domain/listing-lot';

// Local copy, not an import from modules/realtime: notification must not
// depend on realtime (nor vice versa) — both only share the wire shape via
// the same Redis channel.
interface NotificationEnvelope {
  type: 'notification';
  lotId: string;
  payload: Notification;
}

@Injectable()
export class NotificationConsumer extends BaseConsumer<
  LotOpenedPayload | LotClosedPayload | BidPlacedPayload
> {
  protected readonly queue = Queues.notification;
  protected readonly prefetch = 10;
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(
    @Inject(AMQP_CONNECTION) connection: AmqpConnectionManager,
    publisher: Publisher,
    @Inject(MESSAGING_CONFIG) config: MessagingConfig,
    @Inject(DEDUP_PORT) dedup: DedupPort,
    private readonly pubSub: PubSub,
    private readonly log: NotificationLogRepository,
    private readonly lots: LotRepository,
    private readonly bids: BidRepository,
  ) {
    super(connection, publisher, config, dedup);
  }

  protected async process(
    msg: RmqMessage<LotOpenedPayload | LotClosedPayload | BidPlacedPayload>,
  ): Promise<void> {
    switch (msg.routingKey) {
      case RoutingKeys.lotOpened: {
        const payload = msg.payload as LotOpenedPayload;
        const { message, detail } = renderLotOpened();
        await this.deliver(msg.messageId, payload.lotId, {
          recipientId: payload.shipperId,
          type: 'lot_opened',
          lotId: payload.lotId,
          message,
          detail,
        });
        return;
      }
      case RoutingKeys.bidPlaced: {
        const payload = msg.payload as BidPlacedPayload;
        const lot = await this.lots.findById(payload.lotId);
        if (!lot) {
          this.logger.warn(
            `Notification: bid.placed for unknown lot ${payload.lotId}, skipping`,
          );
          return;
        }

        const { message: newBidMessage, detail: newBidDetail } = renderNewBid(
          payload.amount,
          payload.carrierId,
          payload.bidId,
        );
        await this.deliver(msg.messageId, payload.lotId, {
          recipientId: lot.shipperId,
          type: 'new_bid',
          lotId: payload.lotId,
          message: newBidMessage,
          detail: newBidDetail,
        });

        const previousBest = await this.bids.findPreviousBest(
          payload.lotId,
          payload.bidId,
        );
        if (previousBest && previousBest.carrierId !== payload.carrierId) {
          const { message, detail } = renderOutbid(
            payload.amount,
            previousBest.amount,
          );
          await this.deliver(msg.messageId, payload.lotId, {
            recipientId: previousBest.carrierId,
            type: 'outbid',
            lotId: payload.lotId,
            message,
            detail,
          });
        }
        return;
      }
      case RoutingKeys.lotClosed: {
        const payload = msg.payload as LotClosedPayload;
        const lot = await this.lots.findById(payload.lotId);
        if (!lot) {
          this.logger.warn(
            `Notification: lot.closed for unknown lot ${payload.lotId}, skipping`,
          );
          return;
        }
        const { message, detail } = renderLotClosed(payload.closeAt);
        await this.deliver(msg.messageId, payload.lotId, {
          recipientId: lot.shipperId,
          type: 'lot_closed',
          lotId: payload.lotId,
          message,
          detail,
        });
        return;
      }
      default:
        this.logger.warn(
          `Notification: unexpected routing key ${msg.routingKey}, skipping`,
        );
        return;
    }
  }

  private async deliver(
    messageId: string,
    lotId: string,
    notification: Notification,
  ): Promise<void> {
    await this.log.record({
      messageId,
      recipientId: notification.recipientId,
      type: notification.type,
      channel: 'email',
      lotId,
      payload: notification,
    });
    const envelope: NotificationEnvelope = {
      type: 'notification',
      lotId,
      payload: notification,
    };
    await this.pubSub.publish(RedisKeys.lotChannel(lotId), envelope);
  }
}
