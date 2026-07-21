import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Publisher } from '@src/platform/messaging/publisher';
import {
  CommandRoutingKeys,
  Exchanges,
} from '@src/platform/messaging/messaging.constants';
import type { SettlementStepCommand } from '@src/modules/settlement/domain/settlement-command';

@Injectable()
export class StepCommandPublisher {
  constructor(private readonly publisher: Publisher) {}

  publishStep(cmd: SettlementStepCommand): Promise<void> {
    return this.publisher.publish(
      Exchanges.settlementCommands,
      CommandRoutingKeys.settlementStep,
      cmd,
      { messageId: randomUUID() },
    );
  }
}
