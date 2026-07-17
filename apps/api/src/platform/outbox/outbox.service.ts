import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { OutboxPort } from '@src/platform/persistence/outbox.port';
import { OutboxEntity } from './outbox.entity';

@Injectable()
export class OutboxService implements OutboxPort {
  async add(
    manager: EntityManager,
    eventType: string,
    payload: unknown,
  ): Promise<void> {
    await manager.insert(OutboxEntity, {
      id: randomUUID(),
      routingKey: eventType,
      payload,
    } as QueryDeepPartialEntity<OutboxEntity>);
  }
}
