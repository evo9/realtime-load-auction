import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRepository } from '@src/modules/identity/infrastructure/user.repository';
import { PasswordHasher } from '@src/modules/identity/infrastructure/password-hasher';
import { JwtPayload } from '@src/modules/identity/domain/jwt-payload';

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
    const passwordMatches = user
      ? await this.hasher.verify(user.passwordHash, password)
      : false;

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
