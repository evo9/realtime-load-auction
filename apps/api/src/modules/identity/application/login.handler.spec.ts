import { UnauthorizedException } from '@nestjs/common';
import { LoginHandler } from './login.handler';

describe('LoginHandler', () => {
  let users: { findByEmail: jest.Mock };
  let hasher: { verify: jest.Mock };
  let jwt: { signAsync: jest.Mock };
  let handler: LoginHandler;

  beforeEach(() => {
    users = { findByEmail: jest.fn() };
    hasher = { verify: jest.fn() };
    jwt = { signAsync: jest.fn() };
    handler = new LoginHandler(users as never, hasher as never, jwt as never);
  });

  it('returns an access token for valid credentials', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'carrier@example.com',
      passwordHash: 'hashed',
      role: 'carrier',
    });
    hasher.verify.mockResolvedValue(true);
    jwt.signAsync.mockResolvedValue('signed-token');

    const result = await handler.execute(
      'carrier@example.com',
      'correct-password',
    );

    expect(result).toEqual({ accessToken: 'signed-token' });
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'carrier@example.com',
      role: 'carrier',
    });
  });

  it('rejects an unknown email without checking the password', async () => {
    users.findByEmail.mockResolvedValue(null);

    await expect(
      handler.execute('nobody@example.com', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('rejects a wrong password', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'carrier@example.com',
      passwordHash: 'hashed',
      role: 'carrier',
    });
    hasher.verify.mockResolvedValue(false);

    await expect(
      handler.execute('carrier@example.com', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
