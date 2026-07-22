import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@src/modules/identity/identity.module';
import { LotEntity } from '@src/modules/auction/infrastructure/lot.entity';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';
import { AuctionSchedulerDispatcher } from '@src/modules/auction/infrastructure/auction-scheduler.dispatcher';
import { CreateLotHandler } from '@src/modules/auction/application/create-lot.handler';
import { OpenLotHandler } from '@src/modules/auction/application/open-lot.handler';
import { CloseLotHandler } from '@src/modules/auction/application/close-lot.handler';
import { CancelLotHandler } from '@src/modules/auction/application/cancel-lot.handler';
import { GetLotHandler } from '@src/modules/auction/application/get-lot.handler';
import { LotsController } from '@src/modules/auction/api/lots.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LotEntity]), IdentityModule],
  controllers: [LotsController],
  providers: [
    LotRepository,
    CreateLotHandler,
    OpenLotHandler,
    CloseLotHandler,
    CancelLotHandler,
    GetLotHandler,
    AuctionSchedulerDispatcher,
  ],
  exports: [LotRepository, AuctionSchedulerDispatcher, CreateLotHandler],
})
export class AuctionModule {}
