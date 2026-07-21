import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@src/modules/identity/api/guards/jwt-auth.guard';
import { RolesGuard } from '@src/modules/identity/api/guards/roles.guard';
import { Roles } from '@src/modules/identity/api/decorators/roles.decorator';
import { CurrentUser } from '@src/modules/identity/api/decorators/current-user.decorator';
import type { JwtPayload } from '@src/modules/identity/domain/jwt-payload';
import { RequireIdempotencyKeyGuard } from '@src/platform/idempotency/require-idempotency-key.guard';
import { IdempotencyKey } from '@src/platform/idempotency/idempotency-key.decorator';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';
import { PlaceBidHandler } from '@src/modules/bidding/application/place-bid.handler';
import { GetLotBidsHandler } from '@src/modules/bidding/application/get-lot-bids.handler';
import { PlaceBidDto } from '@src/modules/bidding/api/dto/place-bid.dto';
import { GetLotBidsQueryDto } from '@src/modules/bidding/api/dto/get-lot-bids-query.dto';
import {
  BidHistoryResponseDto,
  toBidHistoryItemDto,
} from '@src/modules/bidding/api/dto/bid-history.dto';
import { placeBidOutcomeToHttp } from '@src/modules/bidding/api/place-bid-outcome.http';

// Malformed amount is rejected with the app-wide global ValidationPipe's
// default 400 — a route-scoped pipe here would never run: Nest chains
// global -> class -> method pipes for the same param and the global one
// already throws on the first bad value.
@Controller('lots/:lotId/bids')
export class BidsController {
  constructor(
    private readonly placeBid: PlaceBidHandler,
    private readonly getLotBids: GetLotBidsHandler,
    private readonly lots: LotRepository,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, RequireIdempotencyKeyGuard)
  @Roles('carrier')
  async place(
    @Param('lotId') lotId: string,
    @Body() dto: PlaceBidDto,
    @CurrentUser() user: JwtPayload,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    const outcome = await this.placeBid.execute({
      lotId,
      carrierId: user.sub,
      amount: dto.amount,
      idempotencyKey,
    });

    return placeBidOutcomeToHttp(outcome);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async history(
    @Param('lotId') lotId: string,
    @Query() query: GetLotBidsQueryDto,
  ): Promise<BidHistoryResponseDto> {
    const lot = await this.lots.findById(lotId);
    if (!lot) throw new NotFoundException(`Lot ${lotId} not found`);

    const result = await this.getLotBids.execute({ lotId, ...query });
    return {
      items: result.items.map(toBidHistoryItemDto),
      nextCursor: result.nextCursor,
    };
  }
}
