import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import type { NotificationType } from '@src/modules/notification/domain/notification';

@Entity('notifications')
@Unique(['messageId', 'recipientId', 'type', 'channel'])
export class NotificationEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'message_id', type: 'varchar' })
  messageId!: string;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @Column({ type: 'varchar' })
  type!: NotificationType;

  @Column({ type: 'varchar', default: 'email' })
  channel!: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
