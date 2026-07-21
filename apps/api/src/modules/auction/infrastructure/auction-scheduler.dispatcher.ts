import { Injectable } from '@nestjs/common';
import { SchedulerDispatchPort } from '@src/platform/scheduler/scheduler-dispatch.port';
import { OpenLotHandler } from '@src/modules/auction/application/open-lot.handler';
import { CloseLotHandler } from '@src/modules/auction/application/close-lot.handler';

@Injectable()
export class AuctionSchedulerDispatcher implements SchedulerDispatchPort {
  constructor(
    private readonly openLot: OpenLotHandler,
    private readonly closeLot: CloseLotHandler,
  ) {}

  async dispatchOpen(lotId: string): Promise<void> {
    await this.openLot.execute(lotId);
  }

  async dispatchClose(lotId: string): Promise<void> {
    await this.closeLot.execute(lotId);
  }
}
