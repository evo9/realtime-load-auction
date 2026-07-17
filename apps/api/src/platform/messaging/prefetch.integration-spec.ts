import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import * as amqp from 'amqp-connection-manager';
import { Publisher } from '@src/platform/messaging/publisher';
import { BaseConsumer } from '@src/platform/messaging/base.consumer';
import { NullDedupPort } from '@src/platform/messaging/dedup.port';
import { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import { Exchanges, Queues } from '@src/platform/messaging/messaging.constants';

const testConfig: MessagingConfig = {
  prefetch: 1,
  retryLimit: 3,
  retryBaseTtlMs: 5000,
  retryMultiplier: 3,
  retryMaxTtlMs: 60_000,
};

class ThrottledConsumer extends BaseConsumer {
  protected readonly queue = Queues.settlement;
  protected readonly prefetch = 1;
  private inFlight = 0;
  private maxInFlight = 0;
  private processedCount = 0;

  constructor(
    connection: amqp.AmqpConnectionManager,
    publisher: Publisher,
    private readonly onProcessed: () => void,
  ) {
    super(connection, publisher, testConfig, new NullDedupPort());
  }

  get observedMax(): number {
    return this.maxInFlight;
  }

  protected async process(): Promise<void> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 150));
    this.inFlight -= 1;
    this.processedCount += 1;
    this.onProcessed();
  }
}

describe('BaseConsumer prefetch (integration)', () => {
  let container: StartedRabbitMQContainer;
  let connection: amqp.AmqpConnectionManager;
  let publisher: Publisher;

  beforeAll(async () => {
    container = await new RabbitMQContainer(
      'rabbitmq:3.13-management-alpine',
    ).start();
    connection = amqp.connect([container.getAmqpUrl()]);
    await connection.connect();
    publisher = new Publisher(connection);
  }, 120_000);

  afterAll(async () => {
    await connection.close();
    await container.stop();
  });

  it('never processes more than `prefetch` messages concurrently', async () => {
    const total = 5;
    let completed = 0;
    let resolveAll!: () => void;
    const allDone = new Promise<void>((resolve) => {
      resolveAll = resolve;
    });

    const consumer = new ThrottledConsumer(connection, publisher, () => {
      completed += 1;
      if (completed === total) resolveAll();
    });
    await consumer.onModuleInit();

    for (let i = 0; i < total; i++) {
      await publisher.publish(
        Exchanges.events,
        'lot.closed',
        { i },
        { messageId: `prefetch-${i}` },
      );
    }

    await allDone;
    expect(consumer.observedMax).toBe(1);
  }, 15_000);
});
