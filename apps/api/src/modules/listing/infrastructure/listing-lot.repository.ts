import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@src/platform/persistence/base.repository';
import type {
  ListingLotStatus,
  LotOpenedPayload,
} from '@src/modules/listing/domain/listing-lot';
import { ListingLotEntity } from '@src/modules/listing/infrastructure/listing-lot.entity';

export interface ListLotsFilter {
  status?: ListingLotStatus;
  equipmentType?: string;
  origin?: string;
  destination?: string;
  cursor?: { closeAt: Date; id: string };
  limit: number;
}

@Injectable()
export class ListingLotRepository extends BaseRepository<ListingLotEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, ListingLotEntity);
  }

  // Consumer-level dedup only guards against redelivering the same message —
  // it can't stop a genuinely later lot.closed from committing before an
  // earlier, reordered lot.opened arrives (at-least-once gives ordering no
  // guarantee across distinct messageIds). The upsert therefore never
  // overwrites status/close_at on conflict: those only move forward via
  // markClosing. Only the descriptive fields, which don't change between open
  // and close, are re-applied on a duplicate/reordered delivery.
  async upsertOpened(payload: LotOpenedPayload): Promise<void> {
    await this.read()
      .createQueryBuilder()
      .insert()
      .into(ListingLotEntity)
      .values({
        id: payload.lotId,
        shipperId: payload.shipperId,
        origin: payload.origin,
        destination: payload.destination,
        equipmentType: payload.equipmentType,
        weightKg: payload.weightKg,
        reservePrice: payload.reservePrice,
        targetPrice: payload.targetPrice,
        status: 'open',
        openAt: new Date(payload.openAt),
        closeAt: new Date(payload.closeAt),
        updatedAt: new Date(),
      })
      .orUpdate(
        [
          'shipper_id',
          'origin',
          'destination',
          'equipment_type',
          'weight_kg',
          'reserve_price',
          'target_price',
          'open_at',
          'updated_at',
        ],
        ['id'],
      )
      .execute();
  }

  async markClosing(lotId: string, closeAt: Date): Promise<number> {
    const result = await this.read()
      .createQueryBuilder()
      .update(ListingLotEntity)
      .set({ status: 'closing', closeAt, updatedAt: () => 'now()' })
      .where('id = :id', { id: lotId })
      .execute();
    return result.affected ?? 0;
  }

  // Reverse auction: a bid only wins the read-model's current_best if it's
  // strictly lower (or the row has none yet). A worse/duplicate bid.placed
  // redelivery is expected to affect 0 rows — that's a no-op, not an error.
  async updateCurrentBest(lotId: string, amount: number): Promise<number> {
    const result = await this.read()
      .createQueryBuilder()
      .update(ListingLotEntity)
      .set({ currentBest: amount, updatedAt: () => 'now()' })
      .where('id = :id', { id: lotId })
      .andWhere('(current_best IS NULL OR :amount < current_best)', {
        amount,
      })
      .execute();
    return result.affected ?? 0;
  }

  async exists(lotId: string): Promise<boolean> {
    const count = await this.read()
      .createQueryBuilder('l')
      .where('l.id = :id', { id: lotId })
      .getCount();
    return count > 0;
  }

  async list(filter: ListLotsFilter): Promise<ListingLotEntity[]> {
    const qb = this.read().createQueryBuilder('l');
    if (filter.status)
      qb.andWhere('l.status = :status', { status: filter.status });
    if (filter.equipmentType) {
      qb.andWhere('l.equipment_type = :eq', { eq: filter.equipmentType });
    }
    if (filter.origin)
      qb.andWhere('l.origin = :origin', { origin: filter.origin });
    if (filter.destination) {
      qb.andWhere('l.destination = :destination', {
        destination: filter.destination,
      });
    }
    if (filter.cursor) {
      qb.andWhere('(l.close_at, l.id) > (:cAt, :cId)', {
        cAt: filter.cursor.closeAt,
        cId: filter.cursor.id,
      });
    }
    qb.orderBy('l.close_at', 'ASC')
      .addOrderBy('l.id', 'ASC')
      .limit(filter.limit + 1);
    return qb.getMany();
  }
}
