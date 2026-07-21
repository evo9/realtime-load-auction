export type Money = number; // integer cents, matches CasService/Lua CAS — duplicated from auction/domain/lot, no cross-module domain import precedent in this codebase

export interface Bid {
  id: string;
  lotId: string;
  carrierId: string;
  amount: Money;
  idempotencyKey: string;
  createdAt: Date;
}

export interface NewBid {
  id: string;
  lotId: string;
  carrierId: string;
  amount: Money;
  idempotencyKey: string;
}
