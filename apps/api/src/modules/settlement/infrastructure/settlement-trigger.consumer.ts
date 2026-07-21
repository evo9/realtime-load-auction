import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { AMQP_CONNECTION } from '@src/platform/messaging/amqp-connection.token';
import { MESSAGING_CONFIG } from '@src/platform/messaging/messaging.config.token';
import type { MessagingConfig } from '@src/platform/messaging/messaging.config.token';
import { Publisher } from '@src/platform/messaging/publisher';
import { DEDUP_PORT } from '@src/platform/messaging/dedup.port';
import type { DedupPort } from '@src/platform/messaging/dedup.port';
import { BaseConsumer } from '@src/platform/messaging/base.consumer';
import type { RmqMessage } from '@src/platform/messaging/base.consumer';
import {
  Queues,
  RoutingKeys,
} from '@src/platform/messaging/messaging.constants';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { SagaRepository } from '@src/modules/settlement/infrastructure/saga.repository';
import type { LotClosedPayload } from '@src/modules/listing/domain/listing-lot';

@Injectable()
export class SettlementTriggerConsumer extends BaseConsumer<LotClosedPayload> {
  protected readonly queue = Queues.settlement;
  protected readonly prefetch = 5;
  private readonly logger = new Logger(SettlementTriggerConsumer.name);

  constructor(
    @Inject(AMQP_CONNECTION) connection: AmqpConnectionManager,
    publisher: Publisher,
    @Inject(MESSAGING_CONFIG) config: MessagingConfig,
    @Inject(DEDUP_PORT) dedup: DedupPort,
    private readonly uow: UnitOfWork,
    private readonly sagas: SagaRepository,
  ) {
    super(connection, publisher, config, dedup);
  }

  protected async process(msg: RmqMessage<LotClosedPayload>): Promise<void> {
    switch (msg.routingKey) {
      case RoutingKeys.lotClosed: {
        const payload = msg.payload;
        await this.uow.transaction((tx) =>
          this.sagas.create(tx, {
            lotId: payload.lotId,
            payload: { closeAt: payload.closeAt },
          }),
        );
        return;
      }
      default:
        this.logger.warn(
          `Settlement trigger: unexpected routing key ${msg.routingKey}, skipping`,
        );
        return;
    }
  }
}
