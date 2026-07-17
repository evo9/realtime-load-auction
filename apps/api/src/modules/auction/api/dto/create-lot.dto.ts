import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { EquipmentType } from '@src/modules/auction/domain/lot';
import { PickupWindowDto } from '@src/modules/auction/api/dto/pickup-window.dto';

const EQUIPMENT_TYPES: EquipmentType[] = ['van', 'reefer', 'flatbed'];

// bounds anti-snipe's lastBidAt + antiSnipeWindowSec*1000 well within the Date range,
// and keeps monetary/weight fields inside the Postgres int4 column they're stored in
const MAX_WEIGHT_KG = 100_000;
const MAX_MONEY_CENTS = 200_000_00;
const MAX_ANTI_SNIPE_WINDOW_SEC = 3600;
const MAX_LOCATION_LENGTH = 200;

export class CreateLotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LOCATION_LENGTH)
  origin!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LOCATION_LENGTH)
  destination!: string;

  @IsIn(EQUIPMENT_TYPES)
  equipmentType!: EquipmentType;

  @IsInt()
  @IsPositive()
  @Max(MAX_WEIGHT_KG)
  weightKg!: number;

  @ValidateNested()
  @Type(() => PickupWindowDto)
  pickupWindow!: PickupWindowDto;

  @IsInt()
  @Min(1)
  @Max(MAX_MONEY_CENTS)
  reservePrice!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MONEY_CENTS)
  targetPrice?: number;

  @Type(() => Date)
  @IsDate()
  openAt!: Date;

  @Type(() => Date)
  @IsDate()
  closeAt!: Date;

  @IsInt()
  @Min(0)
  @Max(MAX_ANTI_SNIPE_WINDOW_SEC)
  antiSnipeWindowSec!: number;
}
