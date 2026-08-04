import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type {
  AccountCategoryValue,
  AccountListFilter,
  AccountMutationContext,
  AccountRecord,
  BalanceDirectionValue,
} from "./account.types.js";

export interface CreateAccountData {
  code: string;
  name: string;
  category: AccountCategoryValue;
  normalDirection: BalanceDirectionValue;
  parentId: number | null;
  level: number;
  cashFlowCode: string | null;
  sortOrder: number;
  maintainedById: number;
}

export interface UpdateAccountData {
  code?: string;
  name?: string;
  category?: AccountCategoryValue;
  normalDirection?: BalanceDirectionValue;
  parentId?: number | null;
  level?: number;
  isEnabled?: boolean;
  cashFlowCode?: string | null;
  sortOrder?: number;
  maintainedById: number;
}

export interface AccountRepository {
  list(filter: AccountListFilter): Promise<AccountRecord[]>;
  findById(id: number): Promise<AccountRecord | null>;
  findByCode(code: string): Promise<AccountRecord | null>;
  countChildren(id: number): Promise<number>;
  countVoucherEntries(id: number): Promise<number>;
  create(data: CreateAccountData, context: AccountMutationContext): Promise<AccountRecord>;
  update(
    current: AccountRecord,
    data: UpdateAccountData,
    context: AccountMutationContext,
  ): Promise<AccountRecord>;
  softDelete(current: AccountRecord, context: AccountMutationContext): Promise<void>;
}

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(filter: AccountListFilter) {
    return this.prisma.account.findMany({
      where: {
        deletedAt: null,
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.isEnabled === undefined ? {} : { isEnabled: filter.isEnabled }),
        ...(filter.keyword
          ? { OR: [{ code: { contains: filter.keyword } }, { name: { contains: filter.keyword } }] }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
  }

  findById(id: number) {
    return this.prisma.account.findFirst({ where: { id, deletedAt: null } });
  }

  findByCode(code: string) {
    return this.prisma.account.findUnique({ where: { code } });
  }

  countChildren(id: number) {
    return this.prisma.account.count({ where: { parentId: id, deletedAt: null } });
  }

  countVoucherEntries(id: number) {
    return this.prisma.voucherEntry.count({ where: { accountId: id, deletedAt: null } });
  }

  create(data: CreateAccountData, context: AccountMutationContext) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({ data });
      if (data.parentId) {
        await tx.account.update({ where: { id: data.parentId }, data: { isLeaf: false } });
      }
      await tx.auditLog.create({
        data: this.auditData("CREATE", account.id, null, account, context),
      });
      return account;
    });
  }

  update(current: AccountRecord, data: UpdateAccountData, context: AccountMutationContext) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.update({ where: { id: current.id }, data });
      if (data.parentId && data.parentId !== current.parentId) {
        await tx.account.update({ where: { id: data.parentId }, data: { isLeaf: false } });
      }
      if (current.parentId && data.parentId !== undefined && data.parentId !== current.parentId) {
        const siblings = await tx.account.count({
          where: { parentId: current.parentId, deletedAt: null, id: { not: current.id } },
        });
        if (siblings === 0) {
          await tx.account.update({ where: { id: current.parentId }, data: { isLeaf: true } });
        }
      }
      await tx.auditLog.create({
        data: this.auditData("UPDATE", account.id, current, account, context),
      });
      return account;
    });
  }

  async softDelete(current: AccountRecord, context: AccountMutationContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.account.update({
        where: { id: current.id },
        data: { deletedAt, isEnabled: false, maintainedById: context.actorId },
      });
      if (current.parentId) {
        const siblings = await tx.account.count({
          where: { parentId: current.parentId, deletedAt: null, id: { not: current.id } },
        });
        if (siblings === 0) {
          await tx.account.update({ where: { id: current.parentId }, data: { isLeaf: true } });
        }
      }
      await tx.auditLog.create({
        data: this.auditData("DELETE", current.id, current, null, context),
      });
    });
  }

  private auditData(
    action: "CREATE" | "UPDATE" | "DELETE",
    id: number,
    before: AccountRecord | null,
    after: AccountRecord | null,
    context: AccountMutationContext,
  ): Prisma.AuditLogUncheckedCreateInput {
    const snapshot = (account: AccountRecord | null) =>
      account ? { code: account.code, name: account.name, parentId: account.parentId } : undefined;
    return {
      actorId: context.actorId,
      action,
      resourceType: "Account",
      resourceId: id,
      beforeData: snapshot(before) ?? Prisma.JsonNull,
      afterData: snapshot(after) ?? Prisma.JsonNull,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      requestId: context.requestId ?? null,
    };
  }
}
