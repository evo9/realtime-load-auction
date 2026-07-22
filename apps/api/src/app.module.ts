import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from '@src/config/app-config.module';
import { AppConfigService } from '@src/config/app-config.service';
import { HealthModule } from '@src/health/health.module';
import { AuctionModule } from '@src/modules/auction/auction.module';
import { AuctionSchedulerWiringModule } from '@src/modules/auction/auction-scheduler-wiring.module';
import { BiddingModule } from '@src/modules/bidding/bidding.module';
import { DemoModule } from '@src/modules/demo/demo.module';
import { IdentityModule } from '@src/modules/identity/identity.module';
import { ListingModule } from '@src/modules/listing/listing.module';
import { NotificationModule } from '@src/modules/notification/notification.module';
import { OpsModule } from '@src/modules/ops/ops.module';
import { RealtimeModule } from '@src/modules/realtime/realtime.module';
import { SettlementModule } from '@src/modules/settlement/settlement.module';
import { IdempotencyModule } from '@src/platform/idempotency/idempotency.module';
import { MessagingModule } from '@src/platform/messaging/messaging.module';
import { OutboxModule } from '@src/platform/outbox/outbox.module';
import { PersistenceModule } from '@src/platform/persistence/persistence.module';
import { RedisModule } from '@src/platform/redis/redis.module';
import { SchedulerModule } from '@src/platform/scheduler/scheduler.module';

@Module({
  imports: [
    AppConfigModule,
    PersistenceModule,
    RedisModule,
    MessagingModule,
    OutboxModule,
    IdempotencyModule,
    SchedulerModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    IdentityModule,
    AuctionModule,
    AuctionSchedulerWiringModule,
    BiddingModule,
    DemoModule,
    ListingModule,
    RealtimeModule,
    NotificationModule,
    SettlementModule,
    OpsModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.nodeEnv === 'production' ? 'info' : 'debug',
          redact: ['req.headers["idempotency-key"]'],
          genReqId: (req, res) => {
            const existing = req.headers['x-request-id'];
            const id = typeof existing === 'string' ? existing : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
        },
      }),
    }),
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
