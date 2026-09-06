import { Type } from "@sinclair/typebox";

const money = Type.String({ pattern: "^-?\\d{1,15}(?:\\.\\d{1,4})?$" });
const positiveMoney = Type.String({ pattern: "^\\d{1,15}(?:\\.\\d{1,4})?$" });
export const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const ReconciliationBody = Type.Object({
  periodId: Type.Integer({ minimum: 1 }),
  bankAccountId: Type.Integer({ minimum: 1 }),
  statementOpeningBalance: money,
  statementClosingBalance: money,
  remark: Type.Optional(Type.String({ maxLength: 500 })),
});
export const ReconciliationUpdateBody = Type.Object({
  statementOpeningBalance: money,
  statementClosingBalance: money,
  remark: Type.Optional(Type.String({ maxLength: 500 })),
});
export const ReconciliationQuery = Type.Object({
  periodId: Type.Optional(Type.Integer({ minimum: 1 })),
  bankAccountId: Type.Optional(Type.Integer({ minimum: 1 })),
  status: Type.Optional(Type.Integer({ minimum: 0, maximum: 1 })),
});
export const PreviousClosingQuery = Type.Object({
  periodId: Type.Integer({ minimum: 1 }),
  bankAccountId: Type.Integer({ minimum: 1 }),
});
export const MatchBody = Type.Object({
  bankTransactionId: Type.Integer({ minimum: 1 }),
  voucherEntryId: Type.Integer({ minimum: 1 }),
  matchedAmount: positiveMoney,
});
export const DirectionBody = Type.Object({
  direction: Type.Union([Type.Literal("INFLOW"), Type.Literal("OUTFLOW")]),
});
export const ReasonBody = Type.Object({ reason: Type.String({ minLength: 1, maxLength: 500 }) });
