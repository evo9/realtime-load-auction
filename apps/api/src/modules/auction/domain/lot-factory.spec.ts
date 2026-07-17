import {
  CreateLotCommand,
  InvalidLotError,
  newScheduledLot,
} from '@src/modules/auction/domain/lot-factory';

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

describe('newScheduledLot', () => {
  it('builds a scheduled lot from a valid command', () => {
    const cmd = makeCommand();

    const lot = newScheduledLot(cmd);

    expect(lot.status).toBe('scheduled');
    expect(lot.version).toBe(1);
    expect(lot.shipperId).toBe(cmd.shipperId);
  });

  it('rejects when openAt is not before closeAt', () => {
    const cmd = makeCommand({
      openAt: new Date(Date.now() + 120_000),
      closeAt: new Date(Date.now() + 60_000),
    });

    expect(() => newScheduledLot(cmd)).toThrow(InvalidLotError);
  });

  it('rejects when openAt is in the past', () => {
    const cmd = makeCommand({ openAt: new Date(Date.now() - 60_000) });

    expect(() => newScheduledLot(cmd)).toThrow(InvalidLotError);
  });

  it('rejects when pickupWindow.from is not before pickupWindow.to', () => {
    const cmd = makeCommand({
      pickupWindow: {
        from: new Date(Date.now() + 6 * 3_600_000),
        to: new Date(Date.now() + 3 * 3_600_000),
      },
    });

    expect(() => newScheduledLot(cmd)).toThrow(InvalidLotError);
  });
});
