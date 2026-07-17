import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigModule } from '@src/config/app-config.module';
import { AppConfigService } from '@src/config/app-config.service';
import { LockService } from '@src/platform/redis/lock.service';
import { RateLimiter } from '@src/platform/redis/rate-limiter';
import { PubSub } from '@src/platform/redis/pub-sub';
import { CasService } from '@src/platform/redis/cas.service';
import { REDIS_CLIENT } from '@src/platform/redis/redis-client.token';

export { REDIS_CLIENT };

class RedisLifecycle implements OnModuleDestroy {
  constructor(private readonly client: Redis) {}

  async onModuleDestroy() {
    await this.client.quit();
  }
}

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Redis({ host: config.redis.host, port: config.redis.port }),
    },
    {
      provide: RedisLifecycle,
      inject: [REDIS_CLIENT],
      useFactory: (client: Redis) => new RedisLifecycle(client),
    },
    LockService,
    RateLimiter,
    PubSub,
    CasService,
  ],
  exports: [REDIS_CLIENT, LockService, RateLimiter, PubSub, CasService],
})
export class RedisModule {}
