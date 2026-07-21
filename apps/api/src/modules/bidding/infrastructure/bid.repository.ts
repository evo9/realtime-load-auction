import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@src/platform/persistence/base.repository';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import type { HighBidCandidate } from '@src/platform/redis/cas.service';
import { Bid, NewBid } from '@src/modules/bidding/domain/bid';
import { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';
import { BidMapper } from '@src/modules/bidding/infrastructure/bid.mapper';

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
}
