import { Static, Type } from "@sinclair/typebox";

export const BankTransactionParamsSchema = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const BankTransactionQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 20 })),
    keyword: Type.Optional(Type.String({ maxLength: 200 })),
    startTime: Type.Optional(Type.String({ format: "date-time" })),
    endTime: Type.Optional(Type.String({ format: "date-time" })),
    voucherStatus: Type.Optional(Type.Union([Type.Literal("UNPOSTED"), Type.Literal("VOUCHERED")])),
    reconciliationStatus: Type.Optional(Type.Union([Type.Literal("UNMATCHED"), Type.Literal("MATCHED")])),
  },
  { additionalProperties: false },
);

export const BankFetchBodySchema = Type.Object(
  {
    apiUrl: Type.String({ minLength: 1, maxLength: 500, format: "uri" }),
    userId: Type.String({ minLength: 1, maxLength: 100 }),
    cardNbr: Type.String({ minLength: 1, maxLength: 35 }),
    beginDate: Type.String({ minLength: 8, maxLength: 10 }),
    endDate: Type.String({ minLength: 8, maxLength: 10 }),
    transactionSequence: Type.Optional(Type.String({ maxLength: 9 })),
    currencyCode: Type.Optional(Type.String({ maxLength: 2 })),
    queryAcctNbr: Type.Optional(Type.String({ maxLength: 200 })),
    reserve: Type.Optional(Type.String({ maxLength: 200 })),
    privateKey: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
    bankPublicKey: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
    symKey: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  },
  { additionalProperties: false },
);

export const BankFetchConfigSchema = Type.Object(
  {
    apiUrl: Type.String(),
    userId: Type.String(),
    cardNbr: Type.String(),
    beginDate: Type.String(),
    endDate: Type.String(),
    currencyCode: Type.String(),
    privateKey: Type.String(),
    bankPublicKey: Type.String(),
    symKey: Type.String(),
  },
  { additionalProperties: false },
);

export const SavedBankFetchConfigSchema = Type.Object(
  {
    apiUrl: Type.String(),
    userId: Type.String(),
    cardNbr: Type.String(),
    beginDate: Type.String(),
    endDate: Type.String(),
    currencyCode: Type.String(),
    hasPrivateKey: Type.Boolean(),
    hasBankPublicKey: Type.Boolean(),
    hasSymKey: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const BankTransactionSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  importBatchId: Type.Integer({ minimum: 1 }),
  payerAccount: Type.Union([Type.String(), Type.Null()]),
  payerName: Type.Union([Type.String(), Type.Null()]),
  payerBank: Type.Union([Type.String(), Type.Null()]),
  payerCurrency: Type.Union([Type.String(), Type.Null()]),
  payeeAccount: Type.Union([Type.String(), Type.Null()]),
  payeeName: Type.Union([Type.String(), Type.Null()]),
  payeeBank: Type.Union([Type.String(), Type.Null()]),
  payeeCurrency: Type.Union([Type.String(), Type.Null()]),
  amount: Type.String(),
  balance: Type.Union([Type.String(), Type.Null()]),
  transactionTime: Type.String({ format: "date-time" }),
  transactionNo: Type.String(),
  transactionType: Type.Union([Type.String(), Type.Null()]),
  summary: Type.Union([Type.String(), Type.Null()]),
  voucherId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  voucher: Type.Union([
    Type.Object({
      id: Type.Integer({ minimum: 1 }),
      voucherNo: Type.String(),
      status: Type.Integer(),
    }),
    Type.Null(),
  ]),
  postingStatus: Type.Union([Type.Literal("UNPOSTED"), Type.Literal("VOUCHERED")]),
  reconciliationStatus: Type.Union([
    Type.Literal("UNMATCHED"),
    Type.Literal("PARTIAL"),
    Type.Literal("MATCHED"),
  ]),
  reconciledAmount: Type.String(),
  rawData: Type.Union([Type.Any(), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
  deletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});

export const BankImportSummarySchema = Type.Object({
  batchId: Type.Integer({ minimum: 1 }),
  status: Type.Integer({ minimum: 0, maximum: 3 }),
  totalCount: Type.Integer(),
  successCount: Type.Integer(),
  skippedCount: Type.Integer(),
  failedCount: Type.Integer(),
  errors: Type.Array(
    Type.Object({
      row: Type.Integer(),
      message: Type.String(),
      transactionNo: Type.Optional(Type.String()),
    }),
  ),
  periodWarnings: Type.Optional(Type.Array(Type.Object({
    code: Type.Literal("ACCOUNTING_PERIOD_CLOSED"),
    message: Type.String(),
    periodId: Type.Integer(),
    periodCode: Type.String(),
    transactionNo: Type.String(),
  }))),
});

export type BankTransactionParams = Static<typeof BankTransactionParamsSchema>;
export type BankTransactionQuery = Static<typeof BankTransactionQuerySchema>;
export type BankFetchBody = Static<typeof BankFetchBodySchema>;
export type SavedBankFetchConfig = Static<typeof BankFetchConfigSchema>;
export type SavedBankFetchConfigView = Static<typeof SavedBankFetchConfigSchema>;

export const BankGenerateVoucherBodySchema = Type.Object({
  counterAccountId: Type.Integer({ minimum: 1 }),
  summary: Type.Optional(Type.String({ maxLength: 500 })),
});
export type BankGenerateVoucherBody = Static<typeof BankGenerateVoucherBodySchema>;
