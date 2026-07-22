import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuctionModule } from '@src/modules/auction/auction.module';
import { BiddingModule } from '@src/modules/bidding/bidding.module';
import { IdentityModule } from '@src/modules/identity/identity.module';
import { ListingModule } from '@src/modules/listing/listing.module';
import { DemoGeneratorService } from '@src/modules/demo/application/demo-generator.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuctionModule,
    BiddingModule,
    ListingModule,
    IdentityModule,
  ],
  providers: [DemoGeneratorService],
})
export class DemoModule {}
