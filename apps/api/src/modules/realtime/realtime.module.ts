import { Module } from '@nestjs/common';
import { IdentityModule } from '@src/modules/identity/identity.module';
import { RealtimeGateway } from '@src/modules/realtime/api/realtime.gateway';
import { RealtimeBridgeConsumer } from '@src/modules/realtime/infrastructure/realtime-bridge.consumer';

@Module({
  imports: [IdentityModule],
  providers: [RealtimeGateway, RealtimeBridgeConsumer],
})
export class RealtimeModule {}
