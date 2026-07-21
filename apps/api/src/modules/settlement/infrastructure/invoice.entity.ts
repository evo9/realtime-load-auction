import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type InvoiceStatus = 'issued' | 'void';

@Entity('invoices')
@Unique(['lotId'])
export class InvoiceEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId!: string;

  @Column({ name: 'saga_id', type: 'uuid' })
  sagaId!: string;

  @Column({ name: 'bid_id', type: 'uuid' })
  bidId!: string;

  @Column({ type: 'int' })
  amount!: number;

  @Column({ name: 'carrier_id', type: 'uuid' })
  carrierId!: string;

  @Column({ type: 'varchar' })
  status!: InvoiceStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
