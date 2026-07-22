import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { BaseRepository } from '@src/platform/persistence/base.repository';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import { Lot, LotStatus } from '@src/modules/auction/domain/lot';
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

  async findByIds(ids: string[]): Promise<Lot[]> {
    if (ids.length === 0) return [];
    const entities = await this.read().find({ where: { id: In(ids) } });
    return entities.map((entity) => this.mapper.toDomain(entity));
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

  // Non-locking MVCC read of just the status column, run inside the caller's
  // TX. Deliberately not lockForUpdate: the hot bid path only needs to see
  // committed state, not hold a row lock that would contend with
  // CloseLotHandler's FOR UPDATE for the duration of the close.
  async readStatus(
    tx: TransactionContext,
    lotId: string,
  ): Promise<LotStatus | null> {
    const entity = await tx.manager.findOne(LotEntity, {
      where: { id: lotId },
      select: { status: true },
    });
    return entity?.status ?? null;
  }

  // Point UPDATE, not save(): the hot bid path only needs to persist the
  // timestamp of the last accepted bid so CloseLotHandler can read it back
  // for the anti-snipe check — not a full versioned save of the row.
  async touchLastBidAt(
    tx: TransactionContext,
    lotId: string,
    at: Date,
  ): Promise<void> {
    await tx.manager.update(LotEntity, { id: lotId }, { lastBidAt: at });
  }
}
