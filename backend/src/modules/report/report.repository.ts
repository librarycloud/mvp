import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { ACCOUNTING_PERIOD_STATUS, REPORT_STATUS, VOUCHER_STATUS } from "../../common/status-codes.js";
import type {
  ReportAccount,
  ReportAccountingPeriod,
  ReportAccountTotal,
  ReportCashCounterpartyTotal,
  ReportPeriodInput,
  ReportTemplateDefinition,
} from "./report.types.js";

export interface PersistReportLine {
  reportItemId: number;
  openingAmount: string | null;
  currentAmount: string | null;
  closingAmount: string | null;
  calculationTrace: Record<string, unknown>;
}

export interface ReportRepository {
  findActiveTemplate(code: string): Promise<ReportTemplateDefinition | null>;
  listAccountingPeriods(fiscalYear: number): Promise<ReportAccountingPeriod[]>;
  listAccounts(): Promise<ReportAccount[]>;
  aggregateEntries(startDate: Date, endDate: Date): Promise<ReportAccountTotal[]>;
  aggregateCashCounterparties(startDate: Date, endDate: Date, cashAccountIds: number[]): Promise<ReportCashCounterpartyTotal[]>;
  saveReport(input: {
    templateId: number;
    period: ReportPeriodInput;
    periodStart: Date;
    periodEnd: Date;
    generatedById: number;
    lines: PersistReportLine[];
  }): Promise<unknown>;
  findReportById(id: number): Promise<unknown | null>;
  listReports?(page: number, pageSize: number): Promise<{ items: unknown[]; total: number }>;
}

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveTemplate(code: string): Promise<ReportTemplateDefinition | null> {
    const template = await this.prisma.reportTemplate.findFirst({
      where: { code, isActive: true, deletedAt: null },
      orderBy: { version: "desc" },
      include: {
        items: {
          where: { deletedAt: null },
          orderBy: { sortOrder: "asc" },
          include: {
            accountMappings: { where: { deletedAt: null } },
            dependenciesAsTarget: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });
    if (!template) return null;
    return {
      id: template.id, code: template.code, name: template.name, type: template.type, version: template.version,
      items: template.items.map((item) => ({
        id: item.id, itemCode: item.itemCode, name: item.name, lineNumber: item.lineNumber, sortOrder: item.sortOrder,
        mappings: item.accountMappings.map((mapping) => ({
          accountId: mapping.accountId, operator: mapping.operator, valueType: mapping.valueType,
          direction: mapping.direction, includeChildren: mapping.includeChildren,
        })),
        dependencies: item.dependenciesAsTarget.map((dependency) => ({
          sourceItemId: dependency.sourceItemId, operator: dependency.operator, coefficient: dependency.coefficient.toString(),
        })),
      })),
    };
  }

  async listReports(page: number, pageSize: number) {
    const where = { deletedAt: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({ where, include: { template: { select: { code: true, name: true, type: true, version: true } }, generatedBy: { select: { id: true, displayName: true } } }, orderBy: { generatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.report.count({ where }),
    ]);
    return { items, total };
  }

  listAccounts() {
    return this.prisma.account.findMany({ select: { id: true, parentId: true, normalDirection: true, category: true, code: true } });
  }

  listAccountingPeriods(fiscalYear: number) {
    return this.prisma.accountingPeriod.findMany({
      where: {
        year: fiscalYear,
        deletedAt: null,
        status: { in: [ACCOUNTING_PERIOD_STATUS.OPEN, ACCOUNTING_PERIOD_STATUS.CLOSED, ACCOUNTING_PERIOD_STATUS.LOCKED] },
      },
      select: { year: true, month: true, startDate: true, endDate: true },
      orderBy: [{ month: "asc" }, { startDate: "asc" }],
    });
  }

  async aggregateEntries(startDate: Date, endDate: Date) {
    const periodIds = await this.periodIds(startDate, endDate);
    const rows = await this.prisma.voucherEntry.groupBy({
      by: ["accountId"],
      where: {
        deletedAt: null,
        voucher: {
          status: VOUCHER_STATUS.POSTED,
          deletedAt: null,
          periodId: { in: periodIds },
          accountingEvents: { none: { eventType: "YEAR_END", deletedAt: null } },
        },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });
    return rows.map((row) => ({
      accountId: row.accountId,
      debit: row._sum?.debitAmount?.toString() ?? "0",
      credit: row._sum?.creditAmount?.toString() ?? "0",
    }));
  }

  async aggregateCashCounterparties(startDate: Date, endDate: Date, cashAccountIds: number[]): Promise<ReportCashCounterpartyTotal[]> {
    if (!cashAccountIds.length) return [];
    const periodIds = await this.periodIds(startDate, endDate);
    if (!periodIds.length) return [];
    const cashAccounts = new Set(cashAccountIds);
    const totals = new Map<number, { inflow: Prisma.Decimal; outflow: Prisma.Decimal }>();
    const vouchers = await this.prisma.voucher.findMany({
      where: {
        status: VOUCHER_STATUS.POSTED,
        deletedAt: null,
        periodId: { in: periodIds },
        accountingEvents: { none: { eventType: "YEAR_END", deletedAt: null } },
      },
      select: { entries: { where: { deletedAt: null }, select: { accountId: true, debitAmount: true, creditAmount: true } } },
    });
    for (const voucher of vouchers) {
      const cashDebits = voucher.entries.filter((entry) => cashAccounts.has(entry.accountId)).reduce((sum, entry) => sum.plus(entry.debitAmount), new Prisma.Decimal(0));
      const cashCredits = voucher.entries.filter((entry) => cashAccounts.has(entry.accountId)).reduce((sum, entry) => sum.plus(entry.creditAmount), new Prisma.Decimal(0));
      const nonCashDebits = voucher.entries.filter((entry) => !cashAccounts.has(entry.accountId) && !entry.debitAmount.isZero());
      const nonCashCredits = voucher.entries.filter((entry) => !cashAccounts.has(entry.accountId) && !entry.creditAmount.isZero());
      const totalNonCashCredits = nonCashCredits.reduce((sum, entry) => sum.plus(entry.creditAmount), new Prisma.Decimal(0));
      const totalNonCashDebits = nonCashDebits.reduce((sum, entry) => sum.plus(entry.debitAmount), new Prisma.Decimal(0));
      if (!cashDebits.isZero() && !totalNonCashCredits.isZero()) {
        for (const entry of nonCashCredits) this.addCashTotal(totals, entry.accountId, "inflow", cashDebits.mul(entry.creditAmount).div(totalNonCashCredits));
      }
      if (!cashCredits.isZero() && !totalNonCashDebits.isZero()) {
        for (const entry of nonCashDebits) this.addCashTotal(totals, entry.accountId, "outflow", cashCredits.mul(entry.debitAmount).div(totalNonCashDebits));
      }
    }
    return [...totals.entries()].map(([accountId, total]) => ({ accountId, inflow: total.inflow.toString(), outflow: total.outflow.toString() }));
  }

  private async periodIds(startDate: Date, endDate: Date): Promise<number[]> {
    const periods = await this.prisma.accountingPeriod.findMany({
      where: { deletedAt: null, status: { in: [ACCOUNTING_PERIOD_STATUS.OPEN, ACCOUNTING_PERIOD_STATUS.CLOSED, ACCOUNTING_PERIOD_STATUS.LOCKED] }, startDate: { gte: startDate }, endDate: { lte: endDate } },
      select: { id: true },
    });
    return periods.map((period) => period.id);
  }

  private addCashTotal(totals: Map<number, { inflow: Prisma.Decimal; outflow: Prisma.Decimal }>, accountId: number, field: "inflow" | "outflow", amount: Prisma.Decimal) {
    const total = totals.get(accountId) ?? { inflow: new Prisma.Decimal(0), outflow: new Prisma.Decimal(0) };
    total[field] = total[field].plus(amount);
    totals.set(accountId, total);
  }

  saveReport(input: {
    templateId: number;
    period: ReportPeriodInput;
    periodStart: Date;
    periodEnd: Date;
    generatedById: number;
    lines: PersistReportLine[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const key = {
        templateId_periodType_periodStart_periodEnd: {
          templateId: input.templateId, periodType: input.period.periodType,
          periodStart: input.periodStart, periodEnd: input.periodEnd,
        },
      };
      let report = await tx.report.findUnique({ where: key });
      const existed = Boolean(report);
      if (!report) {
        report = await tx.report.create({
          data: {
            templateId: input.templateId, periodType: input.period.periodType, fiscalYear: input.period.fiscalYear,
            periodStart: input.periodStart, periodEnd: input.periodEnd, generatedById: input.generatedById,
          },
        });
      } else {
        report = await tx.report.update({
          where: { id: report.id },
          data: { fiscalYear: input.period.fiscalYear, status: REPORT_STATUS.GENERATED, generatedById: input.generatedById, generatedAt: new Date(), deletedAt: null },
        });
      }
      const itemIds = new Set(input.lines.map((line) => line.reportItemId));
      for (const line of input.lines) {
        await tx.reportLine.upsert({
          where: { reportId_reportItemId: { reportId: report.id, reportItemId: line.reportItemId } },
          create: this.lineRecord(report.id, line),
          update: { ...this.lineValues(line), deletedAt: null },
        });
      }
      await tx.reportLine.updateMany({
        where: { reportId: report.id, reportItemId: { notIn: [...itemIds] }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await tx.auditLog.create({ data: {
        actorId: input.generatedById,
        action: existed ? "UPDATE" : "CREATE",
        resourceType: "Report",
        resourceId: report.id,
        description: "Generate financial report",
        afterData: { templateId: input.templateId, periodType: input.period.periodType, fiscalYear: input.period.fiscalYear, periodStart: input.periodStart.toISOString(), periodEnd: input.periodEnd.toISOString() },
      } });
      return tx.report.findUniqueOrThrow({
        where: { id: report.id },
        include: {
          template: { select: { code: true, name: true, type: true, version: true } },
          lines: {
            where: { deletedAt: null },
            include: {
              reportItem: {
                select: {
                  id: true,
                  itemCode: true,
                  name: true,
                  lineNumber: true,
                  sortOrder: true,
                  accountMappings: {
                    where: { deletedAt: null },
                    select: {
                      accountId: true,
                      operator: true,
                      valueType: true,
                      account: { select: { id: true, code: true, name: true } },
                    },
                  },
                },
              },
            },
            orderBy: { reportItem: { sortOrder: "asc" } },
          },
        },
      });
    });
  }

  findReportById(id: number) {
    return this.prisma.report.findFirst({
      where: { id, deletedAt: null },
      include: {
        template: { select: { code: true, name: true, type: true, version: true } },
        lines: {
          where: { deletedAt: null },
          include: {
            reportItem: {
              select: {
                id: true,
                itemCode: true,
                name: true,
                lineNumber: true,
                sortOrder: true,
                accountMappings: {
                  where: { deletedAt: null },
                  select: {
                    accountId: true,
                    operator: true,
                    valueType: true,
                    account: { select: { id: true, code: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: { reportItem: { sortOrder: "asc" } },
        },
      },
    });
  }

  private lineRecord(reportId: number, line: PersistReportLine) {
    return {
      reportId,
      reportItemId: line.reportItemId,
      ...this.lineValues(line),
    };
  }

  private lineValues(line: PersistReportLine) {
    return {
      openingAmount: line.openingAmount,
      currentAmount: line.currentAmount,
      closingAmount: line.closingAmount,
      calculationTrace: line.calculationTrace as Prisma.InputJsonObject,
    };
  }
}
