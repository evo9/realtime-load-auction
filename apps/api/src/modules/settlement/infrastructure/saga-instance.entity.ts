import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type {
  SagaPayload,
  SagaStatus,
  SagaStep,
} from '@src/modules/settlement/domain/saga';

@Entity('saga_instances')
@Unique(['lotId'])
export class SagaInstanceEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId!: string;

  @Column({ type: 'varchar' })
  step!: SagaStep;

  @Column({ type: 'varchar' })
  status!: SagaStatus;

  @Column({ type: 'jsonb' })
  payload!: SagaPayload;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
