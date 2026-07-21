export class LotNotOpenError extends Error {
  constructor(readonly lotId: string) {
    super(`Lot ${lotId} is not open`);
  }
}
