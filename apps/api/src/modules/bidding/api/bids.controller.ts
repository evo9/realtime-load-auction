import {
  Body,
  ConflictException,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@src/modules/identity/api/guards/jwt-auth.guard';
import { RolesGuard } from '@src/modules/identity/api/guards/roles.guard';
import { Roles } from '@src/modules/identity/api/decorators/roles.decorator';
import { CurrentUser } from '@src/modules/identity/api/decorators/current-user.decorator';
import type { JwtPayload } from '@src/modules/identity/domain/jwt-payload';
import { RequireIdempotencyKeyGuard } from '@src/platform/idempotency/require-idempotency-key.guard';
import { IdempotencyKey } from '@src/platform/idempotency/idempotency-key.decorator';
import { PlaceBidHandler } from '@src/modules/bidding/application/place-bid.handler';
import { PlaceBidDto } from '@src/modules/bidding/api/dto/place-bid.dto';

// Malformed amount is rejected with the app-wide global ValidationPipe's
// default 400 — a route-scoped pipe here would never run: Nest chains
// global -> class -> method pipes for the same param and the global one
// already throws on the first bad value.
@Controller('lots/:lotId/bids')
export class BidsController {
  constructor(private readonly placeBid: PlaceBidHandler) {}

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

    switch (outcome.status) {
      case 'accepted':
        return outcome.bid;
      case 'rejected':
        throw new ConflictException({ reason: outcome.reason });
      case 'rate_limited':
        throw new HttpException(
          { reason: 'rate_limited' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case 'in_progress':
        throw new ConflictException({ reason: 'idempotency_in_progress' });
    }
  }
}
