import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import * as amqp from 'amqp-connection-manager';
import { Publisher } from '@src/platform/messaging/publisher';
import {
  BaseConsumer,
  RmqMessage,
} from '@src/platform/messaging/base.consumer';
import { NullDedupPort } from '@src/platform/messaging/dedup.port';
import { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import { Exchanges, Queues } from '@src/platform/messaging/messaging.constants';

const testConfig: MessagingConfig = {
  prefetch: 10,
  retryLimit: 3,
  retryBaseTtlMs: 5000,
  retryMultiplier: 3,
  retryMaxTtlMs: 60_000,
};

class RecordingConsumer extends BaseConsumer {
  protected readonly queue: string;
  protected readonly prefetch = 10;
  private readonly onMessage: (msg: RmqMessage) => void;

  constructor(
    connection: amqp.AmqpConnectionManager,
    publisher: Publisher,
    queue: string,
    onMessage: (msg: RmqMessage) => void,
  ) {
    super(connection, publisher, testConfig, new NullDedupPort());
    this.queue = queue;
    this.onMessage = onMessage;
  }

  protected process(msg: RmqMessage): Promise<void> {
    this.onMessage(msg);
    return Promise.resolve();
  }
}

describe('Publisher + BaseConsumer (integration)', () => {
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

  it('delivers a published event to a bound consumer queue', async () => {
    let resolveReceived!: (msg: RmqMessage) => void;
    const received = new Promise<RmqMessage>((resolve) => {
      resolveReceived = resolve;
    });

    const consumer = new RecordingConsumer(
      connection,
      publisher,
      Queues.notification,
      resolveReceived,
    );
    await consumer.onModuleInit();

    await publisher.publish(
      Exchanges.events,
      'bid.placed',
      { foo: 'bar' },
      { messageId: 'm-1' },
    );

    const msg = await received;
    expect(msg.payload).toEqual({ foo: 'bar' });
    expect(msg.messageId).toBe('m-1');
  }, 15_000);

  it('routes a settlement command to the settlement steps queue', async () => {
    let resolveReceived!: (msg: RmqMessage) => void;
    const received = new Promise<RmqMessage>((resolve) => {
      resolveReceived = resolve;
    });

    const consumer = new RecordingConsumer(
      connection,
      publisher,
      Queues.settlementSteps,
      resolveReceived,
    );
    await consumer.onModuleInit();

    await publisher.publish(
      Exchanges.settlementCommands,
      'settlement.step',
      { step: 'reserve' },
      { messageId: 'm-2' },
    );

    const msg = await received;
    expect(msg.payload).toEqual({ step: 'reserve' });
    expect(msg.messageId).toBe('m-2');
  }, 15_000);
});
