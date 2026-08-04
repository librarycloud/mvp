import { Static, Type } from "@sinclair/typebox";

export const AccountingPeriodCreateBodySchema = Type.Object({
  year: Type.Integer({ minimum: 2000, maximum: 9999 }),
  month: Type.Integer({ minimum: 1, maximum: 12 }),
}, { additionalProperties: false });
export const AccountingPeriodParamsSchema = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const AccountingPeriodQuerySchema = Type.Object({
  year: Type.Optional(Type.Integer({ minimum: 2000, maximum: 9999 })),
  status: Type.Optional(Type.Integer({ minimum: 0, maximum: 2 })),
}, { additionalProperties: false });

const AccountingPeriodFields = {
  id: Type.Integer({ minimum: 1 }), year: Type.Integer(), month: Type.Integer(), periodCode: Type.String(),
  startDate: Type.String({ format: "date-time" }), endDate: Type.String({ format: "date-time" }),
  status: Type.Integer({ minimum: 0, maximum: 2 }),
  closedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  closedById: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }), updatedAt: Type.String({ format: "date-time" }),
};
export const AccountingPeriodSchema = Type.Object({
  ...AccountingPeriodFields,
  closedBy: Type.Union([Type.Object({ id: Type.Integer({ minimum: 1 }), username: Type.String(), displayName: Type.String() }), Type.Null()]),
});
export const AccountingPeriodUpdateBodySchema = Type.Object({
  year: Type.Optional(Type.Integer({ minimum: 2000, maximum: 9999 })),
  month: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
  startDate: Type.Optional(Type.String({ format: "date" })),
  endDate: Type.Optional(Type.String({ format: "date" })),
}, { additionalProperties: false });

export type AccountingPeriodCreateBody = Static<typeof AccountingPeriodCreateBodySchema>;
export type AccountingPeriodUpdateBody = Static<typeof AccountingPeriodUpdateBodySchema>;
export type AccountingPeriodParams = Static<typeof AccountingPeriodParamsSchema>;
export type AccountingPeriodQuery = Static<typeof AccountingPeriodQuerySchema>;
