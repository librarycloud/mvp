import { describe, expect, it } from "vitest";
import { VoucherService } from "../src/modules/voucher/voucher.service.js";
import { AccountingPeriodService } from "../src/modules/accounting-period/accounting-period.service.js";
import type { VoucherEntryInput } from "../src/modules/voucher/voucher.types.js";
import { MemoryFileStorage } from "./helpers/memory-file-storage.js";
import {
  FakeVoucherRepository,
  creditAccountId,
  debitAccountId,
} from "./helpers/fake-voucher-repository.js";
import { FakeAccountingPeriodRepository } from "./helpers/fake-accounting-period-repository.js";

const user = { actorId: 1, role: "ACCOUNTANT" as const };
const admin = { actorId: 2, role: "ADMIN" as const };
const balancedEntries: VoucherEntryInput[] = [
  { accountId: debitAccountId, summary: "确认费用", debitAmount: "100.10", creditAmount: "0" },
  { accountId: creditAccountId, summary: "支付款项", debitAmount: "0", creditAmount: "100.10" },
];

function setup() {
  const repository = new FakeVoucherRepository();
  repository.postableAccounts.add(debitAccountId).add(creditAccountId);
  return { repository, service: new VoucherService(repository, new MemoryFileStorage()) };
}

describe("VoucherService", () => {
  it("creates balanced vouchers with program-calculated Decimal totals and numbers", async () => {
    const { service } = setup();
    const first = await service.createManual(
      { voucherDate: new Date(2026, 6, 1), summary: "支付费用", entries: balancedEntries },
      user,
    );
    const second = await service.createManual(
      { voucherDate: new Date(2026, 6, 2), summary: "支付费用", entries: balancedEntries },
      user,
    );

    expect(first).toMatchObject({ voucherNo: "2026-000001", totalDebit: "100.1", totalCredit: "100.1" });
    expect(second).toMatchObject({ voucherNo: "2026-000002" });
  });

  it("blocks voucher posting when the accounting period is closed", async () => {
    const repository = new FakeVoucherRepository();
    repository.postableAccounts.add(debitAccountId).add(creditAccountId);
    const periodService = new AccountingPeriodService(new FakeAccountingPeriodRepository());
    const period = await periodService.create(2026, 7, admin) as { id: number };
    await periodService.close(period.id, admin);
    const service = new VoucherService(repository, new MemoryFileStorage(), periodService);
    await expect(service.createManual(
      { voucherDate: new Date(Date.UTC(2026, 6, 1)), postingDate: new Date(Date.UTC(2026, 6, 1)), summary: "已关账期间", entries: balancedEntries },
      user,
    )).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
  });

  it("rejects unbalanced and double-sided entries", async () => {
    const { service } = setup();
    await expect(
      service.createManual(
        {
          voucherDate: new Date(2026, 6, 1),
          summary: "不平衡",
          entries: [balancedEntries[0]!, { ...balancedEntries[1]!, creditAmount: "99.99" }],
        },
        user,
      ),
    ).rejects.toMatchObject({ code: "VOUCHER_NOT_BALANCED" });
    await expect(
      service.createManual(
        {
          voucherDate: new Date(2026, 6, 1),
          summary: "双边",
          entries: [{ ...balancedEntries[0]!, creditAmount: "1" }, balancedEntries[1]!],
        },
        user,
      ),
    ).rejects.toMatchObject({ code: "INVALID_VOUCHER_ENTRY" });
  });

  it("uses Decimal arithmetic for exact fractional totals", async () => {
    const { service } = setup();
    const voucher = await service.createManual(
      {
        voucherDate: new Date(2026, 6, 1),
        summary: "小数测试",
        entries: [
          { accountId: debitAccountId, summary: "第一项", debitAmount: "0.1", creditAmount: "0" },
          { accountId: debitAccountId, summary: "第二项", debitAmount: "0.2", creditAmount: "0" },
          { accountId: creditAccountId, summary: "合计", debitAmount: "0", creditAmount: "0.3" },
        ],
      },
      user,
    );
    expect(voucher).toMatchObject({ totalDebit: "0.3", totalCredit: "0.3" });
  });

  it("enforces draft, review, posting and reversal lifecycle permissions", async () => {
    const { service } = setup();
    const voucher = (await service.createManual(
      { voucherDate: new Date(2026, 6, 1), summary: "审核测试", entries: balancedEntries },
      user,
    )) as { id: number };

    await service.submit(voucher.id, user);
    await expect(service.review(voucher.id, user)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await service.review(voucher.id, admin);
    await service.post(voucher.id, admin);
    await expect(
      service.update(
        voucher.id,
        { voucherDate: new Date(2026, 6, 1), summary: "修改", entries: balancedEntries },
        user,
      ),
    ).rejects.toMatchObject({ code: "VOUCHER_STATUS_INVALID" });
    await service.unpost(voucher.id, admin);
    const draft = await service.unreview(voucher.id, admin);
    expect(draft).toMatchObject({ status: 0 });
  });

  it("batch processes vouchers through the existing lifecycle and reports individual failures", async () => {
    const { service } = setup();
    const first = await service.createManual(
      { voucherDate: new Date(2026, 6, 1), summary: "批量凭证一", entries: balancedEntries },
      user,
    ) as { id: number };
    const second = await service.createManual(
      { voucherDate: new Date(2026, 6, 2), summary: "批量凭证二", entries: balancedEntries },
      user,
    ) as { id: number };

    expect(await service.batch("submit", [first.id, second.id], user)).toMatchObject({
      succeededIds: [first.id, second.id],
      failures: [],
    });
    expect(await service.batch("review", [first.id, second.id], admin)).toMatchObject({
      succeededIds: [first.id, second.id],
      failures: [],
    });
    expect(await service.batch("post", [first.id, second.id], admin)).toMatchObject({
      succeededIds: [first.id, second.id],
      failures: [],
    });
    const repeated = await service.batch("post", [first.id], admin);
    expect(repeated.succeededIds).toEqual([]);
    expect(repeated.failures[0]).toMatchObject({ id: first.id, code: "VOUCHER_STATUS_INVALID" });
  });

  it("voids only posted vouchers and restores them as editable drafts", async () => {
    const { service } = setup();
    const voucher = await service.createManual({ voucherDate: new Date(2026, 6, 1), summary: "作废流程", entries: balancedEntries }, user) as { id: number };
    await service.submit(voucher.id, user);
    await service.review(voucher.id, admin);
    await service.post(voucher.id, admin);
    const voided = await service.void(voucher.id, "重复入账", admin);
    expect(voided).toMatchObject({ status: 3, voidReason: "重复入账" });
    const restored = await service.restore(voucher.id, admin);
    expect(restored).toMatchObject({ status: 0, voidReason: null, postedAt: null });
  });

  it("confirms AI suggestions using user-entered amounts", async () => {
    const { repository, service } = setup();
    const suggestionId = 500;
    repository.suggestions.set(suggestionId, {
      id: suggestionId,
      status: 1,
      requestedById: user.actorId,
      bankTransactionId: 301,
      invoiceId: null,
      suggestion: { summary: "AI 摘要", entries: [] },
    });
    const voucher = await service.createFromSuggestion(
      suggestionId,
      { voucherDate: new Date(2026, 6, 1), summary: "", entries: balancedEntries },
      user,
    );
    expect(voucher).toMatchObject({ summary: "AI 摘要", totalDebit: "100.1" });
    expect(repository.suggestions.get(suggestionId)?.status).toBe(2);
  });

  it("rechecks stored entry totals before review", async () => {
    const { repository, service } = setup();
    const voucher = (await service.createManual(
      { voucherDate: new Date(2026, 6, 1), summary: "复核", entries: balancedEntries },
      user,
    )) as { id: number };
    repository.vouchers.get(voucher.id)!.data.entries[0]!.debitAmount = "99";

    await service.submit(voucher.id, user);
    await expect(service.review(voucher.id, admin)).rejects.toMatchObject({ code: "VOUCHER_NOT_BALANCED" });
  });

  it("accepts safe attachment formats and rejects executable files", async () => {
    const { service } = setup();
    const voucher = (await service.createManual(
      { voucherDate: new Date(2026, 6, 1), summary: "附件", entries: balancedEntries },
      user,
    )) as { id: number };
    const attachment = await service.addAttachment(
      voucher.id,
      { originalName: "invoice.pdf", mimeType: "application/pdf", data: Buffer.from("pdf") },
      user,
    );
    expect(attachment).toMatchObject({ originalName: "invoice.pdf" });
    await expect(
      service.addAttachment(
        voucher.id,
        { originalName: "script.exe", mimeType: "application/octet-stream", data: Buffer.from("exe") },
        user,
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_ATTACHMENT" });
  });

  it("supports red-letter (negative) vouchers with algebraic debit/credit balance", async () => {
    const { service } = setup();
    const redVoucher = await service.createManual(
      {
        voucherDate: new Date(2026, 6, 1),
        summary: "冲减费用（红字冲销）",
        entries: [
          { accountId: debitAccountId, summary: "冲减管理费用", debitAmount: "-50.00", creditAmount: "0" },
          { accountId: creditAccountId, summary: "冲减银行存款", debitAmount: "0", creditAmount: "-50.00" },
        ],
      },
      user,
    );
    expect(redVoucher).toMatchObject({ totalDebit: "-50", totalCredit: "-50" });
  });

  it("enforces segregation of duties (SoD): creator cannot review own voucher", async () => {
    const { service } = setup();
    const creatorAdmin = { actorId: 99, role: "ADMIN" as const };
    const voucher = (await service.createManual(
      { voucherDate: new Date(2026, 6, 1), summary: "自审拦截测试", entries: balancedEntries },
      creatorAdmin,
    )) as { id: number };

    await service.submit(voucher.id, creatorAdmin);
    await expect(service.review(voucher.id, creatorAdmin)).rejects.toMatchObject({ code: "SOD_VIOLATION" });
  });
});
