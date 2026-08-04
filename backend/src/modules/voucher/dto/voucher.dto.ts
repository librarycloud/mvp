import { Static, Type } from "@sinclair/typebox";

const amount = Type.String({ pattern: "^\\d{1,15}(?:\\.\\d{1,4})?$" });
const VoucherCategorySchema = Type.Union([
  Type.Literal("RECEIPT"),
  Type.Literal("PAYMENT"),
  Type.Literal("TRANSFER"),
  Type.Literal("ACCRUAL"),
  Type.Literal("CLOSING"),
  Type.Literal("OTHER"),
]);
export const VoucherEntryBodySchema = Type.Object(
  {
    accountId: Type.Integer({ minimum: 1 }),
    summary: Type.String({ maxLength: 500 }),
    debitAmount: amount,
    creditAmount: amount,
    dimensionMemberIds: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }), { uniqueItems: true, maxItems: 20 })),
  },
  { additionalProperties: false },
);
export const VoucherWriteBodySchema = Type.Object(
  {
    voucherDate: Type.String({ format: "date" }),
    postingDate: Type.Optional(Type.String({ format: "date" })),
    summary: Type.String({ minLength: 1, maxLength: 500 }),
    category: Type.Optional(VoucherCategorySchema),
    entries: Type.Array(VoucherEntryBodySchema, { minItems: 2, maxItems: 100 }),
  },
  { additionalProperties: false },
);
export const VoucherParamsSchema = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const VoucherSuggestionParamsSchema = Type.Object({
  suggestionId: Type.Integer({ minimum: 1 }),
});
export const VoucherAttachmentParamsSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
});
export const VoucherVoidBodySchema = Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) }, { additionalProperties: false });
export const VoucherBatchBodySchema = Type.Object(
  { ids: Type.Array(Type.Integer({ minimum: 1 }), { minItems: 1, maxItems: 100, uniqueItems: true }) },
  { additionalProperties: false },
);
export const VoucherBatchResultSchema = Type.Object({
  succeededIds: Type.Array(Type.Integer({ minimum: 1 })),
  failures: Type.Array(Type.Object({ id: Type.Integer({ minimum: 1 }), code: Type.String(), message: Type.String() })),
});
export const VoucherQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 20 })),
    status: Type.Optional(Type.Integer({ minimum: 0, maximum: 3 })),
    category: Type.Optional(VoucherCategorySchema),
    keyword: Type.Optional(Type.String({ maxLength: 200 })),
    fiscalYear: Type.Optional(Type.Integer({ minimum: 2000, maximum: 9999 })),
    fiscalPeriod: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
    periodId: Type.Optional(Type.Integer({ minimum: 1 })),
    startDate: Type.Optional(Type.String({ format: "date" })),
    endDate: Type.Optional(Type.String({ format: "date" })),
  },
  { additionalProperties: false },
);

export const VoucherEntrySchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  voucherId: Type.Integer({ minimum: 1 }),
  lineNo: Type.Integer(),
  accountId: Type.Integer({ minimum: 1 }),
  summary: Type.String(),
  debitAmount: Type.String(),
  creditAmount: Type.String(),
  dimensions: Type.Optional(Type.Array(Type.Object({
    dimensionId: Type.Integer({ minimum: 1 }),
    dimensionMemberId: Type.Integer({ minimum: 1 }),
    dimension: Type.Optional(Type.Object({ id: Type.Integer(), code: Type.String(), name: Type.String() })),
    dimensionMember: Type.Optional(Type.Object({ id: Type.Integer(), code: Type.String(), name: Type.String() })),
  }))),
  account: Type.Optional(Type.Object({ id: Type.Integer({ minimum: 1 }), code: Type.String(), name: Type.String() })),
});
export const VoucherAttachmentSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  voucherId: Type.Integer({ minimum: 1 }),
  originalName: Type.String(),
  storagePath: Type.String(),
  mimeType: Type.String(),
  fileSize: Type.String(),
  fileHash: Type.String(),
  createdAt: Type.String({ format: "date-time" }),
});
const VoucherFields = {
  id: Type.Integer({ minimum: 1 }),
  voucherNo: Type.String(),
  fiscalYear: Type.Integer(),
  fiscalPeriod: Type.Integer(),
  sequenceNo: Type.Integer(),
  voucherDate: Type.String({ format: "date-time" }),
  postingDate: Type.String({ format: "date-time" }),
  periodId: Type.Integer({ minimum: 1 }),
  summary: Type.String(),
  sourceType: Type.Union([
    Type.Literal("BANK_TRANSACTION"),
    Type.Literal("INVOICE"),
    Type.Literal("MIXED"),
    Type.Literal("MANUAL"),
  ]),
  category: VoucherCategorySchema,
  status: Type.Integer({ minimum: 0, maximum: 3 }),
  attachmentCount: Type.Integer(),
  totalDebit: Type.String(),
  totalCredit: Type.String(),
  createdById: Type.Integer({ minimum: 1 }),
  reviewerId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  reviewedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  postedById: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  postedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  voidById: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  voidAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  voidReason: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
  deletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
};
export const VoucherSchema = Type.Object({
  ...VoucherFields,
  reviewer: Type.Optional(Type.Union([Type.Object({ id: Type.Integer({ minimum: 1 }), displayName: Type.String() }), Type.Null()])),
  postedBy: Type.Optional(Type.Union([Type.Object({ id: Type.Integer({ minimum: 1 }), displayName: Type.String() }), Type.Null()])),
  voidBy: Type.Optional(Type.Union([Type.Object({ id: Type.Integer({ minimum: 1 }), displayName: Type.String() }), Type.Null()])),
  period: Type.Optional(Type.Object({ id: Type.Integer({ minimum: 1 }), periodCode: Type.String(), status: Type.Integer({ minimum: 0, maximum: 2 }) })),
  _count: Type.Optional(Type.Object({ entries: Type.Integer(), attachments: Type.Integer(), accountingEvents: Type.Optional(Type.Integer()) })),
});
export const VoucherDetailSchema = Type.Object({
  ...VoucherFields,
  reviewer: Type.Optional(Type.Union([Type.Object({ id: Type.Integer({ minimum: 1 }), displayName: Type.String() }), Type.Null()])),
  postedBy: Type.Optional(Type.Union([Type.Object({ id: Type.Integer({ minimum: 1 }), displayName: Type.String() }), Type.Null()])),
  voidBy: Type.Optional(Type.Union([Type.Object({ id: Type.Integer({ minimum: 1 }), displayName: Type.String() }), Type.Null()])),
  period: Type.Optional(Type.Object({ id: Type.Integer({ minimum: 1 }), periodCode: Type.String(), status: Type.Integer({ minimum: 0, maximum: 2 }) })),
  entries: Type.Array(VoucherEntrySchema),
  attachments: Type.Array(VoucherAttachmentSchema),
  sources: Type.Array(
    Type.Object({
      id: Type.Integer({ minimum: 1 }),
      voucherId: Type.Integer({ minimum: 1 }),
      bankTransactionId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
      invoiceId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    }),
  ),
});

export type VoucherWriteBody = Static<typeof VoucherWriteBodySchema>;
export type VoucherParams = Static<typeof VoucherParamsSchema>;
export type VoucherSuggestionParams = Static<typeof VoucherSuggestionParamsSchema>;
export type VoucherAttachmentParams = Static<typeof VoucherAttachmentParamsSchema>;
export type VoucherVoidBody = Static<typeof VoucherVoidBodySchema>;
export type VoucherBatchBody = Static<typeof VoucherBatchBodySchema>;
export type VoucherQuery = Static<typeof VoucherQuerySchema>;
