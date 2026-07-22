import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseRepository } from '@src/platform/persistence/base.repository';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import {
  FIRST_STEP,
  SagaInstance,
  SagaPayload,
  SagaStatus,
  SagaStep,
} from '@src/modules/settlement/domain/saga';
import { SagaInstanceEntity } from '@src/modules/settlement/infrastructure/saga-instance.entity';
import { SagaMapper } from '@src/modules/settlement/infrastructure/saga.mapper';

export interface CreateSagaInput {
  lotId: string;
  payload: SagaPayload;
}

export interface ListSagasFilter {
  status?: SagaStatus;
  step?: SagaStep;
  lotId?: string;
  limit: number;
  offset: number;
}

@Injectable()
export class SagaRepository extends BaseRepository<SagaInstanceEntity> {
  private readonly mapper = new SagaMapper();

  constructor(dataSource: DataSource) {
    super(dataSource, SagaInstanceEntity);
  }

  // One saga per lot: ON CONFLICT DO NOTHING makes a redelivered lot.closed
  // a no-op, then the follow-up read returns whichever row won the race —
  // the freshly inserted one or the one from an earlier delivery.
  async create(
    tx: TransactionContext,
    input: CreateSagaInput,
  ): Promise<SagaInstance> {
    await tx.manager
      .createQueryBuilder()
      .insert()
      .into(SagaInstanceEntity)
      .values({
        id: randomUUID(),
        lotId: input.lotId,
        step: FIRST_STEP,
        status: SagaStatus.Running,
        payload: input.payload,
        attempts: 0,
      } as unknown as QueryDeepPartialEntity<SagaInstanceEntity>)
      .orIgnore()
      .execute();

    const entity = await tx.manager.findOneBy(SagaInstanceEntity, {
      lotId: input.lotId,
    });
    if (!entity) {
      throw new Error(
        `saga instance for lot ${input.lotId} vanished after insert`,
      );
    }
    return this.mapper.toDomain(entity);
  }

  async findByLotId(lotId: string): Promise<SagaInstance | null> {
    const entity = await this.read().findOneBy({ lotId });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findById(id: string): Promise<SagaInstance | null> {
    const entity = await this.read().findOneBy({ id });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async list(filter: ListSagasFilter): Promise<SagaInstance[]> {
    const qb = this.read().createQueryBuilder('s');
    if (filter.status)
      qb.andWhere('s.status = :status', { status: filter.status });
    if (filter.step) qb.andWhere('s.step = :step', { step: filter.step });
    if (filter.lotId) qb.andWhere('s.lotId = :lotId', { lotId: filter.lotId });
    qb.orderBy('s.updatedAt', 'DESC')
      .addOrderBy('s.id', 'DESC')
      .skip(filter.offset)
      .take(filter.limit);

    const rows = await qb.getMany();
    return rows.map((r) => this.mapper.toDomain(r));
  }

  async lockForUpdate(
    tx: TransactionContext,
    id: string,
  ): Promise<SagaInstance | null> {
    const entity = await tx.lockForUpdate(SagaInstanceEntity, id);
    return entity ? this.mapper.toDomain(entity) : null;
  }

  // save() only guards against a stale version when the entity was read
  // (and locked) in this same transaction — it does not condition the
  // UPDATE on `version` itself. Callers advancing a saga under concurrent
  // writers (M4-02 step consumers) must lockForUpdate the row first, the
  // same discipline LotRepository.update() relies on.
  async update(
    tx: TransactionContext,
    saga: SagaInstance,
  ): Promise<SagaInstance> {
    const saved = await this.repo(tx).save(this.mapper.toEntity(saga));
    return this.mapper.toDomain(saved);
  }
}
