import { Type } from "@sinclair/typebox";
export const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const PartyBody = Type.Object({ code: Type.String({ minLength: 1, maxLength: 64 }), name: Type.String({ minLength: 1, maxLength: 200 }), taxId: Type.Optional(Type.String({ maxLength: 64 })), contact: Type.Optional(Type.String({ maxLength: 100 })), phone: Type.Optional(Type.String({ maxLength: 50 })), address: Type.Optional(Type.String({ maxLength: 500 })), remark: Type.Optional(Type.String({ maxLength: 500 })), creditLimit: Type.Optional(Type.String({ pattern: "^\\d{1,15}(?:\\.\\d{1,4})?$" })), enabled: Type.Optional(Type.Boolean()) });
export const PartyUpdateBody = Type.Partial(PartyBody);
export const DocumentBody = Type.Object({ partyId: Type.Integer({ minimum: 1 }), documentNo: Type.String({ minLength: 1, maxLength: 64 }), occurrenceDate: Type.String({ format: "date" }), dueDate: Type.Optional(Type.String({ format: "date" })), amount: Type.String(), currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })), description: Type.Optional(Type.String({ maxLength: 500 })) });
export const SettlementBody = Type.Object({ amount: Type.String(), paymentDate: Type.String({ format: "date" }), bankAccountId: Type.Integer({ minimum: 1 }), settlementAccountId: Type.Integer({ minimum: 1 }), bankTransactionId: Type.Optional(Type.Integer({ minimum: 1 })), remark: Type.Optional(Type.String({ maxLength: 500 })) });
export const DocumentQuery = Type.Object({ partyId: Type.Optional(Type.Integer({ minimum: 1 })), status: Type.Optional(Type.String({ maxLength: 32 })) });
export const KeywordQuery = Type.Object({ keyword: Type.Optional(Type.String({ maxLength: 200 })) });
export const AgingQuery = Type.Object({ asOf: Type.Optional(Type.String({ format: "date" })) });
export const FollowUpBody = Type.Object({ customerId: Type.Optional(Type.Integer({ minimum: 1 })), supplierId: Type.Optional(Type.Integer({ minimum: 1 })), sourceType: Type.Optional(Type.String({ maxLength: 32 })), sourceId: Type.Optional(Type.Integer({ minimum: 1 })), scheduledDate: Type.String({ format: "date" }), content: Type.String({ minLength: 1, maxLength: 500 }), result: Type.Optional(Type.String({ maxLength: 500 })) }, { additionalProperties: false });
export const FollowUpQuery = Type.Object({ status: Type.Optional(Type.Integer({ minimum: 0, maximum: 1 })), due: Type.Optional(Type.Union([Type.Literal("today"), Type.Literal("overdue"), Type.Literal("all")])) });
export const StatementOfAccountQuery = Type.Object({
  partyId: Type.Integer({ minimum: 1 }),
  kind: Type.Union([Type.Literal("customer"), Type.Literal("supplier")]),
  startDate: Type.String({ format: "date" }),
  endDate: Type.String({ format: "date" }),
});
