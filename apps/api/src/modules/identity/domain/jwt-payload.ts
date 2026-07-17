import { Role } from '@src/modules/identity/domain/user';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
