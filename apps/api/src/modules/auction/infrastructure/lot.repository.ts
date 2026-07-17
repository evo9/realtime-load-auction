import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@src/platform/persistence/base.repository';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import { Lot } from '@src/modules/auction/domain/lot';
import { LotEntity } from '@src/modules/auction/infrastructure/lot.entity';
import { LotMapper } from '@src/modules/auction/infrastructure/lot.mapper';

@Injectable()
export class LotRepository extends BaseRepository<LotEntity> {
  private readonly mapper = new LotMapper();

  constructor(dataSource: DataSource) {
    super(dataSource, LotEntity);
  }

  async insert(tx: TransactionContext, lot: Lot): Promise<Lot> {
    const saved = await this.repo(tx).save(this.mapper.toEntity(lot));
    return this.mapper.toDomain(saved);
  }

  async findById(id: string): Promise<Lot | null> {
    const entity = await this.read().findOneBy({ id });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async update(tx: TransactionContext, lot: Lot): Promise<Lot> {
    const saved = await this.repo(tx).save(this.mapper.toEntity(lot));
    return this.mapper.toDomain(saved);
  }

  async lockForUpdate(
    tx: TransactionContext,
    lotId: string,
  ): Promise<Lot | null> {
    const entity = await tx.lockForUpdate(LotEntity, lotId);
    return entity ? this.mapper.toDomain(entity) : null;
  }
}
