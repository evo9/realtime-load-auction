import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@src/app.module';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { UserRepository } from '@src/modules/identity/infrastructure/user.repository';
import { PasswordHasher } from '@src/modules/identity/infrastructure/password-hasher';
import { Role } from '@src/modules/identity/domain/user';

describe('Ops API (e2e)', () => {
  let app: INestApplication<App>;
  const password = 'correct-horse-battery-staple';
  const tokens: Record<Role, string> = {
    admin: '',
    carrier: '',
    shipper: '',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const uow = app.get(UnitOfWork);
    const users = app.get(UserRepository);
    const hasher = app.get(PasswordHasher);
    const passwordHash = await hasher.hash(password);

    for (const role of ['admin', 'carrier', 'shipper'] as const) {
      const email = `ops-${role}-${randomUUID()}@example.com`;
      await uow.transaction((tx) =>
        users.insert(tx, {
          id: randomUUID(),
          email,
          passwordHash,
          role,
          createdAt: new Date(),
        }),
      );

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      tokens[role] = (
        loginResponse.body as { accessToken: string }
      ).accessToken;
    }
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /ops/sagas without a token is rejected', () => {
    return request(app.getHttpServer()).get('/ops/sagas').expect(401);
  });

  it('GET /ops/sagas is forbidden for a carrier', () => {
    return request(app.getHttpServer())
      .get('/ops/sagas')
      .set('Authorization', `Bearer ${tokens.carrier}`)
      .expect(403);
  });

  it('GET /ops/sagas is forbidden for a shipper', () => {
    return request(app.getHttpServer())
      .get('/ops/sagas')
      .set('Authorization', `Bearer ${tokens.shipper}`)
      .expect(403);
  });

  it('GET /ops/sagas returns an array for an admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/ops/sagas')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /ops/dlq without a token is rejected', () => {
    return request(app.getHttpServer()).get('/ops/dlq').expect(401);
  });

  it('GET /ops/dlq is forbidden for a shipper', () => {
    return request(app.getHttpServer())
      .get('/ops/dlq')
      .set('Authorization', `Bearer ${tokens.shipper}`)
      .expect(403);
  });

  it('GET /ops/dlq returns queue summaries for an admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/ops/dlq')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);

    const body = res.body as Array<{
      queue: string;
      dlq: string;
      messageCount: number;
      messages: unknown[];
    }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const entry of body) {
      expect(typeof entry.queue).toBe('string');
      expect(typeof entry.dlq).toBe('string');
      expect(typeof entry.messageCount).toBe('number');
      expect(Array.isArray(entry.messages)).toBe(true);
    }
  });
});
