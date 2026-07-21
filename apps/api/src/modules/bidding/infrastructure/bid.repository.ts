import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@src/platform/persistence/base.repository';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import type { HighBidCandidate } from '@src/platform/redis/cas.service';
import { Bid, NewBid } from '@src/modules/bidding/domain/bid';
import { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';
import { BidMapper } from '@src/modules/bidding/infrastructure/bid.mapper';

export interface ListByLotFilter {
  sort: 'amount' | 'time';
  cursor?: { value: string; id: string };
  limit: number;
}

export interface ListByCarrierFilter {
  cursor?: { value: string; id: string };
  limit: number;
}

@Injectable()
export class BidRepository extends BaseRepository<BidEntity> {
  private readonly mapper = new BidMapper();

  constructor(dataSource: DataSource) {
    super(dataSource, BidEntity);
  }

  async insert(tx: TransactionContext, bid: NewBid): Promise<Bid> {
    const saved = await this.repo(tx).save(
      this.mapper.toEntity({ ...bid, createdAt: new Date() }),
    );
    return this.mapper.toDomain(saved);
  }

  async findCurrentBest(lotId: string): Promise<HighBidCandidate | null> {
    const entity = await this.read().findOne({
      where: { lotId },
      order: { amount: 'ASC', createdAt: 'ASC' },
    });
    return entity
      ? { amount: entity.amount, carrierId: entity.carrierId, bidId: entity.id }
      : null;
  }

  // ORDER BY and the cursor comparator must stay in lockstep column-for-
  // column: Postgres row comparison `(a, b) > (x, y)` walks the tuple
  // lexicographically, so any column present in ORDER BY but absent from the
  // comparator can reorder or duplicate rows across a page boundary. Amount
  // sort therefore orders by (amount, id) only — id already breaks ties
  // deterministically, so created_at never enters either side.
  async listByLot(
    lotId: string,
    filter: ListByLotFilter,
  ): Promise<BidEntity[]> {
    const qb = this.read()
      .createQueryBuilder('b')
      .where('b.lot_id = :lotId', { lotId });

    if (filter.sort === 'amount') {
      if (filter.cursor) {
        qb.andWhere('(b.amount, b.id) > (:cVal, :cId)', {
          cVal: Number(filter.cursor.value),
          cId: filter.cursor.id,
        });
      }
      qb.orderBy('b.amount', 'ASC').addOrderBy('b.id', 'ASC');
    } else {
      if (filter.cursor) {
        qb.andWhere('(b.created_at, b.id) < (:cVal, :cId)', {
          cVal: filter.cursor.value,
          cId: filter.cursor.id,
        });
      }
      qb.orderBy('b.created_at', 'DESC').addOrderBy('b.id', 'DESC');
    }

    return qb.limit(filter.limit + 1).getMany();
  }

  async listByCarrier(
    carrierId: string,
    filter: ListByCarrierFilter,
  ): Promise<BidEntity[]> {
    const qb = this.read()
      .createQueryBuilder('b')
      .where('b.carrier_id = :carrierId', { carrierId });

    if (filter.cursor) {
      qb.andWhere('(b.created_at, b.id) < (:cVal, :cId)', {
        cVal: filter.cursor.value,
        cId: filter.cursor.id,
      });
    }
    qb.orderBy('b.created_at', 'DESC')
      .addOrderBy('b.id', 'DESC')
      .limit(filter.limit + 1);

    return qb.getMany();
  }
}
