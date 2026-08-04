import { describe, expect, it } from "vitest";
import { AccountBalanceService } from "../src/modules/account-balance/account-balance.service.js";
import { FakeAccountBalanceRepository } from "./helpers/fake-account-balance-repository.js";

describe("AccountBalanceService", () => {
  it("rolls detailed account totals into parents and calculates balances", async () => {
    const repository = new FakeAccountBalanceRepository();
    repository.before = [{ accountId: 101, debit: "100", credit: "0" }];
    repository.period = [
      { accountId: 101, debit: "0.2", credit: "30" },
      { accountId: 200, debit: "0", credit: "50" },
    ];
    const result = await new AccountBalanceService(repository).getBalances({
      startDate: new Date(2026, 6, 1), endDate: new Date(2026, 6, 31), includeZero: true,
    });
    const parent = result.rows.find((row) => row.account.code === "1002");
    const child = result.rows.find((row) => row.account.code === "100201");
    const payable = result.rows.find((row) => row.account.code === "2202");

    expect(parent).toMatchObject({ opening: { direction: "DEBIT", amount: "100" }, periodDebit: "0.2", periodCredit: "30", closing: { direction: "DEBIT", amount: "70.2" } });
    expect(child).toMatchObject({ closing: { direction: "DEBIT", amount: "70.2" } });
    expect(payable).toMatchObject({ closing: { direction: "CREDIT", amount: "50" } });
  });

  it("omits fully zero rows when requested", async () => {
    const repository = new FakeAccountBalanceRepository();
    repository.period = [{ accountId: 101, debit: "1", credit: "0" }];
    const result = await new AccountBalanceService(repository).getBalances({
      startDate: new Date(2026, 6, 1), endDate: new Date(2026, 6, 31), includeZero: false,
    });
    expect(result.rows.map((row) => row.account.code)).toEqual(["1002", "100201"]);
  });

  it("rejects inverted periods", async () => {
    await expect(
      new AccountBalanceService(new FakeAccountBalanceRepository()).getBalances({
        startDate: new Date(2026, 6, 31), endDate: new Date(2026, 6, 1), includeZero: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_DATE_RANGE" });
  });
});
