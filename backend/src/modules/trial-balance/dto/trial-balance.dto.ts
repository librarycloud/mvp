import { Static, Type } from "@sinclair/typebox";

export const TrialBalanceQuerySchema = Type.Object(
  {
    startDate: Type.String({ format: "date" }),
    endDate: Type.String({ format: "date" }),
    includeZero: Type.Optional(Type.Boolean({ default: false })),
  },
  { additionalProperties: false },
);
export const TrialBalanceSchema = Type.Object({
  startDate: Type.String({ format: "date-time" }), endDate: Type.String({ format: "date-time" }),
  rows: Type.Array(
    Type.Object({
      account: Type.Object({
        id: Type.Integer({ minimum: 1 }), code: Type.String(), name: Type.String(), category: Type.String(),
        normalDirection: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT")]), isLeaf: Type.Boolean(),
        sortOrder: Type.Integer(), deletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
      }),
      openingDirection: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT"), Type.Null()]),
      openingDebit: Type.String(), openingCredit: Type.String(), periodDebit: Type.String(), periodCredit: Type.String(),
      closingDirection: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT"), Type.Null()]),
      closingDebit: Type.String(), closingCredit: Type.String(),
    }),
  ),
  totals: Type.Object({
    openingDebit: Type.String(), openingCredit: Type.String(), periodDebit: Type.String(), periodCredit: Type.String(),
    closingDebit: Type.String(), closingCredit: Type.String(),
  }),
  isBalanced: Type.Boolean(),
});

export type TrialBalanceQuery = Static<typeof TrialBalanceQuerySchema>;
