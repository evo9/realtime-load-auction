import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { AMQP_CONNECTION } from '@src/platform/messaging/amqp-connection.token';
import { MESSAGING_CONFIG } from '@src/platform/messaging/messaging.config.token';
import type { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import { Publisher } from '@src/platform/messaging/publisher';
import { declareTopology } from '@src/platform/messaging/topology';
import { Exchanges } from '@src/platform/messaging/messaging.constants';
import { DEDUP_PORT } from '@src/platform/messaging/dedup.port';
import type { DedupPort } from '@src/platform/messaging/dedup.port';

export interface RmqMessage<T = unknown> {
  messageId: string;
  routingKey: string;
  payload: T;
  headers: Record<string, unknown>;
  attempt: number;
  raw: ConsumeMessage;
}

@Injectable()
export abstract class BaseConsumer<T = unknown> implements OnModuleInit {
  protected abstract readonly queue: string;
  protected abstract readonly prefetch: number;

  constructor(
    @Inject(AMQP_CONNECTION) private readonly connection: AmqpConnectionManager,
    private readonly publisher: Publisher,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
    @Inject(DEDUP_PORT) private readonly dedup: DedupPort,
  ) {}

  protected abstract process(msg: RmqMessage<T>): Promise<void>;

  async onModuleInit(): Promise<void> {
    const channel = this.connection.createChannel({
      json: false,
      setup: async (ch: ConfirmChannel) => {
        await declareTopology(ch);
        await ch.prefetch(this.prefetch);
        await ch.consume(
          this.queue,
          (raw) => {
            void this.handle(raw, ch);
          },
          { noAck: false },
        );
      },
    });
    await channel.waitForConnect();
  }

  private async handle(
    raw: ConsumeMessage | null,
    channel: ConfirmChannel,
  ): Promise<void> {
    if (!raw) return;

    let msg: RmqMessage<T>;
    try {
      msg = this.parse(raw);
    } catch (err) {
      // unparsable body will never succeed on redelivery — skip the retry cycle
      await this.deadLetterUnparsable(raw, channel, err);
      return;
    }

    try {
      if (await this.dedup.seen(this.queue, msg.messageId)) {
        channel.ack(raw);
        return;
      }
      await this.process(msg);
      await this.dedup.mark(this.queue, msg.messageId);
      channel.ack(raw);
    } catch (err) {
      await this.retryOrDlq(msg, raw, channel, err);
    }
  }

  private parse(raw: ConsumeMessage): RmqMessage<T> {
    const headers = (raw.properties.headers ?? {}) as Record<string, unknown>;
    const attempt = Number(headers['x-attempt'] ?? 0);
    return {
      messageId:
        (raw.properties.messageId as string | undefined) ??
        raw.fields.deliveryTag.toString(),
      routingKey: raw.fields.routingKey,
      payload: JSON.parse(raw.content.toString()) as T,
      headers,
      attempt,
      raw,
    };
  }

  private async deadLetterUnparsable(
    raw: ConsumeMessage,
    channel: ConfirmChannel,
    err: unknown,
  ): Promise<void> {
    const messageId =
      (raw.properties.messageId as string | undefined) ??
      raw.fields.deliveryTag.toString();
    await this.publisher.publish(
      Exchanges.dlx,
      this.queue,
      raw.content.toString('utf8'),
      {
        messageId,
        headers: { 'x-attempt': 1, 'x-last-error': String(err) },
      },
    );
    channel.ack(raw);
  }

  private async retryOrDlq(
    msg: RmqMessage<T>,
    raw: ConsumeMessage,
    channel: ConfirmChannel,
    err: unknown,
  ): Promise<void> {
    const nextAttempt = msg.attempt + 1;
    if (nextAttempt > this.config.retryLimit) {
      await this.publisher.publish(Exchanges.dlx, this.queue, msg.payload, {
        messageId: msg.messageId,
        headers: {
          ...msg.headers,
          'x-attempt': nextAttempt,
          'x-last-error': String(err),
        },
      });
    } else {
      await this.publisher.publish(Exchanges.retry, this.queue, msg.payload, {
        messageId: msg.messageId,
        headers: { ...msg.headers, 'x-attempt': nextAttempt },
        expiration: String(this.backoff(nextAttempt)),
      });
    }
    channel.ack(raw);
  }

  private backoff(attempt: number): number {
    const ttl =
      this.config.retryBaseTtlMs *
      Math.pow(this.config.retryMultiplier, attempt - 1);
    return Math.min(ttl, this.config.retryMaxTtlMs);
  }
}
