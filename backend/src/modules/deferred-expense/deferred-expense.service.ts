import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { FIXED_ASSET_STATUS, POSTING_STATUS, VOUCHER_STATUS } from "../../common/status-codes.js";
import type { AccountingPeriodResolver } from "../accounting-period/accounting-period.types.js";
import { getNextVoucherNumber } from "../voucher/voucher-numbering.helper.js";
import type { CreateDeferredExpenseInput, DeferredExpenseFilter } from "./deferred-expense.types.js";

const ZERO = new Prisma.Decimal(0);

export class DeferredExpenseService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly periods?: AccountingPeriodResolver,
  ) {}

  async list(filter: DeferredExpenseFilter = {}) {
    const where: Prisma.FixedAssetWhereInput = {
      category: "DEFERRED_EXPENSE",
      deletedAt: null,
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.keyword
        ? {
            OR: [
              { assetNo: { contains: filter.keyword } },
              { name: { contains: filter.keyword } },
            ],
          }
        : {}),
    };

    return this.prisma.fixedAsset.findMany({
      where,
      include: {
        depreciationExpenseAccount: { select: { id: true, code: true, name: true } },
        depreciationRecords: {
          where: { deletedAt: null },
          include: { period: true, voucher: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { assetNo: "asc" },
    });
  }

  async create(input: CreateDeferredExpenseInput, actor: { actorId: number; role: string }) {
    const expenseNo = input.expenseNo.trim();
    if (!expenseNo) throw new AppError("INVALID_EXPENSE_NO", "待摊费用编号不能为空", 400);
    const name = input.name.trim();
    if (!name) throw new AppError("INVALID_EXPENSE_NAME", "待摊费用名称不能为空", 400);
    if (!/^\d{1,15}(\.\d{1,4})?$/.test(input.originalValue) || Number(input.originalValue) <= 0) {
      throw new AppError("INVALID_ORIGINAL_VALUE", "支出金额必须为大于零的数值", 400);
    }
    const originalValue = new Prisma.Decimal(input.originalValue);
    const usefulLifeMonths = Number(input.usefulLifeMonths);
    if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths < 1 || usefulLifeMonths > 600) {
      throw new AppError("INVALID_USEFUL_LIFE", "摊销期必须为1至600个月之间", 400);
    }
    const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
    if (Number.isNaN(startDate.getTime())) throw new AppError("INVALID_DATE", "开始摊销日期无效", 400);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.fixedAsset.findFirst({
        where: { assetNo: expenseNo, deletedAt: null },
      });
      if (existing) throw new AppError("EXPENSE_NO_EXISTS", `费用编号【${expenseNo}】已存在`, 409);

      let expenseAccountId = input.expenseAccountId;
      if (expenseAccountId) {
        const acc = await tx.account.findFirst({ where: { id: expenseAccountId, deletedAt: null, isEnabled: true, isLeaf: true } });
        if (!acc) throw new AppError("ACCOUNT_NOT_FOUND", "所选费用科目不存在或不是末级科目", 400);
      } else {
        const defaultAcc = await tx.account.findFirst({
          where: { code: { startsWith: "6602" }, deletedAt: null, isEnabled: true, isLeaf: true },
          orderBy: { code: "asc" },
        });
        expenseAccountId = defaultAcc?.id;
      }

      const asset = await tx.fixedAsset.create({
        data: {
          assetNo: expenseNo,
          name,
          category: "DEFERRED_EXPENSE",
          purchaseDate: startDate,
          startUseDate: startDate,
          originalValue,
          residualRate: ZERO,
          residualValue: ZERO,
          depreciationMethod: "STRAIGHT_LINE",
          usefulLifeMonths,
          accumulatedDepreciation: ZERO,
          netValue: originalValue,
          department: input.department?.trim() || null,
          custodian: input.custodian?.trim() || null,
          depreciationExpenseAccountId: expenseAccountId ?? null,
          status: FIXED_ASSET_STATUS.ACTIVE,
          createdById: actor.actorId,
        },
      });

      const event = await tx.accountingEvent.create({
        data: {
          eventType: "DEFERRED_EXPENSE",
          sourceType: "DeferredExpense",
          sourceId: asset.id,
          description: `长期待摊费用登记：${asset.assetNo} ${asset.name}`,
          createdById: actor.actorId,
        },
      });

      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { eventId: event.id },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: "CREATE",
          resourceType: "DeferredExpense",
          resourceId: asset.id,
          description: `长期待摊费用登记【${asset.assetNo}】金额：${asset.originalValue}`,
        },
      });

      return asset;
    });
  }

  async amortize(periodId: number, actor: { actorId: number; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.accountingPeriod.findUnique({ where: { id: periodId } });
      if (!period) throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "会计期间不存在", 404);

      const assets = await tx.fixedAsset.findMany({
        where: {
          category: "DEFERRED_EXPENSE",
          status: FIXED_ASSET_STATUS.ACTIVE,
          startUseDate: { lte: period.endDate },
          deletedAt: null,
        },
        orderBy: { assetNo: "asc" },
      });

      const deferredAssetAccount = await tx.account.findFirst({
        where: { code: { startsWith: "1801" }, deletedAt: null, isEnabled: true, isLeaf: true },
        orderBy: { code: "asc" },
      });
      if (!deferredAssetAccount) {
        throw new AppError("DEFERRED_EXPENSE_ACCOUNT_NOT_FOUND", "未找到1801长期待摊费用会计科目", 400);
      }

      const generated: Array<{ assetNo: string; name: string; amount: string; voucherNo: string }> = [];
      let skipped = 0;

      for (const asset of assets) {
        const exists = await tx.depreciationRecord.findUnique({
          where: { assetId_periodId: { assetId: asset.id, periodId } },
        });
        if (exists) {
          skipped++;
          continue;
        }

        const remaining = asset.originalValue.minus(asset.accumulatedDepreciation);
        if (remaining.lessThanOrEqualTo(0)) {
          skipped++;
          continue;
        }

        const monthly = asset.originalValue.div(asset.usefulLifeMonths).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const amount = Prisma.Decimal.min(monthly, remaining);
        if (amount.lessThanOrEqualTo(0)) {
          skipped++;
          continue;
        }

        const expenseAccountId =
          asset.depreciationExpenseAccountId ??
          (await tx.account.findFirst({ where: { code: { startsWith: "6602" }, deletedAt: null, isEnabled: true, isLeaf: true } }))?.id;
        if (!expenseAccountId) throw new AppError("EXPENSE_ACCOUNT_NOT_FOUND", "未配置摊销费用科目", 400);

        const summary = `摊销${period.periodCode}长期待摊费用：${asset.assetNo} ${asset.name}`;
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
            category: "ACCRUAL",
            status: VOUCHER_STATUS.POSTED,
            totalDebit: amount,
            totalCredit: amount,
            createdById: actor.actorId,
            reviewerId: actor.actorId,
            reviewedAt: new Date(),
            postedById: actor.actorId,
            postedAt: new Date(),
            entries: {
              create: [
                { lineNo: 1, accountId: expenseAccountId, summary, debitAmount: amount, creditAmount: ZERO },
                { lineNo: 2, accountId: deferredAssetAccount.id, summary, debitAmount: ZERO, creditAmount: amount },
              ],
            },
          },
        });

        const newAccumulated = asset.accumulatedDepreciation.plus(amount);
        const newNetValue = asset.originalValue.minus(newAccumulated);
        const newStatus = newNetValue.lessThanOrEqualTo(0) ? FIXED_ASSET_STATUS.DISCARDED : FIXED_ASSET_STATUS.ACTIVE;

        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: {
            accumulatedDepreciation: newAccumulated,
            netValue: newNetValue,
            status: newStatus,
          },
        });

        const record = await tx.depreciationRecord.create({
          data: {
            assetId: asset.id,
            periodId: period.id,
            amount,
            status: POSTING_STATUS.POSTED,
            voucherId: voucher.id,
            createdById: actor.actorId,
          },
        });

        await tx.accountingEvent.create({
          data: {
            eventType: "DEFERRED_EXPENSE_AMORTIZATION",
            sourceType: "DeferredExpense",
            sourceId: asset.id,
            voucherId: voucher.id,
            description: summary,
            createdById: actor.actorId,
          },
        });

        generated.push({
          assetNo: asset.assetNo,
          name: asset.name,
          amount: amount.toString(),
          voucherNo: voucher.voucherNo,
        });
      }

      return {
        periodCode: period.periodCode,
        generatedCount: generated.length,
        skippedCount: skipped,
        generated,
      };
    });
  }
}
