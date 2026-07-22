import { Injectable } from '@nestjs/common';
import {
  DlqInspector,
  DlqQueueSummary,
} from '@src/platform/messaging/dlq-inspector';

const DEFAULT_PEEK_LIMIT = 20;
const MAX_PEEK_LIMIT = 100;

@Injectable()
export class ListDlqHandler {
  constructor(private readonly dlq: DlqInspector) {}

  async execute(limit?: number): Promise<DlqQueueSummary[]> {
    return this.dlq.peek(Math.min(limit ?? DEFAULT_PEEK_LIMIT, MAX_PEEK_LIMIT));
  }
}
