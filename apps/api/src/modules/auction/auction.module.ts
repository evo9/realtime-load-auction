import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LotEntity } from '@src/modules/auction/infrastructure/lot.entity';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';

@Module({
  imports: [TypeOrmModule.forFeature([LotEntity])],
  providers: [LotRepository],
  exports: [LotRepository],
})
export class AuctionModule {}
