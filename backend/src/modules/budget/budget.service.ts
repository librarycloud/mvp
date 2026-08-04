import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { canManageAccounting } from "../../common/auth/authorization.js";
import type { BudgetActor, BudgetLineInput, BudgetPlanInput, BudgetReservationInput } from "./budget.types.js";

const ZERO = new Prisma.Decimal(0);
const planInclude = { lines: { include: { reservations: { where: { status: { in: [0, 1] } }, select: { amount: true, status: true, warning: true } } }, orderBy: { expenseType: "asc" as const } } };

export class BudgetService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(fiscalYear?: number) {
    const plans = await this.prisma.budgetPlan.findMany({ where: { deletedAt: null, ...(fiscalYear ? { fiscalYear } : {}) }, include: planInclude, orderBy: [{ fiscalYear: "desc" }, { name: "asc" }] });
    return plans.map((plan) => ({ ...plan, lines: plan.lines.map((line) => this.lineSummary(line)) }));
  }

  async createPlan(input: BudgetPlanInput, actor: BudgetActor) {
    this.assertManager(actor);
    const name = input.name.trim();
    if (!name) throw new AppError("INVALID_BUDGET_PLAN", "预算计划名称不能为空", 400);
    return this.prisma.$transaction(async (tx) => {
      const status = input.status ?? 1;
      if (status === 1) await tx.budgetPlan.updateMany({ where: { activeFiscalYear: input.fiscalYear, deletedAt: null }, data: { status: 0, activeFiscalYear: null } });
      const plan = await tx.budgetPlan.create({ data: { fiscalYear: input.fiscalYear, activeFiscalYear: status === 1 ? input.fiscalYear : null, name, status } });
      for (const line of input.lines ?? []) await this.createLineTx(tx, plan.id, line);
      await this.audit(tx, actor, "CREATE", "BudgetPlan", plan.id, null, { fiscalYear: plan.fiscalYear, name: plan.name, status: plan.status });
      return tx.budgetPlan.findUniqueOrThrow({ where: { id: plan.id }, include: planInclude });
    });
  }

  async updatePlan(id: number, input: Partial<BudgetPlanInput>, actor: BudgetActor) {
    this.assertManager(actor);
    const current = await this.requirePlan(id);
    const name = input.name?.trim() || current.name;
    const fiscalYear = input.fiscalYear ?? current.fiscalYear;
    const status = input.status ?? current.status;
    return this.prisma.$transaction(async tx => {
      if (fiscalYear !== current.fiscalYear) {
        const commitments = await tx.budgetReservation.count({ where: { budgetLine: { planId: id }, status: { in: [0, 1] } } });
        if (commitments) throw new AppError("BUDGET_PLAN_YEAR_LOCKED", "已有占用或实际支出的预算计划不能修改年度", 409);
      }
      if (status === 1) await tx.budgetPlan.updateMany({ where: { activeFiscalYear: fiscalYear, id: { not: id }, deletedAt: null }, data: { status: 0, activeFiscalYear: null } });
      const row = await tx.budgetPlan.update({ where: { id }, data: { name, fiscalYear, status, activeFiscalYear: status === 1 ? fiscalYear : null }, include: planInclude });
      await this.audit(tx, actor, "UPDATE", "BudgetPlan", id, { fiscalYear: current.fiscalYear, name: current.name, status: current.status }, { fiscalYear, name, status });
      return row;
    });
  }

  async addLine(planId: number, input: BudgetLineInput, actor: BudgetActor) {
    this.assertManager(actor);
    await this.requirePlan(planId);
    return this.prisma.$transaction(async tx => {
      const row = await this.createLineTx(tx, planId, input);
      await this.audit(tx, actor, "CREATE", "BudgetLine", row.id, null, { planId, expenseType: row.expenseType, department: row.department, amount: row.amount.toString() });
      return row;
    });
  }

  async updateLine(id: number, input: Partial<BudgetLineInput>, actor: BudgetActor) {
    this.assertManager(actor);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM budget_lines WHERE id = ${id} FOR UPDATE`;
      const current = await tx.budgetLine.findUnique({ where: { id } });
      if (!current) throw new AppError("BUDGET_LINE_NOT_FOUND", "预算额度不存在", 404);
      const data = this.lineData({ expenseType: input.expenseType ?? current.expenseType, department: input.department ?? current.department, amount: input.amount ?? current.amount.toString() });
      const commitments = await tx.budgetReservation.aggregate({ where: { budgetLineId: id, status: { in: [0, 1] } }, _sum: { amount: true } });
      const committed = commitments._sum.amount ?? ZERO;
      if (data.amount.lessThan(committed)) throw new AppError("BUDGET_AMOUNT_BELOW_COMMITMENTS", "预算额度不能低于当前占用和已用金额", 409, { committed: committed.toString() });
      const row = await tx.budgetLine.update({ where: { id }, data, include: { reservations: true } });
      await this.audit(tx, actor, "UPDATE", "BudgetLine", id, { expenseType: current.expenseType, department: current.department, amount: current.amount.toString() }, { expenseType: row.expenseType, department: row.department, amount: row.amount.toString() });
      return row;
    });
  }

  async deleteLine(id: number, actor: BudgetActor) {
    this.assertManager(actor);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM budget_lines WHERE id = ${id} FOR UPDATE`;
      const current = await tx.budgetLine.findUnique({ where: { id }, include: { reservations: { where: { status: { in: [0, 1] } } } } });
      if (!current) throw new AppError("BUDGET_LINE_NOT_FOUND", "预算额度不存在", 404);
      if (current.reservations.length) throw new AppError("BUDGET_LINE_IN_USE", "已有报销占用的预算额度不能删除", 409);
      const row = await tx.budgetLine.delete({ where: { id } });
      await this.audit(tx, actor, "DELETE", "BudgetLine", id, { expenseType: current.expenseType, department: current.department, amount: current.amount.toString() }, { deleted: true });
      return row;
    });
  }

  async reserveForReimbursement(tx: Prisma.TransactionClient, input: BudgetReservationInput, simpleMode: boolean) {
    const existing = await tx.budgetReservation.findUnique({ where: { reimbursementId: input.id } });
    if (existing && existing.status === 1) throw new AppError("BUDGET_ALREADY_CONSUMED", "报销预算已转为实际支出，不能重新占用", 409);
    if (existing) await tx.budgetReservation.update({ where: { id: existing.id }, data: { status: 2 } });
    const amount = typeof input.amount === "string" ? new Prisma.Decimal(input.amount) : input.amount;
    const department = input.department?.trim() ?? "";
    const year = input.expenseDate.getUTCFullYear();
    const line = await tx.budgetLine.findFirst({ where: { plan: { activeFiscalYear: year, status: 1, deletedAt: null }, expenseType: input.expenseType.trim(), department: { in: [department, ""] } }, orderBy: { department: "desc" } });
    if (!line) {
      if (!simpleMode) throw new AppError("BUDGET_NOT_CONFIGURED", "当前年度未配置匹配的费用预算", 409);
      return { warning: true, configured: false, available: null, reservationId: null };
    }
    await tx.$queryRaw`SELECT id FROM budget_lines WHERE id = ${line.id} FOR UPDATE`;
    const totals = await tx.budgetReservation.aggregate({ where: { budgetLineId: line.id, status: { in: [0, 1] }, ...(existing ? { id: { not: existing.id } } : {}) }, _sum: { amount: true } });
    const used = totals._sum.amount ?? ZERO;
    const over = used.plus(amount).greaterThan(line.amount);
    if (over && !simpleMode) throw new AppError("BUDGET_EXCEEDED", "本次报销将超过预算额度", 409, { budgetAmount: line.amount.toString(), used: used.toString(), requested: amount.toString() });
    const reservation = existing
      ? await tx.budgetReservation.update({ where: { id: existing.id }, data: { budgetLineId: line.id, amount, status: 0, warning: over } })
      : await tx.budgetReservation.create({ data: { budgetLineId: line.id, reimbursementId: input.id, amount, status: 0, warning: over } });
    return { warning: over, configured: true, available: line.amount.minus(used).toString(), reservationId: reservation.id };
  }

  consume(tx: Prisma.TransactionClient, reimbursementId: number) {
    const model = (tx as Prisma.TransactionClient & { budgetReservation?: Prisma.TransactionClient["budgetReservation"] }).budgetReservation;
    return model ? model.updateMany({ where: { reimbursementId, status: 0 }, data: { status: 1 } }) : Promise.resolve({ count: 0 });
  }

  release(tx: Prisma.TransactionClient, reimbursementId: number) {
    const model = (tx as Prisma.TransactionClient & { budgetReservation?: Prisma.TransactionClient["budgetReservation"] }).budgetReservation;
    return model ? model.updateMany({ where: { reimbursementId, status: { in: [0, 1] } }, data: { status: 2 } }) : Promise.resolve({ count: 0 });
  }

  private async createLineTx(tx: Prisma.TransactionClient, planId: number, input: BudgetLineInput) {
    const data = this.lineData(input);
    return tx.budgetLine.create({ data: { ...data, planId } });
  }

  private lineData(input: BudgetLineInput) {
    const expenseType = input.expenseType.trim();
    const department = input.department?.trim() ?? "";
    const amount = new Prisma.Decimal(String(input.amount));
    if (!expenseType || amount.lessThanOrEqualTo(0)) throw new AppError("INVALID_BUDGET_LINE", "预算费用类型不能为空，额度必须大于零", 400);
    return { expenseType, department, amount };
  }

  private lineSummary(line: { amount: Prisma.Decimal; reservations: Array<{ amount: Prisma.Decimal; status: number; warning: boolean }> }) {
    const reserved = line.reservations.filter((item) => item.status === 0).reduce((sum, item) => sum.plus(item.amount), ZERO);
    const consumed = line.reservations.filter((item) => item.status === 1).reduce((sum, item) => sum.plus(item.amount), ZERO);
    return { ...line, reserved: reserved.toString(), consumed: consumed.toString(), available: line.amount.minus(reserved).minus(consumed).toString(), over: reserved.plus(consumed).greaterThan(line.amount) };
  }

  private async requirePlan(id: number) {
    const row = await this.prisma.budgetPlan.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new AppError("BUDGET_PLAN_NOT_FOUND", "预算计划不存在", 404);
    return row;
  }

  private assertManager(actor: BudgetActor) { if (!canManageAccounting(actor.role)) throw new AppError("FORBIDDEN", "仅管理员或财务主管可以维护预算", 403); }

  private audit(tx: Prisma.TransactionClient, actor: BudgetActor, action: "CREATE" | "UPDATE" | "DELETE", resourceType: string, resourceId: number, beforeData: object | null, afterData: object) {
    return tx.auditLog.create({ data: { actorId: actor.actorId, action, resourceType, resourceId, beforeData: beforeData === null ? Prisma.JsonNull : beforeData as Prisma.InputJsonObject, afterData: afterData as Prisma.InputJsonObject } });
  }
}
