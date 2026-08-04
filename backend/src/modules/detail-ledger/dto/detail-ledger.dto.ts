import { Static, Type } from "@sinclair/typebox";

export const DetailLedgerQuerySchema = Type.Object(
  {
    accountId: Type.Integer({ minimum: 1 }),
    startDate: Type.String({ format: "date" }),
    endDate: Type.String({ format: "date" }),
    auxiliaryKey: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    auxiliaryValue: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  },
  { additionalProperties: false },
);

const BalanceSchema = Type.Object({
  direction: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT"), Type.Null()]),
  amount: Type.String(),
});
export const DetailLedgerSchema = Type.Object({
  account: Type.Object({
    id: Type.Integer({ minimum: 1 }), code: Type.String(), name: Type.String(),
    normalDirection: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT")]),
  }),
  startDate: Type.String({ format: "date-time" }),
  endDate: Type.String({ format: "date-time" }),
  auxiliary: Type.Union([Type.Object({ key: Type.String(), value: Type.String() }), Type.Null()]),
  opening: BalanceSchema,
  periodDebit: Type.String(),
  periodCredit: Type.String(),
  closing: BalanceSchema,
  lines: Type.Array(
    Type.Object({
      voucherId: Type.Integer({ minimum: 1 }), voucherNo: Type.String(), voucherDate: Type.String({ format: "date-time" }),
      sequenceNo: Type.Integer(), voucherSummary: Type.String(), lineNo: Type.Integer(), entrySummary: Type.String(),
      debitAmount: Type.String(), creditAmount: Type.String(),
      dimensions: Type.Array(Type.Object({ dimensionId: Type.Integer(), dimensionCode: Type.String(), dimensionName: Type.String(), memberId: Type.Integer(), memberCode: Type.String(), memberName: Type.String() })),
      balanceDirection: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT"), Type.Null()]), balance: Type.String(),
    }),
  ),
});

export type DetailLedgerQuery = Static<typeof DetailLedgerQuerySchema>;
