import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '@src/config/app-config.module';
import { OUTBOX_PORT } from '@src/platform/persistence/outbox.port';
import { OutboxEntity } from './outbox.entity';
import { OutboxRelay } from './outbox.relay';
import { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  imports: [AppConfigModule, TypeOrmModule.forFeature([OutboxEntity])],
  providers: [
    OutboxRepository,
    OutboxService,
    { provide: OUTBOX_PORT, useExisting: OutboxService },
    OutboxRelay,
  ],
  exports: [OUTBOX_PORT],
})
export class OutboxModule {}
