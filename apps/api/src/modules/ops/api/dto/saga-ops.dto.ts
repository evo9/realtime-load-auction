import {
  SagaInstance,
  SagaStatus,
  SagaStep,
} from '@src/modules/settlement/domain/saga';

// Allowlisted view of SagaPayload, not a passthrough: the payload also
// carries `lockToken`, a Redis distributed-lock capability — an internal
// mechanism, never a value to hand back over HTTP even to an admin. Listed
// explicitly (rather than omitting one key) so a future payload field is
// excluded by default until someone decides it belongs on this screen.
export class SagaOpsPayloadDto {
  closeAt?: string;
  winningBidId?: string;
  winningAmount?: number;
  winningCarrierId?: string;
  failureReason?: string;
}

export class SagaOpsDto {
  id!: string;
  lotId!: string;
  step!: SagaStep;
  status!: SagaStatus;
  payload!: SagaOpsPayloadDto;
  attempts!: number;
  version!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export function toSagaOpsDto(saga: SagaInstance): SagaOpsDto {
  return {
    id: saga.id,
    lotId: saga.lotId,
    step: saga.step,
    status: saga.status,
    payload: {
      closeAt: saga.payload.closeAt,
      winningBidId: saga.payload.winningBidId,
      winningAmount: saga.payload.winningAmount,
      winningCarrierId: saga.payload.winningCarrierId,
      failureReason: saga.payload.failureReason,
    },
    attempts: saga.attempts,
    version: saga.version,
    createdAt: saga.createdAt,
    updatedAt: saga.updatedAt,
  };
}
