import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { RequireIdempotencyKeyGuard } from './require-idempotency-key.guard';

function contextWithHeaders(headers: Record<string, string>) {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RequireIdempotencyKeyGuard', () => {
  let guard: RequireIdempotencyKeyGuard;

  beforeEach(() => {
    guard = new RequireIdempotencyKeyGuard();
  });

  it('rejects a request with no Idempotency-Key header', () => {
    const context = contextWithHeaders({});

    expect(() => guard.canActivate(context)).toThrow(BadRequestException);
  });

  it('rejects a request with an empty Idempotency-Key header', () => {
    const context = contextWithHeaders({ 'idempotency-key': '   ' });

    expect(() => guard.canActivate(context)).toThrow(BadRequestException);
  });

  it('allows a request with a valid Idempotency-Key header', () => {
    const context = contextWithHeaders({ 'idempotency-key': 'key-1' });

    expect(guard.canActivate(context)).toBe(true);
  });
});
