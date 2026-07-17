import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@src/modules/identity/identity.module';
import { ListingLotEntity } from '@src/modules/listing/infrastructure/listing-lot.entity';
import { ListingLotRepository } from '@src/modules/listing/infrastructure/listing-lot.repository';
import { ListingProjectionConsumer } from '@src/modules/listing/infrastructure/listing-projection.consumer';
import { ListLotsHandler } from '@src/modules/listing/application/list-lots.handler';
import { ListingController } from '@src/modules/listing/api/listing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ListingLotEntity]), IdentityModule],
  controllers: [ListingController],
  providers: [ListingLotRepository, ListLotsHandler, ListingProjectionConsumer],
})
export class ListingModule {}
