import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  AuthUserRecord,
  RefreshSessionRecord,
  RequestContext,
} from "./auth.types.js";

export interface NewRefreshSession {
  tokenId: string;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  lastActivityAt: Date;
}

export interface AuthRepository {
  findUserByUsername(username: string): Promise<AuthUserRecord | null>;
  findUserById(id: number): Promise<AuthUserRecord | null>;
  findRefreshSession(tokenHash: string): Promise<RefreshSessionRecord | null>;
  createRefreshSession(session: NewRefreshSession): Promise<void>;
  rotateRefreshSession(currentId: number, next: NewRefreshSession): Promise<void>;
  revokeRefreshSession(tokenHash: string): Promise<void>;
  getIdleTimeoutMinutes(): Promise<number>;
  recordLogin(userId: number | null, succeeded: boolean, context: RequestContext): Promise<void>;
}

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  passwordHash: true,
  role: true,
  status: true,
} as const;

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findUserByUsername(username: string) {
    return this.prisma.user.findFirst({ where: { username, deletedAt: null }, select: userSelect });
  }

  findUserById(id: number) {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
  }

  findRefreshSession(tokenHash: string) {
    return this.prisma.refreshToken.findFirst({
      where: { tokenHash, deletedAt: null },
      select: { id: true, tokenId: true, tokenHash: true, expiresAt: true, lastActivityAt: true, revokedAt: true, user: { select: userSelect } },
    });
  }

  async createRefreshSession(session: NewRefreshSession): Promise<void> {
    await this.prisma.refreshToken.create({ data: session });
  }

  async rotateRefreshSession(currentId: number, next: NewRefreshSession): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({ where: { id: currentId }, data: { revokedAt: new Date() } }),
      this.prisma.refreshToken.create({ data: next }),
    ]);
  }

  async revokeRefreshSession(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, deletedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getIdleTimeoutMinutes(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: "SESSION_IDLE_TIMEOUT_MINUTES" } });
    const minutes = Number(setting?.value ?? 30);
    return Number.isSafeInteger(minutes) && minutes >= 5 && minutes <= 480 ? minutes : 30;
  }

  async recordLogin(userId: number | null, succeeded: boolean, context: RequestContext): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      ...(succeeded && userId
        ? [this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: now } })]
        : []),
      this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: "LOGIN",
          resourceType: "User",
          resourceId: userId,
          description: succeeded ? "登录成功" : "登录失败",
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          requestId: context.requestId ?? null,
        },
      }),
    ]);
  }
}
