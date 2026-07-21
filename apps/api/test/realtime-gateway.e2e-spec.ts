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

describe('Realtime gateway (e2e)', () => {
  let app: INestApplication;
  let url: string;
  let token: string;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);

    const address = (
      app.getHttpServer() as HttpServer
    ).address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}/realtime`;

    const jwt = app.get(JwtService);
    token = await jwt.signAsync({
      sub: randomUUID(),
      email: `carrier-${randomUUID()}@example.com`,
      role: 'carrier',
    });
  }, 30_000);

  afterAll(async () => {
    for (const client of clients) client.close();
    await app.close();
  });

  function connect(authToken: string | undefined): ClientSocket {
    const client = io(url, {
      auth: authToken === undefined ? {} : { token: authToken },
      transports: ['websocket'],
      forceNew: true,
    });
    clients.push(client);
    return client;
  }

  it('delivers a published event to two clients subscribed to the same lot', async () => {
    const lotId = randomUUID();
    const clientA = connect(token);
    const clientB = connect(token);

    await Promise.all([
      waitForEvent(clientA, 'connect'),
      waitForEvent(clientB, 'connect'),
    ]);

    clientA.emit('subscribe', { lotId });
    clientB.emit('subscribe', { lotId });
    await sleep(300);

    const receivedA = waitForEvent<{ foo: string }>(clientA, 'bid.placed');
    const receivedB = waitForEvent<{ foo: string }>(clientB, 'bid.placed');

    await app.get(PubSub).publish(RedisKeys.lotChannel(lotId), {
      type: 'bid.placed',
      lotId,
      payload: { foo: 'bar' },
    });

    await expect(receivedA).resolves.toEqual({ foo: 'bar' });
    await expect(receivedB).resolves.toEqual({ foo: 'bar' });
  });

  it('delivers exactly one copy per client when two clients subscribe to a brand-new lot concurrently', async () => {
    // Regression: acquire() used to check-then-act across an await, so two
    // concurrent first-subscribers to the same not-yet-tracked lot could each
    // start their own Redis subscription — leaking one and double-emitting
    // every event. Firing both subscribes back-to-back with no gap between
    // them (unlike the other tests' `sleep(300)`) is what actually exercises
    // that race.
    const lotId = randomUUID();
    const clientA = connect(token);
    const clientB = connect(token);

    await Promise.all([
      waitForEvent(clientA, 'connect'),
      waitForEvent(clientB, 'connect'),
    ]);

    const receivedCountsA: unknown[] = [];
    const receivedCountsB: unknown[] = [];
    clientA.on('bid.placed', (payload: unknown) =>
      receivedCountsA.push(payload),
    );
    clientB.on('bid.placed', (payload: unknown) =>
      receivedCountsB.push(payload),
    );

    await Promise.all([
      new Promise<void>((resolve) => {
        clientA.emit('subscribe', { lotId }, () => resolve());
        setTimeout(resolve, 50);
      }),
      new Promise<void>((resolve) => {
        clientB.emit('subscribe', { lotId }, () => resolve());
        setTimeout(resolve, 50);
      }),
    ]);
    await sleep(300);

    await app.get(PubSub).publish(RedisKeys.lotChannel(lotId), {
      type: 'bid.placed',
      lotId,
      payload: { foo: 'once' },
    });
    await sleep(300);

    expect(receivedCountsA).toEqual([{ foo: 'once' }]);
    expect(receivedCountsB).toEqual([{ foo: 'once' }]);
  });

  it('does not deliver an event to a client subscribed to a different lot', async () => {
    const lotId = randomUUID();
    const otherLotId = randomUUID();
    const subscribed = connect(token);
    const isolated = connect(token);

    await Promise.all([
      waitForEvent(subscribed, 'connect'),
      waitForEvent(isolated, 'connect'),
    ]);

    subscribed.emit('subscribe', { lotId });
    isolated.emit('subscribe', { lotId: otherLotId });
    await sleep(300);

    let isolatedReceived = false;
    isolated.on('bid.placed', () => {
      isolatedReceived = true;
    });

    const received = waitForEvent<{ foo: string }>(subscribed, 'bid.placed');
    await app.get(PubSub).publish(RedisKeys.lotChannel(lotId), {
      type: 'bid.placed',
      lotId,
      payload: { foo: 'bar' },
    });

    await expect(received).resolves.toEqual({ foo: 'bar' });
    expect(isolatedReceived).toBe(false);
  });

  it('ignores subscribe attempts once a client is already at the per-socket lot cap', async () => {
    const client = connect(token);
    await waitForEvent(client, 'connect');

    const MAX_LOTS_PER_SOCKET = 50;
    for (let i = 0; i < MAX_LOTS_PER_SOCKET; i += 1) {
      client.emit('subscribe', { lotId: randomUUID() });
    }
    await sleep(500);

    const overflowLotId = randomUUID();
    client.emit('subscribe', { lotId: overflowLotId });
    await sleep(300);

    let overflowReceived = false;
    client.on('bid.placed', () => {
      overflowReceived = true;
    });

    await app.get(PubSub).publish(RedisKeys.lotChannel(overflowLotId), {
      type: 'bid.placed',
      lotId: overflowLotId,
      payload: { foo: 'over-cap' },
    });
    await sleep(300);

    expect(overflowReceived).toBe(false);
  }, 15_000);

  it('disconnects a client that connects without a token', async () => {
    const client = connect(undefined);
    const disconnected = waitForEvent(client, 'disconnect');
    let received = false;
    client.on('bid.placed', () => {
      received = true;
    });

    await expect(disconnected).resolves.toBeDefined();
    expect(received).toBe(false);
  });

  it('disconnects a client that connects with an invalid token', async () => {
    const client = connect('garbage');
    const disconnected = waitForEvent(client, 'disconnect');
    let received = false;
    client.on('bid.placed', () => {
      received = true;
    });

    await expect(disconnected).resolves.toBeDefined();
    expect(received).toBe(false);
  });
});
