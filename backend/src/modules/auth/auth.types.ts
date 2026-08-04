export type AuthRole = "ADMIN" | "FINANCE_MANAGER" | "ACCOUNTANT" | "CASHIER";
export type AuthUserStatus = number;

export interface AuthUserRecord {
  id: number;
  username: string;
  displayName: string;
  passwordHash: string;
  role: AuthRole;
  status: AuthUserStatus;
}

export interface AuthUserView {
  id: number;
  username: string;
  displayName: string;
  role: AuthRole;
}

export interface RefreshSessionRecord {
  id: number;
  tokenId: string;
  tokenHash: string;
  expiresAt: Date;
  lastActivityAt: Date;
  revokedAt: Date | null;
  user: AuthUserRecord;
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: Date;
}

export interface IssuedTokenPair extends TokenPair {
  refreshTokenId: string;
}

export interface RefreshClaims {
  sub: number;
  jti: string;
  role: AuthRole;
  type: "refresh";
}
