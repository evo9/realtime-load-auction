import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { AppConfigService } from '@src/config/app-config.service';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import {
  NullSchedulerDispatchPort,
  SCHEDULER_DISPATCH_PORT,
} from './scheduler-dispatch.port';
import type { SchedulerDispatchPort } from './scheduler-dispatch.port';
import { ZSetScheduler } from './zset-scheduler';

@Injectable()
export class SchedulerTicker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerTicker.name);
  private readonly port: SchedulerDispatchPort;
  private intervalHandle?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly scheduler: ZSetScheduler,
    private readonly config: AppConfigService,
    @Optional()
    @Inject(SCHEDULER_DISPATCH_PORT)
    port?: SchedulerDispatchPort,
  ) {
    this.port = port ?? new NullSchedulerDispatchPort();
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const opts = {
        batchSize: this.config.scheduler.batchSize,
        retryDelayMs: this.config.scheduler.retryDelayMs,
      };
      const openResult = await this.scheduler.tick(
        RedisKeys.scheduleOpen(),
        (lotId) => this.port.dispatchOpen(lotId),
        opts,
      );
      const closeResult = await this.scheduler.tick(
        RedisKeys.scheduleClose(),
        (lotId) => this.port.dispatchClose(lotId),
        opts,
      );
      if (openResult.claimed > 0 || closeResult.claimed > 0) {
        this.logger.log(
          `open: ${JSON.stringify(openResult)}, close: ${JSON.stringify(closeResult)}`,
        );
      }
    } finally {
      this.ticking = false;
    }
  }

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      this.tick().catch((err: unknown) => {
        this.logger.error('scheduler tick failed', err);
      });
    }, this.config.scheduler.tickIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }
}
