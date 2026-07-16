import { EntityManager } from 'typeorm';

export interface OutboxPort {
  add(
    manager: EntityManager,
    eventType: string,
    payload: unknown,
  ): Promise<void>;
}

export const OUTBOX_PORT = Symbol('OUTBOX_PORT');

export class NullOutboxPort implements OutboxPort {
  add(): Promise<void> {
    throw new Error(
      'Outbox is not configured yet — platform/outbox lands in M2-03. ' +
        'Provide OUTBOX_PORT once it does.',
    );
  }
}
