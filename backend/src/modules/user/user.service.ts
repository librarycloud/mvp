import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { USER_ROLES } from "../../common/auth/authorization.js";
import type { PasswordHasher } from "../auth/password-hasher.js";
import type { AuthRole } from "../auth/auth.types.js";

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
  role: AuthRole;
}

export interface UpdateUserInput {
  displayName?: string;
  password?: string;
  role?: AuthRole;
  status?: number;
}

const SESSION_IDLE_SETTING = "SESSION_IDLE_TIMEOUT_MINUTES";

export class UserService {
  constructor(private readonly prisma: PrismaClient, private readonly passwordHasher: PasswordHasher) {}

  list = () => this.prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, username: true, displayName: true, role: true, status: true, lastLoginAt: true, createdAt: true },
    orderBy: [{ status: "asc" }, { username: "asc" }],
  });

  async create(input: CreateUserInput, actorId: number) {
    const username = input.username.trim();
    const displayName = input.displayName.trim();
    if (!username || !displayName || !USER_ROLES.includes(input.role)) throw new AppError("INVALID_USER", "用户信息不完整或角色无效", 400);
    const existing = await this.prisma.user.findFirst({ where: { username, deletedAt: null }, select: { id: true } });
    if (existing) throw new AppError("USERNAME_EXISTS", "用户名已存在", 409);
    const passwordHash = await this.passwordHasher.hash(input.password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { username, displayName, passwordHash, role: input.role } });
      await tx.auditLog.create({ data: { actorId, action: "CREATE", resourceType: "User", resourceId: user.id, description: `创建用户 ${username}`, afterData: { username, displayName, role: input.role } } });
      return { id: user.id, username: user.username, displayName: user.displayName, role: user.role, status: user.status, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt };
    });
  }

  async update(id: number, input: UpdateUserInput, actorId: number) {
    const current = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
    if (input.role !== undefined && !USER_ROLES.includes(input.role)) throw new AppError("INVALID_USER_ROLE", "角色无效", 400);
    if (input.status !== undefined && ![0, 1].includes(input.status)) throw new AppError("INVALID_USER_STATUS", "用户状态无效", 400);
    const removesLastAdmin = current.role === "ADMIN" && current.status === 0 && (input.role !== undefined && input.role !== "ADMIN" || input.status === 1);
    if (removesLastAdmin && await this.prisma.user.count({ where: { role: "ADMIN", status: 0, deletedAt: null } }) <= 1) {
      throw new AppError("LAST_ADMIN", "至少保留一个启用的系统管理员", 409);
    }
    const data: { displayName?: string; passwordHash?: string; role?: AuthRole; status?: number } = {};
    if (input.displayName !== undefined) {
      const displayName = input.displayName.trim();
      if (!displayName) throw new AppError("INVALID_USER", "姓名不能为空", 400);
      data.displayName = displayName;
    }
    if (input.password !== undefined) data.passwordHash = await this.passwordHasher.hash(input.password);
    if (input.role !== undefined) data.role = input.role;
    if (input.status !== undefined) data.status = input.status;
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "User", resourceId: id, description: `更新用户 ${current.username}`, beforeData: { displayName: current.displayName, role: current.role, status: current.status }, afterData: { displayName: updated.displayName, role: updated.role, status: updated.status } } });
      return updated;
    });
    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role, status: user.status, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt };
  }

  async getIdleTimeoutMinutes() {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: SESSION_IDLE_SETTING } });
    const value = Number(setting?.value ?? 30);
    return Number.isSafeInteger(value) && value >= 5 && value <= 480 ? value : 30;
  }

  async setIdleTimeoutMinutes(minutes: number, actorId: number) {
    if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 480) throw new AppError("INVALID_IDLE_TIMEOUT", "无操作退出时间必须在 5 到 480 分钟之间", 400);
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: SESSION_IDLE_SETTING }, create: { key: SESSION_IDLE_SETTING, value: String(minutes) }, update: { value: String(minutes) } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "SystemSetting", resourceId: null, description: "更新无操作退出时间", afterData: { idleTimeoutMinutes: minutes } } });
    });
    return { idleTimeoutMinutes: minutes };
  }
}
