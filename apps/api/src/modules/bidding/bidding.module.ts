import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@src/modules/identity/identity.module';
import { AuctionModule } from '@src/modules/auction/auction.module';
import { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';
import { PlaceBidHandler } from '@src/modules/bidding/application/place-bid.handler';
import { BidsController } from '@src/modules/bidding/api/bids.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BidEntity]),
    IdentityModule,
    AuctionModule,
  ],
  controllers: [BidsController],
  providers: [BidRepository, PlaceBidHandler],
})
export class BiddingModule {}
