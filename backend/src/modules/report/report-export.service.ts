import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { AppError } from "../../common/errors/app-error.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { ReportService } from "./report.service.js";
import { XlsxTemplatePatcher } from "./xlsx-template-patcher.js";

interface ExportLine {
  openingAmount: unknown;
  currentAmount: unknown;
  closingAmount: unknown;
  reportItem: { itemCode: string; lineNumber: number | null; name: string };
}
interface ExportReport {
  id: number;
  periodStart: Date;
  periodEnd: Date;
  template: { name: string; type: string };
  lines: ExportLine[];
}
interface CompanyProfileReader {
  companyProfile: { findFirst(args: object): Promise<{ name: string; unifiedSocialCreditCode: string } | null> };
  auditLog?: { create(args: any): Promise<unknown> };
}

const OFFICIAL_TEMPLATES: Record<string, { fileName: string; sheetName: string }> = {
  BALANCE_SHEET: { fileName: "official-balance-sheet-template.xlsx", sheetName: "资产负债表" },
  INCOME_STATEMENT: { fileName: "official-income-statement-template.xlsx", sheetName: "利润表" },
  CASH_FLOW_STATEMENT: { fileName: "official-cash-flow-statement-template.xlsx", sheetName: "现金流量表" },
  EQUITY_CHANGE_STATEMENT: { fileName: "official-equity-change-statement-template.xlsx", sheetName: "所有者权益变动表" },
};

const BALANCE_ALIASES: Record<string, string> = {
  应收票据及应收账款: "应收账款",
  长期投资: "长期股权投资",
  未分配利润: "未分配利润",
  实收资本: "实收资本（或股本）",
  所有者权益合计: "所有者权益（或股东权益）合计",
  负债和所有者权益总计: "负债和所有者权益（或股东权益）总计",
};

const INCOME_ALIASES: Record<string, string> = {
  营业收入: "一、营业收入",
  营业成本: "减：营业成本",
  营业利润: "二、营业利润（亏损以“-”号填列）",
  利润总额: "三、利润总额（亏损总额以“-”号填列）",
  所得税费用: "减：所得税费用",
  净利润: "四、净利润（净亏损以“-”号填列）",
};

export class ReportExportService {
  constructor(
    private readonly reports: ReportService,
    private readonly configuredFontPath: string | null,
    private readonly companyReader?: CompanyProfileReader,
  ) {}

  async excel(id: number, actorId?: number) {
    const report = await this.load(id);
    if (actorId) await this.auditExport(id, actorId);
    const template = OFFICIAL_TEMPLATES[report.template.type];
    if (!template) return this.genericExcel(report);
    const templatePath = path.resolve(process.cwd(), "assets", template.fileName);
    if (!fs.existsSync(templatePath)) throw new AppError("REPORT_EXCEL_TEMPLATE_MISSING", "未找到财务报表 Excel 模板文件", 500);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const sheet = workbook.getWorksheet(template.sheetName);
    if (!sheet) throw new AppError("REPORT_EXCEL_TEMPLATE_INVALID", `Excel 模板缺少工作表：${template.sheetName}`, 500);
    const values = new Map<string, string | number>();
    await this.fillMetadata(values, report, report.template.type);
    if (report.template.type === "BALANCE_SHEET") this.fillBalanceSheet(sheet, report.lines, values);
    if (report.template.type === "INCOME_STATEMENT") this.fillIncomeStatement(sheet, report.lines, values);
    if (report.template.type === "CASH_FLOW_STATEMENT") this.fillCashFlow(sheet, report.lines, values);
    if (report.template.type === "EQUITY_CHANGE_STATEMENT") this.fillEquityChange(sheet, report.lines, values);
    return new XlsxTemplatePatcher().fill(templatePath, template.sheetName, values);
  }

  async pdf(id: number, actorId?: number) {
    const report = await this.load(id); const font = this.fontPath();
    if (actorId) await this.auditExport(id, actorId);
    if (!font) throw new AppError("REPORT_PDF_FONT_MISSING", "未找到中文 PDF 字体，请配置 PDF_FONT_PATH", 500);
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 36, info: { Title: report.template.name } });
      const chunks: Buffer[] = []; doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
      doc.font(font).fontSize(16).text(report.template.name, { align: "center" });
      doc.fontSize(9).text(`${this.date(report.periodStart)} 至 ${this.date(report.periodEnd)}`, { align: "center" }).moveDown();
      const widths = [36, 190, 85, 85, 85]; const headers = ["行次", "项目", "期初/上期", "本期", "期末/累计"];
      this.pdfRow(doc, headers, widths, true);
      for (const line of report.lines) { if (doc.y > 760) { doc.addPage(); this.pdfRow(doc, headers, widths, true); } this.pdfRow(doc, [String(line.reportItem.lineNumber ?? ""), line.reportItem.name, this.textAmount(line.openingAmount), this.textAmount(line.currentAmount), this.textAmount(line.closingAmount)], widths, false); }
      doc.end();
    });
  }

  private async fillMetadata(cells: Map<string, string | number>, report: ExportReport, type: string) {
    const company = await this.companyReader?.companyProfile.findFirst({ where: { deletedAt: null }, select: { name: true, unifiedSocialCreditCode: true } });
    const metadata: Record<string, string> = type === "BALANCE_SHEET"
      ? { D3: company?.unifiedSocialCreditCode ?? "", H3: company?.name ?? "", D4: this.date(report.periodStart), H4: this.date(report.periodEnd) }
      : type === "EQUITY_CHANGE_STATEMENT"
        ? { C3: company?.unifiedSocialCreditCode ?? "", E3: company?.name ?? "", H3: this.date(report.periodStart), J3: this.date(report.periodEnd) }
        : { C3: company?.unifiedSocialCreditCode ?? "", E3: company?.name ?? "", C4: this.date(report.periodStart), E4: this.date(report.periodEnd) };
    for (const [address, value] of Object.entries(metadata)) cells.set(address, value);
  }

  private fillBalanceSheet(sheet: ExcelJS.Worksheet, lines: ExportLine[], values: Map<string, string | number>) {
    const rows = new Map<string, { row: number; closing: string; opening: string }>();
    for (let row = 6; row <= 46; row++) {
      const asset = this.label(sheet.getCell(`B${row}`).value); if (asset) rows.set(asset, { row, closing: `D${row}`, opening: `E${row}` });
      const liability = this.label(sheet.getCell(`F${row}`).value); if (liability) rows.set(liability, { row, closing: `H${row}`, opening: `I${row}` });
    }
    for (const line of lines) {
      const target = rows.get(BALANCE_ALIASES[line.reportItem.name] ?? line.reportItem.name);
      if (!target) continue;
      this.setInput(sheet, values, target.closing, line.closingAmount);
      this.setInput(sheet, values, target.opening, line.openingAmount);
    }
  }

  private fillIncomeStatement(sheet: ExcelJS.Worksheet, lines: ExportLine[], values: Map<string, string | number>) {
    const rows = new Map<string, number>();
    for (let row = 6; row <= 48; row++) rows.set(this.label(sheet.getCell(`B${row}`).value), row);
    for (const line of lines) {
      const name = INCOME_ALIASES[line.reportItem.name] ?? line.reportItem.name;
      const row = rows.get(name); if (!row) continue;
      this.setInput(sheet, values, `C${row}`, line.currentAmount);
      if (line.openingAmount !== null && line.openingAmount !== undefined) this.setInput(sheet, values, `D${row}`, line.openingAmount);
    }
  }

  private fillCashFlow(sheet: ExcelJS.Worksheet, lines: ExportLine[], values: Map<string, string | number>) {
    const amounts = new Map(lines.map((line) => [line.reportItem.itemCode, this.number(line.currentAmount) ?? 0]));
    const cellByCode: Record<string, string> = {
      OPERATING_CASH_SALES: "C7", OPERATING_TAX_REFUND: "C8", OPERATING_OTHER_INFLOW: "C9",
      OPERATING_PURCHASES: "C11", OPERATING_EMPLOYEE_PAYMENTS: "C12", OPERATING_TAX_PAYMENTS: "C13", OPERATING_OTHER_OUTFLOW: "C14",
      INVESTING_RECOVERY: "C18", INVESTING_INCOME: "C19", INVESTING_DISPOSAL_ASSETS: "C20", INVESTING_DISPOSAL_SUBSIDIARY: "C21", INVESTING_OTHER_INFLOW: "C22",
      INVESTING_PURCHASE_ASSETS: "C24", INVESTING_PURCHASE_INVESTMENTS: "C25", INVESTING_PURCHASE_SUBSIDIARY: "C26", INVESTING_OTHER_OUTFLOW: "C27",
      FINANCING_CAPITAL_INFLOW: "C31", FINANCING_BORROWING_INFLOW: "C32", FINANCING_OTHER_INFLOW: "C33",
      FINANCING_REPAYMENT: "C35", FINANCING_DIVIDEND_INTEREST: "C36", FINANCING_OTHER_OUTFLOW: "C37", FX_EFFECT: "C40",
    };
    const hasDirectRows = Object.keys(cellByCode).some((code) => amounts.has(code));
    if (hasDirectRows) {
      for (const [code, address] of Object.entries(cellByCode)) this.setInput(sheet, values, address, amounts.get(code) ?? 0);
    } else {
      const operatingNet = amounts.get("NET_CASH_OPERATING") ?? 0;
      this.setInput(sheet, values, operatingNet >= 0 ? "C9" : "C14", Math.abs(operatingNet));
    }
    const beginning = lines.find((line) => line.reportItem.itemCode === "CASH_BEGINNING");
    if (beginning) this.setInput(sheet, values, "C42", beginning.openingAmount);
  }

  private fillEquityChange(sheet: ExcelJS.Worksheet, lines: ExportLine[], values: Map<string, string | number>) {
    const amounts = new Map(lines.map((line) => [line.reportItem.itemCode, this.number(line.currentAmount) ?? 0]));
    const columns = { PAID_CAPITAL: ["C", "N"], CAPITAL_RESERVE: ["G", "R"], TREASURY_STOCK: ["H", "S"], SURPLUS_RESERVE: ["K", "V"] } as const;
    for (const [component, [currentColumn, previousColumn]] of Object.entries(columns)) {
      this.setInput(sheet, values, `${currentColumn}7`, amounts.get(`CY_OPEN_${component}`) ?? 0);
      this.setInput(sheet, values, `${previousColumn}7`, amounts.get(`PY_OPEN_${component}`) ?? 0);
      this.setInput(sheet, values, `${currentColumn}18`, amounts.get(`CY_CHANGE_${component}`) ?? 0);
      this.setInput(sheet, values, `${previousColumn}18`, amounts.get(`PY_CHANGE_${component}`) ?? 0);
    }
    this.setInput(sheet, values, "L7", (amounts.get("CY_OPEN_CURRENT_PROFIT") ?? 0) + (amounts.get("CY_OPEN_PROFIT_DISTRIBUTION") ?? 0));
    this.setInput(sheet, values, "W7", (amounts.get("PY_OPEN_CURRENT_PROFIT") ?? 0) + (amounts.get("PY_OPEN_PROFIT_DISTRIBUTION") ?? 0));
    this.setInput(sheet, values, "L13", amounts.get("CY_CHANGE_CURRENT_PROFIT") ?? 0);
    this.setInput(sheet, values, "W13", amounts.get("PY_CHANGE_CURRENT_PROFIT") ?? 0);
    this.setInput(sheet, values, "L22", amounts.get("CY_CHANGE_PROFIT_DISTRIBUTION") ?? 0);
    this.setInput(sheet, values, "W22", amounts.get("PY_CHANGE_PROFIT_DISTRIBUTION") ?? 0);
  }

  private setInput(sheet: ExcelJS.Worksheet, values: Map<string, string | number>, address: string, value: unknown) { if (sheet.getCell(address).type === ExcelJS.ValueType.Formula) return; values.set(address, this.number(value) ?? 0); }
  private label(value: ExcelJS.CellValue) { return String(value ?? "").trim(); }

  private async genericExcel(report: ExportReport) {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet(report.template.name, { pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1 } });
    sheet.mergeCells("A1:E1"); sheet.getCell("A1").value = report.template.name; sheet.getCell("A1").font = { bold: true, size: 16 }; sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.mergeCells("A2:E2"); sheet.getCell("A2").value = `${this.date(report.periodStart)} 至 ${this.date(report.periodEnd)}`; sheet.getCell("A2").alignment = { horizontal: "center" };
    sheet.addRow(["行次", "项目", "期初/上期", "本期", "期末/累计"]);
    for (const line of report.lines) sheet.addRow([line.reportItem.lineNumber ?? "", line.reportItem.name, this.number(line.openingAmount), this.number(line.currentAmount), this.number(line.closingAmount)]);
    sheet.columns = [{ width: 10 }, { width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async load(id: number) { return await this.reports.getReport(id) as ExportReport; }
  private auditExport(id: number, actorId: number) {
    return this.companyReader?.auditLog?.create({ data: { actorId, action: "EXPORT", resourceType: "Report", resourceId: id, description: "Export financial report" } });
  }
  private fontPath() { return [this.configuredFontPath, "C:/Windows/Fonts/simhei.ttf", "C:/Windows/Fonts/msyh.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"].find((candidate) => candidate && fs.existsSync(candidate)) ?? null; }
  private pdfRow(doc: PDFKit.PDFDocument, values: string[], widths: number[], header: boolean) { const y = doc.y; let x = doc.page.margins.left; const height = 22; if (header) doc.save().fillColor("#eeeeee").rect(x, y, widths.reduce((sum, width) => sum + width, 0), height).fill().restore(); values.forEach((value, index) => { doc.rect(x, y, widths[index]!, height).stroke("#999999"); doc.fontSize(8).fillColor("#111111").text(value, x + 3, y + 6, { width: widths[index]! - 6, align: index >= 2 ? "right" : index === 0 ? "center" : "left", lineBreak: false }); x += widths[index]!; }); doc.y = y + height; }
  private number(value: unknown) {
    if (value === null || value === undefined || value === "") return null;
    return Number(new Prisma.Decimal(String(value)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString());
  }
  private textAmount(value: unknown) { const amount = this.number(value); return amount === null ? "" : amount.toFixed(2); }
  private date(value: Date) {
    const date = new Date(value);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
