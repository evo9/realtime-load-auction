import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('outbox')
export class OutboxEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'routing_key' })
  routingKey!: string;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;
}
