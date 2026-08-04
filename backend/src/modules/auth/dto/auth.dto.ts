import { Static, Type } from "@sinclair/typebox";

export const LoginBodySchema = Type.Object(
  {
    username: Type.String({ minLength: 1, maxLength: 64 }),
    password: Type.String({ minLength: 8, maxLength: 128 }),
  },
  { additionalProperties: false },
);

export const RefreshBodySchema = Type.Object(
  { refreshToken: Type.String({ minLength: 20, maxLength: 4096 }) },
  { additionalProperties: false },
);

export const AuthUserSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  username: Type.String(),
  displayName: Type.String(),
  role: Type.Union([Type.Literal("ADMIN"), Type.Literal("FINANCE_MANAGER"), Type.Literal("ACCOUNTANT"), Type.Literal("CASHIER")]),
});

export const AuthResultSchema = Type.Object({
  accessToken: Type.String(),
  refreshToken: Type.String(),
  accessTokenExpiresIn: Type.Integer(),
  refreshTokenExpiresAt: Type.String({ format: "date-time" }),
  tokenType: Type.Literal("Bearer"),
  idleTimeoutMinutes: Type.Integer({ minimum: 5, maximum: 480 }),
  user: AuthUserSchema,
});

export type LoginBody = Static<typeof LoginBodySchema>;
export type RefreshBody = Static<typeof RefreshBodySchema>;
