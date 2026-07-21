import {
  FIRST_STEP,
  SagaStep,
  STEP_ORDER,
  nextStep,
} from '@src/modules/settlement/domain/saga';

describe('STEP_ORDER', () => {
  it('starts at the declared first step', () => {
    expect(STEP_ORDER[0]).toBe(FIRST_STEP);
  });

  it('lists every SagaStep exactly once', () => {
    const values = Object.values(SagaStep);
    expect(STEP_ORDER).toHaveLength(values.length);
    expect(new Set(STEP_ORDER).size).toBe(values.length);
    expect(new Set(STEP_ORDER)).toEqual(new Set(values));
  });
});

describe('nextStep', () => {
  const pairs: [SagaStep, SagaStep | null][] = [
    [SagaStep.Lock, SagaStep.Winner],
    [SagaStep.Winner, SagaStep.Reserve],
    [SagaStep.Reserve, SagaStep.Invoice],
    [SagaStep.Invoice, SagaStep.Notify],
    [SagaStep.Notify, SagaStep.Settle],
    [SagaStep.Settle, null],
  ];

  it.each(pairs)('from %s returns %s', (from, expected) => {
    expect(nextStep(from)).toBe(expected);
  });
});
