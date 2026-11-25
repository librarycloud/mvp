import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { canManageAccounting } from "../../common/auth/authorization.js";
import { ACCOUNTING_PERIOD_STATUS, POSTING_STATUS, VOUCHER_STATUS } from "../../common/status-codes.js";
import type { YearEndActor, YearEndInput } from "./year-end-closing.types.js";
import { getNextVoucherNumber } from "../voucher/voucher-numbering.helper.js";

const ZERO = new Prisma.Decimal(0);
type Tx = Prisma.TransactionClient;

interface PreviewLine {
  accountId: number;
  code: string;
  name: string;
  normalDirection: "DEBIT" | "CREDIT";
  closingDirection: "DEBIT" | "CREDIT";
  amount: Prisma.Decimal;
  kind: "REVENUE" | "COST" | "EXPENSE";
}

export class YearEndClosingService {
  constructor(private readonly prisma: PrismaClient) {}

  async preview(fiscalYear: number, actor?: YearEndActor) {
    this.year(fiscalYear);
    const result = await this.buildPreview(fiscalYear);
    if (actor) {
      await this.prisma.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: "CREATE",
          resourceType: "YearEndClosingPreview",
          description: `${fiscalYear}年度结转试运行`,
          afterData: { fiscalYear, netProfit: result.netProfit.toString() },
        },
      });
    }
    return result;
  }

  async get(fiscalYear: number) {
    const row = await this.prisma.yearEndClosing.findFirst({
      where: { fiscalYear, deletedAt: null },
      include: { voucher: true, createdBy: true },
    });
    if (!row) {
      throw new AppError("YEAR_END_CLOSING_NOT_FOUND", "年度结转不存在", 404);
    }
    return row;
  }

  async close(fiscalYear: number, input: YearEndInput, actor: YearEndActor) {
    this.admin(actor);
    this.year(fiscalYear);
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.yearEndClosing.findFirst({ where: { fiscalYear } });
      if (exists) {
        throw new AppError("YEAR_END_ALREADY_CLOSED", "该年度已执行结转，不能重复结转", 409);
      }

      const periods = await tx.accountingPeriod.findMany({
        where: { year: fiscalYear, deletedAt: null },
        orderBy: { month: "asc" },
      });
      if (periods.length !== 12 || periods.some((x) => x.status === ACCOUNTING_PERIOD_STATUS.OPEN)) {
        throw new AppError("YEAR_NOT_CLOSED", "年度期间尚未全部关账，不能执行年度结转", 409);
      }

      const period = periods.at(-1);
      if (!period) {
        throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "未找到年度最后会计期间", 404);
      }

      const preview = await this.buildPreview(fiscalYear, tx);
      const profit = await tx.account.findFirst({
        where: { id: input.profitAccountId, deletedAt: null, isEnabled: true, isLeaf: true },
      });
      if (!profit) {
        throw new AppError("ACCOUNT_NOT_POSTABLE", "本年利润科目不存在、未启用或不是末级科目", 400);
      }

      let retainedEarnings: { id: number; code: string; name: string } | null = null;
      if (input.retainedEarningsAccountId) {
        if (input.retainedEarningsAccountId === profit.id) {
          throw new AppError("INVALID_CLOSING_ACCOUNTS", "本年利润科目与未分配利润科目不能相同", 400);
        }
        retainedEarnings = await tx.account.findFirst({
          where: { id: input.retainedEarningsAccountId, deletedAt: null, isEnabled: true, isLeaf: true },
          select: { id: true, code: true, name: true },
        });
        if (!retainedEarnings) {
          throw new AppError("ACCOUNT_NOT_POSTABLE", "利润分配（未分配利润）科目不存在、未启用或不是末级科目", 400);
        }
      }

      const summary = `${fiscalYear}年度损益及利润结转`;
      const entries: Array<{ lineNo: number; accountId: number; summary: string; debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }> = preview.lines.flatMap((line, index) =>
        line.normalDirection === "CREDIT"
          ? [
              { lineNo: index * 2 + 1, accountId: line.accountId, summary, debitAmount: line.amount, creditAmount: ZERO },
              { lineNo: index * 2 + 2, accountId: profit.id, summary, debitAmount: ZERO, creditAmount: line.amount },
            ]
          : [
              { lineNo: index * 2 + 1, accountId: profit.id, summary, debitAmount: line.amount, creditAmount: ZERO },
              { lineNo: index * 2 + 2, accountId: line.accountId, summary, debitAmount: ZERO, creditAmount: line.amount },
            ],
      );

      const totalProfitToRetained = preview.alreadyClosedMonthlyProfit.plus(preview.netProfit);
      if (retainedEarnings && !totalProfitToRetained.isZero()) {
        const transferAmount = totalProfitToRetained.abs();
        const distSummary = `${fiscalYear}年度本年利润结转未分配利润`;
        if (totalProfitToRetained.greaterThan(0)) {
          entries.push(
            { lineNo: entries.length + 1, accountId: profit.id, summary: distSummary, debitAmount: transferAmount, creditAmount: ZERO },
            { lineNo: entries.length + 2, accountId: retainedEarnings.id, summary: distSummary, debitAmount: ZERO, creditAmount: transferAmount },
          );
        } else {
          entries.push(
            { lineNo: entries.length + 1, accountId: retainedEarnings.id, summary: distSummary, debitAmount: transferAmount, creditAmount: ZERO },
            { lineNo: entries.length + 2, accountId: profit.id, summary: distSummary, debitAmount: ZERO, creditAmount: transferAmount },
          );
        }
      }

      if (!entries.length) {
        throw new AppError("YEAR_END_NOTHING_TO_CLOSE", "本年度没有可结转的损益或本年利润数据", 409);
      }

      const sequence = await getNextVoucherNumber(tx, fiscalYear);

      const total = entries
        .filter((x) => new Prisma.Decimal(x.debitAmount).greaterThan(0))
        .reduce((sum, x) => sum.plus(x.debitAmount), ZERO);

      const voucher = await tx.voucher.create({
        data: {
          ...sequence,
          fiscalYear,
          fiscalPeriod: period.month,
          voucherDate: period.endDate,
          postingDate: period.endDate,
          periodId: period.id,
          summary,
          sourceType: "MANUAL",
          category: "CLOSING",
          status: VOUCHER_STATUS.POSTED,
          totalDebit: total,
          totalCredit: total,
          createdById: actor.actorId,
          reviewerId: actor.actorId,
          reviewedAt: new Date(),
          postedById: actor.actorId,
          postedAt: new Date(),
          entries: { create: entries },
        },
      });

      const event = await tx.accountingEvent.create({
        data: {
          eventType: "YEAR_END",
          sourceType: "YearEndClosing",
          sourceId: fiscalYear,
          voucherId: voucher.id,
          description: summary,
          createdById: actor.actorId,
        },
      });

      const reportData = {
        lines: preview.lines.map((x) => ({ ...x, amount: x.amount.toString() })),
        totals: {
          revenueAmount: preview.revenueAmount.toString(),
          costAmount: preview.costAmount.toString(),
          expenseAmount: preview.expenseAmount.toString(),
          netProfit: totalProfitToRetained.toString(),
          alreadyClosedMonthlyProfit: preview.alreadyClosedMonthlyProfit.toString(),
        },
      };

      const closing = await tx.yearEndClosing.create({
        data: {
          fiscalYear,
          revenueAmount: preview.revenueAmount,
          costAmount: preview.costAmount,
          expenseAmount: preview.expenseAmount,
          netProfit: totalProfitToRetained,
          eventId: event.id,
          voucherId: voucher.id,
          reportData: reportData as Prisma.InputJsonObject,
          createdById: actor.actorId,
        },
      });

      await this.audit(tx, actor.actorId, "CREATE", closing.id, {
        fiscalYear,
        status: VOUCHER_STATUS.POSTED,
        netProfit: preview.netProfit.toString(),
      });

      return closing;
    });
  }

  async cancel(fiscalYear: number, reason: string, actor: YearEndActor) {
    this.admin(actor);
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new AppError("VOID_REASON_REQUIRED", "撤销结转必须填写原因", 400);
    }

    return this.prisma.$transaction(async (tx) => {
      const closing = await tx.yearEndClosing.findFirst({ where: { fiscalYear, deletedAt: null } });
      if (!closing) {
        throw new AppError("YEAR_END_CLOSING_NOT_FOUND", "年度结转不存在", 404);
      }
      if (closing.status !== POSTING_STATUS.POSTED) {
        throw new AppError("YEAR_END_NOT_POSTED", "年度结转已撤销", 409);
      }

      await tx.voucher.update({
        where: { id: closing.voucherId },
        data: {
          status: VOUCHER_STATUS.VOID,
          voidById: actor.actorId,
          voidAt: new Date(),
          voidReason: trimmedReason,
        },
      });

      const result = await tx.yearEndClosing.update({
        where: { id: closing.id },
        data: { status: POSTING_STATUS.VOID },
      });

      await this.audit(tx, actor.actorId, "UPDATE", closing.id, {
        fiscalYear,
        status: VOUCHER_STATUS.VOID,
        reason: trimmedReason,
      });

      return result;
    });
  }

  private async buildPreview(fiscalYear: number, tx: PrismaClient | Tx = this.prisma) {
    const [entries, costItems] = await Promise.all([
      tx.voucherEntry.findMany({
        where: {
          deletedAt: null,
          voucher: {
            deletedAt: null,
            status: VOUCHER_STATUS.POSTED,
            period: { year: fiscalYear, deletedAt: null },
            accountingEvents: { none: { eventType: "YEAR_END", deletedAt: null } },
          },
        },
        include: {
          account: {
            select: { id: true, code: true, name: true, category: true, normalDirection: true },
          },
        },
      }),
      tx.dictionaryItem.findMany({
        where: {
          deletedAt: null,
          enabled: true,
          category: { code: "year_end_cost_account", enabled: true, deletedAt: null },
        },
        select: { value: true },
      }),
    ]);

    const costCodes = new Set(costItems.map((item) => item.value));
    const totals = new Map<number, { account: any; debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    let alreadyClosedMonthlyProfit = ZERO;

    for (const entry of entries) {
      if (entry.account.code?.startsWith("4103")) {
        alreadyClosedMonthlyProfit = alreadyClosedMonthlyProfit.plus(entry.creditAmount).minus(entry.debitAmount);
      }
      if (entry.account.category !== "PROFIT_AND_LOSS") continue;
      const current = totals.get(entry.accountId) ?? { account: entry.account, debit: ZERO, credit: ZERO };
      current.debit = current.debit.plus(entry.debitAmount);
      current.credit = current.credit.plus(entry.creditAmount);
      totals.set(entry.accountId, current);
    }

    const lines: PreviewLine[] = [];
    let revenue = ZERO;
    let cost = ZERO;
    let expense = ZERO;

    for (const current of totals.values()) {
      const netDebit = current.debit.minus(current.credit);
      if (netDebit.equals(0)) continue;
      const amount = netDebit.abs();
      const kind: PreviewLine["kind"] =
        current.account.normalDirection === "CREDIT"
          ? "REVENUE"
          : costCodes.has(current.account.code)
            ? "COST"
            : "EXPENSE";

      lines.push({
        accountId: current.account.id,
        code: current.account.code,
        name: current.account.name,
        normalDirection: netDebit.greaterThan(0) ? "DEBIT" : "CREDIT",
        closingDirection: netDebit.greaterThan(0) ? "CREDIT" : "DEBIT",
        amount,
        kind,
      });

      const signed =
        current.account.normalDirection === "CREDIT"
          ? current.credit.minus(current.debit)
          : current.debit.minus(current.credit);

      if (kind === "REVENUE") revenue = revenue.plus(signed);
      else if (kind === "COST") cost = cost.plus(signed);
      else expense = expense.plus(signed);
    }

    const netProfit = revenue.minus(cost).minus(expense);
    return {
      lines: lines.sort((a, b) => a.code.localeCompare(b.code)),
      revenueAmount: revenue,
      costAmount: cost,
      expenseAmount: expense,
      netProfit,
      alreadyClosedMonthlyProfit,
      totalTransferToRetained: alreadyClosedMonthlyProfit.plus(netProfit),
    };
  }

  private year(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      throw new AppError("INVALID_FISCAL_YEAR", "会计年度无效", 400);
    }
  }

  private admin(actor: YearEndActor) {
    if (canManageAccounting(actor.role)) return;
    throw new AppError("FORBIDDEN", "仅财务主管可以执行或撤销年度结转", 403);
  }

  private audit(tx: Tx, actorId: number, action: "CREATE" | "UPDATE", resourceId: number, afterData: object) {
    return tx.auditLog.create({
      data: {
        actorId,
        action,
        resourceType: "YearEndClosing",
        resourceId,
        afterData,
      },
    });
  }

  async getMonthlyPnlStatus(periodId: number) {
    const period = await this.prisma.accountingPeriod.findFirst({ where: { id: periodId, deletedAt: null } });
    if (!period) throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "会计期间不存在", 404);

    const vouchers = await this.prisma.voucher.findMany({
      where: {
        periodId: period.id,
        category: "CLOSING",
        summary: { contains: "期末损益结转" },
        deletedAt: null,
        status: { not: VOUCHER_STATUS.VOID },
      },
      select: {
        id: true,
        voucherNo: true,
        status: true,
        totalDebit: true,
        totalCredit: true,
        createdAt: true,
      },
      orderBy: { id: "desc" },
    });

    return {
      hasClosed: vouchers.length > 0,
      vouchers,
      voucher: vouchers[0] ?? null,
      duplicateCount: vouchers.length,
    };
  }

  async cancelMonthlyPnl(periodId: number, reason: string, actor?: YearEndActor) {
    if (actor) {
      this.admin(actor);
    }
    const currentActorId = actor?.actorId;
    if (!currentActorId) {
      throw new AppError("FORBIDDEN", "缺少有效操作人，无法撤销月度结转", 403);
    }
    const trimmedReason = reason?.trim() || "撤销月度损益结转";

    return this.prisma.$transaction(async (tx) => {
      const period = await tx.accountingPeriod.findFirst({ where: { id: periodId, deletedAt: null } });
      if (!period) throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "会计期间不存在", 404);
      if (period.status !== ACCOUNTING_PERIOD_STATUS.OPEN) {
        throw new AppError("PERIOD_CLOSED", "已关账会计期间不能撤销损益结转，请先反关账", 409);
      }

      const events = await tx.accountingEvent.findMany({
        where: {
          eventType: "MONTHLY_PNL",
          sourceId: period.id,
          deletedAt: null,
        },
        include: { voucher: true },
      });

      const closingVouchers = await tx.voucher.findMany({
        where: {
          periodId: period.id,
          category: "CLOSING",
          summary: { contains: "期末损益结转" },
          deletedAt: null,
          status: { not: VOUCHER_STATUS.VOID },
        },
      });

      const voucherIdsToVoid = new Set<number>();
      for (const e of events) {
        if (e.voucherId) voucherIdsToVoid.add(e.voucherId);
        if (e.voucher && e.voucher.status !== VOUCHER_STATUS.VOID) {
          voucherIdsToVoid.add(e.voucher.id);
        }
      }
      for (const v of closingVouchers) {
        voucherIdsToVoid.add(v.id);
      }

      if (voucherIdsToVoid.size === 0 && events.length === 0) {
        throw new AppError("MONTHLY_PNL_NOT_FOUND", "当前期间未找到生效中的损益结转凭证", 404);
      }

      const now = new Date();
      for (const vid of voucherIdsToVoid) {
        await tx.voucher.update({
          where: { id: vid },
          data: {
            status: VOUCHER_STATUS.VOID,
            voidById: currentActorId,
            voidAt: now,
            voidReason: trimmedReason,
          },
        });
      }

      for (const e of events) {
        await tx.accountingEvent.update({
          where: { id: e.id },
          data: { deletedAt: now },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: currentActorId,
          action: "UPDATE",
          resourceType: "MonthlyPnlClosing",
          resourceId: period.id,
          description: `撤销 ${period.periodCode} 月度损益结转凭证共 ${voucherIdsToVoid.size} 张：${trimmedReason}`,
          afterData: { periodId, voidedVoucherIds: Array.from(voucherIdsToVoid), reason: trimmedReason },
        },
      });

      return { voidedCount: voucherIdsToVoid.size };
    });
  }

  async closeMonthlyPnl(periodId: number, profitAccountId?: number, actor?: YearEndActor) {
    if (actor) {
      this.admin(actor);
    }
    const currentActorId = actor?.actorId;
    if (!currentActorId) {
      throw new AppError("FORBIDDEN", "缺少有效操作人，无法执行月度结转", 403);
    }

    return this.prisma.$transaction(async (tx) => {
      const period = await tx.accountingPeriod.findFirst({ where: { id: periodId, deletedAt: null } });
      if (!period) throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "会计期间不存在", 404);
      if (period.status !== ACCOUNTING_PERIOD_STATUS.OPEN) throw new AppError("PERIOD_CLOSED", "已关账期间不能执行结转", 409);

      // 防重复结转检查
      const existingClosingVouchers = await tx.voucher.findMany({
        where: {
          periodId: period.id,
          category: "CLOSING",
          summary: { contains: "期末损益结转" },
          deletedAt: null,
          status: { not: VOUCHER_STATUS.VOID },
        },
      });
      if (existingClosingVouchers.length > 0) {
        const voucherNos = existingClosingVouchers.map((v) => v.voucherNo).join("、");
        throw new AppError(
          "MONTHLY_PNL_ALREADY_EXISTS",
          `该期间已存在生效中的月度损益结转凭证（${voucherNos}），不能重复结转。如需重新结转请先撤销原有结转凭证。`,
          409,
        );
      }

      const profit = profitAccountId
        ? await tx.account.findFirst({ where: { id: profitAccountId, deletedAt: null, isEnabled: true, isLeaf: true } })
        : (await tx.account.findFirst({ where: { code: "4103", deletedAt: null, isEnabled: true, isLeaf: true } })) ??
          (await tx.account.findFirst({ where: { code: { startsWith: "4103" }, deletedAt: null, isEnabled: true, isLeaf: true } }));
      if (!profit) throw new AppError("ACCOUNT_NOT_POSTABLE", "本年利润科目不存在或未启用", 400);

      const entries = await tx.voucherEntry.findMany({
        where: {
          deletedAt: null,
          voucher: {
            deletedAt: null,
            status: VOUCHER_STATUS.POSTED,
            periodId,
            accountingEvents: { none: { eventType: { in: ["YEAR_END", "MONTHLY_PNL"] }, deletedAt: null } },
          },
        },
        include: { account: { select: { id: true, code: true, name: true, category: true, normalDirection: true } } },
      });

      const totals = new Map<number, { account: any; debit: Prisma.Decimal; credit: Prisma.Decimal }>();
      for (const entry of entries) {
        if (entry.account.category !== "PROFIT_AND_LOSS") continue;
        const current = totals.get(entry.accountId) ?? { account: entry.account, debit: ZERO, credit: ZERO };
        current.debit = current.debit.plus(entry.debitAmount);
        current.credit = current.credit.plus(entry.creditAmount);
        totals.set(entry.accountId, current);
      }

      const closingEntries: Array<{
        lineNo: number;
        accountId: number;
        summary: string;
        debitAmount: Prisma.Decimal;
        creditAmount: Prisma.Decimal;
      }> = [];
      const summary = `${period.periodCode}期末损益结转`;

      for (const current of totals.values()) {
        const netDebit = current.debit.minus(current.credit);
        if (netDebit.equals(0)) continue;
        const amount = netDebit.abs();
        if (netDebit.greaterThan(0)) {
          closingEntries.push({ lineNo: closingEntries.length + 1, accountId: profit.id, summary, debitAmount: amount, creditAmount: ZERO });
          closingEntries.push({ lineNo: closingEntries.length + 1, accountId: current.account.id, summary, debitAmount: ZERO, creditAmount: amount });
        } else {
          closingEntries.push({ lineNo: closingEntries.length + 1, accountId: current.account.id, summary, debitAmount: amount, creditAmount: ZERO });
          closingEntries.push({ lineNo: closingEntries.length + 1, accountId: profit.id, summary, debitAmount: ZERO, creditAmount: amount });
        }
      }

      if (!closingEntries.length) {
        throw new AppError("MONTHLY_PNL_NOTHING_TO_CLOSE", "本期间损益科目已全部结平，无需结转", 400);
      }

      const total = closingEntries
        .filter((x) => x.debitAmount.greaterThan(0))
        .reduce((sum, x) => sum.plus(x.debitAmount), ZERO);
      const sequence = await getNextVoucherNumber(tx, period.year);
      const voucher = await tx.voucher.create({
        data: {
          ...sequence,
          fiscalYear: period.year,
          fiscalPeriod: period.month,
          voucherDate: period.endDate,
          postingDate: period.endDate,
          periodId: period.id,
          summary,
          sourceType: "MANUAL",
          category: "CLOSING",
          status: VOUCHER_STATUS.POSTED,
          totalDebit: total,
          totalCredit: total,
          createdById: currentActorId,
          reviewerId: currentActorId,
          reviewedAt: new Date(),
          postedById: currentActorId,
          postedAt: new Date(),
          entries: { create: closingEntries },
        },
      });

      await tx.accountingEvent.create({
        data: {
          eventType: "MONTHLY_PNL",
          sourceType: "MonthlyPnlClosing",
          sourceId: period.id,
          voucherId: voucher.id,
          description: summary,
          createdById: currentActorId,
        },
      });

      return voucher;
    });
  }
}
