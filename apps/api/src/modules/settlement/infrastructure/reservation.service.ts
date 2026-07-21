import { Injectable } from '@nestjs/common';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import {
  ReservationRepository,
  ReserveInput,
} from '@src/modules/settlement/infrastructure/reservation.repository';

@Injectable()
export class ReservationService {
  constructor(private readonly reservations: ReservationRepository) {}

  reserve(tx: TransactionContext, input: ReserveInput): Promise<void> {
    return this.reservations.insert(tx, input);
  }

  release(tx: TransactionContext, lotId: string): Promise<void> {
    return this.reservations.markReleased(tx, lotId);
  }
}
