import { randomUUID } from 'node:crypto';
import {
  EquipmentType,
  Lot,
  Money,
  PickupWindow,
} from '@src/modules/auction/domain/lot';

export class InvalidLotError extends Error {}

export interface CreateLotCommand {
  shipperId: string;
  origin: string;
  destination: string;
  equipmentType: EquipmentType;
  weightKg: number;
  pickupWindow: PickupWindow;
  reservePrice: Money;
  targetPrice?: Money;
  openAt: Date;
  closeAt: Date;
  antiSnipeWindowSec: number;
}

export function newScheduledLot(cmd: CreateLotCommand): Lot {
  if (cmd.openAt.getTime() >= cmd.closeAt.getTime()) {
    throw new InvalidLotError('openAt must be before closeAt');
  }
  if (cmd.openAt.getTime() < Date.now()) {
    throw new InvalidLotError('openAt must be in the future');
  }
  if (cmd.pickupWindow.from.getTime() >= cmd.pickupWindow.to.getTime()) {
    throw new InvalidLotError(
      'pickupWindow.from must be before pickupWindow.to',
    );
  }

  return {
    id: randomUUID(),
    shipperId: cmd.shipperId,
    origin: cmd.origin,
    destination: cmd.destination,
    equipmentType: cmd.equipmentType,
    weightKg: cmd.weightKg,
    pickupWindow: cmd.pickupWindow,
    reservePrice: cmd.reservePrice,
    targetPrice: cmd.targetPrice,
    openAt: cmd.openAt,
    closeAt: cmd.closeAt,
    antiSnipeWindowSec: cmd.antiSnipeWindowSec,
    status: 'scheduled',
    version: 1,
    createdAt: new Date(),
  };
}
