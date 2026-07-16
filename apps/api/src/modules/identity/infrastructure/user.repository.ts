import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@src/platform/persistence/base.repository';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import { User } from '@src/modules/identity/domain/user';
import { UserEntity } from '@src/modules/identity/infrastructure/user.entity';
import { UserMapper } from '@src/modules/identity/infrastructure/user.mapper';

@Injectable()
export class UserRepository extends BaseRepository<UserEntity> {
  private readonly mapper = new UserMapper();

  constructor(dataSource: DataSource) {
    super(dataSource, UserEntity);
  }

  async findByEmail(email: string): Promise<User | null> {
    const entity = await this.read().findOneBy({ email });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async insert(tx: TransactionContext, user: User): Promise<User> {
    const saved = await this.repo(tx).save(this.mapper.toEntity(user));
    return this.mapper.toDomain(saved);
  }
}
