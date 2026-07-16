import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

function contextWithUser(user?: { role: string }) {
  const request = { user };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as never);
  });

  it('allows access when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextWithUser({ role: 'carrier' }))).toBe(true);
  });

  it('allows access when the user has a matching role', () => {
    reflector.getAllAndOverride.mockReturnValue(['carrier']);

    expect(guard.canActivate(contextWithUser({ role: 'carrier' }))).toBe(true);
  });

  it('rejects access when the user role does not match', () => {
    reflector.getAllAndOverride.mockReturnValue(['shipper']);

    expect(() =>
      guard.canActivate(contextWithUser({ role: 'carrier' })),
    ).toThrow(ForbiddenException);
  });

  it('rejects access when there is no user on the request', () => {
    reflector.getAllAndOverride.mockReturnValue(['shipper']);

    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
