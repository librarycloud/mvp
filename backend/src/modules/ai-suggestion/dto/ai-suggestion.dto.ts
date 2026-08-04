import { Static, Type } from "@sinclair/typebox";

export const AiSuggestionParamsSchema = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const CreateAiSuggestionBodySchema = Type.Object(
  {
    bankTransactionId: Type.Optional(Type.Integer({ minimum: 1 })),
    invoiceId: Type.Optional(Type.Integer({ minimum: 1 })),
    summary: Type.Optional(Type.String({ maxLength: 500 })),
  },
  { additionalProperties: false, minProperties: 1 },
);

export const SuggestedEntrySchema = Type.Object({
  direction: Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT")]),
  accountCode: Type.String(),
  rationale: Type.String(),
});
export const VoucherSuggestionOutputSchema = Type.Object({
  summary: Type.String(),
  entries: Type.Array(SuggestedEntrySchema),
});
export const AiSuggestionSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  bankTransactionId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  invoiceId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  voucherId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  requestedById: Type.Integer({ minimum: 1 }),
  status: Type.Integer({ minimum: 0, maximum: 4 }),
  model: Type.String(),
  inputSnapshot: Type.Any(),
  suggestion: Type.Union([VoucherSuggestionOutputSchema, Type.Null()]),
  errorMessage: Type.Union([Type.String(), Type.Null()]),
  acceptedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
  deletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});

export type AiSuggestionParams = Static<typeof AiSuggestionParamsSchema>;
export type CreateAiSuggestionBody = Static<typeof CreateAiSuggestionBodySchema>;
