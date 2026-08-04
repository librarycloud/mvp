import type { TrialBalanceRepository } from "../../src/modules/trial-balance/trial-balance.repository.js";
import type { TrialAccount, TrialBalanceQuery, TrialDebitCreditTotal } from "../../src/modules/trial-balance/trial-balance.types.js";

export class FakeTrialBalanceRepository implements TrialBalanceRepository {
  accounts: TrialAccount[] = [
    { id: 1, code: "1002", name: "银行存款", category: "ASSET", normalDirection: "DEBIT", isLeaf: false, sortOrder: 10, deletedAt: null },
    { id: 2, code: "100201", name: "基本户", category: "ASSET", normalDirection: "DEBIT", isLeaf: true, sortOrder: 20, deletedAt: null },
    { id: 3, code: "2202", name: "应付账款", category: "LIABILITY", normalDirection: "CREDIT", isLeaf: true, sortOrder: 30, deletedAt: null },
    { id: 4, code: "6602", name: "管理费用", category: "PROFIT_AND_LOSS", normalDirection: "DEBIT", isLeaf: true, sortOrder: 40, deletedAt: null },
  ];
  before: TrialDebitCreditTotal[] = [];
  period: TrialDebitCreditTotal[] = [];

  async listAccounts() { return this.accounts; }
  async aggregateBefore(_startDate: Date) { return this.before; }
  async aggregatePeriod(_query: TrialBalanceQuery) { return this.period; }
}
