import { IsInt, IsPositive, Max } from 'class-validator';

// keep in sync with MAX_MONEY_CENTS in auction/api/dto/create-lot.dto.ts
const MAX_MONEY_CENTS = 200_000_00;

export class PlaceBidDto {
  @IsInt()
  @IsPositive()
  @Max(MAX_MONEY_CENTS)
  amount!: number;
}
