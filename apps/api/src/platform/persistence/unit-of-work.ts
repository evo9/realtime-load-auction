import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NullOutboxPort, OUTBOX_PORT } from './outbox.port';
import type { OutboxPort } from './outbox.port';
import { TransactionContext } from './transaction-context';

@Injectable()
export class UnitOfWork {
  private readonly outbox: OutboxPort;

  constructor(
    private readonly dataSource: DataSource,
    @Optional() @Inject(OUTBOX_PORT) outbox?: OutboxPort,
  ) {
    this.outbox = outbox ?? new NullOutboxPort();
  }

  transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) =>
      work(new TransactionContext(manager, this.outbox)),
    );
  }
}
