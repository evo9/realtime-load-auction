import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRepository } from '@src/modules/identity/infrastructure/user.repository';
import { PasswordHasher } from '@src/modules/identity/infrastructure/password-hasher';
import { JwtPayload } from '@src/modules/identity/domain/jwt-payload';

// Argon2id hash of an arbitrary fixed string, computed offline with the same
// cost params as PasswordHasher. Verified against unknown-email logins so the
// response time doesn't leak whether an account exists.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$/81SKYfTXfY/RYqKJPOsEg$go1+JTtXYZyODkSXMTHp7XwBHyqFhMnJ/xtgTwQFx6U';

@Injectable()
export class LoginHandler {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly jwt: JwtService,
  ) {}

  async execute(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.users.findByEmail(email);
    const passwordMatches = await this.hasher.verify(
      user ? user.passwordHash : DUMMY_PASSWORD_HASH,
      password,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload);

    return { accessToken };
  }
}
