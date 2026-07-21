import { Mapper } from '@src/platform/persistence/mapper';
import { SagaInstance } from '@src/modules/settlement/domain/saga';
import { SagaInstanceEntity } from '@src/modules/settlement/infrastructure/saga-instance.entity';

export class SagaMapper implements Mapper<SagaInstance, SagaInstanceEntity> {
  toDomain(entity: SagaInstanceEntity): SagaInstance {
    return {
      id: entity.id,
      lotId: entity.lotId,
      step: entity.step,
      status: entity.status,
      payload: entity.payload,
      attempts: entity.attempts,
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  toEntity(domain: SagaInstance): SagaInstanceEntity {
    const entity = new SagaInstanceEntity();
    entity.id = domain.id;
    entity.lotId = domain.lotId;
    entity.step = domain.step;
    entity.status = domain.status;
    entity.payload = domain.payload;
    entity.attempts = domain.attempts;
    entity.version = domain.version;
    entity.createdAt = domain.createdAt;
    entity.updatedAt = domain.updatedAt;
    return entity;
  }
}
