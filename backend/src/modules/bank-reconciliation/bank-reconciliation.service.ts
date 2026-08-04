import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { canOperateCash } from "../../common/auth/authorization.js";
import { VOUCHER_STATUS } from "../../common/status-codes.js";
import type { BankMatchInput, BankReconciliationActor, BankReconciliationInput, BankReconciliationUpdateInput, BankTransactionDirection } from "./bank-reconciliation.types.js";

const ZERO = new Prisma.Decimal(0);
const STATUS = { DRAFT: 0, COMPLETED: 1 } as const;

export class BankReconciliationService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filter: { periodId?: number; bankAccountId?: number; status?: number }) {
    const rows = await this.prisma.bankReconciliation.findMany({
      where: { deletedAt: null, ...(filter.periodId ? { periodId: filter.periodId } : {}), ...(filter.bankAccountId ? { bankAccountId: filter.bankAccountId } : {}), ...(filter.status !== undefined ? { status: filter.status } : {}) },
      include: { period: true, bankAccount: { select: { id: true, code: true, name: true } }, _count: { select: { matches: { where: { deletedAt: null } } } } },
      orderBy: [{ period: { startDate: "desc" } }, { bankAccount: { code: "asc" } }],
    });
    return Promise.all(rows.map(async row => {
      const bookClosingBalance = await this.bookBalance(row.bankAccountId, row.period.endDate);
      return { ...row, bookClosingBalance, difference: row.statementClosingBalance.minus(bookClosingBalance) };
    }));
  }

  async create(input: BankReconciliationInput, actor: BankReconciliationActor) {
    const opening = this.money(input.statementOpeningBalance, "银行对账单期初余额", true);
    const closing = this.money(input.statementClosingBalance, "银行对账单期末余额", true);
    const [period, account] = await Promise.all([
      this.prisma.accountingPeriod.findFirst({ where: { id: input.periodId, deletedAt: null } }),
      this.prisma.account.findFirst({ where: { id: input.bankAccountId, deletedAt: null, isEnabled: true, isLeaf: true } }),
    ]);
    if (!period) throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "会计期间不存在", 404);
    if (!account || !account.code.startsWith("1002")) throw new AppError("INVALID_BANK_ACCOUNT", "请选择银行存款末级科目", 400);
    const existing = await this.prisma.bankReconciliation.findFirst({ where: { periodId: period.id, bankAccountId: account.id, deletedAt: null } });
    if (existing) throw new AppError("BANK_RECONCILIATION_EXISTS", "该期间和银行科目已经建立对账单", 409);
    const bookClosing = await this.bookBalance(account.id, period.endDate);
    return this.prisma.$transaction(async tx => {
      const row = await tx.bankReconciliation.create({ data: { reconciliationNo: `BR-${period.periodCode.replace("-", "")}-${account.code}`, periodId: period.id, bankAccountId: account.id, statementOpeningBalance: opening, statementClosingBalance: closing, bookClosingBalance: bookClosing, difference: closing.minus(bookClosing), remark: input.remark?.trim() || null, createdById: actor.actorId } });
      const linkedMatches = await this.linkedMatches(tx, period.id, period.startDate, period.endDate, account.id, actor.actorId, row.id);
      if (linkedMatches.length) await tx.bankReconciliationMatch.createMany({ data: linkedMatches });
      await this.audit(tx, actor.actorId, "CREATE", row.id, { periodId: period.id, bankAccountId: account.id });
      return row;
    });
  }

  async update(id: number, input: BankReconciliationUpdateInput, actor: BankReconciliationActor) {
    const row = await this.requireDraft(id);
    const opening = this.money(input.statementOpeningBalance, "银行对账单期初余额", true);
    const closing = this.money(input.statementClosingBalance, "银行对账单期末余额", true);
    const bookClosing = await this.bookBalance(row.bankAccountId, row.period.endDate);
    const data = {
      statementOpeningBalance: opening,
      statementClosingBalance: closing,
      bookClosingBalance: bookClosing,
      difference: closing.minus(bookClosing),
      remark: input.remark?.trim() || null,
    };
    return this.prisma.$transaction(async tx => {
      const updated = await tx.bankReconciliation.update({ where: { id }, data });
      await this.audit(tx, actor.actorId, "UPDATE", id, data, {
        statementOpeningBalance: row.statementOpeningBalance,
        statementClosingBalance: row.statementClosingBalance,
        bookClosingBalance: row.bookClosingBalance,
        difference: row.difference,
        remark: row.remark,
      });
      return updated;
    });
  }

  async detail(id: number) {
    const row = await this.require(id);
    const [transactions, entries, matches, profile, currentBookClosing, unpostedBankEntryCount] = await Promise.all([
      this.prisma.bankTransaction.findMany({ where: { deletedAt: null, transactionDate: { gte: row.period.startDate, lte: row.period.endDate } }, orderBy: [{ transactionDate: "asc" }, { transactionNo: "asc" }] }),
      this.prisma.voucherEntry.findMany({ where: { deletedAt: null, accountId: row.bankAccountId, voucher: { deletedAt: null, status: VOUCHER_STATUS.POSTED, postingDate: { gte: row.period.startDate, lte: row.period.endDate } } }, include: { voucher: { select: { id: true, voucherNo: true, postingDate: true, summary: true } } }, orderBy: [{ voucher: { postingDate: "asc" } }, { lineNo: "asc" }] }),
      this.prisma.bankReconciliationMatch.findMany({ where: { reconciliationId: id, deletedAt: null }, include: { bankTransaction: true, voucherEntry: { include: { voucher: { select: { id: true, voucherNo: true, postingDate: true, summary: true } } } }, matchedBy: { select: { id: true, displayName: true } } }, orderBy: { matchedAt: "asc" } }),
      this.prisma.companyProfile.findFirst({ where: { deletedAt: null }, select: { bankAccount: true } }),
      this.bookBalance(row.bankAccountId, row.period.endDate),
      this.prisma.voucherEntry.count({ where: { deletedAt: null, accountId: row.bankAccountId, voucher: { deletedAt: null, status: { in: [VOUCHER_STATUS.DRAFT, VOUCHER_STATUS.PENDING] }, postingDate: { gte: row.period.startDate, lte: row.period.endDate } } } }),
    ]);
    const transactionMatched = this.sumBy(matches, match => match.bankTransactionId);
    const entryMatched = this.sumBy(matches, match => match.voucherEntryId);
    const ownBankAccount = this.accountNumber(profile?.bankAccount);
    const relevantTransactions = ownBankAccount
      ? transactions.filter(item => [item.payerAccount, item.payeeAccount].some(value => this.accountNumber(value) === ownBankAccount))
      : transactions;
    const transactionRows = relevantTransactions.map(item => ({ ...item, direction: this.transactionDirection(item, profile?.bankAccount), directionConfirmed: Boolean(item.reconciliationDirection), matchedAmount: (transactionMatched.get(item.id) ?? ZERO).toString(), remainingAmount: Prisma.Decimal.max(ZERO, item.amount.abs().minus(transactionMatched.get(item.id) ?? ZERO)).toString() }));
    const entryRows = entries.map(item => { const amount = Prisma.Decimal.max(item.debitAmount, item.creditAmount); const matched = entryMatched.get(item.id) ?? ZERO; return { ...item, direction: this.entryDirection(item), movementAmount: amount.toString(), matchedAmount: matched.toString(), remainingAmount: Prisma.Decimal.max(ZERO, amount.minus(matched)).toString() }; });
    const unmatchedTransactionAmount = transactionRows.reduce((sum, item) => sum.plus(item.remainingAmount), ZERO);
    const unmatchedEntryAmount = entryRows.reduce((sum, item) => sum.plus(item.remainingAmount), ZERO);
    return {
      ...row,
      companyBankAccount: profile?.bankAccount ?? null,
      bookClosingBalance: currentBookClosing,
      difference: row.statementClosingBalance.minus(currentBookClosing),
      unpostedBankEntryCount,
      unmatchedTransactionAmount: unmatchedTransactionAmount.toString(),
      unmatchedEntryAmount: unmatchedEntryAmount.toString(),
      matchingDifference: unmatchedTransactionAmount.minus(unmatchedEntryAmount).toString(),
      transactions: transactionRows,
      entries: entryRows,
      matches,
    };
  }

  async confirmTransactionDirection(id: number, transactionId: number, direction: BankTransactionDirection, actor: BankReconciliationActor) {
    const row = await this.requireDraft(id);
    return this.prisma.$transaction(async tx => {
      const transaction = await tx.bankTransaction.findFirst({
        where: { id: transactionId, deletedAt: null, transactionDate: { gte: row.period.startDate, lte: row.period.endDate } },
      });
      if (!transaction) throw new AppError("BANK_TRANSACTION_NOT_FOUND", "当前对账期间内未找到银行流水", 404);
      const matches = await tx.bankReconciliationMatch.findMany({
        where: { reconciliationId: id, bankTransactionId: transactionId, deletedAt: null },
        include: { voucherEntry: true },
      });
      if (matches.some(match => this.entryDirection(match.voucherEntry) !== direction)) {
        throw new AppError("BANK_DIRECTION_CONFLICTS_WITH_MATCH", "所选方向与该流水已匹配的凭证分录方向不一致，请先解除匹配", 409);
      }
      const updated = await tx.bankTransaction.update({
        where: { id: transactionId },
        data: { reconciliationDirection: direction, directionConfirmedAt: new Date(), directionConfirmedById: actor.actorId },
      });
      await tx.auditLog.create({ data: {
        actorId: actor.actorId,
        action: "UPDATE",
        resourceType: "BankTransaction",
        resourceId: transactionId,
        beforeData: { reconciliationDirection: transaction.reconciliationDirection },
        afterData: { reconciliationDirection: direction, reconciliationId: id },
      } });
      return updated;
    });
  }

  async match(id: number, input: BankMatchInput, actor: BankReconciliationActor, matchType = "MANUAL") {
    const row = await this.requireDraft(id);
    const amount = this.money(input.matchedAmount, "匹配金额");
    if (!amount.greaterThan(0)) throw new AppError("INVALID_MATCH_AMOUNT", "匹配金额必须大于零", 400);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM bank_reconciliations WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${input.bankTransactionId} AND deleted_at IS NULL FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM voucher_entries WHERE id = ${input.voucherEntryId} AND deleted_at IS NULL FOR UPDATE`;
      const lockedReconciliation = await tx.bankReconciliation.findFirst({ where: { id, deletedAt: null }, select: { status: true } });
      if (!lockedReconciliation || lockedReconciliation.status !== STATUS.DRAFT) throw new AppError("BANK_RECONCILIATION_COMPLETED", "Bank reconciliation is no longer editable", 409);
      const [transaction, entry, transactionUsed, entryUsed, profile, existingPair] = await Promise.all([
        tx.bankTransaction.findFirst({ where: { id: input.bankTransactionId, deletedAt: null, transactionDate: { gte: row.period.startDate, lte: row.period.endDate } } }),
        tx.voucherEntry.findFirst({ where: { id: input.voucherEntryId, deletedAt: null, accountId: row.bankAccountId, voucher: { deletedAt: null, status: VOUCHER_STATUS.POSTED, periodId: row.periodId } }, include: { voucher: true } }),
        tx.bankReconciliationMatch.aggregate({ where: { bankTransactionId: input.bankTransactionId, deletedAt: null }, _sum: { matchedAmount: true } }),
        tx.bankReconciliationMatch.aggregate({ where: { voucherEntryId: input.voucherEntryId, deletedAt: null }, _sum: { matchedAmount: true } }),
        tx.companyProfile.findFirst({ where: { deletedAt: null }, select: { bankAccount: true } }),
        tx.bankReconciliationMatch.findFirst({ where: { reconciliationId: id, bankTransactionId: input.bankTransactionId, voucherEntryId: input.voucherEntryId } }),
      ]);
      if (!transaction) throw new AppError("BANK_TRANSACTION_NOT_FOUND", "当前期间内未找到银行流水", 404);
      if (!entry) throw new AppError("BANK_ENTRY_NOT_FOUND", "当前银行科目内未找到已记账分录", 404);
      if (existingPair && !existingPair.deletedAt) throw new AppError("BANK_MATCH_EXISTS", "该流水与凭证分录已经匹配", 409);
      const transactionDirection = this.transactionDirection(transaction, profile?.bankAccount);
      const entryDirection = this.entryDirection(entry);
      if (transactionDirection === "UNKNOWN") throw new AppError("BANK_TRANSACTION_DIRECTION_REQUIRED", "请先确认银行流水方向", 409);
      if (entryDirection !== transactionDirection) {
        throw new AppError("BANK_MATCH_DIRECTION_MISMATCH", transactionDirection === "INFLOW" ? "银行流入只能匹配银行科目借方分录" : "银行流出只能匹配银行科目贷方分录", 409, { transactionDirection, entryDirection });
      }
      const transactionRemaining = transaction.amount.abs().minus(transactionUsed._sum.matchedAmount ?? ZERO);
      const entryAmount = Prisma.Decimal.max(entry.debitAmount, entry.creditAmount);
      const entryRemaining = entryAmount.minus(entryUsed._sum.matchedAmount ?? ZERO);
      if (amount.greaterThan(transactionRemaining) || amount.greaterThan(entryRemaining)) throw new AppError("MATCH_AMOUNT_EXCEEDED", "匹配金额超过流水或凭证分录的未匹配金额", 409, { transactionRemaining: transactionRemaining.toString(), entryRemaining: entryRemaining.toString() });
      const match = existingPair
        ? await tx.bankReconciliationMatch.update({ where: { id: existingPair.id }, data: { matchedAmount: amount, matchType, matchedById: actor.actorId, matchedAt: new Date(), deletedAt: null } })
        : await tx.bankReconciliationMatch.create({ data: { reconciliationId: id, bankTransactionId: transaction.id, voucherEntryId: entry.id, matchedAmount: amount, matchType, matchedById: actor.actorId } });
      if (amount.equals(transactionRemaining) && !transaction.voucherId) await tx.bankTransaction.update({ where: { id: transaction.id }, data: { voucherId: entry.voucherId } });
      await this.audit(tx, actor.actorId, "CREATE", row.id, { matchId: match.id, bankTransactionId: transaction.id, voucherEntryId: entry.id, amount: amount.toString() });
      return match;
    });
  }

  async unmatch(matchId: number, actor: BankReconciliationActor) {
    const match = await this.prisma.bankReconciliationMatch.findFirst({ where: { id: matchId, deletedAt: null }, include: { reconciliation: true, voucherEntry: true } });
    if (!match) throw new AppError("BANK_MATCH_NOT_FOUND", "匹配记录不存在", 404);
    if (match.reconciliation.status !== STATUS.DRAFT) throw new AppError("BANK_RECONCILIATION_COMPLETED", "已完成对账，不能解除匹配", 409);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM bank_reconciliations WHERE id = ${match.reconciliationId} AND deleted_at IS NULL FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM bank_reconciliation_matches WHERE id = ${match.id} AND deleted_at IS NULL FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${match.bankTransactionId} AND deleted_at IS NULL FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM voucher_entries WHERE id = ${match.voucherEntryId} AND deleted_at IS NULL FOR UPDATE`;
      const lockedReconciliation = await tx.bankReconciliation.findFirst({ where: { id: match.reconciliationId, deletedAt: null }, select: { status: true } });
      if (!lockedReconciliation || lockedReconciliation.status !== STATUS.DRAFT) throw new AppError("BANK_RECONCILIATION_COMPLETED", "Bank reconciliation is no longer editable", 409);
      await tx.bankReconciliationMatch.update({ where: { id: match.id }, data: { deletedAt: new Date() } });
      await tx.bankTransaction.updateMany({ where: { id: match.bankTransactionId, voucherId: match.voucherEntry.voucherId }, data: { voucherId: null } });
      await this.audit(tx, actor.actorId, "DELETE", match.reconciliationId, { matchId });
    });
  }

  async autoMatch(id: number, actor: BankReconciliationActor) {
    const detail = await this.detail(id);
    if (detail.status !== STATUS.DRAFT) throw new AppError("BANK_RECONCILIATION_COMPLETED", "已完成对账，不能自动匹配", 409);
    const entries = [...detail.entries];
    let count = 0;
    for (const transaction of detail.transactions) {
      if (new Prisma.Decimal(transaction.remainingAmount).lessThanOrEqualTo(0)) continue;
      const linkedCandidates = transaction.voucherId
        ? entries.filter(entry => entry.voucher.id === transaction.voucherId && entry.remainingAmount === transaction.remainingAmount)
        : [];
      const candidate = linkedCandidates.length === 1
        ? linkedCandidates[0]
        : entries.find(entry => transaction.direction !== "UNKNOWN" && entry.direction === transaction.direction && entry.remainingAmount === transaction.remainingAmount && Math.abs(new Date(entry.voucher.postingDate).getTime() - new Date(transaction.transactionDate).getTime()) <= 3 * 86_400_000);
      if (!candidate) continue;
      await this.match(id, { bankTransactionId: transaction.id, voucherEntryId: candidate.id, matchedAmount: transaction.remainingAmount }, actor, "AUTO");
      candidate.remainingAmount = "0";
      count++;
    }
    return { matchedCount: count };
  }

  async complete(id: number, actor: BankReconciliationActor) {
    this.admin(actor);
    const detail = await this.detail(id);
    if (detail.status !== STATUS.DRAFT) throw new AppError("BANK_RECONCILIATION_COMPLETED", "银行对账已经完成", 409);
    const unmatchedTransactions = detail.transactions.filter(item => new Prisma.Decimal(item.remainingAmount).greaterThan(0));
    const unmatchedEntries = detail.entries.filter(item => new Prisma.Decimal(item.remainingAmount).greaterThan(0));
    const bookClosing = await this.bookBalance(detail.bankAccountId, detail.period.endDate);
    const difference = detail.statementClosingBalance.minus(bookClosing);
    if (unmatchedTransactions.length || unmatchedEntries.length || !difference.equals(0)) {
      throw new AppError("BANK_RECONCILIATION_UNBALANCED", `不能完成对账：未匹配流水 ${unmatchedTransactions.length} 条，未匹配分录 ${unmatchedEntries.length} 条，期末余额差额 ${difference.toString()}`, 409, { unmatchedTransactions: unmatchedTransactions.length, unmatchedEntries: unmatchedEntries.length, difference: difference.toString() });
    }
    return this.prisma.bankReconciliation.update({ where: { id }, data: { status: STATUS.COMPLETED, bookClosingBalance: bookClosing, difference, completedAt: new Date(), completedById: actor.actorId } });
  }

  async reopen(id: number, actor: BankReconciliationActor) {
    this.admin(actor);
    const row = await this.require(id);
    if (row.status !== STATUS.COMPLETED) throw new AppError("BANK_RECONCILIATION_NOT_COMPLETED", "银行对账尚未完成", 409);
    return this.prisma.bankReconciliation.update({ where: { id }, data: { status: STATUS.DRAFT, completedAt: null, completedById: null } });
  }

  private require(id: number) { return this.prisma.bankReconciliation.findFirst({ where: { id, deletedAt: null }, include: { period: true, bankAccount: { select: { id: true, code: true, name: true } } } }).then(row => { if (!row) throw new AppError("BANK_RECONCILIATION_NOT_FOUND", "银行对账单不存在", 404); return row; }); }
  private async linkedMatches(tx: Prisma.TransactionClient, periodId: number, startDate: Date, endDate: Date, bankAccountId: number, matchedById: number, reconciliationId: number) {
    const transactions = await tx.bankTransaction.findMany({
      where: { deletedAt: null, voucherId: { not: null }, transactionDate: { gte: startDate, lte: endDate }, reconciliationMatches: { none: { deletedAt: null } } },
      select: { id: true, amount: true, voucher: { select: { id: true, periodId: true, entries: { where: { accountId: bankAccountId, deletedAt: null }, select: { id: true, debitAmount: true, creditAmount: true } } } } },
    });
    return transactions.flatMap(transaction => {
      if (!transaction.voucher || transaction.voucher.periodId !== periodId) return [];
      const matchingEntries = transaction.voucher.entries.filter(entry => Prisma.Decimal.max(entry.debitAmount, entry.creditAmount).equals(transaction.amount.abs()));
      if (matchingEntries.length !== 1) return [];
      return [{ reconciliationId, bankTransactionId: transaction.id, voucherEntryId: matchingEntries[0]!.id, matchedAmount: transaction.amount.abs(), matchType: "BUSINESS", matchedById }];
    });
  }

  private async requireDraft(id: number) { const row = await this.require(id); if (row.status !== STATUS.DRAFT) throw new AppError("BANK_RECONCILIATION_COMPLETED", "已完成对账，不能修改匹配", 409); return row; }
  private money(value: string, field: string, signed = false) { const pattern = signed ? /^-?\d{1,15}(\.\d{1,4})?$/ : /^\d{1,15}(\.\d{1,4})?$/; if (!pattern.test(value)) throw new AppError("INVALID_AMOUNT", `${field}格式错误`, 400); return new Prisma.Decimal(value); }
  private async bookBalance(accountId: number, endDate: Date) { const sums = await this.prisma.voucherEntry.aggregate({ where: { accountId, deletedAt: null, voucher: { deletedAt: null, status: VOUCHER_STATUS.POSTED, postingDate: { lte: endDate } } }, _sum: { debitAmount: true, creditAmount: true } }); return (sums._sum.debitAmount ?? ZERO).minus(sums._sum.creditAmount ?? ZERO); }
  private transactionDirection(item: { amount: Prisma.Decimal; payerAccount: string | null; payeeAccount: string | null; reconciliationDirection?: string | null }, companyBankAccount?: string | null) { if (item.reconciliationDirection === "INFLOW" || item.reconciliationDirection === "OUTFLOW") return item.reconciliationDirection; const own = this.accountNumber(companyBankAccount); const payer = this.accountNumber(item.payerAccount); const payee = this.accountNumber(item.payeeAccount); if (own && payer === own && payee !== own) return "OUTFLOW" as const; if (own && payee === own && payer !== own) return "INFLOW" as const; if (item.amount.isNegative()) return "OUTFLOW" as const; if (!own && item.amount.greaterThan(0)) return "INFLOW" as const; return "UNKNOWN" as const; }
  private entryDirection(item: { debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }) { if (item.debitAmount.greaterThan(0) && item.creditAmount.equals(0)) return "INFLOW" as const; if (item.creditAmount.greaterThan(0) && item.debitAmount.equals(0)) return "OUTFLOW" as const; return "UNKNOWN" as const; }
  private accountNumber(value?: string | null) { return value?.replace(/[^0-9A-Za-z]/g, "").toUpperCase() ?? ""; }
  private sumBy<T>(items: T[], key: (item: T) => number) { const sums = new Map<number, Prisma.Decimal>(); for (const item of items as Array<T & { matchedAmount: Prisma.Decimal }>) sums.set(key(item), (sums.get(key(item)) ?? ZERO).plus(item.matchedAmount)); return sums; }
  private admin(actor: BankReconciliationActor) { if (canOperateCash(actor.role)) return; throw new AppError("FORBIDDEN", "仅出纳或财务主管可以完成或重新打开银行对账", 403); }
  private audit(tx: Prisma.TransactionClient, actorId: number, action: "CREATE" | "UPDATE" | "DELETE", resourceId: number, afterData: object, beforeData?: object) { return tx.auditLog.create({ data: { actorId, action, resourceType: "BankReconciliation", resourceId, beforeData: beforeData ?? Prisma.JsonNull, afterData } }); }
}
