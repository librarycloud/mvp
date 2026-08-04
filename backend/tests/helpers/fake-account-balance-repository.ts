import type { AccountBalanceRepository } from "../../src/modules/account-balance/account-balance.repository.js";
import type { AccountBalanceQuery, BalanceAccount, DebitCreditTotal } from "../../src/modules/account-balance/account-balance.types.js";

export class FakeAccountBalanceRepository implements AccountBalanceRepository {
  accounts: BalanceAccount[] = [
    {
      id: 100, code: "1002", name: "银行存款", category: "ASSET",
      normalDirection: "DEBIT", parentId: null, level: 1, sortOrder: 10, isEnabled: true, deletedAt: null,
    },
    {
      id: 101, code: "100201", name: "基本户", category: "ASSET",
      normalDirection: "DEBIT", parentId: 100, level: 2, sortOrder: 20, isEnabled: true, deletedAt: null,
    },
    {
      id: 200, code: "2202", name: "应付账款", category: "LIABILITY",
      normalDirection: "CREDIT", parentId: null, level: 1, sortOrder: 30, isEnabled: true, deletedAt: null,
    },
  ];
  before: DebitCreditTotal[] = [];
  period: DebitCreditTotal[] = [];

  async listAccounts() {
    return this.accounts;
  }

  async aggregateBefore(_startDate: Date) {
    return this.before;
  }

  async aggregatePeriod(_query: AccountBalanceQuery) {
    return this.period;
  }
}
