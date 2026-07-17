import { Global, Module } from '@nestjs/common';
import { SCHEDULER_DISPATCH_PORT } from '@src/platform/scheduler/scheduler-dispatch.port';
import { AuctionModule } from '@src/modules/auction/auction.module';
import { AuctionSchedulerDispatcher } from '@src/modules/auction/infrastructure/auction-scheduler.dispatcher';

/**
 * platform/scheduler can't import modules/auction (would invert the
 * dependency direction), so AuctionModule can't hand SCHEDULER_DISPATCH_PORT
 * to the globally-scoped SchedulerTicker directly. This module — global,
 * like OutboxModule's wiring for OUTBOX_PORT — imports AuctionModule and
 * re-exposes its dispatcher under the platform's port token, making it
 * visible to SchedulerTicker's optional injection without platform/*
 * ever importing modules/*.
 */
@Global()
@Module({
  imports: [AuctionModule],
  providers: [
    {
      provide: SCHEDULER_DISPATCH_PORT,
      useExisting: AuctionSchedulerDispatcher,
    },
  ],
  exports: [SCHEDULER_DISPATCH_PORT],
})
export class AuctionSchedulerWiringModule {}
