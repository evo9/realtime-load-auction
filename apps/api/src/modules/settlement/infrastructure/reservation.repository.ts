import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseRepository } from '@src/platform/persistence/base.repository';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import { FundReservationEntity } from '@src/modules/settlement/infrastructure/fund-reservation.entity';

export interface ReserveInput {
  lotId: string;
  sagaId: string;
  amount: number;
}

@Injectable()
export class ReservationRepository extends BaseRepository<FundReservationEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, FundReservationEntity);
  }

  // One reservation per lot: a redelivered reserve step just re-runs this
  // insert, which is then a no-op instead of a unique-violation.
  async insert(tx: TransactionContext, input: ReserveInput): Promise<void> {
    await tx.manager
      .createQueryBuilder()
      .insert()
      .into(FundReservationEntity)
      .values({
        id: randomUUID(),
        lotId: input.lotId,
        sagaId: input.sagaId,
        amount: input.amount,
        status: 'reserved',
      } as unknown as QueryDeepPartialEntity<FundReservationEntity>)
      .orIgnore()
      .execute();
  }

  async markReleased(tx: TransactionContext, lotId: string): Promise<void> {
    await tx.manager.update(
      FundReservationEntity,
      { lotId, status: 'reserved' },
      { status: 'released' },
    );
  }

  async findByLotId(lotId: string): Promise<FundReservationEntity | null> {
    return this.read().findOneBy({ lotId });
  }
}
