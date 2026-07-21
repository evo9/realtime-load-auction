export enum SagaStep {
  Lock = 'lock',
  Winner = 'winner',
  Reserve = 'reserve',
  Invoice = 'invoice',
  Notify = 'notify',
  Settle = 'settle',
}

export enum SagaStatus {
  Running = 'running',
  Compensating = 'compensating',
  Completed = 'completed',
  Failed = 'failed',
}

export const STEP_ORDER: SagaStep[] = [
  SagaStep.Lock,
  SagaStep.Winner,
  SagaStep.Reserve,
  SagaStep.Invoice,
  SagaStep.Notify,
  SagaStep.Settle,
];

export const FIRST_STEP = SagaStep.Lock;

export function nextStep(step: SagaStep): SagaStep | null {
  const index = STEP_ORDER.indexOf(step);
  return index === -1 || index === STEP_ORDER.length - 1
    ? null
    : STEP_ORDER[index + 1];
}

export function previousStep(step: SagaStep): SagaStep | null {
  const index = STEP_ORDER.indexOf(step);
  return index <= 0 ? null : STEP_ORDER[index - 1];
}

export interface SagaPayload {
  closeAt?: string;
  lockToken?: string;
  winningBidId?: string;
  winningAmount?: number;
  winningCarrierId?: string;
  failureReason?: string;
  [key: string]: unknown;
}

export interface SagaInstance {
  id: string;
  lotId: string;
  step: SagaStep;
  status: SagaStatus;
  payload: SagaPayload;
  attempts: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
