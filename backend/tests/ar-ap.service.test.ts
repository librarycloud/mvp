import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { ArApService } from "../src/modules/ar-ap/ar-ap.service.js";

const periods = { resolveOpenPeriod: vi.fn() } as any;
const actor = { actorId: 1, role: "ADMIN" as const };

describe("ArApService", () => {
  it("rejects invalid receivable amount before persisting", async () => {
    const service = new ArApService({} as any, periods);
    await expect(service.createDocument("receivable", { partyId: 1, documentNo: "AR-1", occurrenceDate: "2026-07-01", amount: "0" }, actor)).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("rejects a due date earlier than its business date", async () => {
    const service = new ArApService({} as any, periods);
    await expect(service.createDocument("payable", { partyId: 1, documentNo: "AP-1", occurrenceDate: "2026-07-15", dueDate: "2026-07-01", amount: "10.00" }, actor)).rejects.toMatchObject({ code: "INVALID_DUE_DATE" });
  });

  it("calculates aging from unverified balances only", async () => {
    const service = new ArApService({} as any, periods);
    (service as any).listDocuments = async () => [
      { id: "1", documentNo: "AR-1", amount: new Prisma.Decimal("100"), settledAmount: new Prisma.Decimal("30"), occurrenceDate: new Date("2026-04-01"), dueDate: new Date("2026-04-15"), customer: { name: "客户甲" } },
      { id: "2", documentNo: "AR-2", amount: new Prisma.Decimal("50"), settledAmount: new Prisma.Decimal("50"), occurrenceDate: new Date("2026-04-01"), dueDate: null, customer: { name: "客户乙" } },
    ];
    const rows = await service.aging("receivable", new Date("2026-07-14T00:00:00.000Z"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ documentNo: "AR-1", bucket: "61-90", daysOverdue: 90 });
    expect(rows[0]?.outstanding.toString()).toBe("70");
  });

  it("suggests unlinked bank transactions with the same counterparty and outstanding amount", async () => {
    const bankTransaction = { findMany: vi.fn().mockResolvedValue([{ id: "bank-1", amount: new Prisma.Decimal("60"), payerAccount: null, payeeAccount: null, reconciliationDirection: null }]) };
    const service = new ArApService({ receivable: { findFirst: vi.fn().mockResolvedValue({ id: "ar-1", amount: new Prisma.Decimal("100"), settledAmount: new Prisma.Decimal("40"), customer: { name: "客户甲" } }) }, bankTransaction, companyProfile: { findFirst: vi.fn().mockResolvedValue(null) } } as any, periods);
    const result = await service.bankMatches("receivable", 1);
    expect(result.outstanding.toString()).toBe("60");
    expect(result.matches.map((row) => row.id)).toEqual(["bank-1"]);
    expect(bankTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ amount: { in: [new Prisma.Decimal("60"), new Prisma.Decimal("-60")] }, voucherId: null }) }));
  });

  it("suggests only outgoing bank transactions for a payable", async () => {
    const bankTransaction = { findMany: vi.fn().mockResolvedValue([
      { id: "out", amount: new Prisma.Decimal("-60"), payerAccount: null, payeeAccount: null, reconciliationDirection: null },
      { id: "in", amount: new Prisma.Decimal("60"), payerAccount: null, payeeAccount: null, reconciliationDirection: null },
    ]) };
    const service = new ArApService({ payable: { findFirst: vi.fn().mockResolvedValue({ id: "ap-1", amount: new Prisma.Decimal("100"), settledAmount: new Prisma.Decimal("40"), supplier: { name: "供应商甲" } }) }, bankTransaction, companyProfile: { findFirst: vi.fn().mockResolvedValue(null) } } as any, periods);

    const result = await service.bankMatches("payable", 1);

    expect(result.matches.map((row) => row.id)).toEqual(["out"]);
  });

  it("supports partial bank transaction matching and rejects when amount exceeds bank remaining", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ next_value: 1 }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      voucherSequence: { update: vi.fn() },
      bankTransaction: {
        findFirst: vi.fn().mockResolvedValue({ id: 10, amount: new Prisma.Decimal("100"), voucherId: null, payerAccount: null, payeeAccount: null }),
        update: vi.fn(),
      },
      companyProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      receivable: {
        findFirst: vi.fn().mockResolvedValue({ id: 1, amount: new Prisma.Decimal("100"), settledAmount: new Prisma.Decimal("0"), customer: { name: "客户甲" } }),
        update: vi.fn(),
      },
      account: { findFirst: vi.fn().mockResolvedValue({ id: 101, isEnabled: true, isLeaf: true }) },
      receivableSettlement: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal("40") } }), // 已有 40 被核销
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
      payableSettlement: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
      voucher: { create: vi.fn().mockResolvedValue({ id: 99, voucherNo: "JZ-2026-001" }) },
      accountingEvent: { create: vi.fn().mockResolvedValue({ id: 1 }) },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (work) => work(tx)),
    } as any;
    periods.resolveOpenPeriod = vi.fn().mockResolvedValue({ id: 1, year: 2026, month: 7 });

    const service = new ArApService(prisma, periods);
    (service as any).validateAccounts = vi.fn();
    (service as any).bankDirection = vi.fn().mockReturnValue("INFLOW");

    // 银行流水 100，已有 40 被核销，剩余可用 60。本次核销 70，超过剩余可用金额，应报错
    await expect(
      service.settle("receivable", 1, { amount: "70", paymentDate: "2026-07-15", bankAccountId: 101, settlementAccountId: 102, bankTransactionId: 10 }, actor),
    ).rejects.toMatchObject({ code: "BANK_AMOUNT_MISMATCH" });

    // 本次核销 50，小于剩余 60，成功且流水 voucherId 不会被立即锁定
    await service.settle("receivable", 1, { amount: "50", paymentDate: "2026-07-15", bankAccountId: 101, settlementAccountId: 102, bankTransactionId: 10 }, actor);
    expect(tx.bankTransaction.update).not.toHaveBeenCalled();

    // 本次核销 60（刚好用完剩余 60），成功且流水 voucherId 被锁定为当前凭证
    tx.receivableSettlement.aggregate.mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal("40") } });
    await service.settle("receivable", 1, { amount: "60", paymentDate: "2026-07-15", bankAccountId: 101, settlementAccountId: 102, bankTransactionId: 10 }, actor);
    expect(tx.bankTransaction.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 10 },
      data: { voucherId: 99 },
    }));
  });

  it("calculates multi-bucket aging matrix grouped by party", async () => {
    const service = new ArApService({} as any, periods);
    (service as any).listDocuments = async () => [
      {
        id: 1,
        documentNo: "AR-1",
        amount: new Prisma.Decimal("100"),
        settledAmount: new Prisma.Decimal("20"),
        occurrenceDate: new Date("2026-07-01"),
        dueDate: new Date("2026-07-10"),
        customer: { id: 10, code: "C001", name: "客户甲", creditLimit: new Prisma.Decimal("10000") },
      },
      {
        id: 2,
        documentNo: "AR-2",
        amount: new Prisma.Decimal("200"),
        settledAmount: new Prisma.Decimal("0"),
        occurrenceDate: new Date("2026-05-01"),
        dueDate: new Date("2026-05-15"),
        customer: { id: 10, code: "C001", name: "客户甲", creditLimit: new Prisma.Decimal("10000") },
      },
    ];

    const matrix = await service.agingMatrix("receivable", new Date("2026-07-20T00:00:00.000Z"));
    expect(matrix).toHaveLength(1);
    expect(matrix[0]?.partyCode).toBe("C001");
    // AR-1: due 2026-07-10, asOf 2026-07-20 => 10 days => within30 (80)
    expect(matrix[0]?.within30).toBe("80");
    // AR-2: due 2026-05-15, asOf 2026-07-20 => 66 days => days61to90 (200)
    expect(matrix[0]?.days61to90).toBe("200");
    expect(matrix[0]?.totalOutstanding).toBe("280");
  });

  it("generates statement of account with opening balance, movements, and closing balance", async () => {
    const prisma = {
      customer: { findFirst: vi.fn().mockResolvedValue({ id: 1, code: "C001", name: "客户甲", taxId: "91110000" }) },
      companyProfile: { findFirst: vi.fn().mockResolvedValue({ companyName: "测试公司", taxpayerId: "91310000" }) },
      receivable: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            documentNo: "AR-OLD",
            description: "上月账单",
            amount: new Prisma.Decimal("1000"),
            occurrenceDate: new Date("2026-05-10"),
            settlements: [
              {
                id: 1,
                amount: new Prisma.Decimal("400"),
                paymentDate: new Date("2026-05-20"),
                status: 1, // POSTED
                remark: "上月回款",
                voucher: { voucherNo: "JZ-001" },
              },
            ],
          },
          {
            id: 2,
            documentNo: "AR-CURR",
            description: "本月发票",
            amount: new Prisma.Decimal("800"),
            occurrenceDate: new Date("2026-06-05"),
            settlements: [
              {
                id: 2,
                amount: new Prisma.Decimal("300"),
                paymentDate: new Date("2026-06-15"),
                status: 1, // POSTED
                remark: "本月回款",
                voucher: { voucherNo: "JZ-002" },
              },
            ],
          },
        ]),
      },
    } as any;

    const service = new ArApService(prisma, periods);
    const statement = await service.statementOfAccount(1, "customer", new Date("2026-06-01"), new Date("2026-06-30"));

    // Opening balance: 1000 - 400 = 600
    expect(statement.openingBalance).toBe("600");
    // In period: 800 increase, 300 settled
    expect(statement.totalIncrease).toBe("800");
    expect(statement.totalSettled).toBe("300");
    // Closing balance: 600 + 800 - 300 = 1100
    expect(statement.closingBalance).toBe("1100");
    expect(statement.lines).toHaveLength(2);
  });
});

