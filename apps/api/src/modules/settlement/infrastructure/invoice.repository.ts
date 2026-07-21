import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseRepository } from '@src/platform/persistence/base.repository';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import { InvoiceEntity } from '@src/modules/settlement/infrastructure/invoice.entity';

export interface CreateInvoiceInput {
  lotId: string;
  sagaId: string;
  bidId: string;
  amount: number;
  carrierId: string;
}

@Injectable()
export class InvoiceRepository extends BaseRepository<InvoiceEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, InvoiceEntity);
  }

  async insert(
    tx: TransactionContext,
    input: CreateInvoiceInput,
  ): Promise<void> {
    await tx.manager
      .createQueryBuilder()
      .insert()
      .into(InvoiceEntity)
      .values({
        id: randomUUID(),
        lotId: input.lotId,
        sagaId: input.sagaId,
        bidId: input.bidId,
        amount: input.amount,
        carrierId: input.carrierId,
        status: 'issued',
      } as unknown as QueryDeepPartialEntity<InvoiceEntity>)
      .orIgnore()
      .execute();
  }

  async markVoid(tx: TransactionContext, lotId: string): Promise<void> {
    await tx.manager.update(
      InvoiceEntity,
      { lotId, status: 'issued' },
      { status: 'void' },
    );
  }

  async findByLotId(lotId: string): Promise<InvoiceEntity | null> {
    return this.read().findOneBy({ lotId });
  }
}
