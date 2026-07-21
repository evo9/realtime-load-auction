import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseRepository } from '@src/platform/persistence/base.repository';
import type { Notification } from '@src/modules/notification/domain/notification';
import { NotificationEntity } from '@src/modules/notification/infrastructure/notification.entity';

export interface RecordNotificationInput {
  messageId: string;
  recipientId: string;
  type: Notification['type'];
  channel: 'email';
  lotId: string;
  payload: Notification;
}

@Injectable()
export class NotificationLogRepository extends BaseRepository<NotificationEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, NotificationEntity);
  }

  // Idempotent by design: BaseConsumer's per-message dedup only guards the
  // whole process() call, so a retry after a partial failure re-runs this —
  // ON CONFLICT DO NOTHING keeps a redelivered/retried write a no-op instead
  // of a unique-violation or a duplicate row.
  async record(input: RecordNotificationInput): Promise<void> {
    await this.read()
      .createQueryBuilder()
      .insert()
      .into(NotificationEntity)
      .values({
        id: randomUUID(),
        messageId: input.messageId,
        recipientId: input.recipientId,
        type: input.type,
        channel: input.channel,
        lotId: input.lotId,
        payload: input.payload,
      } as unknown as QueryDeepPartialEntity<NotificationEntity>)
      .orIgnore()
      .execute();
  }

  async countByMessage(messageId: string): Promise<number> {
    return this.read()
      .createQueryBuilder('n')
      .where('n.message_id = :messageId', { messageId })
      .getCount();
  }
}
