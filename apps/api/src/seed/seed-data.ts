import type { Role } from '@src/modules/identity/domain/user';
import type { EquipmentType, Money } from '@src/modules/auction/domain/lot';

export const SEED_PASSWORD = 'demo12345';

export interface SeedUser {
  email: string;
  role: Role;
}

export const SEED_USERS: SeedUser[] = [
  { email: 'shipper1@example.com', role: 'shipper' },
  { email: 'shipper2@example.com', role: 'shipper' },
  { email: 'carrier1@example.com', role: 'carrier' },
  { email: 'carrier2@example.com', role: 'carrier' },
  { email: 'carrier3@example.com', role: 'carrier' },
  { email: 'ops@example.com', role: 'admin' },
];

export interface SeedLotSpec {
  shipperEmail: string;
  origin: string;
  destination: string;
  equipmentType: EquipmentType;
  weightKg: number;
  reservePrice: Money;
  targetPrice?: Money;
  openImmediately: boolean;
  openOffsetMs: number;
  durationMs: number;
  pickupFromOffsetMs: number;
  pickupToOffsetMs: number;
  antiSnipeWindowSec: number;
}

export const SEED_LOTS: SeedLotSpec[] = [
  // Open right away, for a demo that has visible lots the instant the seed finishes.
  {
    shipperEmail: 'shipper1@example.com',
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    equipmentType: 'van',
    weightKg: 18000,
    reservePrice: 250000,
    targetPrice: 220000,
    openImmediately: true,
    openOffsetMs: 2000,
    durationMs: 2 * 3600_000,
    pickupFromOffsetMs: 3600_000,
    pickupToOffsetMs: 7200_000,
    antiSnipeWindowSec: 30,
  },
  {
    shipperEmail: 'shipper1@example.com',
    origin: 'Los Angeles, CA',
    destination: 'Phoenix, AZ',
    equipmentType: 'reefer',
    weightKg: 15000,
    reservePrice: 180000,
    openImmediately: true,
    openOffsetMs: 2000,
    durationMs: 2 * 3600_000,
    pickupFromOffsetMs: 3600_000,
    pickupToOffsetMs: 7200_000,
    antiSnipeWindowSec: 30,
  },
  {
    shipperEmail: 'shipper2@example.com',
    origin: 'Atlanta, GA',
    destination: 'Miami, FL',
    equipmentType: 'flatbed',
    weightKg: 20000,
    reservePrice: 210000,
    targetPrice: 190000,
    openImmediately: true,
    openOffsetMs: 2000,
    durationMs: 2 * 3600_000,
    pickupFromOffsetMs: 3600_000,
    pickupToOffsetMs: 7200_000,
    antiSnipeWindowSec: 30,
  },
  // Open later via the scheduler, to show a lot transitioning live.
  {
    shipperEmail: 'shipper2@example.com',
    origin: 'Seattle, WA',
    destination: 'Portland, OR',
    equipmentType: 'van',
    weightKg: 12000,
    reservePrice: 90000,
    openImmediately: false,
    openOffsetMs: 3 * 60_000,
    durationMs: 3600_000,
    pickupFromOffsetMs: 5 * 60_000,
    pickupToOffsetMs: 30 * 60_000,
    antiSnipeWindowSec: 20,
  },
  {
    shipperEmail: 'shipper1@example.com',
    origin: 'Denver, CO',
    destination: 'Salt Lake City, UT',
    equipmentType: 'flatbed',
    weightKg: 22000,
    reservePrice: 160000,
    openImmediately: false,
    openOffsetMs: 5 * 60_000,
    durationMs: 3600_000,
    pickupFromOffsetMs: 10 * 60_000,
    pickupToOffsetMs: 40 * 60_000,
    antiSnipeWindowSec: 20,
  },
  // Farther out, still scheduled.
  {
    shipperEmail: 'shipper2@example.com',
    origin: 'New York, NY',
    destination: 'Boston, MA',
    equipmentType: 'van',
    weightKg: 9000,
    reservePrice: 70000,
    openImmediately: false,
    openOffsetMs: 24 * 3600_000,
    durationMs: 2 * 3600_000,
    pickupFromOffsetMs: 25 * 3600_000,
    pickupToOffsetMs: 27 * 3600_000,
    antiSnipeWindowSec: 30,
  },
  {
    shipperEmail: 'shipper1@example.com',
    origin: 'Houston, TX',
    destination: 'New Orleans, LA',
    equipmentType: 'reefer',
    weightKg: 16000,
    reservePrice: 140000,
    openImmediately: false,
    openOffsetMs: 36 * 3600_000,
    durationMs: 3600_000,
    pickupFromOffsetMs: 37 * 3600_000,
    pickupToOffsetMs: 39 * 3600_000,
    antiSnipeWindowSec: 30,
  },
  {
    shipperEmail: 'shipper2@example.com',
    origin: 'San Francisco, CA',
    destination: 'Las Vegas, NV',
    equipmentType: 'flatbed',
    weightKg: 19000,
    reservePrice: 175000,
    openImmediately: false,
    openOffsetMs: 48 * 3600_000,
    durationMs: 2 * 3600_000,
    pickupFromOffsetMs: 49 * 3600_000,
    pickupToOffsetMs: 51 * 3600_000,
    antiSnipeWindowSec: 30,
  },
  {
    shipperEmail: 'shipper1@example.com',
    origin: 'Detroit, MI',
    destination: 'Columbus, OH',
    equipmentType: 'van',
    weightKg: 10000,
    reservePrice: 85000,
    openImmediately: false,
    openOffsetMs: 60 * 3600_000,
    durationMs: 3600_000,
    pickupFromOffsetMs: 61 * 3600_000,
    pickupToOffsetMs: 63 * 3600_000,
    antiSnipeWindowSec: 30,
  },
];
