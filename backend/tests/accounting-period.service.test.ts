import { describe, expect, it } from "vitest";
import { AccountingPeriodService } from "../src/modules/accounting-period/accounting-period.service.js";
import { FakeAccountingPeriodRepository } from "./helpers/fake-accounting-period-repository.js";

const admin = { actorId: 1, role: "ADMIN" as const };
const user = { ...admin, role: "ACCOUNTANT" as const };

describe("AccountingPeriodService", () => {
  it("creates calendar month periods and prevents duplicates", async () => {
    const service = new AccountingPeriodService(new FakeAccountingPeriodRepository());
    const period = await service.create(2026, 2, admin);
    expect(period).toMatchObject({ periodCode: "2026-02", status: 0 });
    await expect(service.create(2026, 2, admin)).rejects.toMatchObject({ code: "ACCOUNTING_PERIOD_EXISTS" });
  });

  it("only allows administrators to close and reopen periods", async () => {
    const service = new AccountingPeriodService(new FakeAccountingPeriodRepository());
    const period = await service.create(2026, 6, admin) as { id: number };
    await expect(service.close(period.id, user)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.resolveOpenPeriod(new Date(Date.UTC(2026, 5, 10)))).resolves.toMatchObject({ id: period.id });
    await service.close(period.id, admin);
    await expect(service.resolveOpenPeriod(new Date(Date.UTC(2026, 5, 10)))).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
    await service.reopen(period.id, admin);
    await expect(service.resolveOpenPeriod(new Date(Date.UTC(2026, 5, 10)))).resolves.toMatchObject({ status: 0 });
  });

  it("updates an open period to a custom cross-month date range", async () => {
    const service = new AccountingPeriodService(new FakeAccountingPeriodRepository());
    const period = await service.create(2026, 6, admin) as { id: number };

    await expect(service.update(period.id, {
      startDate: "2026-06-01",
      endDate: "2026-07-05",
    }, admin)).resolves.toMatchObject({
      periodCode: "2026-06",
      startDate: new Date(Date.UTC(2026, 5, 1)),
      endDate: new Date(Date.UTC(2026, 6, 5)),
    });
  });

  it("rejects updates to closed periods", async () => {
    const service = new AccountingPeriodService(new FakeAccountingPeriodRepository());
    const period = await service.create(2026, 6, admin) as { id: number };
    await service.close(period.id, admin);

    await expect(service.update(period.id, {
      startDate: "2026-06-01",
      endDate: "2026-07-05",
    }, admin)).rejects.toMatchObject({ code: "ACCOUNTING_PERIOD_NOT_OPEN" });
  });

  it("rejects reversed and overlapping date ranges", async () => {
    const service = new AccountingPeriodService(new FakeAccountingPeriodRepository());
    const june = await service.create(2026, 6, admin) as { id: number };
    const july = await service.create(2026, 7, admin) as { id: number };

    await expect(service.update(june.id, {
      startDate: "2026-07-05",
      endDate: "2026-06-01",
    }, admin)).rejects.toMatchObject({ code: "INVALID_ACCOUNTING_PERIOD" });
    await expect(service.update(july.id, {
      startDate: "2026-06-30",
      endDate: "2026-07-31",
    }, admin)).rejects.toMatchObject({ code: "ACCOUNTING_PERIOD_EXISTS" });
  });

  it("rejects creating a month that overlaps a custom period", async () => {
    const service = new AccountingPeriodService(new FakeAccountingPeriodRepository());
    const june = await service.create(2026, 6, admin) as { id: number };
    await service.update(june.id, { startDate: "2026-06-01", endDate: "2026-07-05" }, admin);

    await expect(service.create(2026, 7, admin)).rejects.toMatchObject({ code: "ACCOUNTING_PERIOD_OVERLAP" });
  });
});
