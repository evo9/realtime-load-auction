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

const SORT_VALUES = ['amount', 'time'] as const;
const MAX_LIMIT = 100;
const MAX_CURSOR_LENGTH = 500;

export class GetLotBidsQueryDto {
  @IsOptional()
  @IsIn(SORT_VALUES)
  sort?: 'amount' | 'time';

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
