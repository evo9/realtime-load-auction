import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuctionModule } from '@src/modules/auction/auction.module';
import { BiddingModule } from '@src/modules/bidding/bidding.module';
import { NotificationEntity } from '@src/modules/notification/infrastructure/notification.entity';
import { NotificationLogRepository } from '@src/modules/notification/infrastructure/notification-log.repository';
import { NotificationConsumer } from '@src/modules/notification/infrastructure/notification.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity]),
    AuctionModule,
    BiddingModule,
  ],
  providers: [NotificationLogRepository, NotificationConsumer],
})
export class NotificationModule {}
