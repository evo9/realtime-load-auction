import { Injectable } from '@nestjs/common';

export interface DedupPort {
  seen(messageId: string): Promise<boolean>;
  mark(messageId: string): Promise<void>;
}

export const DEDUP_PORT = Symbol('DEDUP_PORT');

@Injectable()
export class NullDedupPort implements DedupPort {
  seen(): Promise<boolean> {
    return Promise.resolve(false);
  }

  mark(): Promise<void> {
    return Promise.resolve();
  }
}
