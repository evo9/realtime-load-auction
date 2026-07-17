import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { ListingLotStatus } from '@src/modules/listing/domain/listing-lot';

@Entity('listing_lots')
export class ListingLotEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'shipper_id', type: 'uuid' })
  shipperId!: string;

  @Column()
  origin!: string;

  @Column()
  destination!: string;

  @Column({ name: 'equipment_type', type: 'varchar' })
  equipmentType!: string;

  @Column({ name: 'weight_kg', type: 'int' })
  weightKg!: number;

  @Column({ name: 'reserve_price', type: 'int' })
  reservePrice!: number;

  @Column({ name: 'target_price', type: 'int', nullable: true })
  targetPrice!: number | null;

  @Column({ type: 'varchar' })
  status!: ListingLotStatus;

  @Column({ name: 'open_at', type: 'timestamptz' })
  openAt!: Date;

  @Column({ name: 'close_at', type: 'timestamptz' })
  closeAt!: Date;

  @Column({ name: 'current_best', type: 'int', nullable: true })
  currentBest!: number | null;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
