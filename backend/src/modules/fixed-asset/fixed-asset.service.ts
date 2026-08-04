import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { canEditAccounting } from "../../common/auth/authorization.js";
import { FIXED_ASSET_STATUS } from "../../common/status-codes.js";
import type { AuthRole } from "../auth/auth.types.js";
import type { AccountingPeriodResolver } from "../accounting-period/accounting-period.types.js";
import { VOUCHER_STATUS } from "../../common/status-codes.js";

type Actor = { actorId: number; role: AuthRole };
const ZERO = new Prisma.Decimal(0);

export class FixedAssetService {
  constructor(private readonly prisma: PrismaClient, private readonly periods?: AccountingPeriodResolver) {}

  list(filter: { status?: string; category?: string } = {}) {
    return this.prisma.fixedAsset.findMany({ where: { deletedAt: null, ...(filter.status ? { status: Number(filter.status) } : {}), ...(filter.category ? { category: filter.category } : {}) }, orderBy: { assetNo: "asc" } });
  }

  async get(id: number) {
    const asset = await this.prisma.fixedAsset.findFirst({ where: { id, deletedAt: null }, include: { event: true, disposals: { where: { deletedAt: null }, include: { voucher: true }, orderBy: { disposalDate: "desc" } }, depreciationRecords: { where: { deletedAt: null }, include: { period: true, voucher: true }, orderBy: { createdAt: "desc" } } } });
    if (!asset) throw new AppError("FIXED_ASSET_NOT_FOUND", "固定资产不存在", 404);
    return asset;
  }

  async create(input: any, actor: Actor) {
    this.admin(actor);
    const data = this.data(input);
    return this.prisma.$transaction(async (tx) => {
      await this.validateDepreciationExpenseAccount(tx, data.depreciationExpenseAccountId);
      const asset = await tx.fixedAsset.create({ data: { ...data, createdById: actor.actorId } });
      const event = await tx.accountingEvent.create({ data: { eventType: "FIXED_ASSET", sourceType: "FixedAsset", sourceId: asset.id, description: `固定资产建立：${asset.assetNo}`, createdById: actor.actorId } });
      const result = await tx.fixedAsset.update({ where: { id: asset.id }, data: { eventId: event.id } });
      await this.audit(tx, actor.actorId, "CREATE", asset.id, { assetNo: asset.assetNo, status: asset.status });
      return result;
    });
  }

  async update(id: number, input: any, actor: Actor) {
    this.admin(actor);
    const current = await this.get(id);
    if (current.status === FIXED_ASSET_STATUS.DISCARDED || current.status === FIXED_ASSET_STATUS.SOLD) throw new AppError("FIXED_ASSET_FINALIZED", "已报废或出售的资产不能修改", 409);
    const protectedFields = ["originalValue", "residualRate", "usefulLifeMonths", "startUseDate", "depreciationMethod"];
    if (current.accumulatedDepreciation.greaterThan(0) && protectedFields.some((key) => input[key] !== undefined)) throw new AppError("FIXED_ASSET_DEPRECIATED", "已有折旧记录的资产不能修改折旧参数", 409);
    const data = this.data({ ...current, ...input }, true);
    return this.prisma.$transaction(async (tx) => {
      await this.validateDepreciationExpenseAccount(tx, data.depreciationExpenseAccountId);
      const result = await tx.fixedAsset.update({ where: { id }, data });
      await this.audit(tx, actor.actorId, "UPDATE", id, { assetNo: result.assetNo, status: result.status });
      return result;
    });
  }

  async changeStatus(id: number, status: number, actor: Actor) {
    this.admin(actor);
    const current = await this.get(id);
    if (![0, 1, 2, 3].includes(Number(status))) throw new AppError("INVALID_FIXED_ASSET_STATUS", "固定资产状态无效", 400);
    if (Number(status) === FIXED_ASSET_STATUS.DISCARDED || Number(status) === FIXED_ASSET_STATUS.SOLD) throw new AppError("FIXED_ASSET_DISPOSAL_REQUIRED", "报废或出售必须填写处置记录", 409);
    if (current.status === FIXED_ASSET_STATUS.DISCARDED || current.status === FIXED_ASSET_STATUS.SOLD) throw new AppError("FIXED_ASSET_FINALIZED", "已报废或出售的资产不能再次变更状态", 409);
    return this.prisma.$transaction(async (tx) => { const result = await tx.fixedAsset.update({ where: { id }, data: { status: Number(status) } }); await this.audit(tx, actor.actorId, "UPDATE", id, { from: current.status, to: status }); return result; });
  }

  async dispose(id: number, input: { disposalType: string; disposalDate: string; proceeds?: string; reason?: string; proceedsAccountId?: number; gainLossAccountId?: number }, actor: Actor) {
    this.admin(actor);
    const disposalType = String(input.disposalType).toUpperCase();
    if (disposalType !== "DISCARD" && disposalType !== "SALE") throw new AppError("INVALID_DISPOSAL_TYPE", "处置方式只能是报废或出售", 400);
    const date = new Date(`${input.disposalDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new AppError("INVALID_DISPOSAL_DATE", "处置日期无效", 400);
    const proceeds = new Prisma.Decimal(String(input.proceeds ?? "0"));
    if (proceeds.lessThan(0) || (disposalType === "DISCARD" && !proceeds.isZero())) throw new AppError("INVALID_DISPOSAL_PROCEEDS", "报废处置收入必须为零且处置收入不能为负数", 400);
    if (!this.periods) throw new AppError("ACCOUNTING_PERIOD_NOT_CONFIGURED", "未配置会计期间服务，无法生成处置凭证", 500);
    const period = await this.periods.resolveOpenPeriod(date);
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findFirst({ where: { id, deletedAt: null }, include: { disposals: { where: { deletedAt: null } } } });
      if (!asset) throw new AppError("FIXED_ASSET_NOT_FOUND", "固定资产不存在", 404);
      if (asset.status !== FIXED_ASSET_STATUS.ACTIVE && asset.status !== FIXED_ASSET_STATUS.INACTIVE) throw new AppError("FIXED_ASSET_FINALIZED", "该资产已处置，不能重复处置", 409);
      if (asset.disposals.length) throw new AppError("FIXED_ASSET_DISPOSAL_EXISTS", "该资产已有处置记录", 409);
      if (date < asset.purchaseDate) throw new AppError("INVALID_DISPOSAL_DATE", "处置日期不能早于购买日期", 400);
      const accumulated = Prisma.Decimal.min(asset.originalValue, Prisma.Decimal.max(ZERO, asset.accumulatedDepreciation));
      const netBookValue = asset.originalValue.minus(accumulated);
      const gainLoss = proceeds.minus(netBookValue);
      const codes = await tx.account.findMany({ where: { code: { in: ["1601", "1602", "1606", "6115"] }, deletedAt: null, isEnabled: true, isLeaf: true }, select: { id: true, code: true, category: true } });
      const byCode = new Map(codes.map((account) => [account.code, account.id]));
      const fixedAssetAccountId = byCode.get("1601"); const accumulatedAccountId = byCode.get("1602"); const clearingAccountId = byCode.get("1606");
      const gainLossAccountId = input.gainLossAccountId ?? byCode.get("6115");
      const proceedsAccountId = input.proceedsAccountId ?? (await tx.account.findFirst({ where: { code: "1002", deletedAt: null, isEnabled: true, isLeaf: true }, select: { id: true } }))?.id;
      if (!fixedAssetAccountId || !accumulatedAccountId || !clearingAccountId || !gainLossAccountId || (proceeds.greaterThan(0) && !proceedsAccountId)) throw new AppError("FIXED_ASSET_DISPOSAL_ACCOUNTS_MISSING", "缺少固定资产处置所需科目，请先维护1601、1602、1606、6115及收款科目", 409);
      await this.validateDisposalAccounts(tx, fixedAssetAccountId, accumulatedAccountId, clearingAccountId, gainLossAccountId, proceedsAccountId, proceeds, input.proceedsAccountId !== undefined);
      const result = await tx.fixedAssetDisposal.create({ data: { assetId: id, disposalType, disposalDate: date, proceeds, accumulatedDepreciation: accumulated, netBookValue, gainLoss, reason: input.reason?.trim() || null, createdById: actor.actorId } });
      const summary = `固定资产${disposalType === "SALE" ? "出售" : "报废"}：${asset.assetNo} ${asset.name}`;
      const entries: any[] = [];
      let lineNo = 1;
      entries.push({ lineNo: lineNo++, accountId: clearingAccountId, summary, debitAmount: asset.originalValue, creditAmount: ZERO });
      entries.push({ lineNo: lineNo++, accountId: fixedAssetAccountId, summary, debitAmount: ZERO, creditAmount: asset.originalValue });
      if (accumulated.greaterThan(0)) entries.push({ lineNo: lineNo++, accountId: accumulatedAccountId, summary, debitAmount: accumulated, creditAmount: ZERO });
      if (proceeds.greaterThan(0)) entries.push({ lineNo: lineNo++, accountId: proceedsAccountId!, summary, debitAmount: proceeds, creditAmount: ZERO });
      const clearingCredit = accumulated.plus(proceeds);
      if (clearingCredit.greaterThan(0)) entries.push({ lineNo: lineNo++, accountId: clearingAccountId, summary, debitAmount: ZERO, creditAmount: clearingCredit });
      if (gainLoss.greaterThan(0)) entries.push({ lineNo: lineNo++, accountId: clearingAccountId, summary, debitAmount: gainLoss, creditAmount: ZERO }, { lineNo: lineNo++, accountId: gainLossAccountId, summary, debitAmount: ZERO, creditAmount: gainLoss });
      else if (gainLoss.lessThan(0)) { const loss = gainLoss.abs(); entries.push({ lineNo: lineNo++, accountId: gainLossAccountId, summary, debitAmount: loss, creditAmount: ZERO }, { lineNo: lineNo++, accountId: clearingAccountId, summary, debitAmount: ZERO, creditAmount: loss }); }
      const sequence = await this.nextNumber(tx, period.year);
      const total = entries.reduce((sum, entry) => sum.plus(entry.debitAmount), ZERO);
      const voucher = await tx.voucher.create({ data: { ...sequence, fiscalYear: period.year, fiscalPeriod: period.month, voucherDate: date, postingDate: date, periodId: period.id, summary, sourceType: "MANUAL", status: VOUCHER_STATUS.POSTED, totalDebit: total, totalCredit: total, createdById: actor.actorId, reviewerId: actor.actorId, reviewedAt: new Date(), postedById: actor.actorId, postedAt: new Date(), entries: { create: entries } } });
      await tx.fixedAsset.update({ where: { id }, data: { status: disposalType === "SALE" ? FIXED_ASSET_STATUS.SOLD : FIXED_ASSET_STATUS.DISCARDED } });
      const event = await tx.accountingEvent.create({ data: { eventType: "FIXED_ASSET_DISPOSAL", sourceType: "FixedAssetDisposal", sourceId: result.id, voucherId: voucher.id, description: summary, createdById: actor.actorId } });
      await tx.fixedAssetDisposal.update({ where: { id: result.id }, data: { voucherId: voucher.id } });
      await this.audit(tx, actor.actorId, "CREATE", result.id, { assetId: id, disposalType, proceeds: proceeds.toString(), netBookValue: netBookValue.toString(), gainLoss: gainLoss.toString(), voucherId: voucher.id, eventId: event.id });
      return { ...result, voucherId: voucher.id, voucherNo: voucher.voucherNo };
    });
  }

  async disposals(id: number) {
    const asset = await this.prisma.fixedAsset.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!asset) throw new AppError("FIXED_ASSET_NOT_FOUND", "固定资产不存在", 404);
    return this.prisma.fixedAssetDisposal.findMany({ where: { assetId: id, deletedAt: null }, include: { voucher: true }, orderBy: { disposalDate: "desc" } });
  }

  private async nextNumber(tx: Prisma.TransactionClient, year: number) {
    await tx.$executeRaw`INSERT IGNORE INTO voucher_sequences (fiscal_year,next_value,created_at,updated_at,deleted_at) VALUES (${year},1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL)`;
    const rows = await tx.$queryRaw<Array<{ next_value: number }>>`SELECT next_value FROM voucher_sequences WHERE fiscal_year=${year} FOR UPDATE`;
    const sequenceNo = Number(rows[0]?.next_value); await tx.voucherSequence.update({ where: { fiscalYear: year }, data: { nextValue: sequenceNo + 1 } });
    return { sequenceNo, voucherNo: `${year}-${String(sequenceNo).padStart(6, "0")}` };
  }

  private data(input: any, partial = false) {
    const original = new Prisma.Decimal(String(input.originalValue));
    const rate = new Prisma.Decimal(String(input.residualRate));
    if (input.depreciationMethod !== "STRAIGHT_LINE" || original.lessThanOrEqualTo(0) || rate.lessThan(0) || rate.greaterThanOrEqualTo(1) || !Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths < 1) throw new AppError("INVALID_FIXED_ASSET", "固定资产折旧参数无效", 400);
    const purchaseDate = new Date(input.purchaseDate); const startUseDate = new Date(input.startUseDate);
    if (Number.isNaN(purchaseDate.getTime()) || Number.isNaN(startUseDate.getTime()) || startUseDate < purchaseDate) throw new AppError("INVALID_FIXED_ASSET_DATE", "启用日期不能早于购买日期", 400);
    const residualValue = original.mul(rate).toDecimalPlaces(4);
    const accumulated = partial ? new Prisma.Decimal(String(input.accumulatedDepreciation ?? "0")) : ZERO;
    const depreciationExpenseAccountId = input.depreciationExpenseAccountId ? Number(input.depreciationExpenseAccountId) : null;
    if (depreciationExpenseAccountId !== null && (!Number.isInteger(depreciationExpenseAccountId) || depreciationExpenseAccountId < 1)) throw new AppError("INVALID_DEPRECIATION_EXPENSE_ACCOUNT", "折旧费用科目无效", 400);
    return { assetNo: String(input.assetNo).trim(), name: String(input.name).trim(), category: String(input.category).trim(), purchaseDate, startUseDate, originalValue: original, residualRate: rate, residualValue, depreciationMethod: "STRAIGHT_LINE", usefulLifeMonths: input.usefulLifeMonths, accumulatedDepreciation: accumulated, netValue: original.minus(accumulated), department: input.department?.trim() || null, custodian: input.custodian?.trim() || null, depreciationExpenseAccountId };
  }

  private async validateDisposalAccounts(tx: Prisma.TransactionClient, fixedAssetId: number, accumulatedId: number, clearingId: number, gainLossId: number, proceedsId: number | undefined, proceeds: Prisma.Decimal, customProceeds: boolean) {
    const ids = [fixedAssetId, accumulatedId, clearingId, gainLossId, ...(proceedsId ? [proceedsId] : [])];
    const accounts = await tx.account.findMany({ where: { id: { in: ids }, deletedAt: null, isEnabled: true, isLeaf: true }, select: { id: true, code: true, category: true } });
    const byId = new Map(accounts.map(account => [account.id, account]));
    const fixedAsset = byId.get(fixedAssetId);
    const accumulated = byId.get(accumulatedId);
    const clearing = byId.get(clearingId);
    const gainLoss = byId.get(gainLossId);
    if (fixedAsset?.code !== "1601" || fixedAsset.category !== "ASSET" || accumulated?.code !== "1602" || accumulated.category !== "ASSET" || clearing?.code !== "1606" || clearing.category !== "ASSET") {
      throw new AppError("INVALID_FIXED_ASSET_DISPOSAL_ACCOUNT", "固定资产处置基础科目必须是已启用的末级资产类科目", 400);
    }
    if (!gainLoss?.code.startsWith("6") || gainLoss.category !== "PROFIT_AND_LOSS") {
      throw new AppError("INVALID_FIXED_ASSET_DISPOSAL_ACCOUNT", "处置损益科目必须是已启用的末级损益类科目", 400);
    }
    if ((proceeds.greaterThan(0) || customProceeds) && (!proceedsId || !byId.get(proceedsId)?.code.match(/^100[12]/) || byId.get(proceedsId)?.category !== "ASSET")) {
      throw new AppError("INVALID_FIXED_ASSET_DISPOSAL_ACCOUNT", "收款科目必须是已启用的末级现金或银行存款科目", 400);
    }
  }

  private async validateDepreciationExpenseAccount(tx: Prisma.TransactionClient, accountId: number | null) {
    if (!accountId) return;
    const account = await tx.account.findFirst({ where: { id: accountId, deletedAt: null, isEnabled: true, isLeaf: true, category: { in: ["COST", "PROFIT_AND_LOSS"] } }, select: { id: true } });
    if (!account) throw new AppError("INVALID_DEPRECIATION_EXPENSE_ACCOUNT", "折旧费用科目必须是已启用的成本类或损益类末级科目", 400);
  }

  private admin(actor: Actor) { if (canEditAccounting(actor.role)) return; throw new AppError("FORBIDDEN", "仅会计或财务主管可以维护固定资产", 403); }
  private audit(tx: Prisma.TransactionClient, actorId: number, action: "CREATE" | "UPDATE", resourceId: number, afterData: object) { return tx.auditLog.create({ data: { actorId, action, resourceType: "FixedAsset", resourceId, beforeData: Prisma.JsonNull, afterData } }); }
}
