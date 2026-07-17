import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWithHeaders(headers: Record<string, string>) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers,
  };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

describe('JwtAuthGuard', () => {
  let jwt: { verifyAsync: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    guard = new JwtAuthGuard(jwt as never);
  });

  it('rejects a request with no authorization header', async () => {
    const { context } = contextWithHeaders({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a malformed authorization header', async () => {
    const { context } = contextWithHeaders({ authorization: 'Basic abc123' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid or expired token', async () => {
    const { context } = contextWithHeaders({
      authorization: 'Bearer bad-token',
    });
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the decoded payload to the request and allows access', async () => {
    const payload = {
      sub: 'user-1',
      email: 'carrier@example.com',
      role: 'carrier',
    };
    const { context, request } = contextWithHeaders({
      authorization: 'Bearer good-token',
    });
    jwt.verifyAsync.mockResolvedValue(payload);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });
});
