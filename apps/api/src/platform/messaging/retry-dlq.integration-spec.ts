import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import * as amqp from 'amqp-connection-manager';
import type { GetMessage } from 'amqplib';
import { Publisher } from '@src/platform/messaging/publisher';
import { BaseConsumer } from '@src/platform/messaging/base.consumer';
import { NullDedupPort } from '@src/platform/messaging/dedup.port';
import { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import {
  Exchanges,
  Queues,
  dlqName,
} from '@src/platform/messaging/messaging.constants';

const fastRetryConfig: MessagingConfig = {
  prefetch: 10,
  retryLimit: 2,
  retryBaseTtlMs: 150,
  retryMultiplier: 1,
  retryMaxTtlMs: 1000,
};

class FailingConsumer extends BaseConsumer {
  protected readonly prefetch = 10;

  constructor(
    connection: amqp.AmqpConnectionManager,
    publisher: Publisher,
    protected readonly queue: string,
  ) {
    super(connection, publisher, fastRetryConfig, new NullDedupPort());
  }

  protected process(): Promise<void> {
    return Promise.reject(new Error('boom'));
  }
}

class SucceedingConsumer extends BaseConsumer {
  protected readonly prefetch = 10;

  constructor(
    connection: amqp.AmqpConnectionManager,
    publisher: Publisher,
    protected readonly queue: string,
    private readonly onProcessed: () => void,
  ) {
    super(connection, publisher, fastRetryConfig, new NullDedupPort());
  }

  protected process(): Promise<void> {
    this.onProcessed();
    return Promise.resolve();
  }
}

async function pollForMessage(
  channel: amqp.ChannelWrapper,
  queue: string,
  timeoutMs: number,
): Promise<GetMessage | false> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const msg = await channel.get(queue, { noAck: true });
    if (msg) return msg;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('BaseConsumer retry/DLQ (integration)', () => {
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

  it('moves a message that keeps failing to the DLQ after exhausting retries', async () => {
    const consumer = new FailingConsumer(
      connection,
      publisher,
      Queues.notification,
    );
    await consumer.onModuleInit();

    await publisher.publish(
      Exchanges.events,
      'bid.placed',
      { foo: 'bar' },
      { messageId: 'retry-1' },
    );

    const inspector = connection.createChannel({ json: false });
    await inspector.waitForConnect();

    const dlqMessage = await pollForMessage(
      inspector,
      dlqName(Queues.notification),
      10_000,
    );

    expect(dlqMessage).not.toBe(false);
    const headers = (dlqMessage as GetMessage).properties.headers as Record<
      string,
      unknown
    >;
    expect(headers['x-attempt']).toBe(fastRetryConfig.retryLimit + 1);

    await inspector.close();
  }, 20_000);

  it('moves a failing listing.q message to its DLQ after exhausting retries', async () => {
    const consumer = new FailingConsumer(connection, publisher, Queues.listing);
    await consumer.onModuleInit();

    await publisher.publish(
      Exchanges.events,
      'lot.opened',
      { foo: 'bar' },
      { messageId: 'retry-listing-1' },
    );

    const inspector = connection.createChannel({ json: false });
    await inspector.waitForConnect();

    const dlqMessage = await pollForMessage(
      inspector,
      dlqName(Queues.listing),
      10_000,
    );

    expect(dlqMessage).not.toBe(false);
    const headers = (dlqMessage as GetMessage).properties.headers as Record<
      string,
      unknown
    >;
    expect(headers['x-attempt']).toBe(fastRetryConfig.retryLimit + 1);

    await inspector.close();
  }, 20_000);

  it('acks a successfully processed message and leaves the DLQ empty', async () => {
    let processed = 0;
    // settlementSteps is bound only to the settlementCommands exchange, so it
    // can't pick up stray events-exchange traffic (e.g. bid.placed, which the
    // other tests in this file publish and which also fans out to several
    // events-exchange queues) — keeps this test's count exact.
    const consumer = new SucceedingConsumer(
      connection,
      publisher,
      Queues.settlementSteps,
      () => {
        processed += 1;
      },
    );
    await consumer.onModuleInit();

    await publisher.publish(
      Exchanges.settlementCommands,
      'settlement.step',
      { foo: 'baz' },
      { messageId: 'retry-2' },
    );

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(processed).toBe(1);

    const inspector = connection.createChannel({ json: false });
    await inspector.waitForConnect();
    await expect(
      inspector.checkQueue(dlqName(Queues.settlementSteps)),
    ).resolves.toMatchObject({ messageCount: 0 });

    await inspector.close();
  }, 15_000);

  it('dead-letters a message with an unparsable body instead of crashing', async () => {
    const consumer = new FailingConsumer(
      connection,
      publisher,
      Queues.settlement,
    );
    await consumer.onModuleInit();

    const raw = connection.createChannel({ json: false });
    await raw.waitForConnect();
    await raw.publish(Exchanges.events, 'lot.closed', Buffer.from('not-json'), {
      messageId: 'unparsable-1',
      persistent: true,
    });
    await raw.close();

    const inspector = connection.createChannel({ json: false });
    await inspector.waitForConnect();

    const dlqMessage = await pollForMessage(
      inspector,
      dlqName(Queues.settlement),
      10_000,
    );

    expect(dlqMessage).not.toBe(false);
    const headers = (dlqMessage as GetMessage).properties.headers as Record<
      string,
      unknown
    >;
    // skips the retry cycle entirely: a body that fails to parse once will fail forever
    expect(headers['x-attempt']).toBe(1);

    await inspector.close();
  }, 20_000);
});
