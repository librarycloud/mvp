import { Static, Type } from "@sinclair/typebox";

export const AccountCategorySchema = Type.Union([
  Type.Literal("ASSET"),
  Type.Literal("LIABILITY"),
  Type.Literal("COMMON"),
  Type.Literal("EQUITY"),
  Type.Literal("COST"),
  Type.Literal("PROFIT_AND_LOSS"),
]);
export const BalanceDirectionSchema = Type.Union([Type.Literal("DEBIT"), Type.Literal("CREDIT")]);
const accountCode = Type.String({ pattern: "^[0-9]{4,20}$" });
const nullableId = Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]);

export const CreateAccountBodySchema = Type.Object(
  {
    code: accountCode,
    name: Type.String({ minLength: 1, maxLength: 200 }),
    category: AccountCategorySchema,
    normalDirection: BalanceDirectionSchema,
    parentId: Type.Optional(nullableId),
    cashFlowCode: Type.Optional(Type.Union([Type.String({ maxLength: 32 }), Type.Null()])),
    sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const UpdateAccountBodySchema = Type.Object(
  {
    code: Type.Optional(accountCode),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    category: Type.Optional(AccountCategorySchema),
    normalDirection: Type.Optional(BalanceDirectionSchema),
    parentId: Type.Optional(nullableId),
    isEnabled: Type.Optional(Type.Boolean()),
    cashFlowCode: Type.Optional(Type.Union([Type.String({ maxLength: 32 }), Type.Null()])),
    sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false, minProperties: 1 },
);

export const AccountParamsSchema = Type.Object({ id: Type.Integer({ minimum: 1 }) });
export const AccountQuerySchema = Type.Object(
  {
    keyword: Type.Optional(Type.String({ maxLength: 200 })),
    category: Type.Optional(AccountCategorySchema),
    isEnabled: Type.Optional(Type.Boolean()),
    tree: Type.Optional(Type.Boolean({ default: true })),
  },
  { additionalProperties: false },
);

const AccountFields = {
  id: Type.Integer({ minimum: 1 }),
  code: Type.String(),
  name: Type.String(),
  category: AccountCategorySchema,
  normalDirection: BalanceDirectionSchema,
  parentId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  level: Type.Integer(),
  isLeaf: Type.Boolean(),
  isEnabled: Type.Boolean(),
  isSystem: Type.Boolean(),
  cashFlowCode: Type.Union([Type.String(), Type.Null()]),
  sortOrder: Type.Integer(),
  maintainedById: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
  deletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
};

export const AccountSchema = Type.Object(AccountFields);
export const AccountTreeSchema = Type.Recursive((This) =>
  Type.Object({ ...AccountFields, children: Type.Array(This) }),
);

export type CreateAccountBody = Static<typeof CreateAccountBodySchema>;
export type UpdateAccountBody = Static<typeof UpdateAccountBodySchema>;
export type AccountParams = Static<typeof AccountParamsSchema>;
export type AccountQuery = Static<typeof AccountQuerySchema>;
