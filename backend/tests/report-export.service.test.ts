import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import JSZip from "jszip";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReportExportService } from "../src/modules/report/report-export.service.js";
import type { ReportService } from "../src/modules/report/report.service.js";

const companyReader = {
  companyProfile: {
    findFirst: async () => ({ name: "测试企业", unifiedSocialCreditCode: "91310000TEST000001" }),
  },
};

function report(type: string, lines: Array<Record<string, unknown>>) {
  return {
    id: 1,
    periodStart: new Date(2026, 6, 1),
    periodEnd: new Date(2026, 6, 31),
    template: { name: type, type },
    lines,
  };
}

async function exportWorkbook(type: string, lines: Array<Record<string, unknown>>) {
  const buffer = await exportBuffer(type, lines);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
  return workbook;
}

async function exportBuffer(type: string, lines: Array<Record<string, unknown>>) {
  const reports = { getReport: async () => report(type, lines) } as unknown as ReportService;
  return new ReportExportService(reports, null, companyReader).excel(1);
}

const templateFiles: Record<string, string> = {
  BALANCE_SHEET: "official-balance-sheet-template.xlsx",
  INCOME_STATEMENT: "official-income-statement-template.xlsx",
  CASH_FLOW_STATEMENT: "official-cash-flow-statement-template.xlsx",
  EQUITY_CHANGE_STATEMENT: "official-equity-change-statement-template.xlsx",
};

function layoutSignature(workbook: ExcelJS.Workbook) {
  return workbook.worksheets.map((sheet) => ({
    name: sheet.name,
    state: sheet.state,
    properties: sheet.properties,
    pageSetup: Object.fromEntries(Object.entries(sheet.pageSetup).filter(([key]) => key !== "useFirstPageNumber")),
    views: sheet.views,
    merges: [...sheet.model.merges].sort(),
    columns: (sheet.columns ?? []).map((column) => ({ width: column.width, hidden: column.hidden, outlineLevel: column.outlineLevel, style: column.style })),
    rows: Array.from({ length: sheet.rowCount }, (_, index) => {
      const row = sheet.getRow(index + 1);
      return {
        height: row.height,
        hidden: row.hidden,
        outlineLevel: row.outlineLevel,
        styles: Array.from({ length: sheet.columnCount }, (_unused, columnIndex) => row.getCell(columnIndex + 1).style),
      };
    }),
  }));
}

async function zipText(zip: JSZip, fileName: string) {
  const file = zip.file(fileName);
  expect(file, `${fileName} should exist`).not.toBeNull();
  return file!.async("string");
}

function cellStyleSignature(xml: string) {
  return [...xml.matchAll(/<c\b([^>]*)>/g)].map((match) => {
    const attributes = match[1]!;
    return {
      address: /\br="([^"]+)"/.exec(attributes)?.[1],
      style: /\bs="([^"]+)"/.exec(attributes)?.[1] ?? null,
    };
  });
}

function formulaSignature(xml: string) {
  const metadataCells = new Set(["C3", "D3", "E3", "H3", "J3", "C4", "D4", "E4", "H4"]);
  return [...xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].flatMap((match) => {
    const address = /\br="([^"]+)"/.exec(match[1]!)?.[1];
    const formula = /<f\b[^>]*>[\s\S]*?<\/f>/.exec(match[2]!)?.[0];
    return address && formula && !metadataCells.has(address) ? [{ address, formula }] : [];
  });
}

describe("ReportExportService", () => {
  it("exports the balance sheet as one file and preserves calculated cells", async () => {
    const workbook = await exportWorkbook("BALANCE_SHEET", [{
      openingAmount: "100", currentAmount: null, closingAmount: "123.4567",
      reportItem: { itemCode: "CASH", lineNumber: 1, name: "货币资金" },
    }]);
    const sheet = workbook.getWorksheet("资产负债表")!;
    expect(workbook.worksheets).toHaveLength(2);
    expect(workbook.getWorksheet("一般企业_已执行")).toBeDefined();
    expect(sheet.getCell("D7").value).toBe(123.46);
    expect(sheet.getCell("E7").value).toBe(100);
    expect(sheet.getCell("D20").type).toBe(ExcelJS.ValueType.Formula);
  });

  it("exports the income statement without replacing subtotal formulas", async () => {
    const workbook = await exportWorkbook("INCOME_STATEMENT", [{
      openingAmount: "150", currentAmount: "200", closingAmount: "200",
      reportItem: { itemCode: "OPERATING_REVENUE", lineNumber: 1, name: "营业收入" },
    }]);
    const sheet = workbook.getWorksheet("利润表")!;
    expect(workbook.worksheets).toHaveLength(2);
    expect(sheet.getCell("C6").value).toBe(200);
    expect(sheet.getCell("D6").value).toBe(150);
    expect(sheet.getCell("C24").type).toBe(ExcelJS.ValueType.Formula);
  });

  it("exports the cash-flow statement using input rows only", async () => {
    const workbook = await exportWorkbook("CASH_FLOW_STATEMENT", [
      { openingAmount: "0", currentAmount: "80", closingAmount: "0", reportItem: { itemCode: "NET_CASH_OPERATING", lineNumber: 10, name: "经营活动现金流量净额" } },
      { openingAmount: "20", currentAmount: "0", closingAmount: "100", reportItem: { itemCode: "CASH_BEGINNING", lineNumber: 41, name: "期初现金" } },
    ]);
    const sheet = workbook.getWorksheet("现金流量表")!;
    expect(workbook.worksheets).toHaveLength(2);
    expect(sheet.getCell("C9").value).toBe(80);
    expect(sheet.getCell("C42").value).toBe(20);
    expect(sheet.getCell("C10").type).toBe(ExcelJS.ValueType.Formula);
  });

  it("exports equity movements without replacing row totals", async () => {
    const workbook = await exportWorkbook("EQUITY_CHANGE_STATEMENT", [
      { openingAmount: null, currentAmount: "100", closingAmount: null, reportItem: { itemCode: "CY_OPEN_PAID_CAPITAL", lineNumber: 7, name: "本年年初实收资本" } },
      { openingAmount: null, currentAmount: "20", closingAmount: null, reportItem: { itemCode: "CY_CHANGE_PAID_CAPITAL", lineNumber: 18, name: "本年实收资本变动" } },
    ]);
    const sheet = workbook.getWorksheet("所有者权益变动表")!;
    expect(workbook.worksheets).toHaveLength(2);
    expect(sheet.getCell("C7").value).toBe(100);
    expect(sheet.getCell("C18").value).toBe(20);
    expect(sheet.getCell("M7").type).toBe(ExcelJS.ValueType.Formula);
  });

  it.each(Object.keys(templateFiles))("preserves the complete %s template layout and styles", async (type) => {
    const template = new ExcelJS.Workbook();
    await template.xlsx.readFile(path.resolve(process.cwd(), "assets", templateFiles[type]!));
    const exported = await exportWorkbook(type, []);
    expect(layoutSignature(exported)).toEqual(layoutSignature(template));
  });

  it.each(Object.keys(templateFiles))("keeps the original %s theme, colors, formulas and supporting worksheet", async (type) => {
    const templatePath = path.resolve(process.cwd(), "assets", templateFiles[type]!);
    const [templateZip, exportedZip] = await Promise.all([
      JSZip.loadAsync(await fs.readFile(templatePath)),
      JSZip.loadAsync(await exportBuffer(type, [])),
    ]);
    const [templateSheet, exportedSheet] = await Promise.all([
      zipText(templateZip, "xl/worksheets/sheet1.xml"),
      zipText(exportedZip, "xl/worksheets/sheet1.xml"),
    ]);
    await expect(zipText(exportedZip, "xl/styles.xml")).resolves.toBe(await zipText(templateZip, "xl/styles.xml"));
    await expect(zipText(exportedZip, "xl/theme/theme1.xml")).resolves.toBe(await zipText(templateZip, "xl/theme/theme1.xml"));
    await expect(zipText(exportedZip, "xl/worksheets/sheet2.xml")).resolves.toBe(await zipText(templateZip, "xl/worksheets/sheet2.xml"));
    expect(cellStyleSignature(exportedSheet)).toEqual(cellStyleSignature(templateSheet));
    expect(formulaSignature(exportedSheet)).toEqual(formulaSignature(templateSheet));
    expect(exportedZip.file("xl/calcChain.xml")).toBeNull();
  });
});
