import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@src/modules/identity/api/guards/jwt-auth.guard';
import { RolesGuard } from '@src/modules/identity/api/guards/roles.guard';
import { Roles } from '@src/modules/identity/api/decorators/roles.decorator';
import { CurrentUser } from '@src/modules/identity/api/decorators/current-user.decorator';
import type { JwtPayload } from '@src/modules/identity/domain/jwt-payload';
import { GetMyBidsHandler } from '@src/modules/bidding/application/get-my-bids.handler';
import { GetMyBidsQueryDto } from '@src/modules/bidding/api/dto/get-my-bids-query.dto';
import {
  MyBidsResponseDto,
  toMyBidDto,
} from '@src/modules/bidding/api/dto/my-bid.dto';

@Controller('me/bids')
export class MyBidsController {
  constructor(private readonly getMyBids: GetMyBidsHandler) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('carrier')
  async myBids(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetMyBidsQueryDto,
  ): Promise<MyBidsResponseDto> {
    const result = await this.getMyBids.execute({
      carrierId: user.sub,
      ...query,
    });
    return {
      items: result.items.map(toMyBidDto),
      nextCursor: result.nextCursor,
    };
  }
}
