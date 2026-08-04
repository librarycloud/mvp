import { Static, Type } from "@sinclair/typebox";

export const TaxPeriodQuerySchema = Type.Object({
  periodType: Type.Union([Type.Literal("MONTH"), Type.Literal("QUARTER"), Type.Literal("YEAR")]),
  fiscalYear: Type.Integer({ minimum: 2000, maximum: 9999 }),
  period: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
}, { additionalProperties: false });
export type TaxPeriodQuery = Static<typeof TaxPeriodQuerySchema>;
