import { Injectable } from '@nestjs/common';
import { PubSub } from '@src/platform/redis/pub-sub';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { NotificationLogRepository } from '@src/modules/notification/infrastructure/notification-log.repository';
import type { Notification } from '@src/modules/notification/domain/notification';
import {
  renderLotSettled,
  renderLotWon,
} from '@src/modules/notification/domain/notification-templates';
import type { Lot } from '@src/modules/auction/domain/lot';
import type { SagaInstance } from '@src/modules/settlement/domain/saga';

// Local copy of the wire shape, matching NotificationConsumer's envelope:
// settlement must not depend on realtime (nor vice versa).
interface NotificationEnvelope {
  type: 'notification';
  lotId: string;
  payload: Notification;
}

@Injectable()
export class SettlementNotifier {
  constructor(
    private readonly log: NotificationLogRepository,
    private readonly pubSub: PubSub,
  ) {}

  async notifyWinnerAndShipper(saga: SagaInstance, lot: Lot): Promise<void> {
    const winningAmount = saga.payload.winningAmount!;
    const winningCarrierId = saga.payload.winningCarrierId!;

    const won = renderLotWon(winningAmount);
    await this.deliver(`settlement:${saga.id}:lot_won`, lot.id, {
      recipientId: winningCarrierId,
      type: 'lot_won',
      lotId: lot.id,
      message: won.message,
      detail: won.detail,
    });

    const settled = renderLotSettled(winningAmount, winningCarrierId);
    await this.deliver(`settlement:${saga.id}:lot_settled`, lot.id, {
      recipientId: lot.shipperId,
      type: 'lot_settled',
      lotId: lot.id,
      message: settled.message,
      detail: settled.detail,
    });
  }

  private async deliver(
    messageId: string,
    lotId: string,
    notification: Notification,
  ): Promise<void> {
    // messageId is deterministic per saga+type (not randomUUID like the
    // regular event consumers use) so a redelivered notify step dedups on
    // the same (messageId, recipientId, type, channel) unique constraint
    // instead of sending the winner/shipper their notification twice.
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
