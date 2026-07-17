import { Inject, Injectable } from '@nestjs/common';
import type {
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import { AMQP_CONNECTION } from '@src/platform/messaging/amqp-connection.token';
import { declareTopology } from '@src/platform/messaging/topology';

export interface PublishOptions {
  messageId?: string;
  headers?: Record<string, unknown>;
  expiration?: string;
  persistent?: boolean;
}

@Injectable()
export class Publisher {
  private readonly channel: ChannelWrapper;

  constructor(@Inject(AMQP_CONNECTION) connection: AmqpConnectionManager) {
    this.channel = connection.createChannel({
      json: false,
      setup: declareTopology,
    });
  }

  async publish(
    exchange: string,
    routingKey: string,
    payload: unknown,
    opts: PublishOptions = {},
  ): Promise<void> {
    await this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      {
        persistent: opts.persistent ?? true,
        messageId: opts.messageId,
        contentType: 'application/json',
        headers: opts.headers,
        expiration: opts.expiration,
      },
    );
  }
}
