import { describe, expect, it, vi } from "vitest";
import { ReportTemplateService } from "../src/modules/report-template/report-template.service.js";

const admin = { actorId: 1, role: "ADMIN" as const };
const user = { actorId: 2, role: "ACCOUNTANT" as const };
const base = {
  code: "CUSTOM_REPORT",
  type: "CUSTOM" as const,
  name: "管理报表",
  description: null,
};
const item = (itemCode: string, sortOrder: number, sourceItemCode?: string) => ({
  itemCode, name: itemCode, lineNumber: sortOrder, sortOrder,
  normalDirection: null, valueType: null, isSubtotal: Boolean(sourceItemCode), displayLevel: 1,
  mappings: [],
  dependencies: sourceItemCode ? [{ sourceItemCode, operator: "ADD" as const, coefficient: "1" }] : [],
});

describe("ReportTemplateService", () => {
  it("allows only administrators to maintain templates", async () => {
    const prisma = { reportTemplate: { findFirst: vi.fn() } } as any;
    const service = new ReportTemplateService(prisma);
    await expect(service.create({ ...base, items: [item("A", 1)] }, user)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.reportTemplate.findFirst).not.toHaveBeenCalled();
  });

  it("rejects formula cycles before a version is persisted", async () => {
    const prisma = { reportTemplate: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    const service = new ReportTemplateService(prisma);
    await expect(service.create({ ...base, items: [item("A", 1, "B"), item("B", 2, "A")] }, admin)).rejects.toMatchObject({ code: "REPORT_TEMPLATE_CYCLE" });
  });

  it("rejects dependencies that refer to missing report items", async () => {
    const prisma = { reportTemplate: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    const service = new ReportTemplateService(prisma);
    await expect(service.create({ ...base, items: [item("A", 1, "MISSING")] }, admin)).rejects.toMatchObject({ code: "REPORT_DEPENDENCY_INVALID" });
  });
});
