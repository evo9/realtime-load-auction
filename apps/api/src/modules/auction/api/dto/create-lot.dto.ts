import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import type { EquipmentType } from '@src/modules/auction/domain/lot';
import { PickupWindowDto } from '@src/modules/auction/api/dto/pickup-window.dto';

const EQUIPMENT_TYPES: EquipmentType[] = ['van', 'reefer', 'flatbed'];

export class CreateLotDto {
  @IsString()
  @IsNotEmpty()
  origin!: string;

  @IsString()
  @IsNotEmpty()
  destination!: string;

  @IsIn(EQUIPMENT_TYPES)
  equipmentType!: EquipmentType;

  @IsInt()
  @IsPositive()
  weightKg!: number;

  @ValidateNested()
  @Type(() => PickupWindowDto)
  pickupWindow!: PickupWindowDto;

  @IsInt()
  @Min(1)
  reservePrice!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  targetPrice?: number;

  @Type(() => Date)
  @IsDate()
  openAt!: Date;

  @Type(() => Date)
  @IsDate()
  closeAt!: Date;

  @IsInt()
  @Min(0)
  antiSnipeWindowSec!: number;
}
