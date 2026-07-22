import { ListDlqHandler } from '@src/modules/ops/application/list-dlq.handler';

describe('ListDlqHandler', () => {
  function makeDlq() {
    return { peek: jest.fn().mockResolvedValue([]) };
  }

  it('uses the default peek limit when none is given', async () => {
    const dlq = makeDlq();
    const handler = new ListDlqHandler(dlq as never);

    await handler.execute();

    expect(dlq.peek).toHaveBeenCalledWith(20);
  });

  it('clamps a requested limit to the maximum', async () => {
    const dlq = makeDlq();
    const handler = new ListDlqHandler(dlq as never);

    await handler.execute(500);

    expect(dlq.peek).toHaveBeenCalledWith(100);
  });

  it('passes a limit below the maximum through unchanged', async () => {
    const dlq = makeDlq();
    const handler = new ListDlqHandler(dlq as never);

    await handler.execute(5);

    expect(dlq.peek).toHaveBeenCalledWith(5);
  });
});
