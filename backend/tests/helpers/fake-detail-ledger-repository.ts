import type { DetailLedgerRepository } from "../../src/modules/detail-ledger/detail-ledger.repository.js";
import type {
  DetailLedgerAccount,
  DetailLedgerEntry,
  DetailLedgerQuery,
} from "../../src/modules/detail-ledger/detail-ledger.types.js";

export class FakeDetailLedgerRepository implements DetailLedgerRepository {
  account: DetailLedgerAccount | null = {
    id: 701,
    code: "6602",
    name: "管理费用",
    normalDirection: "DEBIT",
  };
  before: DetailLedgerEntry[] = [];
  period: DetailLedgerEntry[] = [];

  async findAccount(id: number) {
    return this.account?.id === id ? this.account : null;
  }

  async listBefore(_accountId: number, _startDate: Date) {
    return this.before;
  }

  async listPeriod(_query: DetailLedgerQuery) {
    return this.period;
  }
}
