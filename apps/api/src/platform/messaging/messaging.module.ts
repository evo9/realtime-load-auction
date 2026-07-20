import { Global, Module } from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import { AppConfigModule } from '@src/config/app-config.module';
import { AppConfigService } from '@src/config/app-config.service';
import { AMQP_CONNECTION } from '@src/platform/messaging/amqp-connection.token';
import { AmqpLifecycle } from '@src/platform/messaging/amqp-lifecycle';
import { MESSAGING_CONFIG } from '@src/platform/messaging/messaging.config.token';
import { DEDUP_PORT } from '@src/platform/messaging/dedup.port';
import { Publisher } from '@src/platform/messaging/publisher';
import { TopologyService } from '@src/platform/messaging/topology';
import { IdempotencyModule } from '@src/platform/idempotency/idempotency.module';
import { RedisDedupPort } from '@src/platform/idempotency/redis-dedup.port';

export const RABBITMQ_OPTIONS = Symbol('RABBITMQ_OPTIONS');

export { AMQP_CONNECTION, MESSAGING_CONFIG, DEDUP_PORT };

@Global()
@Module({
  imports: [AppConfigModule, IdempotencyModule],
  providers: [
    {
      provide: RABBITMQ_OPTIONS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => config.rabbitmq,
    },
    {
      provide: AMQP_CONNECTION,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        amqp.connect(
          [
            `amqp://${config.rabbitmq.user}:${config.rabbitmq.password}@${config.rabbitmq.host}:${config.rabbitmq.port}`,
          ],
          { heartbeatIntervalInSeconds: 15, reconnectTimeInSeconds: 5 },
        ),
    },
    {
      provide: MESSAGING_CONFIG,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => config.messaging,
    },
    {
      provide: DEDUP_PORT,
      useExisting: RedisDedupPort,
    },
    {
      provide: AmqpLifecycle,
      inject: [AMQP_CONNECTION],
      useFactory: (connection: amqp.AmqpConnectionManager) =>
        new AmqpLifecycle(connection),
    },
    Publisher,
    TopologyService,
  ],
  exports: [
    RABBITMQ_OPTIONS,
    AMQP_CONNECTION,
    MESSAGING_CONFIG,
    DEDUP_PORT,
    Publisher,
  ],
})
export class MessagingModule {}
