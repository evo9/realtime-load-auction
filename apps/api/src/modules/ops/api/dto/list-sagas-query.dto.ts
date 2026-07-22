import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { SagaStatus, SagaStep } from '@src/modules/settlement/domain/saga';

const MAX_LIMIT = 200;

export class ListSagasQueryDto {
  @IsOptional()
  @IsIn(Object.values(SagaStatus))
  status?: SagaStatus;

  @IsOptional()
  @IsIn(Object.values(SagaStep))
  step?: SagaStep;

  @IsOptional()
  @IsUUID()
  lotId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
