import { randomUUID } from "node:crypto";
import { createSigner, createVerifier } from "fast-jwt";
import { unauthorized } from "../../common/errors/app-error.js";
import type { AuthRole, AuthUserRecord, IssuedTokenPair, RefreshClaims } from "./auth.types.js";

export interface TokenService {
  issue(user: AuthUserRecord): IssuedTokenPair;
  verifyRefresh(token: string): RefreshClaims;
}

export interface JwtTokenOptions {
  secret: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

interface JwtClaims {
  sub: string;
  jti: string;
  role: AuthRole;
  type: "access" | "refresh";
}

export class JwtTokenService implements TokenService {
  private readonly signAccess;
  private readonly signRefresh;
  private readonly verify;

  constructor(private readonly options: JwtTokenOptions) {
    const common = { key: options.secret, iss: options.issuer, aud: options.audience };
    this.signAccess = createSigner({ ...common, expiresIn: options.accessTokenTtlSeconds * 1000 });
    this.signRefresh = createSigner({ ...common, expiresIn: options.refreshTokenTtlSeconds * 1000 });
    this.verify = createVerifier({
      key: options.secret,
      allowedIss: options.issuer,
      allowedAud: options.audience,
      cache: true,
    });
  }

  issue(user: AuthUserRecord): IssuedTokenPair {
    const accessTokenId = randomUUID();
    const refreshTokenId = randomUUID();
    const base = { sub: String(user.id), role: user.role };
    const accessToken = this.signAccess({ ...base, jti: accessTokenId, type: "access" });
    const refreshToken = this.signRefresh({ ...base, jti: refreshTokenId, type: "refresh" });

    return {
      accessToken,
      refreshToken,
      refreshTokenId,
      accessTokenExpiresIn: this.options.accessTokenTtlSeconds,
      refreshTokenExpiresAt: new Date(Date.now() + this.options.refreshTokenTtlSeconds * 1000),
    };
  }

  verifyRefresh(token: string): RefreshClaims {
    try {
      const claims = this.verify(token) as JwtClaims;
      const subject = Number(claims.sub);
      if (claims.type !== "refresh" || !Number.isSafeInteger(subject) || subject <= 0 || !claims.jti) throw new Error("Invalid claims");
      return { sub: subject, jti: claims.jti, role: claims.role, type: "refresh" };
    } catch {
      throw unauthorized("刷新令牌无效或已过期");
    }
  }
}
