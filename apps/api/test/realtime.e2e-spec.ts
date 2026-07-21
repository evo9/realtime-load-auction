import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '@src/app.module';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { UserRepository } from '@src/modules/identity/infrastructure/user.repository';
import { PasswordHasher } from '@src/modules/identity/infrastructure/password-hasher';
import { CreateLotHandler } from '@src/modules/auction/application/create-lot.handler';
import { OpenLotHandler } from '@src/modules/auction/application/open-lot.handler';

function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 10_000,
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

describe('Realtime bid fan-out (e2e)', () => {
  let app: INestApplication<App>;
  let url: string;
  let accessToken: string;
  let lotId: string;
  const clients: ClientSocket[] = [];
  const password = 'correct-horse-battery-staple';

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

    const uow = app.get(UnitOfWork);
    const users = app.get(UserRepository);
    const hasher = app.get(PasswordHasher);
    const createLot = app.get(CreateLotHandler);
    const openLot = app.get(OpenLotHandler);

    const carrierEmail = `carrier-${randomUUID()}@example.com`;
    const passwordHash = await hasher.hash(password);
    await uow.transaction((tx) =>
      users.insert(tx, {
        id: randomUUID(),
        email: carrierEmail,
        passwordHash,
        role: 'carrier' as const,
        createdAt: new Date(),
      }),
    );

    const now = Date.now();
    const lot = await createLot.execute({
      shipperId: randomUUID(),
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      equipmentType: 'van',
      weightKg: 12000,
      pickupWindow: {
        from: new Date(now + 3_600_000),
        to: new Date(now + 7_200_000),
      },
      reservePrice: 150000,
      openAt: new Date(now + 2_000),
      closeAt: new Date(now + 3_600_000),
      antiSnipeWindowSec: 0,
    });
    lotId = lot.id;
    await openLot.execute(lotId);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: carrierEmail, password })
      .expect(200);
    accessToken = (loginResponse.body as { accessToken: string }).accessToken;
  }, 30_000);

  afterAll(async () => {
    for (const client of clients) client.close();
    await app.close();
  });

  it('delivers bid.placed to WS clients subscribed to the lot after POST /lots/:id/bids', async () => {
    const clientA = io(url, {
      auth: { token: accessToken },
      transports: ['websocket'],
      forceNew: true,
    });
    const clientB = io(url, {
      auth: { token: accessToken },
      transports: ['websocket'],
      forceNew: true,
    });
    clients.push(clientA, clientB);

    await Promise.all([
      waitForEvent(clientA, 'connect'),
      waitForEvent(clientB, 'connect'),
    ]);

    clientA.emit('subscribe', { lotId });
    clientB.emit('subscribe', { lotId });
    await sleep(300);

    const receivedA = waitForEvent<{
      bidId: string;
      lotId: string;
      amount: number;
    }>(clientA, 'bid.placed');
    const receivedB = waitForEvent<{
      bidId: string;
      lotId: string;
      amount: number;
    }>(clientB, 'bid.placed');

    const bidResponse = await request(app.getHttpServer())
      .post(`/lots/${lotId}/bids`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: 100000 })
      .expect(201);
    const bidId = (bidResponse.body as { id: string }).id;

    const eventA = await receivedA;
    const eventB = await receivedB;

    expect(eventA).toMatchObject({ bidId, lotId, amount: 100000 });
    expect(eventB).toMatchObject({ bidId, lotId, amount: 100000 });
  }, 20_000);
});
