import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { LoginHandler } from '@src/modules/identity/application/login.handler';
import { LoginDto } from '@src/modules/identity/api/dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly loginHandler: LoginHandler) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.loginHandler.execute(dto.email, dto.password);
  }
}
