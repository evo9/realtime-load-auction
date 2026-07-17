import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@src/modules/identity/api/guards/jwt-auth.guard';
import { ListLotsHandler } from '@src/modules/listing/application/list-lots.handler';
import {
  ListLotsResponseDto,
  toListingLotDto,
} from '@src/modules/listing/api/dto/listing-lot.dto';
import { ListLotsQueryDto } from '@src/modules/listing/api/dto/list-lots-query.dto';

@Controller('lots')
export class ListingController {
  constructor(private readonly listLots: ListLotsHandler) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Query() query: ListLotsQueryDto): Promise<ListLotsResponseDto> {
    const result = await this.listLots.execute(query);
    return {
      items: result.items.map(toListingLotDto),
      nextCursor: result.nextCursor,
    };
  }
}
