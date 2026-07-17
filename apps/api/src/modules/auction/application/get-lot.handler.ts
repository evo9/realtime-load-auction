import { Injectable } from '@nestjs/common';
import { Lot } from '@src/modules/auction/domain/lot';
import { LotRepository } from '@src/modules/auction/infrastructure/lot.repository';

@Injectable()
export class GetLotHandler {
  constructor(private readonly lots: LotRepository) {}

  async execute(lotId: string): Promise<Lot | null> {
    return this.lots.findById(lotId);
  }
}
