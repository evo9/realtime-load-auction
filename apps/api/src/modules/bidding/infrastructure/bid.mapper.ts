import { Mapper } from '@src/platform/persistence/mapper';
import { Bid } from '@src/modules/bidding/domain/bid';
import { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';

export class BidMapper implements Mapper<Bid, BidEntity> {
  toDomain(entity: BidEntity): Bid {
    return {
      id: entity.id,
      lotId: entity.lotId,
      carrierId: entity.carrierId,
      amount: entity.amount,
      idempotencyKey: entity.idempotencyKey,
      createdAt: entity.createdAt,
    };
  }

  toEntity(domain: Bid): BidEntity {
    const entity = new BidEntity();
    entity.id = domain.id;
    entity.lotId = domain.lotId;
    entity.carrierId = domain.carrierId;
    entity.amount = domain.amount;
    entity.idempotencyKey = domain.idempotencyKey;
    // createdAt intentionally left unset here: @CreateDateColumn stamps the
    // real value on insert, and toDomain reads it back from the saved row.
    return entity;
  }
}
