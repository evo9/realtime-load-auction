import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import type { PlaceBidOutcome } from '@src/modules/bidding/application/place-bid.handler';

const assertNever = (x: never): never => {
  throw new Error(`Unhandled bid outcome: ${JSON.stringify(x)}`);
};

export function placeBidOutcomeToHttp(outcome: PlaceBidOutcome) {
  switch (outcome.status) {
    case 'accepted':
      return outcome.bid;
    case 'rejected':
      throw new ConflictException({ reason: outcome.reason });
    case 'rate_limited':
      throw new HttpException(
        { reason: 'rate_limited' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    case 'in_progress':
      throw new ConflictException({ reason: 'idempotency_in_progress' });
    default:
      return assertNever(outcome); // exhaustiveness check: new outcome status fails the build
  }
}
