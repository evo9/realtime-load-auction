import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '@src/config/app-config.module';
import { AppConfigService } from '@src/config/app-config.service';
import { UnitOfWork } from './unit-of-work';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        type: 'postgres' as const,
        host: config.postgres.host,
        port: config.postgres.port,
        username: config.postgres.user,
        password: config.postgres.password,
        database: config.postgres.database,
        autoLoadEntities: true,
        migrationsRun: false,
      }),
    }),
  ],
  providers: [UnitOfWork],
  exports: [UnitOfWork],
})
export class PersistenceModule {}
