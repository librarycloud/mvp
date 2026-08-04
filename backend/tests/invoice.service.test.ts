import { describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { InvoiceService } from "../src/modules/invoice/invoice.service.js";
import { XmlInvoiceParser } from "../src/modules/invoice/xml-invoice-parser.js";
import { invoiceXml } from "./fixtures/invoice-xml.js";
import { FakeInvoiceRepository } from "./helpers/fake-invoice-repository.js";
import { MemoryFileStorage } from "./helpers/memory-file-storage.js";

const context = { actorId: 1 };

describe("InvoiceService", () => {
  it("skips a repeated seller and invoice number", async () => {
    const repository = new FakeInvoiceRepository();
    const service = new InvoiceService(repository, new XmlInvoiceParser(), new MemoryFileStorage());
    const file = { originalName: "invoice.xml", data: Buffer.from(invoiceXml()) };

    const first = await service.importXml(file, context);
    const second = await service.importXml(file, context);

    expect(first).toMatchObject({ duplicate: false, itemCount: 2 });
    expect(second).toMatchObject({ duplicate: true, itemCount: 0, invoiceId: first.invoiceId });
  });

  it("cleans up a newly stored file when persistence fails", async () => {
    const repository = new FakeInvoiceRepository();
    repository.failImport = true;
    const storage = new MemoryFileStorage();
    const service = new InvoiceService(repository, new XmlInvoiceParser(), storage);

    await expect(
      service.importXml({ originalName: "invoice.xml", data: Buffer.from(invoiceXml()) }, context),
    ).rejects.toThrow("Database failure");
    expect(storage.files.size).toBe(0);
    expect(storage.removed).toHaveLength(1);
  });

  it("continues a batch when one XML file is invalid", async () => {
    const service = new InvoiceService(
      new FakeInvoiceRepository(),
      new XmlInvoiceParser(),
      new MemoryFileStorage(),
    );

    const result = await service.importXmlBatch([
      { originalName: "valid.xml", data: Buffer.from(invoiceXml("BATCH-VALID-001")) },
      { originalName: "invalid.xml", data: Buffer.from("<invalid>") },
    ], context);

    expect(result).toMatchObject({
      totalCount: 2,
      successCount: 1,
      skippedCount: 0,
      failedCount: 1,
      results: [{ fileName: "valid.xml", invoiceNumber: "BATCH-VALID-001" }],
      errors: [{ fileName: "invalid.xml" }],
    });
  });

  it("uses the explicit posting date to resolve the accounting period", async () => {
    let resolvedDate: Date | undefined;
    const service = new InvoiceService(
      new FakeInvoiceRepository(),
      new XmlInvoiceParser(),
      new MemoryFileStorage(),
      { findByPostingDate: async (date) => { resolvedDate = date; return null; } },
    );
    const postingDate = new Date(Date.UTC(2026, 7, 1));

    await service.importXml(
      { originalName: "invoice.xml", data: Buffer.from(invoiceXml()) },
      { ...context, postingDate },
    );

    expect(resolvedDate).toEqual(postingDate);
  });

  it("falls back to the invoice issue date when no posting date is supplied", async () => {
    let resolvedDate: Date | undefined;
    const service = new InvoiceService(
      new FakeInvoiceRepository(),
      new XmlInvoiceParser(),
      new MemoryFileStorage(),
      { findByPostingDate: async (date) => { resolvedDate = date; return null; } },
    );

    await service.importXml(
      { originalName: "invoice.xml", data: Buffer.from(invoiceXml()) },
      context,
    );

    expect(resolvedDate).toEqual(new Date(Date.UTC(2026, 6, 1, 10, 20, 30)));
  });

  it("links and unlinks one invoice with multiple existing vouchers", async () => {
    const repository = new FakeInvoiceRepository();
    const service = new InvoiceService(repository, new XmlInvoiceParser(), new MemoryFileStorage());
    const imported = await service.importXml({ originalName: "invoice.xml", data: Buffer.from(invoiceXml()) }, context);

    await service.linkVoucher(imported.invoiceId, 101, context.actorId);
    await service.linkVoucher(imported.invoiceId, 102, context.actorId);
    expect(repository.voucherLinks).toEqual([
      { invoiceId: imported.invoiceId, voucherId: 101, actorId: context.actorId },
      { invoiceId: imported.invoiceId, voucherId: 102, actorId: context.actorId },
    ]);

    await service.unlinkVoucher(imported.invoiceId, 101, context.actorId);
    expect(repository.voucherLinks).toEqual([
      { invoiceId: imported.invoiceId, voucherId: 102, actorId: context.actorId },
    ]);
  });

  it("rejects an issued invoice whose buyer differs from the approved request", async () => {
    const tx = {
      salesInvoiceRequest: { findFirst: async () => ({ id: 1, status: 1, buyerIdNum: "BUYER-A", buyerName: "客户甲", invoiceType: "ORDINARY", amountWithoutTax: new Prisma.Decimal("100"), taxAmount: new Prisma.Decimal("6"), amountIncludingTax: new Prisma.Decimal("106") }) },
      invoice: { findFirst: async () => ({ id: 9, status: 1, direction: "SALE", buyerIdNum: "BUYER-B", buyerName: "客户乙", invoiceType: "ORDINARY", totalAmountWithoutTax: new Prisma.Decimal("100"), totalTaxAmount: new Prisma.Decimal("6"), totalTaxIncludedAmount: new Prisma.Decimal("106") }) },
    };
    const prisma = { $transaction: async (work: (client: typeof tx) => unknown) => work(tx) } as any;
    const service = new InvoiceService(new FakeInvoiceRepository(), new XmlInvoiceParser(), new MemoryFileStorage(), undefined, prisma);

    await expect(service.issueSalesRequest(1, 9, 1)).rejects.toMatchObject({ code: "SALES_INVOICE_BUYER_MISMATCH" });
  });
});
