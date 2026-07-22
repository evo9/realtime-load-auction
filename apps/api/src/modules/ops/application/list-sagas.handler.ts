import { Injectable } from '@nestjs/common';
import {
  SagaInstance,
  SagaStatus,
  SagaStep,
} from '@src/modules/settlement/domain/saga';
import { SagaRepository } from '@src/modules/settlement/infrastructure/saga.repository';

export interface ListSagasQuery {
  status?: SagaStatus;
  step?: SagaStep;
  lotId?: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class ListSagasHandler {
  constructor(private readonly sagas: SagaRepository) {}

  async execute(query: ListSagasQuery): Promise<SagaInstance[]> {
    return this.sagas.list({
      status: query.status,
      step: query.step,
      lotId: query.lotId,
      limit: Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
      offset: query.offset ?? 0,
    });
  }
}
