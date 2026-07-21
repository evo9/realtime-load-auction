import { BadRequestException, Injectable } from '@nestjs/common';
import { UnitOfWork } from '@src/platform/persistence/unit-of-work';
import { ZSetScheduler } from '@src/platform/scheduler/zset-scheduler';
import { RedisKeys } from '@src/platform/redis/redis-keys';
import { Lot } from '@src/modules/auction/domain/lot';
import {
  CreateLotCommand,
  InvalidLotError,
  newScheduledLot,
} from '@src/modules/auction/domain/lot-factory';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';

@Injectable()
export class CreateLotHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly lots: LotRepository,
    private readonly scheduler: ZSetScheduler,
  ) {}

  async execute(cmd: CreateLotCommand): Promise<Lot> {
    let lot: Lot;
    try {
      lot = newScheduledLot(cmd);
    } catch (err) {
      if (err instanceof InvalidLotError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const saved = await this.uow.transaction(async (tx) => {
      return this.lots.insert(tx, lot);
    });

    // Both timers are scheduled up front (durable ZSET survives a restart);
    // scheduling close only from OpenLot would leave a window where a crash
    // between the open commit and the close-schedule call loses the timer.
    await this.scheduler.schedule(
      RedisKeys.scheduleOpen(),
      saved.openAt.getTime(),
      saved.id,
    );
    await this.scheduler.schedule(
      RedisKeys.scheduleClose(),
      saved.closeAt.getTime(),
      saved.id,
    );

    return saved;
  }
}
