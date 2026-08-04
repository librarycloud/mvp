export interface ParsedInvoiceItem {
  lineNo: number;
  itemName: string;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string;
  taxRate: string | null;
  taxAmount: string | null;
  taxClassificationCode: string | null;
}

export interface ParsedInvoice {
  invoiceType: "SPECIAL" | "ORDINARY" | "UNKNOWN";
  invoiceNumber: string;
  issueTime: Date;
  sellerName: string;
  sellerIdNum: string;
  buyerName: string;
  buyerIdNum: string;
  totalAmountWithoutTax: string;
  totalTaxAmount: string;
  totalTaxIncludedAmount: string;
  currency: string;
  items: ParsedInvoiceItem[];
  rawData: Record<string, unknown>;
}

export interface InvoiceImportContext {
  actorId: number;
  /** Date on which the invoice is posted to the books; defaults to issueTime. */
  postingDate?: Date;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface InvoiceFilter {
  page: number;
  pageSize: number;
  keyword?: string;
  direction?: "PURCHASE" | "SALE" | "UNKNOWN";
  startTime?: Date;
  endTime?: Date;
}

export interface ManualInvoiceFields {
  invoiceNumber: string;
  issueTime: string;
  sellerName: string;
  sellerIdNum: string;
  buyerName: string;
  buyerIdNum: string;
  totalAmountWithoutTax: string;
  totalTaxAmount: string;
  totalTaxIncludedAmount: string;
  invoiceType?: "SPECIAL" | "ORDINARY" | "UNKNOWN";
  currency?: string;
}
