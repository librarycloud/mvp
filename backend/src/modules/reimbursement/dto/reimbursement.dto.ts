import { Type } from "@sinclair/typebox";

export const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

const InvoiceTaxTreatmentBody = Type.Object({
  invoiceId: Type.Integer({ minimum: 1 }),
  deductionStatus: Type.Integer({ minimum: 0, maximum: 3 }),
  deductibleTaxAmount: Type.String({ pattern: "^\\d{1,15}(?:\\.\\d{1,4})?$" }),
});

export const ReimbursementBody = Type.Object({
  applicantName: Type.String({ minLength: 1, maxLength: 100 }),
  department: Type.Optional(Type.String({ maxLength: 100 })),
  expenseDate: Type.String({ format: "date" }),
  expenseType: Type.String({ minLength: 1, maxLength: 100 }),
  amount: Type.String(),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  evidenceType: Type.Optional(Type.Integer({ minimum: 0, maximum: 2, default: 0 })),
  evidenceDescription: Type.Optional(Type.String({ maxLength: 500 })),
  invoiceIds: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }), { maxItems: 50, uniqueItems: true })),
  invoiceTaxTreatments: Type.Optional(Type.Array(InvoiceTaxTreatmentBody, { maxItems: 50 })),
});

export const ReimbursementUpdateBody = Type.Partial(ReimbursementBody);

export const ReimbursementQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 20 })),
  status: Type.Optional(Type.String({ maxLength: 32 })),
  applicantName: Type.Optional(Type.String({ maxLength: 100 })),
  dateFrom: Type.Optional(Type.String({ format: "date" })),
  dateTo: Type.Optional(Type.String({ format: "date" })),
  keyword: Type.Optional(Type.String({ maxLength: 200 })),
});

export const AvailableInvoiceQuery = Type.Object({
  keyword: Type.Optional(Type.String({ maxLength: 200 })),
  reimbursementId: Type.Optional(Type.Integer({ minimum: 1 })),
});

export const PaymentBody = Type.Object({
  paymentDate: Type.String({ format: "date" }),
  expenseAccountId: Type.Integer({ minimum: 1 }),
  paymentAccountId: Type.Integer({ minimum: 1 }),
  inputTaxAccountId: Type.Optional(Type.Integer({ minimum: 1 })),
  bankTransactionId: Type.Optional(Type.Integer({ minimum: 1 })),
  remark: Type.Optional(Type.String({ maxLength: 500 })),
});

export const RejectBody = Type.Object({
  reason: Type.Optional(Type.String({ maxLength: 500 })),
});
