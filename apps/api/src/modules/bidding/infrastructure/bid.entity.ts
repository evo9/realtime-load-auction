import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('bids')
export class BidEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId!: string;

  @Column({ name: 'carrier_id', type: 'uuid' })
  carrierId!: string;

  @Column({ type: 'int' })
  amount!: number;

  @Column({ name: 'idempotency_key', type: 'varchar' })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
