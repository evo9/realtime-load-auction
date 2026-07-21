import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '@src/app.module';
import { PubSub } from '@src/platform/redis/pub-sub';
import { RedisKeys } from '@src/platform/redis/redis-keys';

function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for '${event}'`)),
      timeoutMs,
    );
    socket.once(event, (arg: T) => {
      clearTimeout(timer);
      resolve(arg);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootApp(): Promise<{ app: INestApplication; url: string }> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  await app.listen(0);

  const address = (app.getHttpServer() as HttpServer).address() as AddressInfo;
  return { app, url: `http://127.0.0.1:${address.port}/realtime` };
}

describe('Realtime fan-out across API instances (e2e)', () => {
  let appA: INestApplication;
  let appB: INestApplication;
  let urlA: string;
  let client: ClientSocket;

  beforeAll(async () => {
    const [instanceA, instanceB] = await Promise.all([bootApp(), bootApp()]);
    appA = instanceA.app;
    appB = instanceB.app;
    urlA = instanceA.url;
  }, 30_000);

  afterAll(async () => {
    client?.close();
    await Promise.all([appA.close(), appB.close()]);
  });

  it('fans a Pub/Sub event published on instance B out to a client connected to instance A', async () => {
    const lotId = randomUUID();
    const token = await appA.get(JwtService).signAsync({
      sub: randomUUID(),
      email: `carrier-${randomUUID()}@example.com`,
      role: 'carrier',
    });

    client = io(urlA, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    await waitForEvent(client, 'connect');

    client.emit('subscribe', { lotId });
    await sleep(300);

    const received = waitForEvent<{ foo: string }>(client, 'bid.placed');

    // Published through appB's PubSub client, not appA's — the event only
    // reaches the client connected to appA if the fan-out actually travels
    // through Redis rather than an in-process event bus local to appA.
    await appB.get(PubSub).publish(RedisKeys.lotChannel(lotId), {
      type: 'bid.placed',
      lotId,
      payload: { foo: 'bar' },
    });

    await expect(received).resolves.toEqual({ foo: 'bar' });
  });
});
