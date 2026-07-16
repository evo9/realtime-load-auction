import { Mapper } from '@src/platform/persistence/mapper';
import { User } from '@src/modules/identity/domain/user';
import { UserEntity } from '@src/modules/identity/infrastructure/user.entity';

export class UserMapper implements Mapper<User, UserEntity> {
  toDomain(entity: UserEntity): User {
    return {
      id: entity.id,
      email: entity.email,
      passwordHash: entity.passwordHash,
      role: entity.role,
      createdAt: entity.createdAt,
    };
  }

  toEntity(domain: User): UserEntity {
    const entity = new UserEntity();
    entity.id = domain.id;
    entity.email = domain.email;
    entity.passwordHash = domain.passwordHash;
    entity.role = domain.role;
    entity.createdAt = domain.createdAt;
    return entity;
  }
}
