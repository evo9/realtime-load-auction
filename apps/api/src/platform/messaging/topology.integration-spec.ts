import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import * as amqp from 'amqp-connection-manager';
import { declareTopology } from '@src/platform/messaging/topology';

describe('declareTopology (integration)', () => {
  let container: StartedRabbitMQContainer;
  let connection: amqp.AmqpConnectionManager;

  beforeAll(async () => {
    container = await new RabbitMQContainer(
      'rabbitmq:3.13-management-alpine',
    ).start();
    connection = amqp.connect([container.getAmqpUrl()]);
    await connection.connect();
  }, 120_000);

  afterAll(async () => {
    await connection.close();
    await container.stop();
  });

  it('declares exchanges, queues, retry and dead-letter queues idempotently', async () => {
    const first = connection.createChannel({
      json: false,
      setup: declareTopology,
    });
    await first.waitForConnect();
    await first.close();

    const second = connection.createChannel({
      json: false,
      setup: declareTopology,
    });
    await second.waitForConnect();

    await expect(second.checkQueue('notification.q')).resolves.toBeDefined();
    await expect(
      second.checkQueue('notification.retry.q'),
    ).resolves.toBeDefined();
    await expect(second.checkQueue('notification.dlq')).resolves.toBeDefined();
    await expect(
      second.checkQueue('settlement.steps.q'),
    ).resolves.toBeDefined();

    await second.close();
  });
});
