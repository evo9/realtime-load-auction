import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { REDIS_CLIENT } from '@src/platform/redis/redis.module';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let query: jest.Mock;
  let ping: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    ping = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: REDIS_CLIENT, useValue: { ping } },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('reports ok status when both the database and redis respond', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    ping.mockResolvedValue('PONG');

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
    });
  });

  it('reports 503 when the database is unreachable', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    ping.mockResolvedValue('PONG');

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports 503 when redis is unreachable', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    ping.mockRejectedValue(new Error('connection refused'));

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
