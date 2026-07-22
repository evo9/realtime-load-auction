import { Injectable } from '@nestjs/common';
import { TransactionContext } from '@src/platform/persistence/transaction-context';
import {
  CreateInvoiceInput,
  InvoiceRepository,
} from '@src/modules/settlement/infrastructure/invoice.repository';

@Injectable()
export class InvoiceService {
  constructor(private readonly invoices: InvoiceRepository) {}

  create(tx: TransactionContext, input: CreateInvoiceInput): Promise<void> {
    return this.invoices.insert(tx, input);
  }

  void(tx: TransactionContext, lotId: string): Promise<void> {
    return this.invoices.markVoid(tx, lotId);
  }
}
