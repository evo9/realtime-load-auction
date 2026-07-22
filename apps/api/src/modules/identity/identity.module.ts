import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '@src/config/app-config.module';
import { AppConfigService } from '@src/config/app-config.service';
import { AuthController } from '@src/modules/identity/api/auth.controller';
import { MeController } from '@src/modules/identity/api/me.controller';
import { JwtAuthGuard } from '@src/modules/identity/api/guards/jwt-auth.guard';
import { RolesGuard } from '@src/modules/identity/api/guards/roles.guard';
import { LoginHandler } from '@src/modules/identity/application/login.handler';
import { UserEntity } from '@src/modules/identity/infrastructure/user.entity';
import { PasswordHasher } from '@src/modules/identity/infrastructure/password-hasher';
import { UserRepository } from '@src/modules/identity/infrastructure/user.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwt.secret,
        signOptions: {
          expiresIn: config.jwt.expiresIn as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    LoginHandler,
    UserRepository,
    PasswordHasher,
    JwtAuthGuard,
    RolesGuard,
  ],
  // JwtModule must be re-exported, not just the guards: @UseGuards() resolves
  // a guard's own constructor deps inside the consuming module's injector, so
  // JwtAuthGuard's JwtService dependency needs to be reachable from there too.
  exports: [JwtAuthGuard, RolesGuard, JwtModule, UserRepository],
})
export class IdentityModule {}
