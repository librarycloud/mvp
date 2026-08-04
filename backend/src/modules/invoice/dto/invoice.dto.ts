import { Static, Type } from "@sinclair/typebox";

export const InvoiceDirectionSchema = Type.Union([
  Type.Literal("PURCHASE"),
  Type.Literal("SALE"),
  Type.Literal("UNKNOWN"),
]);
export const InvoiceParamsSchema = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const InvoiceVoucherParamsSchema = Type.Object({ id: Type.Integer({ minimum: 1 }), voucherId: Type.Integer({ minimum: 1 }) });
export const InvoiceVoucherBodySchema = Type.Object({ voucherId: Type.Integer({ minimum: 1 }) }, { additionalProperties: false });
export const TaxDeductionBodySchema = Type.Object({ status: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)]), deductibleTaxAmount: Type.String({ pattern: "^\\d{1,15}(?:\\.\\d{1,4})?$" }) });
export const InvoiceQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 20 })),
    keyword: Type.Optional(Type.String({ maxLength: 200 })),
    direction: Type.Optional(InvoiceDirectionSchema),
    startTime: Type.Optional(Type.String({ format: "date-time" })),
    endTime: Type.Optional(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
export const InvoiceImportQuerySchema = Type.Object(
  { postingDate: Type.Optional(Type.String({ format: "date" })) },
  { additionalProperties: false },
);
export const ManualInvoiceFieldsSchema = Type.Object({
  invoiceNumber: Type.String({ minLength: 1, maxLength: 64 }),
  issueTime: Type.String({ format: "date-time" }),
  sellerName: Type.String({ minLength: 1, maxLength: 200 }),
  sellerIdNum: Type.String({ minLength: 1, maxLength: 64 }),
  buyerName: Type.String({ minLength: 1, maxLength: 200 }),
  buyerIdNum: Type.String({ minLength: 1, maxLength: 64 }),
  totalAmountWithoutTax: Type.String({ pattern: "^-?\\d{1,15}(?:\\.\\d{1,4})?$" }),
  totalTaxAmount: Type.String({ pattern: "^-?\\d{1,15}(?:\\.\\d{1,4})?$" }),
  totalTaxIncludedAmount: Type.String({ pattern: "^-?\\d{1,15}(?:\\.\\d{1,4})?$" }),
  invoiceType: Type.Optional(Type.Union([Type.Literal("SPECIAL"), Type.Literal("ORDINARY"), Type.Literal("UNKNOWN")])),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
});

export const InvoiceItemSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  invoiceId: Type.Integer({ minimum: 1 }),
  lineNo: Type.Integer(),
  itemName: Type.String(),
  specification: Type.Union([Type.String(), Type.Null()]),
  unit: Type.Union([Type.String(), Type.Null()]),
  quantity: Type.Union([Type.String(), Type.Null()]),
  unitPrice: Type.Union([Type.String(), Type.Null()]),
  amount: Type.String(),
  taxRate: Type.Union([Type.String(), Type.Null()]),
  taxAmount: Type.Union([Type.String(), Type.Null()]),
  taxClassificationCode: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
  deletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});

const InvoiceFields = {
  id: Type.Integer({ minimum: 1 }),
  importBatchId: Type.Integer({ minimum: 1 }),
  reimbursementId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  voucherId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  taxDeductionStatus: Type.Integer({ minimum: 0, maximum: 3 }),
  deductibleTaxAmount: Type.String(),
  format: Type.Union([Type.Literal("XML"), Type.Literal("OFD"), Type.Literal("PDF")]),
  invoiceType: Type.Union([Type.Literal("SPECIAL"), Type.Literal("ORDINARY"), Type.Literal("UNKNOWN")]),
  status: Type.Integer({ minimum: 0, maximum: 2 }),
  verificationStatus: Type.Optional(Type.Union([Type.Literal("PENDING"), Type.Literal("VERIFIED"), Type.Literal("FAILED"), Type.Literal("MANUAL_CONFIRMED")])),
  verificationMessage: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  verifiedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  voidedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  redInvoiceOfId: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  direction: InvoiceDirectionSchema,
  invoiceNumber: Type.String(),
  issueTime: Type.String({ format: "date-time" }),
  sellerName: Type.String(),
  sellerIdNum: Type.String(),
  buyerName: Type.String(),
  buyerIdNum: Type.String(),
  totalAmountWithoutTax: Type.String(),
  totalTaxAmount: Type.String(),
  totalTaxIncludedAmount: Type.String(),
  currency: Type.String(),
  sourceFileHash: Type.String(),
  rawData: Type.Union([Type.Any(), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
  deletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
};

export const InvoiceSchema = Type.Object({
  ...InvoiceFields,
  _count: Type.Optional(Type.Object({ items: Type.Integer(), voucherSources: Type.Integer() })),
});
const LinkedVoucherSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  voucherNo: Type.String(),
  voucherDate: Type.String({ format: "date-time" }),
  postingDate: Type.String({ format: "date-time" }),
  status: Type.Integer({ minimum: 0, maximum: 3 }),
  summary: Type.String(),
  totalDebit: Type.String(),
  totalCredit: Type.String(),
});
export const InvoiceDetailSchema = Type.Object({
  ...InvoiceFields,
  items: Type.Array(InvoiceItemSchema),
  importBatch: Type.Object({
    id: Type.Integer({ minimum: 1 }),
    originalName: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
  }),
  voucherSources: Type.Array(Type.Object({
    id: Type.Integer({ minimum: 1 }),
    voucherId: Type.Integer({ minimum: 1 }),
    invoiceId: Type.Integer({ minimum: 1 }),
    voucher: LinkedVoucherSchema,
  })),
});
export const InvoiceImportSummarySchema = Type.Object({
  batchId: Type.Integer({ minimum: 1 }),
  invoiceId: Type.Integer({ minimum: 1 }),
  duplicate: Type.Boolean(),
  invoiceNumber: Type.String(),
  itemCount: Type.Integer(),
  periodWarning: Type.Optional(Type.Object({ code: Type.Literal("ACCOUNTING_PERIOD_CLOSED"), message: Type.String(), periodId: Type.Integer({ minimum: 1 }), periodCode: Type.String() })),
});
export const InvoiceBatchImportSummarySchema = Type.Object({
  totalCount: Type.Integer(),
  successCount: Type.Integer(),
  skippedCount: Type.Integer(),
  failedCount: Type.Integer(),
  results: Type.Array(Type.Intersect([InvoiceImportSummarySchema, Type.Object({ fileName: Type.String() })])),
  errors: Type.Array(Type.Object({ fileName: Type.String(), code: Type.String(), message: Type.String() })),
});

export type InvoiceParams = Static<typeof InvoiceParamsSchema>;
export type InvoiceQuery = Static<typeof InvoiceQuerySchema>;
export type InvoiceImportQuery = Static<typeof InvoiceImportQuerySchema>;
