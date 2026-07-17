import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '@src/config/app-config.module';
import { AppConfigService } from '@src/config/app-config.service';

export const RABBITMQ_OPTIONS = Symbol('RABBITMQ_OPTIONS');

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: RABBITMQ_OPTIONS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => config.rabbitmq,
    },
  ],
  exports: [RABBITMQ_OPTIONS],
})
export class MessagingModule {}
