import { EquipmentType, Money } from '@src/modules/auction/domain/lot';
import { CreateLotCommand } from '@src/modules/auction/domain/lot-factory';

interface Lane {
  origin: string;
  destination: string;
}

const LANES: Lane[] = [
  { origin: 'Chicago, IL', destination: 'Dallas, TX' },
  { origin: 'Los Angeles, CA', destination: 'Phoenix, AZ' },
  { origin: 'Atlanta, GA', destination: 'Miami, FL' },
  { origin: 'Seattle, WA', destination: 'Portland, OR' },
  { origin: 'Denver, CO', destination: 'Salt Lake City, UT' },
  { origin: 'New York, NY', destination: 'Boston, MA' },
  { origin: 'Houston, TX', destination: 'New Orleans, LA' },
  { origin: 'San Francisco, CA', destination: 'Las Vegas, NV' },
  { origin: 'Detroit, MI', destination: 'Columbus, OH' },
  { origin: 'Kansas City, MO', destination: 'St. Louis, MO' },
];

const EQUIPMENT_TYPES: EquipmentType[] = ['van', 'reefer', 'flatbed'];

const MIN_WEIGHT_KG = 8000;
const MAX_WEIGHT_KG = 22000;
const MIN_RESERVE_PRICE: Money = 70_000;
const MAX_RESERVE_PRICE: Money = 250_000;

function pick<T>(pool: T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

function randomIntBetween(min: number, max: number, rng: () => number): number {
  return Math.round(min + rng() * (max - min));
}

export interface BuildSyntheticLotCommandInput {
  shipperId: string;
  now: number;
  durationMs: number;
  antiSnipeWindowSec: number;
  rng?: () => number;
}

export function buildSyntheticLotCommand(
  input: BuildSyntheticLotCommandInput,
): CreateLotCommand {
  const rng = input.rng ?? Math.random;
  const lane = pick(LANES, rng);
  const equipmentType = pick(EQUIPMENT_TYPES, rng);
  const weightKg = randomIntBetween(MIN_WEIGHT_KG, MAX_WEIGHT_KG, rng);
  const reservePrice = randomIntBetween(
    MIN_RESERVE_PRICE,
    MAX_RESERVE_PRICE,
    rng,
  );
  // roughly matches SEED_LOTS: shippers set a target a bit under reserve on
  // about half their lots, and leave it unset otherwise.
  const targetPricePct = randomIntBetween(85, 95, rng);
  const targetPrice =
    rng() < 0.5 ? Math.round((reservePrice * targetPricePct) / 100) : undefined;

  const openAt = new Date(input.now + 5_000);
  const closeAt = new Date(openAt.getTime() + input.durationMs);
  const pickupFrom = new Date(input.now + 3_600_000);
  const pickupTo = new Date(pickupFrom.getTime() + 3_600_000);

  return {
    shipperId: input.shipperId,
    origin: lane.origin,
    destination: lane.destination,
    equipmentType,
    weightKg,
    pickupWindow: { from: pickupFrom, to: pickupTo },
    reservePrice,
    targetPrice,
    openAt,
    closeAt,
    antiSnipeWindowSec: input.antiSnipeWindowSec,
  };
}
