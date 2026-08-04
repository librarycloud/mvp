import type { GeneralLedgerRepository } from "../../src/modules/general-ledger/general-ledger.repository.js";
import type { LedgerAccount, LedgerEntryRecord, LedgerQuery } from "../../src/modules/general-ledger/general-ledger.types.js";

export class FakeGeneralLedgerRepository implements GeneralLedgerRepository {
  account: LedgerAccount | null = {
    id: 701,
    code: "1002",
    name: "银行存款",
    normalDirection: "DEBIT",
  };
  opening = { debit: "0", credit: "0" };
  entries: LedgerEntryRecord[] = [];

  async findAccount(id: number) {
    return this.account?.id === id ? this.account : null;
  }

  async openingTotals(_accountId: number, _startDate: Date) {
    return this.opening;
  }

  async listEntries(_query: LedgerQuery) {
    return this.entries;
  }
}
