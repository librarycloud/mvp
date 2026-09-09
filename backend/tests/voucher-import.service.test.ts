import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { VoucherImportService } from "../src/modules/voucher/voucher-import.service.js";
import { allocateVoucherNumbers } from "../src/modules/voucher/voucher-numbering.helper.js";

describe("VoucherImportService", () => {
  it("generates a valid Excel import template with header and instructions", async () => {
    const service = new VoucherImportService({} as any);
    const templateBuffer = await service.generateTemplate();

    expect(templateBuffer).toBeInstanceOf(Buffer);
    expect(templateBuffer.length).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(templateBuffer).buffer);

    expect(workbook.worksheets.length).toBe(2);
    const sheet1 = workbook.getWorksheet("记账凭证导入");
    expect(sheet1).toBeDefined();
    expect(sheet1!.getRow(1).getCell(1).value).toBe("凭证组号*");
    expect(sheet1!.getRow(1).getCell(5).value).toBe("科目编码*");
    expect(sheet1!.getRow(1).getCell(7).value).toBe("借方金额");
    expect(sheet1!.getRow(1).getCell(8).value).toBe("贷方金额");

    // Sample data rows
    expect(sheet1!.rowCount).toBeGreaterThanOrEqual(5);
  });

  it("parses and validates standard voucher rows successfully", async () => {
    const fakePrisma = {
      account: {
        findMany: async () => [
          { id: 101, code: "1002", name: "银行存款", isEnabled: true, isLeaf: true },
          { id: 201, code: "6602", name: "管理费用", isEnabled: true, isLeaf: true },
        ],
      },
    };

    const service = new VoucherImportService(fakePrisma as any);
    const templateBuffer = await service.generateTemplate();

    // The generated template has 2 sample vouchers: group 1 (6602 & 1002, 350.00) and group 2 (1002 & 1122, 50000.00)
    // For this test, let's mock all accounts in the template
    fakePrisma.account.findMany = async () => [
      { id: 101, code: "1002", name: "银行存款", isEnabled: true, isLeaf: true },
      { id: 201, code: "6602", name: "管理费用", isEnabled: true, isLeaf: true },
      { id: 301, code: "1122", name: "应收账款", isEnabled: true, isLeaf: true },
    ];

    const vouchers = await service.parseAndValidate(templateBuffer, "xlsx");

    expect(vouchers).toHaveLength(2);
    expect(vouchers[0]?.groupKey).toBe("1");
    expect(vouchers[0]?.totalDebit.toString()).toBe("350");
    expect(vouchers[0]?.totalCredit.toString()).toBe("350");
    expect(vouchers[0]?.entries).toHaveLength(2);

    expect(vouchers[1]?.groupKey).toBe("2");
    expect(vouchers[1]?.totalDebit.toString()).toBe("50000");
    expect(vouchers[1]?.totalCredit.toString()).toBe("50000");
  });

  it("throws IMPORT_NOT_BALANCED when a voucher group does not balance", async () => {
    const fakePrisma = {
      account: {
        findMany: async () => [
          { id: 101, code: "1002", name: "银行存款", isEnabled: true, isLeaf: true },
          { id: 201, code: "6602", name: "管理费用", isEnabled: true, isLeaf: true },
        ],
      },
    };

    const service = new VoucherImportService(fakePrisma as any);

    // Create an unbalanced workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("记账凭证导入");
    sheet.addRow(["凭证组号", "凭证日期", "凭证摘要", "科目编码", "借方金额", "贷方金额"]);
    sheet.addRow(["1", "2026-03-15", "不平凭证", "6602", "500.00", "0.00"]);
    sheet.addRow(["1", "2026-03-15", "不平凭证", "1002", "0.00", "300.00"]); // 500 != 300

    const buf = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(service.parseAndValidate(buf, "xlsx")).rejects.toMatchObject({
      code: "IMPORT_NOT_BALANCED",
    });
  });

  it("throws IMPORT_ACCOUNT_NOT_FOUND when account code is not in the system", async () => {
    const fakePrisma = {
      account: {
        findMany: async () => [], // No accounts found
      },
    };

    const service = new VoucherImportService(fakePrisma as any);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("记账凭证导入");
    sheet.addRow(["凭证组号", "凭证日期", "凭证摘要", "科目编码", "借方金额", "贷方金额"]);
    sheet.addRow(["1", "2026-03-15", "测试", "9999", "100.00", "0.00"]);
    sheet.addRow(["1", "2026-03-15", "测试", "9999", "0.00", "100.00"]);

    const buf = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(service.parseAndValidate(buf, "xlsx")).rejects.toMatchObject({
      code: "IMPORT_ACCOUNT_NOT_FOUND",
    });
  });
});

describe("allocateVoucherNumbers", () => {
  it("allocates multiple sequential numbers in one batch", async () => {
    let currentSeq = 10;
    const fakeTx = {
      $executeRaw: async () => 1,
      $queryRaw: async () => [{ next_value: currentSeq }],
      voucherSequence: {
        update: async (args: any) => {
          currentSeq = args.data.nextValue;
          return { fiscalYear: 2026, nextValue: currentSeq };
        },
      },
    };

    const allocated = await allocateVoucherNumbers(fakeTx as any, 2026, 5);

    expect(allocated).toHaveLength(5);
    expect(allocated[0]).toEqual({ sequenceNo: 10, voucherNo: "2026-000010" });
    expect(allocated[4]).toEqual({ sequenceNo: 14, voucherNo: "2026-000014" });
    expect(currentSeq).toBe(15);
  });
});
