export interface SchedulerDispatchPort {
  dispatchOpen(lotId: string): Promise<void>;
  dispatchClose(lotId: string): Promise<void>;
}

export const SCHEDULER_DISPATCH_PORT = Symbol('SCHEDULER_DISPATCH_PORT');

export class NullSchedulerDispatchPort implements SchedulerDispatchPort {
  dispatchOpen(): Promise<void> {
    throw new Error(
      'Scheduler dispatch is not configured yet — auction wiring lands separately. ' +
        'Provide SCHEDULER_DISPATCH_PORT once it does.',
    );
  }

  dispatchClose(): Promise<void> {
    throw new Error(
      'Scheduler dispatch is not configured yet — auction wiring lands separately. ' +
        'Provide SCHEDULER_DISPATCH_PORT once it does.',
    );
  }
}
