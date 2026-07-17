import { EntityTarget, Repository } from 'typeorm';
import { TransactionContext } from './transaction-context';

export abstract class BaseRepository<Entity extends object> {
  protected constructor(private readonly entityTarget: EntityTarget<Entity>) {}

  protected repo(tx: TransactionContext): Repository<Entity> {
    return tx.manager.getRepository(this.entityTarget);
  }
}
