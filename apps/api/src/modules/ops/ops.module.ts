import { Module } from '@nestjs/common';
import { IdentityModule } from '@src/modules/identity/identity.module';
import { SettlementModule } from '@src/modules/settlement/settlement.module';
import { OpsController } from '@src/modules/ops/api/ops.controller';
import { ListSagasHandler } from '@src/modules/ops/application/list-sagas.handler';
import { ListDlqHandler } from '@src/modules/ops/application/list-dlq.handler';

@Module({
  imports: [SettlementModule, IdentityModule],
  controllers: [OpsController],
  providers: [ListSagasHandler, ListDlqHandler],
})
export class OpsModule {}
