import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigModule } from '@src/config/app-config.module';
import { AppConfigService } from '@src/config/app-config.service';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

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
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
