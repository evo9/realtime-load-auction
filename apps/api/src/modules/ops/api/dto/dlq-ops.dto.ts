import {
  DlqMessage,
  DlqQueueSummary,
} from '@src/platform/messaging/dlq-inspector';

export class DlqMessageDto {
  messageId!: string;
  attempt!: number;
  routingKey!: string;
  lastError?: string;
  payload!: unknown;
  rawBody?: string;
}

export class DlqQueueSummaryDto {
  queue!: string;
  dlq!: string;
  messageCount!: number;
  messages!: DlqMessageDto[];
}

export function toDlqMessageDto(message: DlqMessage): DlqMessageDto {
  return {
    messageId: message.messageId,
    attempt: message.attempt,
    routingKey: message.routingKey,
    lastError: message.lastError,
    payload: message.payload,
    rawBody: message.rawBody,
  };
}

export function toDlqQueueSummaryDto(
  summary: DlqQueueSummary,
): DlqQueueSummaryDto {
  return {
    queue: summary.queue,
    dlq: summary.dlq,
    messageCount: summary.messageCount,
    messages: summary.messages.map(toDlqMessageDto),
  };
}
