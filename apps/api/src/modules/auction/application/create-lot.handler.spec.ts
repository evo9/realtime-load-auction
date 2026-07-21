import { BadRequestException } from '@nestjs/common';
import { CreateLotCommand } from '@src/modules/auction/domain/lot-factory';
import { CreateLotHandler } from './create-lot.handler';

function makeCommand(
  overrides: Partial<CreateLotCommand> = {},
): CreateLotCommand {
  return {
    shipperId: 'shipper-1',
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    equipmentType: 'van',
    weightKg: 12000,
    pickupWindow: {
      from: new Date(Date.now() + 3 * 3_600_000),
      to: new Date(Date.now() + 6 * 3_600_000),
    },
    reservePrice: 150000,
    openAt: new Date(Date.now() + 60_000),
    closeAt: new Date(Date.now() + 120_000),
    antiSnipeWindowSec: 60,
    ...overrides,
  };
}

describe('CreateLotHandler', () => {
  let uow: { transaction: jest.Mock };
  let lots: { insert: jest.Mock };
  let scheduler: { schedule: jest.Mock };
  let handler: CreateLotHandler;

  beforeEach(() => {
    uow = {
      transaction: jest.fn((work: (tx: unknown) => Promise<unknown>) =>
        work({}),
      ),
    };
    lots = { insert: jest.fn((_tx, lot) => Promise.resolve(lot)) };
    scheduler = { schedule: jest.fn().mockResolvedValue(undefined) };
    handler = new CreateLotHandler(
      uow as never,
      lots as never,
      scheduler as never,
    );
  });

  it('rejects when openAt is not before closeAt', async () => {
    const cmd = makeCommand({
      openAt: new Date(Date.now() + 120_000),
      closeAt: new Date(Date.now() + 60_000),
    });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(uow.transaction).not.toHaveBeenCalled();
  });

  it('inserts the lot and schedules both the open and close timers', async () => {
    const cmd = makeCommand();

    const lot = await handler.execute(cmd);

    expect(lots.insert).toHaveBeenCalledTimes(1);
    expect(scheduler.schedule).toHaveBeenCalledTimes(2);
    expect(scheduler.schedule).toHaveBeenNthCalledWith(
      1,
      'auction:schedule:open',
      lot.openAt.getTime(),
      lot.id,
    );
    expect(scheduler.schedule).toHaveBeenNthCalledWith(
      2,
      'auction:schedule:close',
      lot.closeAt.getTime(),
      lot.id,
    );
    expect(lot.status).toBe('scheduled');
  });
});
