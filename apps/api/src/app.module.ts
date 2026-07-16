import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from '@src/config/app-config.module';
import { AppConfigService } from '@src/config/app-config.service';
import { HealthModule } from '@src/health/health.module';
import { PersistenceModule } from '@src/platform/persistence/persistence.module';

@Module({
  imports: [
    AppConfigModule,
    PersistenceModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.nodeEnv === 'production' ? 'info' : 'debug',
          genReqId: (req, res) => {
            const existing = req.headers['x-request-id'];
            const id = typeof existing === 'string' ? existing : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
        },
      }),
    }),
    HealthModule,
  ],
})
export class AppModule {}
