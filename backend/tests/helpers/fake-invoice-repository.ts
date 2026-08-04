import type {
  CreateInvoiceImportInput,
  InvoiceImportSummary,
  InvoiceRepository,
} from "../../src/modules/invoice/invoice.repository.js";
import type { InvoiceFilter, InvoiceImportContext } from "../../src/modules/invoice/invoice.types.js";

export class FakeInvoiceRepository implements InvoiceRepository {
  keys = new Map<string, number>();
  imports: CreateInvoiceImportInput[] = [];
  failImport = false;
  voucherLinks: Array<{ invoiceId: number; voucherId: number; actorId: number }> = [];

  async createImport(input: CreateInvoiceImportInput, _context: InvoiceImportContext): Promise<InvoiceImportSummary> {
    if (this.failImport) throw new Error("Database failure");
    const key = `${input.invoice.sellerIdNum}:${input.invoice.invoiceNumber}`;
    const existing = this.keys.get(key);
    const invoiceId = existing ?? 400;
    const duplicate = Boolean(existing);
    if (!existing) {
      this.keys.set(key, invoiceId);
      this.imports.push(input);
    }
    return {
      batchId: this.imports.length + 400,
      invoiceId,
      duplicate,
      invoiceNumber: input.invoice.invoiceNumber,
      itemCount: duplicate ? 0 : input.invoice.items.length,
    };
  }

  async list(filter: InvoiceFilter) {
    const start = (filter.page - 1) * filter.pageSize;
    return { items: this.imports.slice(start, start + filter.pageSize), total: this.imports.length };
  }

  async findById(id: number) {
    return [...this.keys.values()].includes(id) ? this.imports[0] ?? null : null;
  }

  async updateTaxDeduction(id: number, status: number, deductibleTaxAmount: string, _actorId: number) {
    void id;
    const invoice = this.imports[0]?.invoice as any;
    if (!invoice) throw new Error("INVOICE_NOT_FOUND");
    invoice.taxDeductionStatus = status; invoice.deductibleTaxAmount = deductibleTaxAmount; return invoice;
  }
  async updateStatus(_id: number, _status: number, _actorId: number) { return this.imports[0]?.invoice ?? null; }
  async linkVoucher(invoiceId: number, voucherId: number, actorId: number) { this.voucherLinks.push({ invoiceId, voucherId, actorId }); }
  async unlinkVoucher(invoiceId: number, voucherId: number, actorId: number) { this.voucherLinks = this.voucherLinks.filter((row) => row.invoiceId !== invoiceId || row.voucherId !== voucherId); void actorId; }
}
