import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

// OWASP-recommended Argon2id minimums (m>=19456 KiB, t>=2, p=1).
const HASH_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, HASH_OPTIONS);
  }

  verify(hashed: string, plain: string): Promise<boolean> {
    return verify(hashed, plain);
  }
}
