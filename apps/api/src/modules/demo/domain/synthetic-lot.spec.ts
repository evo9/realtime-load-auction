import { buildSyntheticLotCommand } from '@src/modules/demo/domain/synthetic-lot';

const EQUIPMENT_TYPES = ['van', 'reefer', 'flatbed'];

describe('buildSyntheticLotCommand', () => {
  it('builds a command with openAt in the future and before closeAt', () => {
    const now = Date.now();

    const cmd = buildSyntheticLotCommand({
      shipperId: 'shipper-1',
      now,
      durationMs: 120_000,
      antiSnipeWindowSec: 20,
    });

    expect(cmd.openAt.getTime()).toBeGreaterThan(now);
    expect(cmd.closeAt.getTime()).toBeGreaterThan(cmd.openAt.getTime());
  });

  it('builds a valid pickup window (from before to)', () => {
    const cmd = buildSyntheticLotCommand({
      shipperId: 'shipper-1',
      now: Date.now(),
      durationMs: 120_000,
      antiSnipeWindowSec: 20,
    });

    expect(cmd.pickupWindow.from.getTime()).toBeLessThan(
      cmd.pickupWindow.to.getTime(),
    );
  });

  it('picks an allowed equipment type and positive integer weight/price', () => {
    const cmd = buildSyntheticLotCommand({
      shipperId: 'shipper-1',
      now: Date.now(),
      durationMs: 120_000,
      antiSnipeWindowSec: 20,
    });

    expect(EQUIPMENT_TYPES).toContain(cmd.equipmentType);
    expect(Number.isInteger(cmd.weightKg)).toBe(true);
    expect(cmd.weightKg).toBeGreaterThan(0);
    expect(Number.isInteger(cmd.reservePrice)).toBe(true);
    expect(cmd.reservePrice).toBeGreaterThan(0);
    if (cmd.targetPrice !== undefined) {
      expect(Number.isInteger(cmd.targetPrice)).toBe(true);
      expect(cmd.targetPrice).toBeLessThan(cmd.reservePrice);
    }
  });

  it('passes shipperId and antiSnipeWindowSec through unchanged', () => {
    const cmd = buildSyntheticLotCommand({
      shipperId: 'shipper-42',
      now: Date.now(),
      durationMs: 120_000,
      antiSnipeWindowSec: 45,
    });

    expect(cmd.shipperId).toBe('shipper-42');
    expect(cmd.antiSnipeWindowSec).toBe(45);
  });

  it('is deterministic for a fixed rng', () => {
    const rng = () => 0.25;
    const now = 1_800_000_000_000;

    const a = buildSyntheticLotCommand({
      shipperId: 's',
      now,
      durationMs: 120_000,
      antiSnipeWindowSec: 20,
      rng,
    });
    const b = buildSyntheticLotCommand({
      shipperId: 's',
      now,
      durationMs: 120_000,
      antiSnipeWindowSec: 20,
      rng,
    });

    expect(a).toEqual(b);
  });
});
