import { Static, Type } from "@sinclair/typebox";

export const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const MemberIdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const DimensionBody = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 64 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  enabled: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
export const DimensionUpdateBody = Type.Partial(DimensionBody);
export const MemberBody = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 64 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  enabled: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
export const MemberUpdateBody = Type.Partial(MemberBody);
export const RuleBody = Type.Object({
  accountId: Type.Integer({ minimum: 1 }),
  dimensionId: Type.Integer({ minimum: 1 }),
  required: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
export const RuleIdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

export type IdParams = Static<typeof IdParams>;
export type MemberIdParams = Static<typeof MemberIdParams>;
export type DimensionBody = Static<typeof DimensionBody>;
export type DimensionUpdateBody = Static<typeof DimensionUpdateBody>;
export type MemberBody = Static<typeof MemberBody>;
export type MemberUpdateBody = Static<typeof MemberUpdateBody>;
export type RuleBody = Static<typeof RuleBody>;
