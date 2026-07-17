import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '@src/config/app-config.module';
import { SchedulerTicker } from './scheduler.ticker';
import { ZSetScheduler } from './zset-scheduler';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [ZSetScheduler, SchedulerTicker],
  exports: [ZSetScheduler],
})
export class SchedulerModule {}
