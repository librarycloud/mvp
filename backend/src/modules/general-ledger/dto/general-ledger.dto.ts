import { Static, Type } from "@sinclair/typebox";

export const GeneralLedgerQuerySchema = Type.Object(
  {
    accountId: Type.Integer({ minimum: 1 }),
    startDate: Type.String({ format: "date" }),
    endDate: Type.String({ format: "date" }),
  },
  { additionalProperties: false },
);

const BalanceSchema = Type.Object({
  direction: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT"), Type.Null()]),
  amount: Type.String(),
});
export const GeneralLedgerSchema = Type.Object({
  account: Type.Object({
    id: Type.Integer({ minimum: 1 }),
    code: Type.String(),
    name: Type.String(),
    normalDirection: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT")]),
  }),
  startDate: Type.String({ format: "date-time" }),
  endDate: Type.String({ format: "date-time" }),
  opening: BalanceSchema,
  periodDebit: Type.String(),
  periodCredit: Type.String(),
  closing: BalanceSchema,
  lines: Type.Array(
    Type.Object({
      voucherId: Type.Integer({ minimum: 1 }),
      voucherNo: Type.String(),
      voucherDate: Type.String({ format: "date-time" }),
      sequenceNo: Type.Integer(),
      lineNo: Type.Integer(),
      summary: Type.String(),
      debitAmount: Type.String(),
      creditAmount: Type.String(),
      balanceDirection: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT"), Type.Null()]),
      balance: Type.String(),
    }),
  ),
});

export type GeneralLedgerQuery = Static<typeof GeneralLedgerQuerySchema>;
