import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  VersionColumn,
} from 'typeorm';
import type { EquipmentType, LotStatus } from '@src/modules/auction/domain/lot';

@Entity('lots')
export class LotEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'shipper_id', type: 'uuid' })
  shipperId!: string;

  @Column()
  origin!: string;

  @Column()
  destination!: string;

  @Column({ name: 'equipment_type', type: 'varchar' })
  equipmentType!: EquipmentType;

  @Column({ name: 'weight_kg', type: 'int' })
  weightKg!: number;

  @Column({ name: 'pickup_from', type: 'timestamptz' })
  pickupFrom!: Date;

  @Column({ name: 'pickup_to', type: 'timestamptz' })
  pickupTo!: Date;

  @Column({ name: 'reserve_price', type: 'int' })
  reservePrice!: number;

  @Column({ name: 'target_price', type: 'int', nullable: true })
  targetPrice!: number | null;

  @Column({ name: 'open_at', type: 'timestamptz' })
  openAt!: Date;

  @Column({ name: 'close_at', type: 'timestamptz' })
  closeAt!: Date;

  @Column({ name: 'anti_snipe_window_sec', type: 'int' })
  antiSnipeWindowSec!: number;

  @Column({ type: 'varchar' })
  status!: LotStatus;

  @VersionColumn()
  version!: number;

  @Column({ name: 'winning_bid_id', type: 'uuid', nullable: true })
  winningBidId!: string | null;

  @Column({ name: 'winning_amount', type: 'int', nullable: true })
  winningAmount!: number | null;

  @Column({ name: 'last_bid_at', type: 'timestamptz', nullable: true })
  lastBidAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
