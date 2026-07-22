import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuctionModule } from '@src/modules/auction/auction.module';
import { BiddingModule } from '@src/modules/bidding/bidding.module';
import { NotificationModule } from '@src/modules/notification/notification.module';
import { SagaInstanceEntity } from '@src/modules/settlement/infrastructure/saga-instance.entity';
import { SagaRepository } from '@src/modules/settlement/infrastructure/saga.repository';
import { FundReservationEntity } from '@src/modules/settlement/infrastructure/fund-reservation.entity';
import { ReservationRepository } from '@src/modules/settlement/infrastructure/reservation.repository';
import { ReservationService } from '@src/modules/settlement/infrastructure/reservation.service';
import { InvoiceEntity } from '@src/modules/settlement/infrastructure/invoice.entity';
import { InvoiceRepository } from '@src/modules/settlement/infrastructure/invoice.repository';
import { InvoiceService } from '@src/modules/settlement/infrastructure/invoice.service';
import { SettlementNotifier } from '@src/modules/settlement/infrastructure/settlement-notifier';
import { StepCommandPublisher } from '@src/modules/settlement/infrastructure/step-command.publisher';
import { SettlementTriggerConsumer } from '@src/modules/settlement/infrastructure/settlement-trigger.consumer';
import { SettlementStepConsumer } from '@src/modules/settlement/application/settlement-step.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SagaInstanceEntity,
      FundReservationEntity,
      InvoiceEntity,
    ]),
    AuctionModule,
    BiddingModule,
    NotificationModule,
  ],
  providers: [
    SagaRepository,
    ReservationRepository,
    ReservationService,
    InvoiceRepository,
    InvoiceService,
    SettlementNotifier,
    StepCommandPublisher,
    SettlementTriggerConsumer,
    SettlementStepConsumer,
  ],
  exports: [SagaRepository],
})
export class SettlementModule {}
