import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SagaInstanceEntity } from '@src/modules/settlement/infrastructure/saga-instance.entity';
import { SagaRepository } from '@src/modules/settlement/infrastructure/saga.repository';
import { SettlementTriggerConsumer } from '@src/modules/settlement/infrastructure/settlement-trigger.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([SagaInstanceEntity])],
  providers: [SagaRepository, SettlementTriggerConsumer],
})
export class SettlementModule {}
