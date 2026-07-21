import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ConfirmChannel } from 'amqplib';
import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { AMQP_CONNECTION } from '@src/platform/messaging/amqp-connection.token';
import {
  CONSUMER_QUEUES,
  Exchanges,
  dlqName,
  retryQueueName,
} from '@src/platform/messaging/messaging.constants';

export async function declareTopology(channel: ConfirmChannel): Promise<void> {
  await channel.assertExchange(Exchanges.events, 'topic', { durable: true });
  await channel.assertExchange(Exchanges.settlementCommands, 'direct', {
    durable: true,
  });
  await channel.assertExchange(Exchanges.retry, 'topic', { durable: true });
  await channel.assertExchange(Exchanges.dlx, 'topic', { durable: true });

  for (const q of CONSUMER_QUEUES) {
    await channel.assertQueue(q.name, { durable: true });
    for (const b of q.bindings) {
      for (const key of b.keys) {
        await channel.bindQueue(q.name, b.exchange, key);
      }
    }

    const retryQ = retryQueueName(q.name);
    // Dead-lettering back to the origin queue must go through the default
    // exchange with routing key = queue name, not through auction.events:
    // otherwise a retried lot.closed from settlement.q would re-fan-out into
    // notification.q/listing.q on every retry attempt. Per-message TTL
    // (`expiration`, set by the publisher on retry) drives the backoff, so
    // this queue carries no `x-message-ttl` of its own.
    await channel.assertQueue(retryQ, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': q.name,
      },
    });
    await channel.bindQueue(retryQ, Exchanges.retry, q.name);

    const dlq = dlqName(q.name);
    await channel.assertQueue(dlq, { durable: true });
    await channel.bindQueue(dlq, Exchanges.dlx, q.name);
  }
}

@Injectable()
export class TopologyService implements OnModuleInit {
  constructor(
    @Inject(AMQP_CONNECTION)
    private readonly connection: AmqpConnectionManager,
  ) {}

  async onModuleInit(): Promise<void> {
    const channel = this.connection.createChannel({
      json: false,
      setup: declareTopology,
    });
    await channel.waitForConnect();
  }
}
