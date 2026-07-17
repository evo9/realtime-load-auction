import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@src/platform/redis/redis-client.token';

export type PubSubHandler<T> = (payload: T) => void;
export type Unsubscribe = () => Promise<void>;

@Injectable()
export class PubSub implements OnModuleDestroy {
  private readonly logger = new Logger(PubSub.name);
  private readonly subscriber: Redis;
  private readonly handlers = new Map<string, Set<PubSubHandler<unknown>>>();

  constructor(@Inject(REDIS_CLIENT) private readonly publisher: Redis) {
    this.subscriber = publisher.duplicate();
    this.subscriber.on('message', (channel: string, message: string) => {
      this.dispatch(channel, message);
    });
  }

  publish(channel: string, payload: unknown): Promise<number> {
    return this.publisher.publish(channel, JSON.stringify(payload));
  }

  async subscribe<T>(
    channel: string,
    handler: PubSubHandler<T>,
  ): Promise<Unsubscribe> {
    const set = this.handlers.get(channel);
    if (set) {
      set.add(handler);
    } else {
      this.handlers.set(channel, new Set([handler]));
      await this.subscriber.subscribe(channel);
    }

    return async () => {
      await this.unsubscribe(channel, handler);
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.quit();
  }

  private async unsubscribe(
    channel: string,
    handler: PubSubHandler<unknown>,
  ): Promise<void> {
    const set = this.handlers.get(channel);
    if (!set) return;

    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(channel);
      await this.subscriber.unsubscribe(channel);
    }
  }

  private dispatch(channel: string, message: string): void {
    const set = this.handlers.get(channel);
    if (!set) return;

    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch (error) {
      this.logger.error(
        `Failed to parse message on ${channel}`,
        error as Error,
      );
      return;
    }

    for (const handler of set) {
      try {
        handler(payload);
      } catch (error) {
        this.logger.error(`Handler for ${channel} threw`, error as Error);
      }
    }
  }
}
