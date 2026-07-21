import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppConfigService } from '@src/config/app-config.service';
import { Exchanges } from '@src/platform/messaging/messaging.constants';
import { Publisher } from '@src/platform/messaging/publisher';
import { OutboxRepository } from './outbox.repository';

@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private intervalHandle?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: OutboxRepository,
    private readonly publisher: Publisher,
    private readonly config: AppConfigService,
  ) {}

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      // The batch's fetch, publish, and mark all share one transaction so the
      // FOR UPDATE SKIP LOCKED row lock is held for the publish round-trip —
      // committing the fetch early would release the lock before publishing
      // and let a concurrent tick() re-select the same row.
      await this.dataSource.transaction(async (manager) => {
        const rows = await this.repository.fetchUnpublished(
          manager,
          this.config.outbox.batchSize,
        );
        for (const row of rows) {
          try {
            await this.publisher.publish(
              Exchanges.events,
              row.routingKey,
              row.payload,
              { messageId: row.id },
            );
            await this.repository.markPublished(manager, row.id);
          } catch (err) {
            this.logger.error(
              `Failed to publish outbox row ${row.id} (${row.routingKey})`,
              err instanceof Error ? err.stack : String(err),
            );
            await this.repository.recordFailure(manager, row.id);
          }
        }
      });
    } finally {
      this.ticking = false;
    }
  }

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, this.config.outbox.pollIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }
}
