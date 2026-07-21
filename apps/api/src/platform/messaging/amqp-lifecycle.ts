import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { AmqpConnectionManager } from 'amqp-connection-manager';

@Injectable()
export class AmqpLifecycle implements OnModuleDestroy {
  constructor(private readonly connection: AmqpConnectionManager) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
  }
}
