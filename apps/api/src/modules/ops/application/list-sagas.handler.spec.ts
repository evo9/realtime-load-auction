import { ListSagasHandler } from '@src/modules/ops/application/list-sagas.handler';
import { SagaStatus, SagaStep } from '@src/modules/settlement/domain/saga';

describe('ListSagasHandler', () => {
  function makeRepo() {
    return { list: jest.fn().mockResolvedValue([]) };
  }

  it('applies default limit and offset when none are given', async () => {
    const repo = makeRepo();
    const handler = new ListSagasHandler(repo as never);

    await handler.execute({});

    expect(repo.list).toHaveBeenCalledWith({
      status: undefined,
      step: undefined,
      lotId: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it('passes through status, step, and lotId filters', async () => {
    const repo = makeRepo();
    const handler = new ListSagasHandler(repo as never);

    await handler.execute({
      status: SagaStatus.Compensating,
      step: SagaStep.Invoice,
      lotId: 'lot-1',
    });

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SagaStatus.Compensating,
        step: SagaStep.Invoice,
        lotId: 'lot-1',
      }),
    );
  });

  it('clamps limit to the maximum', async () => {
    const repo = makeRepo();
    const handler = new ListSagasHandler(repo as never);

    await handler.execute({ limit: 10_000, offset: 5 });

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200, offset: 5 }),
    );
  });

  it('passes a limit below the maximum through unchanged', async () => {
    const repo = makeRepo();
    const handler = new ListSagasHandler(repo as never);

    await handler.execute({ limit: 30 });

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 30 }),
    );
  });
});
