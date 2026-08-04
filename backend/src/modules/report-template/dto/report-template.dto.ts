import { Static, Type } from "@sinclair/typebox";

const reportType = Type.Union([
  Type.Literal("BALANCE_SHEET"),
  Type.Literal("INCOME_STATEMENT"),
  Type.Literal("CASH_FLOW_STATEMENT"),
  Type.Literal("EQUITY_CHANGE_STATEMENT"),
  Type.Literal("CUSTOM"),
]);
const operator = Type.Union([Type.Literal("ADD"), Type.Literal("SUBTRACT")]);
const direction = Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT")]);
const valueType = Type.Union([
  Type.Literal("OPENING_BALANCE"), Type.Literal("CLOSING_BALANCE"),
  Type.Literal("PERIOD_DEBIT"), Type.Literal("PERIOD_CREDIT"), Type.Literal("PERIOD_NET"),
  Type.Literal("YEAR_TO_DATE_DEBIT"), Type.Literal("YEAR_TO_DATE_CREDIT"), Type.Literal("YEAR_TO_DATE_NET"),
  Type.Literal("CASH_INFLOW"), Type.Literal("CASH_OUTFLOW"),
]);

const mapping = Type.Object({
  accountId: Type.Integer({ minimum: 1 }),
  operator,
  valueType,
  direction: Type.Optional(Type.Union([direction, Type.Null()])),
  includeChildren: Type.Boolean({ default: true }),
}, { additionalProperties: false });
const dependency = Type.Object({
  sourceItemCode: Type.String({ minLength: 1, maxLength: 64 }),
  operator,
  coefficient: Type.String({ pattern: "^-?\\d{1,15}(?:\\.\\d{1,6})?$" }),
}, { additionalProperties: false });
const item = Type.Object({
  itemCode: Type.String({ minLength: 1, maxLength: 64 }),
  name: Type.String({ minLength: 1, maxLength: 200 }),
  lineNumber: Type.Optional(Type.Union([Type.Integer({ minimum: 1, maximum: 9999 }), Type.Null()])),
  sortOrder: Type.Integer({ minimum: 1 }),
  normalDirection: Type.Optional(Type.Union([direction, Type.Null()])),
  valueType: Type.Optional(Type.Union([valueType, Type.Null()])),
  isSubtotal: Type.Boolean({ default: false }),
  displayLevel: Type.Integer({ minimum: 1, maximum: 9, default: 1 }),
  mappings: Type.Array(mapping, { maxItems: 100 }),
  dependencies: Type.Array(dependency, { maxItems: 100 }),
}, { additionalProperties: false });

export const TemplateConfigBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
  items: Type.Array(item, { minItems: 1, maxItems: 500 }),
}, { additionalProperties: false });
export const CreateTemplateBodySchema = Type.Object({
  code: Type.String({ pattern: "^[A-Z][A-Z0-9_]{2,63}$" }),
  type: reportType,
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
  items: Type.Array(item, { minItems: 1, maxItems: 500 }),
}, { additionalProperties: false });
export const TemplateIdParamsSchema = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const TemplateListQuerySchema = Type.Object({ code: Type.Optional(Type.String({ maxLength: 64 })) }, { additionalProperties: false });

export type TemplateConfigBody = Static<typeof TemplateConfigBodySchema>;
export type CreateTemplateBody = Static<typeof CreateTemplateBodySchema>;
export type TemplateIdParams = Static<typeof TemplateIdParamsSchema>;
