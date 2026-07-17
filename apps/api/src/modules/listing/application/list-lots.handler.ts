import { Injectable } from '@nestjs/common';
import {
  decodeCursor,
  encodeCursor,
} from '@src/modules/listing/application/cursor';
import type {
  ListingLot,
  ListingLotStatus,
} from '@src/modules/listing/domain/listing-lot';
import { ListingLotRepository } from '@src/modules/listing/infrastructure/listing-lot.repository';
import type { ListingLotEntity } from '@src/modules/listing/infrastructure/listing-lot.entity';

export interface ListLotsQuery {
  status?: ListingLotStatus;
  equipmentType?: string;
  origin?: string;
  destination?: string;
  cursor?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 20;

function toListingLot(entity: ListingLotEntity): ListingLot {
  return {
    id: entity.id,
    shipperId: entity.shipperId,
    origin: entity.origin,
    destination: entity.destination,
    equipmentType: entity.equipmentType,
    weightKg: entity.weightKg,
    reservePrice: entity.reservePrice,
    targetPrice: entity.targetPrice ?? undefined,
    status: entity.status,
    openAt: entity.openAt,
    closeAt: entity.closeAt,
    currentBest: entity.currentBest ?? undefined,
    updatedAt: entity.updatedAt,
  };
}

@Injectable()
export class ListLotsHandler {
  constructor(private readonly repository: ListingLotRepository) {}

  async execute(
    query: ListLotsQuery,
  ): Promise<{ items: ListingLot[]; nextCursor?: string }> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const rows = await this.repository.list({
      status: query.status,
      equipmentType: query.equipmentType,
      origin: query.origin,
      destination: query.destination,
      cursor,
      limit,
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toListingLot);
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.closeAt, last.id) : undefined;

    return { items, nextCursor };
  }
}
