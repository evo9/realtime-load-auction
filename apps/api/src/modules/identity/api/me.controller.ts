import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@src/modules/identity/api/guards/jwt-auth.guard';
import { CurrentUser } from '@src/modules/identity/api/decorators/current-user.decorator';
import type { JwtPayload } from '@src/modules/identity/domain/jwt-payload';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  @Get()
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
