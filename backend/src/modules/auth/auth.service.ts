import { createHash } from "node:crypto";
import { unauthorized } from "../../common/errors/app-error.js";
import type { AuthRepository, NewRefreshSession } from "./auth.repository.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { TokenService } from "./token-service.js";
import type {
  AuthUserRecord,
  AuthUserView,
  IssuedTokenPair,
  RequestContext,
  TokenPair,
} from "./auth.types.js";
import { USER_STATUS } from "../../common/status-codes.js";

const DUMMY_PASSWORD_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6Ttx7YwST8V6QnZJZQj0hR1HfK5bW";

export interface LoginInput {
  username: string;
  password: string;
}

export interface AuthResult extends TokenPair {
  tokenType: "Bearer";
  user: AuthUserView;
  idleTimeoutMinutes: number;
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
  ) {}

  async login(input: LoginInput, context: RequestContext): Promise<AuthResult> {
    const username = input.username.trim();
    const user = await this.repository.findUserByUsername(username);
    const passwordMatches = await this.passwordHasher.compare(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches || user.status !== USER_STATUS.ACTIVE) {
      await this.repository.recordLogin(user?.id ?? null, false, context);
      throw unauthorized("用户名或密码错误");
    }

    const tokens = this.tokenService.issue(user);
    await this.repository.createRefreshSession(this.toSession(tokens, user.id));
    await this.repository.recordLogin(user.id, true, context);
    return this.toResult(tokens, user, await this.repository.getIdleTimeoutMinutes());
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const claims = this.tokenService.verifyRefresh(refreshToken);
    const session = await this.repository.findRefreshSession(this.hashToken(refreshToken));
    const idleTimeoutMinutes = await this.repository.getIdleTimeoutMinutes();
    const invalid =
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      session.tokenId !== claims.jti ||
      session.user.id !== claims.sub ||
      session.user.status !== USER_STATUS.ACTIVE ||
      session.lastActivityAt.getTime() + idleTimeoutMinutes * 60_000 <= Date.now();
    if (invalid) throw unauthorized("刷新令牌无效或已撤销");

    const tokens = this.tokenService.issue(session.user);
    await this.repository.rotateRefreshSession(session.id, this.toSession(tokens, session.user.id));
    return this.toResult(tokens, session.user, idleTimeoutMinutes);
  }

  async logout(refreshToken: string): Promise<void> {
    this.tokenService.verifyRefresh(refreshToken);
    await this.repository.revokeRefreshSession(this.hashToken(refreshToken));
  }

  async getCurrentUser(userId: number): Promise<AuthUserView> {
    const user = await this.repository.findUserById(userId);
    if (!user || user.status !== USER_STATUS.ACTIVE) throw unauthorized();
    return this.toUserView(user);
  }

  private toSession(tokens: IssuedTokenPair, userId: number): NewRefreshSession {
    return {
      tokenId: tokens.refreshTokenId,
      userId,
      tokenHash: this.hashToken(tokens.refreshToken),
      expiresAt: tokens.refreshTokenExpiresAt,
      lastActivityAt: new Date(),
    };
  }

  private toResult(tokens: IssuedTokenPair, user: AuthUserRecord, idleTimeoutMinutes: number): AuthResult {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      tokenType: "Bearer",
      user: this.toUserView(user),
      idleTimeoutMinutes,
    };
  }

  private toUserView(user: AuthUserRecord): AuthUserView {
    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
