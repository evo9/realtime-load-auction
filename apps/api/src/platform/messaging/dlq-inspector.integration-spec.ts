import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import * as amqp from 'amqp-connection-manager';
import { Publisher } from '@src/platform/messaging/publisher';
import { BaseConsumer } from '@src/platform/messaging/base.consumer';
import { NullDedupPort } from '@src/platform/messaging/dedup.port';
import { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import { DlqInspector } from '@src/platform/messaging/dlq-inspector';
import { Exchanges, Queues } from '@src/platform/messaging/messaging.constants';

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

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('DlqInspector (integration)', () => {
  let container: StartedRabbitMQContainer;
  let connection: amqp.AmqpConnectionManager;
  let publisher: Publisher;
  let dlqInspector: DlqInspector;

  beforeAll(async () => {
    container = await new RabbitMQContainer(
      'rabbitmq:3.13-management-alpine',
    ).start();
    connection = amqp.connect([container.getAmqpUrl()]);
    await connection.connect();
    publisher = new Publisher(connection);
    dlqInspector = new DlqInspector(connection);
  }, 120_000);

  afterAll(async () => {
    await connection.close();
    await container.stop();
  });

  it('counts and peeks a message that landed in the DLQ, without consuming it', async () => {
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
      { messageId: 'dlq-peek-1' },
    );

    await waitFor(async () => {
      const counts = await dlqInspector.counts();
      const entry = counts.find((c) => c.queue === Queues.notification);
      return (entry?.messageCount ?? 0) >= 1;
    }, 10_000);

    const counts = await dlqInspector.counts();
    const notificationCount = counts.find(
      (c) => c.queue === Queues.notification,
    );
    expect(notificationCount).toBeDefined();
    expect(notificationCount?.messageCount).toBeGreaterThanOrEqual(1);

    const firstPeek = await dlqInspector.peek(10);
    const notificationSummary = firstPeek.find(
      (s) => s.queue === Queues.notification,
    );
    expect(notificationSummary).toBeDefined();
    expect(notificationSummary?.messageCount).toBeGreaterThanOrEqual(1);
    const message = notificationSummary?.messages.find(
      (m) => m.messageId === 'dlq-peek-1',
    );
    expect(message).toBeDefined();
    expect(message?.attempt).toBe(fastRetryConfig.retryLimit + 1);
    expect(message?.lastError).toBeDefined();
    expect(message?.payload).toEqual({ foo: 'bar' });

    // Non-destructive: peeking again must still find the same message. The
    // nack from the first peek requeues asynchronously — RabbitMQ doesn't
    // guarantee the message is visible to the very next request on the same
    // channel — so poll rather than assert immediately.
    await waitFor(async () => {
      const recount = await dlqInspector.counts();
      const entry = recount.find((c) => c.queue === Queues.notification);
      return (entry?.messageCount ?? 0) >= 1;
    }, 5_000);

    const secondPeek = await dlqInspector.peek(10);
    const secondSummary = secondPeek.find(
      (s) => s.queue === Queues.notification,
    );
    const stillThere = secondSummary?.messages.find(
      (m) => m.messageId === 'dlq-peek-1',
    );
    expect(stillThere).toBeDefined();
  }, 30_000);

  it('handles an unparsable message body without throwing', async () => {
    // BaseConsumer.deadLetterUnparsable re-publishes the offending body
    // through Publisher.publish, which JSON.stringifies it — so a body that
    // fails to parse in the consumer is actually stored in the DLQ as a
    // valid quoted JSON string. To exercise DlqInspector's own fallback for a
    // body that isn't valid JSON at all, publish raw bytes straight to the
    // DLX, bypassing that wrapping.
    const raw = connection.createChannel({ json: false });
    await raw.waitForConnect();
    await raw.publish(
      Exchanges.dlx,
      Queues.settlement,
      Buffer.from('not-json'),
      {
        messageId: 'dlq-raw-unparsable-1',
        persistent: true,
        headers: { 'x-attempt': 1, 'x-last-error': 'boom' },
      },
    );
    await raw.close();

    await waitFor(async () => {
      const counts = await dlqInspector.counts();
      const entry = counts.find((c) => c.queue === Queues.settlement);
      return (entry?.messageCount ?? 0) >= 1;
    }, 10_000);

    const peeked = await dlqInspector.peek(10);
    const settlementSummary = peeked.find((s) => s.queue === Queues.settlement);
    const message = settlementSummary?.messages.find(
      (m) => m.messageId === 'dlq-raw-unparsable-1',
    );
    expect(message).toBeDefined();
    expect(message?.payload).toBeNull();
    expect(message?.rawBody).toBe('not-json');
    expect(message?.attempt).toBe(1);
    expect(message?.lastError).toBe('boom');
  }, 30_000);
});
