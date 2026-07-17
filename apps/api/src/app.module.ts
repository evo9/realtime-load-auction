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
import { IdentityModule } from '@src/modules/identity/identity.module';
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
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.nodeEnv === 'production' ? 'info' : 'debug',
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
