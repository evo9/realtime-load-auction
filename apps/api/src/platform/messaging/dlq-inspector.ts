import { Inject, Injectable } from '@nestjs/common';
import type { GetMessage } from 'amqplib';
import type {
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import { AMQP_CONNECTION } from '@src/platform/messaging/amqp-connection.token';
import { declareTopology } from '@src/platform/messaging/topology';
import {
  CONSUMER_QUEUES,
  dlqName,
} from '@src/platform/messaging/messaging.constants';

export interface DlqMessage {
  messageId: string;
  attempt: number;
  routingKey: string;
  lastError?: string;
  payload: unknown;
  rawBody?: string;
}

export interface DlqQueueCount {
  queue: string;
  dlq: string;
  messageCount: number;
}

export interface DlqQueueSummary extends DlqQueueCount {
  messages: DlqMessage[];
}

@Injectable()
export class DlqInspector {
  private readonly channel: ChannelWrapper;

  constructor(@Inject(AMQP_CONNECTION) connection: AmqpConnectionManager) {
    this.channel = connection.createChannel({
      json: false,
      setup: declareTopology,
    });
  }

  async counts(): Promise<DlqQueueCount[]> {
    return Promise.all(
      CONSUMER_QUEUES.map(async (q) => {
        const dlq = dlqName(q.name);
        const { messageCount } = await this.channel.checkQueue(dlq);
        return { queue: q.name, dlq, messageCount };
      }),
    );
  }

  async peek(limit: number): Promise<DlqQueueSummary[]> {
    return Promise.all(
      CONSUMER_QUEUES.map(async (q) => {
        const dlq = dlqName(q.name);
        const { messageCount } = await this.channel.checkQueue(dlq);

        const fetched: GetMessage[] = [];
        for (let i = 0; i < limit; i += 1) {
          const msg = await this.channel.get(dlq, { noAck: false });
          if (!msg) break;
          fetched.push(msg);
        }

        // Requeue only after every get() for this queue has finished — a nack
        // interleaved with get() could hand the same message right back on
        // the next iteration and double-count or spin.
        for (const msg of fetched) {
          this.channel.nack(msg, false, true);
        }

        return {
          queue: q.name,
          dlq,
          messageCount,
          messages: fetched.map(toDlqMessage),
        };
      }),
    );
  }
}

function toDlqMessage(msg: GetMessage): DlqMessage {
  const headers = (msg.properties.headers ?? {}) as Record<string, unknown>;
  const messageId =
    (msg.properties.messageId as string | undefined) ??
    msg.fields.deliveryTag.toString();
  const attempt = Number(headers['x-attempt'] ?? 0);
  const lastError = headers['x-last-error'] as string | undefined;

  const body = msg.content.toString('utf8');
  try {
    return {
      messageId,
      attempt,
      routingKey: msg.fields.routingKey,
      lastError,
      payload: JSON.parse(body) as unknown,
    };
  } catch {
    return {
      messageId,
      attempt,
      routingKey: msg.fields.routingKey,
      lastError,
      payload: null,
      rawBody: body,
    };
  }
}
