import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { canManageAccounting } from "../../common/auth/authorization.js";
import type { DimensionActor, DimensionInput, DimensionMemberInput, DimensionRuleInput } from "./dimension.types.js";

const dimensionInclude = {
  members: { where: { deletedAt: null }, orderBy: { code: "asc" as const } },
  accountRules: { include: { account: { select: { id: true, code: true, name: true } } }, orderBy: { accountId: "asc" as const } },
};

export class DimensionService {
  constructor(private readonly prisma: PrismaClient) {}

  list() {
    return this.prisma.accountingDimension.findMany({ where: { deletedAt: null }, include: dimensionInclude, orderBy: { code: "asc" } });
  }

  async create(input: DimensionInput, actor: DimensionActor) {
    this.assertManager(actor);
    const data = this.dimensionData(input);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.accountingDimension.create({ data });
      await this.audit(tx, actor, "CREATE", "AccountingDimension", row.id, null, { code: row.code, name: row.name });
      return tx.accountingDimension.findUniqueOrThrow({ where: { id: row.id }, include: dimensionInclude });
    });
  }

  async update(id: number, input: Partial<DimensionInput>, actor: DimensionActor) {
    this.assertManager(actor);
    const current = await this.requireDimension(id);
    const data = this.dimensionData({ code: input.code ?? current.code, name: input.name ?? current.name, enabled: input.enabled ?? current.enabled });
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.accountingDimension.update({ where: { id }, data });
      await this.audit(tx, actor, "UPDATE", "AccountingDimension", id, { code: current.code, name: current.name, enabled: current.enabled }, { code: row.code, name: row.name, enabled: row.enabled });
      return tx.accountingDimension.findUniqueOrThrow({ where: { id }, include: dimensionInclude });
    });
  }

  async createMember(dimensionId: number, input: DimensionMemberInput, actor: DimensionActor) {
    this.assertManager(actor);
    await this.requireDimension(dimensionId);
    const data = this.memberData(input);
    return this.prisma.$transaction(async tx => {
      const row = await tx.accountingDimensionMember.create({ data: { ...data, dimensionId } });
      await this.audit(tx, actor, "CREATE", "AccountingDimensionMember", row.id, null, { dimensionId, code: row.code, name: row.name, enabled: row.enabled });
      return row;
    });
  }

  async updateMember(id: number, input: Partial<DimensionMemberInput>, actor: DimensionActor) {
    this.assertManager(actor);
    const current = await this.prisma.accountingDimensionMember.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppError("DIMENSION_MEMBER_NOT_FOUND", "辅助核算成员不存在", 404);
    const data = this.memberData({ code: input.code ?? current.code, name: input.name ?? current.name, enabled: input.enabled ?? current.enabled });
    return this.prisma.$transaction(async tx => {
      const row = await tx.accountingDimensionMember.update({ where: { id }, data });
      await this.audit(tx, actor, "UPDATE", "AccountingDimensionMember", id, { code: current.code, name: current.name, enabled: current.enabled }, { code: row.code, name: row.name, enabled: row.enabled });
      return row;
    });
  }

  async deleteMember(id: number, actor: DimensionActor) {
    this.assertManager(actor);
    const current = await this.prisma.accountingDimensionMember.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppError("DIMENSION_MEMBER_NOT_FOUND", "辅助核算成员不存在", 404);
    return this.prisma.$transaction(async tx => {
      const used = await tx.voucherEntryDimension.count({ where: { dimensionMemberId: id } });
      if (used) throw new AppError("DIMENSION_MEMBER_IN_USE", "已用于凭证的辅助核算成员不能删除，请先停用", 409);
      const row = await tx.accountingDimensionMember.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } });
      await this.audit(tx, actor, "DELETE", "AccountingDimensionMember", id, { code: current.code, name: current.name, enabled: current.enabled }, { deleted: true });
      return row;
    });
  }

  async upsertRule(input: DimensionRuleInput, actor: DimensionActor) {
    this.assertManager(actor);
    await this.requireDimension(input.dimensionId);
    const account = await this.prisma.account.findFirst({ where: { id: input.accountId, deletedAt: null, isLeaf: true } });
    if (!account) throw new AppError("ACCOUNT_NOT_FOUND", "会计科目不存在或不是末级科目", 404);
    return this.prisma.$transaction(async tx => {
      const before = await tx.accountDimensionRule.findUnique({ where: { accountId_dimensionId: { accountId: input.accountId, dimensionId: input.dimensionId } } });
      const row = await tx.accountDimensionRule.upsert({
        where: { accountId_dimensionId: { accountId: input.accountId, dimensionId: input.dimensionId } },
        create: { accountId: input.accountId, dimensionId: input.dimensionId, required: input.required ?? true },
        update: { required: input.required ?? true },
        include: { account: { select: { id: true, code: true, name: true } }, dimension: { select: { id: true, code: true, name: true } } },
      });
      await this.audit(tx, actor, before ? "UPDATE" : "CREATE", "AccountDimensionRule", row.id, before ? { required: before.required } : null, { accountId: row.accountId, dimensionId: row.dimensionId, required: row.required });
      return row;
    });
  }

  async deleteRule(id: number, actor: DimensionActor) {
    this.assertManager(actor);
    const current = await this.prisma.accountDimensionRule.findUnique({ where: { id } });
    if (!current) throw new AppError("DIMENSION_RULE_NOT_FOUND", "科目辅助核算规则不存在", 404);
    return this.prisma.$transaction(async tx => {
      const row = await tx.accountDimensionRule.delete({ where: { id } });
      await this.audit(tx, actor, "DELETE", "AccountDimensionRule", id, { accountId: current.accountId, dimensionId: current.dimensionId, required: current.required }, { deleted: true });
      return row;
    });
  }

  private async requireDimension(id: number) {
    const row = await this.prisma.accountingDimension.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new AppError("DIMENSION_NOT_FOUND", "辅助核算维度不存在", 404);
    return row;
  }

  private dimensionData(input: DimensionInput) {
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) throw new AppError("INVALID_DIMENSION", "维度编码和名称不能为空", 400);
    return { code, name, enabled: input.enabled ?? true };
  }

  private memberData(input: DimensionMemberInput) {
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) throw new AppError("INVALID_DIMENSION_MEMBER", "成员编码和名称不能为空", 400);
    return { code, name, enabled: input.enabled ?? true };
  }

  private assertManager(actor: DimensionActor) {
    if (!canManageAccounting(actor.role)) throw new AppError("FORBIDDEN", "仅管理员或财务主管可以维护辅助核算", 403);
  }

  private audit(tx: Prisma.TransactionClient, actor: DimensionActor, action: "CREATE" | "UPDATE" | "DELETE", resourceType: string, resourceId: number, beforeData: object | null, afterData: object) {
    return tx.auditLog.create({ data: { actorId: actor.actorId, action, resourceType, resourceId, beforeData: beforeData === null ? Prisma.JsonNull : beforeData as Prisma.InputJsonObject, afterData: afterData as Prisma.InputJsonObject } });
  }
}
