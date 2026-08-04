import { Static, Type } from "@sinclair/typebox";

export const IncomeStatementPeriodSchema = Type.Object(
  {
    periodType: Type.Union([Type.Literal("MONTH"), Type.Literal("QUARTER"), Type.Literal("YEAR")]),
    fiscalYear: Type.Integer({ minimum: 2000, maximum: 9999 }),
    period: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
  },
  { additionalProperties: false },
);
export const GenerateReportBodySchema = Type.Object(
  {
    ...IncomeStatementPeriodSchema.properties,
    templateCode: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);
export const ReportParamsSchema = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const ReportSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }), periodType: Type.Union([Type.Literal("MONTH"), Type.Literal("QUARTER"), Type.Literal("YEAR")]),
  fiscalYear: Type.Integer(), periodStart: Type.String({ format: "date-time" }), periodEnd: Type.String({ format: "date-time" }),
  status: Type.Integer({ minimum: 0, maximum: 1 }), generatedById: Type.Integer({ minimum: 1 }), generatedAt: Type.String({ format: "date-time" }),
  template: Type.Object({ code: Type.String(), name: Type.String(), type: Type.String(), version: Type.Integer() }),
  lines: Type.Array(Type.Object({
    id: Type.Integer({ minimum: 1 }), reportId: Type.Integer({ minimum: 1 }), reportItemId: Type.Integer({ minimum: 1 }), openingAmount: Type.Union([Type.String(), Type.Null()]),
    currentAmount: Type.Union([Type.String(), Type.Null()]), closingAmount: Type.Union([Type.String(), Type.Null()]),
    calculationTrace: Type.Union([Type.Any(), Type.Null()]),
    reportItem: Type.Object({ itemCode: Type.String(), name: Type.String(), lineNumber: Type.Union([Type.Integer(), Type.Null()]), sortOrder: Type.Integer() }),
  })),
});

export type IncomeStatementPeriod = Static<typeof IncomeStatementPeriodSchema>;
export type GenerateReportBody = Static<typeof GenerateReportBodySchema>;
export type ReportParams = Static<typeof ReportParamsSchema>;
