import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@src/app.module';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { UserRepository } from '@src/modules/identity/infrastructure/user.repository';
import { PasswordHasher } from '@src/modules/identity/infrastructure/password-hasher';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let email: string;
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

    email = `carrier-${randomUUID()}@example.com`;
    const user = {
      id: randomUUID(),
      email,
      passwordHash: await hasher.hash(password),
      role: 'carrier' as const,
      createdAt: new Date(),
    };

    await uow.transaction((tx) => users.insert(tx, user));
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in with valid credentials and returns a usable token', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const { accessToken } = loginResponse.body as { accessToken: string };
    expect(accessToken).toEqual(expect.any(String));

    const meResponse = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meResponse.body).toMatchObject({ email, role: 'carrier' });
  });

  it('rejects an invalid password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects /me without a token', () => {
    return request(app.getHttpServer()).get('/me').expect(401);
  });
});
