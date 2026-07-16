import { EntityManager, EntityTarget, FindOptionsWhere } from 'typeorm';
import { OutboxPort } from './outbox.port';

export class TransactionContext {
  constructor(
    readonly manager: EntityManager,
    readonly outbox: OutboxPort,
  ) {}

  lockForUpdate<Entity extends { id: string }>(
    target: EntityTarget<Entity>,
    id: string,
  ): Promise<Entity | null> {
    return this.manager.findOne(target, {
      where: { id } as FindOptionsWhere<Entity>,
      lock: { mode: 'pessimistic_write' },
    });
  }
}
