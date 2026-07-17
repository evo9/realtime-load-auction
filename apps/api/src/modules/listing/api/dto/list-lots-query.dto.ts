import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ListingLotStatus } from '@src/modules/listing/domain/listing-lot';

const LISTING_LOT_STATUSES: ListingLotStatus[] = ['open', 'closing'];
const EQUIPMENT_TYPES = ['van', 'reefer', 'flatbed'];
const MAX_LOCATION_LENGTH = 200;
const MAX_LIMIT = 100;
const MAX_CURSOR_LENGTH = 500;

export class ListLotsQueryDto {
  @IsOptional()
  @IsIn(LISTING_LOT_STATUSES)
  status?: ListingLotStatus;

  @IsOptional()
  @IsIn(EQUIPMENT_TYPES)
  equipmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LOCATION_LENGTH)
  origin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LOCATION_LENGTH)
  destination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}
