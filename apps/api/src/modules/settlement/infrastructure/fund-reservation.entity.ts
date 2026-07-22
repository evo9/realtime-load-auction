import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type FundReservationStatus = 'reserved' | 'released';

@Entity('fund_reservations')
@Unique(['lotId'])
export class FundReservationEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId!: string;

  @Column({ name: 'saga_id', type: 'uuid' })
  sagaId!: string;

  @Column({ type: 'int' })
  amount!: number;

  @Column({ type: 'varchar' })
  status!: FundReservationStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
