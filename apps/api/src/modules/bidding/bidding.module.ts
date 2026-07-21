import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@src/modules/identity/identity.module';
import { AuctionModule } from '@src/modules/auction/auction.module';
import { BidEntity } from '@src/modules/bidding/infrastructure/bid.entity';
import { BidRepository } from '@src/modules/bidding/infrastructure/bid.repository';
import { PlaceBidHandler } from '@src/modules/bidding/application/place-bid.handler';
import { GetLotBidsHandler } from '@src/modules/bidding/application/get-lot-bids.handler';
import { GetMyBidsHandler } from '@src/modules/bidding/application/get-my-bids.handler';
import { BidsController } from '@src/modules/bidding/api/bids.controller';
import { MyBidsController } from '@src/modules/bidding/api/my-bids.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BidEntity]),
    IdentityModule,
    AuctionModule,
  ],
  controllers: [BidsController, MyBidsController],
  providers: [
    BidRepository,
    PlaceBidHandler,
    GetLotBidsHandler,
    GetMyBidsHandler,
  ],
})
export class BiddingModule {}
