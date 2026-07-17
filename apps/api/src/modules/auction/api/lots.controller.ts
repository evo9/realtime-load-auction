import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@src/modules/identity/api/guards/jwt-auth.guard';
import { RolesGuard } from '@src/modules/identity/api/guards/roles.guard';
import { Roles } from '@src/modules/identity/api/decorators/roles.decorator';
import { CurrentUser } from '@src/modules/identity/api/decorators/current-user.decorator';
import type { JwtPayload } from '@src/modules/identity/domain/jwt-payload';
import { CreateLotHandler } from '@src/modules/auction/application/create-lot.handler';
import { CancelLotHandler } from '@src/modules/auction/application/cancel-lot.handler';
import { GetLotHandler } from '@src/modules/auction/application/get-lot.handler';
import { CreateLotDto } from '@src/modules/auction/api/dto/create-lot.dto';
import { CancelLotDto } from '@src/modules/auction/api/dto/cancel-lot.dto';

@Controller('lots')
export class LotsController {
  constructor(
    private readonly createLot: CreateLotHandler,
    private readonly cancelLot: CancelLotHandler,
    private readonly getLot: GetLotHandler,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('shipper')
  async create(@Body() dto: CreateLotDto, @CurrentUser() user: JwtPayload) {
    return this.createLot.execute({ ...dto, shipperId: user.sub });
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('shipper')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelLotDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.cancelLot.execute(id, {
      requestedBy: user.sub,
      reason: dto.reason,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getOne(@Param('id') id: string) {
    const lot = await this.getLot.execute(id);
    if (!lot) throw new NotFoundException(`Lot ${id} not found`);
    return lot;
  }
}
