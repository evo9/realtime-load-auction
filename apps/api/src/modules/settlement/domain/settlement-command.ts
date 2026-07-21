import { SagaStep } from '@src/modules/settlement/domain/saga';

export type StepDirection = 'forward' | 'compensate';

export interface SettlementStepCommand {
  sagaId: string;
  lotId: string;
  step: SagaStep;
  direction: StepDirection;
}
