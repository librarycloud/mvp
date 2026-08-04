import { Static, Type } from "@sinclair/typebox";

const amount = Type.String({ pattern: "^\\d{1,15}(?:\\.\\d{1,4})?$" });
export const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const PlanQuery = Type.Object({ fiscalYear: Type.Optional(Type.Integer({ minimum: 2000, maximum: 9999 })) });
export const PlanBody = Type.Object({
  fiscalYear: Type.Integer({ minimum: 2000, maximum: 9999 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  status: Type.Optional(Type.Integer({ minimum: 0, maximum: 1 })),
  lines: Type.Optional(Type.Array(Type.Object({
    expenseType: Type.String({ minLength: 1, maxLength: 100 }),
    department: Type.Optional(Type.String({ maxLength: 100 })),
    amount,
  }, { additionalProperties: false }), { maxItems: 200 })),
}, { additionalProperties: false });
export const LineBody = Type.Object({
  expenseType: Type.String({ minLength: 1, maxLength: 100 }),
  department: Type.Optional(Type.String({ maxLength: 100 })),
  amount,
}, { additionalProperties: false });
export const LineUpdateBody = Type.Partial(LineBody);
export const PlanUpdateBody = Type.Partial(PlanBody);
export type IdParams = Static<typeof IdParams>;
export type PlanQuery = Static<typeof PlanQuery>;
export type PlanBody = Static<typeof PlanBody>;
export type LineBody = Static<typeof LineBody>;
export type LineUpdateBody = Static<typeof LineUpdateBody>;
export type PlanUpdateBody = Static<typeof PlanUpdateBody>;
