import { IsOptional, IsString } from 'class-validator';

export class CancelLotDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
