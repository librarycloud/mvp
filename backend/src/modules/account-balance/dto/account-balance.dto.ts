import { Static, Type } from "@sinclair/typebox";

export const AccountBalanceQuerySchema = Type.Object(
  {
    startDate: Type.String({ format: "date" }),
    endDate: Type.String({ format: "date" }),
    includeZero: Type.Optional(Type.Boolean({ default: true })),
  },
  { additionalProperties: false },
);
const BalanceSchema = Type.Object({
  direction: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT"), Type.Null()]), amount: Type.String(),
});
export const AccountBalanceSchema = Type.Object({
  startDate: Type.String({ format: "date-time" }),
  endDate: Type.String({ format: "date-time" }),
  rows: Type.Array(
    Type.Object({
      account: Type.Object({
        id: Type.Integer({ minimum: 1 }), code: Type.String(), name: Type.String(), category: Type.String(),
        normalDirection: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT")]),
        parentId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]), level: Type.Integer(), isEnabled: Type.Boolean(),
        deletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
      }),
      opening: BalanceSchema, periodDebit: Type.String(), periodCredit: Type.String(), closing: BalanceSchema,
    }),
  ),
});

export type AccountBalanceQuery = Static<typeof AccountBalanceQuerySchema>;
