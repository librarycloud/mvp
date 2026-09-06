import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { ACCOUNTING_PERIOD_STATUS } from "../../common/status-codes.js";
import type {
  AccountingPeriodActor,
  AccountingPeriodFilter,
  AccountingPeriodRecord,
  AccountingPeriodRepository,
} from "./accounting-period.types.js";

export class PrismaAccountingPeriodRepository implements AccountingPeriodRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: { year: number; month: number; periodCode: string; startDate: Date; endDate: Date }) {
    return this.prisma.$transaction(async (tx) => {
      const overlap = await tx.accountingPeriod.findFirst({
        where: { deletedAt: null, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } },
        select: { id: true },
      });
      if (overlap) throw new AppError("ACCOUNTING_PERIOD_OVERLAP", "会计期间日期范围与其他期间重叠", 409);
      return tx.accountingPeriod.create({ data: input, include: this.periodInclude() });
    });
  }

  list(filter: AccountingPeriodFilter) {
    return this.prisma.accountingPeriod.findMany({
      where: { deletedAt: null, ...(filter.year ? { year: filter.year } : {}), ...(filter.status !== undefined ? { status: filter.status } : {}) },
      include: this.periodInclude(),
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
  }

  async findById(id: number): Promise<AccountingPeriodRecord | null> {
    return this.prisma.accountingPeriod.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, year: true, month: true, periodCode: true, startDate: true, endDate: true, status: true, closedAt: true, closedById: true },
    });
  }

  async findByPostingDate(date: Date): Promise<AccountingPeriodRecord | null> {
    return this.prisma.accountingPeriod.findFirst({
      where: { deletedAt: null, startDate: { lte: date }, endDate: { gte: date } },
      orderBy: { startDate: "asc" },
      select: { id: true, year: true, month: true, periodCode: true, startDate: true, endDate: true, status: true, closedAt: true, closedById: true },
    });
  }

  async close(id: number, actor: AccountingPeriodActor) {
    return this.changeState(id, actor, ACCOUNTING_PERIOD_STATUS.OPEN, ACCOUNTING_PERIOD_STATUS.CLOSED);
  }

  async reopen(id: number, actor: AccountingPeriodActor) {
    return this.changeState(id, actor, ACCOUNTING_PERIOD_STATUS.CLOSED, ACCOUNTING_PERIOD_STATUS.OPEN);
  }

  async update(id: number, input: { year: number; month: number; periodCode: string; startDate: Date; endDate: Date }, actor: AccountingPeriodActor) {
    return this.prisma.$transaction(async (tx) => {
      const overlap = await tx.accountingPeriod.findFirst({ where: { id: { not: id }, deletedAt: null, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } }, select: { id: true } });
      if (overlap) throw new AppError("ACCOUNTING_PERIOD_OVERLAP", "会计期间日期范围与其他期间重叠", 409);
      const changed = await tx.accountingPeriod.updateMany({ where: { id, status: ACCOUNTING_PERIOD_STATUS.OPEN, deletedAt: null }, data: input });
      if (changed.count !== 1) throw new AppError("ACCOUNTING_PERIOD_STATE_CONFLICT", "会计期间状态已发生变化", 409);
      await tx.auditLog.create({ data: this.audit(id, actor, "会计期间修改") });
      return tx.accountingPeriod.findUniqueOrThrow({ where: { id }, include: this.periodInclude() });
    });
  }

  async findSubsequentClosed(year: number, month: number): Promise<AccountingPeriodRecord | null> {
    return this.prisma.accountingPeriod.findFirst({
      where: {
        deletedAt: null,
        status: { in: [ACCOUNTING_PERIOD_STATUS.CLOSED, ACCOUNTING_PERIOD_STATUS.LOCKED] },
        OR: [
          { year: { gt: year } },
          { year, month: { gt: month } },
        ],
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: { id: true, year: true, month: true, periodCode: true, startDate: true, endDate: true, status: true, closedAt: true, closedById: true },
    });
  }

  async findPriorOpen(year: number, month: number): Promise<AccountingPeriodRecord | null> {
    return this.prisma.accountingPeriod.findFirst({
      where: {
        deletedAt: null,
        status: ACCOUNTING_PERIOD_STATUS.OPEN,
        OR: [
          { year: { lt: year } },
          { year, month: { lt: month } },
        ],
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: { id: true, year: true, month: true, periodCode: true, startDate: true, endDate: true, status: true, closedAt: true, closedById: true },
    });
  }

  private async changeState(id: number, actor: AccountingPeriodActor, from: number, to: number) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.accountingPeriod.updateMany({
        where: { id, status: from, deletedAt: null },
        data: to === ACCOUNTING_PERIOD_STATUS.CLOSED ? { status: to, closedAt: now, closedById: actor.actorId } : { status: to, closedAt: null, closedById: null },
      });
      if (changed.count !== 1) throw new AppError("ACCOUNTING_PERIOD_STATE_CONFLICT", "会计期间状态已发生变化", 409);
      await tx.auditLog.create({ data: this.audit(id, actor, to === ACCOUNTING_PERIOD_STATUS.CLOSED ? "会计期间关账" : "会计期间反关账") });
      return tx.accountingPeriod.findUniqueOrThrow({ where: { id }, include: this.periodInclude() });
    });
  }

  private periodInclude() {
    return { closedBy: { select: { id: true, username: true, displayName: true } } };
  }

  private audit(id: number, actor: AccountingPeriodActor, description: string): Prisma.AuditLogUncheckedCreateInput {
    return { actorId: actor.actorId, action: "UPDATE", resourceType: "AccountingPeriod", resourceId: id, description, ipAddress: actor.ipAddress ?? null, userAgent: actor.userAgent ?? null, requestId: actor.requestId ?? null };
  }
}
