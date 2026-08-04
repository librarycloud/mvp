import { describe, expect, it } from "vitest";
import { TrialBalanceService } from "../src/modules/trial-balance/trial-balance.service.js";
import { FakeTrialBalanceRepository } from "./helpers/fake-trial-balance-repository.js";

describe("TrialBalanceService", () => {
  it("balances opening, period, and closing totals without parent double counting", async () => {
    const repository = new FakeTrialBalanceRepository();
    repository.before = [
      { accountId: 2, debit: "100", credit: "0" },
      { accountId: 3, debit: "0", credit: "100" },
    ];
    repository.period = [
      { accountId: 2, debit: "0.1", credit: "0" },
      { accountId: 3, debit: "0", credit: "0.1" },
    ];
    const result = await new TrialBalanceService(repository).getTrialBalance({
      startDate: new Date(2026, 6, 1), endDate: new Date(2026, 6, 31), includeZero: false,
    });

    expect(result.rows.map((row) => row.account.code)).toEqual(["100201", "2202"]);
    expect(result.totals).toEqual({
      openingDebit: "100", openingCredit: "100", periodDebit: "0.1", periodCredit: "0.1", closingDebit: "100.1", closingCredit: "100.1",
    });
    expect(result.isBalanced).toBe(true);
  });

  it("keeps non-leaf accounts with direct historical postings but hides unused zero leaves", async () => {
    const repository = new FakeTrialBalanceRepository();
    repository.period = [{ accountId: 1, debit: "5", credit: "5" }];
    const result = await new TrialBalanceService(repository).getTrialBalance({
      startDate: new Date(2026, 6, 1), endDate: new Date(2026, 6, 31), includeZero: false,
    });
    expect(result.rows.map((row) => row.account.code)).toEqual(["1002"]);
    expect(result.isBalanced).toBe(true);
  });

  it("includes zero posting leaves when requested", async () => {
    const result = await new TrialBalanceService(new FakeTrialBalanceRepository()).getTrialBalance({
      startDate: new Date(2026, 6, 1), endDate: new Date(2026, 6, 31), includeZero: true,
    });
    expect(result.rows.map((row) => row.account.code)).toEqual(["100201", "2202", "6602"]);
  });
});
