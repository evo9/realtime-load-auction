import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OutboxEntity } from './outbox.entity';

export interface OutboxRow {
  id: string;
  routingKey: string;
  payload: unknown;
}

@Injectable()
export class OutboxRepository {
  async fetchUnpublished(
    manager: EntityManager,
    limit: number,
  ): Promise<OutboxRow[]> {
    const rows = await manager
      .createQueryBuilder(OutboxEntity, 'outbox')
      .where('outbox.publishedAt IS NULL')
      .orderBy('outbox.createdAt', 'ASC')
      .limit(limit)
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getMany();

    return rows.map((row) => ({
      id: row.id,
      routingKey: row.routingKey,
      payload: row.payload,
    }));
  }

  async markPublished(manager: EntityManager, id: string): Promise<void> {
    await manager.update(OutboxEntity, { id }, { publishedAt: new Date() });
  }

  async recordFailure(manager: EntityManager, id: string): Promise<void> {
    await manager.increment(OutboxEntity, { id }, 'attempts', 1);
  }
}
