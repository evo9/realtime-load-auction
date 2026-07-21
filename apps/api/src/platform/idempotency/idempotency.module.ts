import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '@src/config/app-config.module';
import { IdempotencyService } from '@src/platform/idempotency/idempotency.service';
import { RedisDedupPort } from '@src/platform/idempotency/redis-dedup.port';
import { RequireIdempotencyKeyGuard } from '@src/platform/idempotency/require-idempotency-key.guard';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [IdempotencyService, RedisDedupPort, RequireIdempotencyKeyGuard],
  exports: [IdempotencyService, RedisDedupPort, RequireIdempotencyKeyGuard],
})
export class IdempotencyModule {}
