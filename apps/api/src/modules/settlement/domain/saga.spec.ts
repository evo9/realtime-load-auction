import {
  FIRST_STEP,
  SagaStep,
  STEP_ORDER,
  nextStep,
  previousStep,
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

describe('previousStep', () => {
  const pairs: [SagaStep, SagaStep | null][] = [
    [SagaStep.Lock, null],
    [SagaStep.Winner, SagaStep.Lock],
    [SagaStep.Reserve, SagaStep.Winner],
    [SagaStep.Invoice, SagaStep.Reserve],
    [SagaStep.Notify, SagaStep.Invoice],
    [SagaStep.Settle, SagaStep.Notify],
  ];

  it.each(pairs)('from %s returns %s', (from, expected) => {
    expect(previousStep(from)).toBe(expected);
  });

  it('is the exact inverse of nextStep across the whole chain', () => {
    for (const step of STEP_ORDER) {
      const next = nextStep(step);
      if (next !== null) {
        expect(previousStep(next)).toBe(step);
      }
    }
  });
});
