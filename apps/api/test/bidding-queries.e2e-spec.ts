import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@src/app.module';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { UserRepository } from '@src/modules/identity/infrastructure/user.repository';
import { PasswordHasher } from '@src/modules/identity/infrastructure/password-hasher';
import { CreateLotHandler } from '@src/modules/auction/application/create-lot.handler';
import { OpenLotHandler } from '@src/modules/auction/application/open-lot.handler';

describe('Bidding queries (e2e)', () => {
  let app: INestApplication<App>;
  let carrierEmail: string;
  let accessToken: string;
  let lotId: string;
  let bestBidId: string;
  const password = 'correct-horse-battery-staple';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const uow = app.get(UnitOfWork);
    const users = app.get(UserRepository);
    const hasher = app.get(PasswordHasher);
    const createLot = app.get(CreateLotHandler);
    const openLot = app.get(OpenLotHandler);

    carrierEmail = `carrier-${randomUUID()}@example.com`;
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

    // Reverse auction: only a strictly lower bid beats the current candidate,
    // so amounts must arrive in decreasing order for all three to be accepted.
    const amounts = [100000, 90000, 80000];
    for (const amount of amounts) {
      const res = await request(app.getHttpServer())
        .post(`/lots/${lotId}/bids`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ amount })
        .expect(201);
      if (amount === 80000) {
        bestBidId = (res.body as { id: string }).id;
      }
    }
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /lots/:id/bids returns the placed bids with exactly one marked isCurrentBest', async () => {
    const res = await request(app.getHttpServer())
      .get(`/lots/${lotId}/bids`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = res.body as {
      items: Array<{ id: string; amount: number; isCurrentBest: boolean }>;
    };
    expect(body.items).toHaveLength(3);
    expect(body.items.map((i) => i.amount).sort((a, b) => a - b)).toEqual([
      80000, 90000, 100000,
    ]);

    const leaders = body.items.filter((i) => i.isCurrentBest);
    expect(leaders).toHaveLength(1);
    expect(leaders[0].id).toBe(bestBidId);
    expect(leaders[0].amount).toBe(80000);
  });

  it("GET /me/bids returns only the carrier's bids with correct leading/outbid statuses", async () => {
    const res = await request(app.getHttpServer())
      .get('/me/bids')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = res.body as {
      items: Array<{ id: string; amount: number; status: string }>;
    };
    expect(body.items).toHaveLength(3);
    expect(body.items.every((i) => typeof i.amount === 'number')).toBe(true);

    const leading = body.items.filter((i) => i.status === 'leading');
    const outbid = body.items.filter((i) => i.status === 'outbid');
    expect(leading).toHaveLength(1);
    expect(leading[0].id).toBe(bestBidId);
    expect(outbid).toHaveLength(2);
  });

  it('GET /me/bids without a token is rejected', () => {
    return request(app.getHttpServer()).get('/me/bids').expect(401);
  });

  it('GET /lots/:id/bids for an unknown lot returns 404', () => {
    return request(app.getHttpServer())
      .get(`/lots/${randomUUID()}/bids`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });
});
