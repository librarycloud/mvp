import { describe, expect, it, vi } from "vitest";
import { VoucherTemplateService } from "../src/modules/voucher-template/voucher-template.service.js";

describe("VoucherTemplateService", () => {
  it("returns built-in templates with mapped account IDs", async () => {
    const mockPrisma = {
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: 101, code: "6602", name: "管理费用", isLeaf: true },
          { id: 102, code: "1002", name: "银行存款", isLeaf: true },
          { id: 103, code: "2211", name: "应付职工薪酬", isLeaf: true },
          { id: 104, code: "6603", name: "财务费用", isLeaf: true },
          { id: 105, code: "2231", name: "应付利息", isLeaf: true },
          { id: 106, code: "2241", name: "其他应付款", isLeaf: true },
        ]),
      },
    };

    const service = new VoucherTemplateService(mockPrisma as any);
    const templates = await service.list();
    expect(templates.length).toBeGreaterThanOrEqual(5);

    const salaryTpl = templates.find((t) => t.category === "SALARY");
    expect(salaryTpl).toBeDefined();
    expect(salaryTpl?.entries.length).toBe(2);
    expect(salaryTpl?.entries[0]?.accountCode).toBe("6602");
    expect(salaryTpl?.entries[1]?.accountCode).toBe("2211");
  });

  it("creates custom voucher template and allows removal", async () => {
    const mockPrisma = {
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: 201, code: "6601", name: "销售费用" },
          { id: 202, code: "1002", name: "银行存款" },
        ]),
      },
    };

    const service = new VoucherTemplateService(mockPrisma as any);
    const created = await service.create({
      name: "销售推广费报销",
      summary: "报销市场部推广宣传费",
      entries: [
        { lineNo: 1, accountId: 201, direction: "DEBIT", summary: "推广费" },
        { lineNo: 2, accountId: 202, direction: "CREDIT", summary: "推广费" },
      ],
    });

    expect(created.id).toBeGreaterThanOrEqual(1000);
    expect(created.name).toBe("销售推广费报销");
    expect(created.entries[0]?.accountCode).toBe("6601");

    const list = await service.list();
    expect(list.some((t) => t.id === created.id)).toBe(true);

    await service.remove(created.id);
    const afterList = await service.list();
    expect(afterList.some((t) => t.id === created.id)).toBe(false);
  });
});
