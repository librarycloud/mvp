import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { AppError } from "../../common/errors/app-error.js";
import type {
  BankImportError,
  BankParseResult,
  ParsedBankTransaction,
} from "./bank-transaction.types.js";

type Field = keyof Omit<ParsedBankTransaction, "rawData">;
type SourceField =
  | Field
  | "account"
  | "accountName"
  | "currency"
  | "transactionDate"
  | "debitAmount"
  | "creditAmount";

const HEADERS: Record<string, SourceField> = {
  付方账户: "payerAccount",
  付方名称: "payerName",
  付方开户行: "payerBank",
  付方开户银行: "payerBank",
  付方账户币种: "payerCurrency",
  收方账户: "payeeAccount",
  收方名称: "payeeName",
  收方开户行: "payeeBank",
  收方开户银行: "payeeBank",
  收方账户币种: "payeeCurrency",
  交易金额: "amount",
  余额: "balance",
  交易时间: "transactionTime",
  交易日期: "transactionTime",
  交易流水号: "transactionNo",
  流水号: "transactionNo",
  交易类型: "transactionType",
  摘要: "summary",
  账号: "account",
  账号名称: "accountName",
  币种: "currency",
  交易日: "transactionDate",
  借方金额: "debitAmount",
  贷方金额: "creditAmount",
  "收(付)方名称": "payeeName",
  "收(付)方账号": "payeeAccount",
  "收(付)方开户行名": "payeeBank",
};

const CURRENCY_ALIASES: Record<string, string> = {
  CNY: "CNY",
  RMB: "CNY",
  人民币: "CNY",
  人民币元: "CNY",
  USD: "USD",
  美元: "USD",
  EUR: "EUR",
  欧元: "EUR",
  HKD: "HKD",
  港币: "HKD",
  港元: "HKD",
  JPY: "JPY",
  日元: "JPY",
  GBP: "GBP",
  英镑: "GBP",
};

export class BankFileParser {
  async parse(data: Buffer, extension: "xlsx" | "csv" | "json"): Promise<BankParseResult> {
    if (extension === "json") return this.parseCmbJson(data);
    const workbook = new ExcelJS.Workbook();
    if (extension === "xlsx") {
      await workbook.xlsx.load(new Uint8Array(data).buffer);
    } else {
      await workbook.csv.read(Readable.from(data));
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new AppError("EMPTY_BANK_FILE", "银行流水文件没有工作表", 400);

    const headerRowNumber = this.findHeaderRow(sheet);
    const headerRow = sheet.getRow(headerRowNumber);
    const columns = new Map<number, { original: string; field: SourceField }>();
    headerRow.eachCell((cell, column) => {
      const original = this.cellText(cell).trim().replace(/^\uFEFF/, "");
      const field = HEADERS[original.replaceAll(/\s/g, "")];
      if (field) columns.set(column, { original, field });
    });
    this.assertRequiredHeaders(columns);

    const transactions: ParsedBankTransaction[] = [];
    const errors: BankImportError[] = [];
    let totalCount = 0;
    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (!row.hasValues) continue;
      totalCount += 1;
      try {
        transactions.push(this.parseRow(row, rowNumber, columns));
      } catch (error) {
        errors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : "无法解析该行",
          ...(this.readField(row, columns, "transactionNo")
            ? { transactionNo: this.readField(row, columns, "transactionNo") }
            : {}),
        });
      }
    }
    return { totalCount, transactions, errors };
  }

  /** Parses the CMB trsQryByBreakPoint response documented at openbiz.cmbchina.com. */
  private parseCmbJson(data: Buffer): BankParseResult {
    let document: unknown;
    try {
      document = JSON.parse(data.toString("utf8"));
    } catch {
      throw new AppError("INVALID_BANK_JSON", "银行流水 JSON 文件格式错误", 400);
    }
    if (!document || typeof document !== "object") {
      throw new AppError("INVALID_BANK_JSON", "银行流水 JSON 文件格式错误", 400);
    }

    const root = document as Record<string, unknown>;
    const response = this.record(root.response) ?? root;
    const body = this.record(response.body) ?? response;
    const rows = Array.isArray(document)
      ? document
      : this.arrayOrSingle(body.TRANSQUERYBYBREAKPOINT_Z2) ?? this.arrayOrSingle(body.transQueryByBreakPointZ2) ?? [];
    if (rows.length === 0) {
      throw new AppError("BANK_JSON_ROWS_NOT_FOUND", "未找到招商银行 TRANSQUERYBYBREAKPOINT_Z2 流水数据", 400);
    }
    const requestRoot = this.record(root.request);
    const request = this.record(requestRoot?.body);
    const requestRows = this.arrayOrSingle(request?.TRANSQUERYBYBREAKPOINT_X1) ?? [];
    const responseRows = this.arrayOrSingle(body.TRANSQUERYBYBREAKPOINT_Y1) ?? [];
    const ownAccount = this.stringValue(this.record(requestRows[0])?.cardNbr)
      || this.stringValue(this.record(responseRows[0])?.acctNbr)
      || null;
    const transactions: ParsedBankTransaction[] = [];
    const errors: BankImportError[] = [];
    rows.forEach((value, index) => {
      try {
        transactions.push(this.parseCmbRow(value, index + 1, ownAccount));
      } catch (error) {
        errors.push({ row: index + 1, message: error instanceof Error ? error.message : "无法解析该行" });
      }
    });
    return { totalCount: rows.length, transactions, errors };
  }

  private parseCmbRow(value: unknown, rowNumber: number, ownAccount: string | null): ParsedBankTransaction {
    const row = this.record(value);
    if (!row) throw new Error(`第${rowNumber}行不是有效的交易对象`);
    const transactionNo = this.stringValue(row.transSequenceIdn).trim();
    if (!transactionNo) throw new Error(`第${rowNumber}行缺少流水号 transSequenceIdn`);
    if (transactionNo.length > 128) throw new Error(`第${rowNumber}行流水号不能超过128个字符`);
    const loanCode = this.stringValue(row.loanCode).trim().toUpperCase();
    if (loanCode && loanCode !== "C" && loanCode !== "D") throw new Error(`第${rowNumber}行借贷码无效`);
    const amountSource = this.stringValue(row.transAmount).trim();
    const amount = this.decimal(amountSource, "交易金额");
    const magnitude = amount.replace(/^-/, "");
    const signedAmount = loanCode === "D" ? `-${magnitude}` : loanCode === "C" ? magnitude : amount;
    const counterpartyAccount = this.optionalJson(row.ctpAcctNbr, 100);
    const counterpartyName = this.optionalJson(row.ctpAcctName, 200);
    const counterpartyBank = this.optionalJson(row.ctpBankName, 200);
    const account = ownAccount || this.optionalJson(row.transCardNbr, 100);
    const currency = this.cmbCurrency(row.currencyNbr);
    const isDebit = loanCode === "D" || (!loanCode && amount.startsWith("-"));
    const transactionType = this.optionalJson(row.textCode, 100) || this.optionalJson(row.businessName, 100);
    const summary = this.optionalJson(row.businessText, 500) || this.optionalJson(row.remarkTextClt, 500);
    const rawData: Record<string, string | null> = {};
    for (const [key, item] of Object.entries(row)) rawData[key] = this.stringValue(item) || null;
    return {
      payerAccount: isDebit ? account : counterpartyAccount,
      payerName: isDebit ? null : counterpartyName,
      payerBank: isDebit ? null : counterpartyBank,
      payerCurrency: currency,
      payeeAccount: isDebit ? counterpartyAccount : account,
      payeeName: isDebit ? counterpartyName : null,
      payeeBank: isDebit ? counterpartyBank : null,
      payeeCurrency: currency,
      amount: signedAmount,
      balance: this.optionalCmbDecimal(row.acctOnlineBal),
      transactionTime: this.cmbDate(row.transDate, row.transTime, rowNumber),
      transactionNo,
      transactionType,
      summary,
      rawData,
    };
  }

  private record(value: unknown): Record<string, any> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
  }

  private arrayOrSingle(value: unknown): unknown[] | null {
    if (Array.isArray(value)) return value;
    return value && typeof value === "object" ? [value] : null;
  }

  private stringValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  private optionalJson(value: unknown, maxLength = 500): string | null {
    const text = this.stringValue(value);
    if (!text) return null;
    if (text.length > maxLength) throw new Error(`字段不能超过${maxLength}个字符`);
    return text;
  }

  private optionalCmbDecimal(value: unknown): string | null {
    const text = this.stringValue(value);
    return text ? this.decimal(text, "余额") : null;
  }

  private cmbCurrency(value: unknown): string | null {
    const source = this.stringValue(value).toUpperCase();
    if (!source) return null;
    const aliases: Record<string, string> = { "10": "CNY", "14": "USD", "21": "HKD", "27": "JPY", "32": "EUR", CNY: "CNY", RMB: "CNY", USD: "USD", HKD: "HKD", JPY: "JPY", EUR: "EUR" };
    return aliases[source] ?? (/^[A-Z]{3}$/.test(source) ? source : null);
  }

  private cmbDate(dateValue: unknown, timeValue: unknown, rowNumber: number): Date {
    const date = this.stringValue(dateValue).replace(/[-/.]/g, "");
    const time = this.stringValue(timeValue).padStart(6, "0");
    const match = date.match(/^(\d{4})(\d{2})(\d{2})$/);
    const timeMatch = time.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (!match || (time && !timeMatch)) throw new Error(`第${rowNumber}行交易时间格式错误`);
    const [, year, month, day] = match;
    const [, hour = "0", minute = "0", second = "0"] = timeMatch ?? [];
    const result = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    if (Number.isNaN(result.getTime()) || result.getFullYear() !== Number(year) || result.getMonth() !== Number(month) - 1 || result.getDate() !== Number(day)) {
      throw new Error(`第${rowNumber}行交易日期无效`);
    }
    return result;
  }

  private findHeaderRow(sheet: ExcelJS.Worksheet): number {
    const last = Math.min(sheet.rowCount, 20);
    for (let rowNumber = 1; rowNumber <= last; rowNumber += 1) {
      const found = new Set<SourceField>();
      sheet.getRow(rowNumber).eachCell((cell) => {
        const field = HEADERS[this.cellText(cell).replaceAll(/\s/g, "")];
        if (field) found.add(field);
      });
      const hasAmount = found.has("amount") || found.has("debitAmount") || found.has("creditAmount");
      const hasTime = found.has("transactionTime") || found.has("transactionDate");
      if (hasAmount && hasTime && found.has("transactionNo")) {
        return rowNumber;
      }
    }
    throw new AppError("BANK_HEADERS_NOT_FOUND", "未找到交易金额、交易时间和交易流水号表头", 400);
  }

  private assertRequiredHeaders(columns: Map<number, { field: SourceField }>): void {
    const fields = new Set([...columns.values()].map((column) => column.field));
    if (
      (fields.has("amount") || fields.has("debitAmount") || fields.has("creditAmount")) &&
      (fields.has("transactionTime") || fields.has("transactionDate")) &&
      fields.has("transactionNo")
    ) {
      return;
    }
    for (const field of ["amount", "transactionTime", "transactionNo"] as const) {
      if (!fields.has(field)) throw new AppError("BANK_HEADER_MISSING", `缺少必要字段：${field}`, 400);
    }
  }

  private parseRow(
    row: ExcelJS.Row,
    rowNumber: number,
    columns: Map<number, { original: string; field: SourceField }>,
  ): ParsedBankTransaction {
    const rawData: Record<string, string | null> = {};
    for (const [column, mapping] of columns) rawData[mapping.original] = this.cellText(row.getCell(column)) || null;
    const transactionNo = this.readField(row, columns, "transactionNo").trim();
    if (!transactionNo) throw new Error("交易流水号不能为空");
    if (transactionNo.length > 128) throw new Error("交易流水号不能超过128个字符");
    if (this.hasField(columns, "debitAmount") || this.hasField(columns, "creditAmount")) {
      return this.parseDebitCreditRow(row, rowNumber, columns, rawData, transactionNo);
    }
    return {
      payerAccount: this.optional(row, columns, "payerAccount", 100, "付方账户"),
      payerName: this.optional(row, columns, "payerName", 200, "付方名称"),
      payerBank: this.optional(row, columns, "payerBank", 200, "付方开户行"),
      payerCurrency: this.currency(row, columns, "payerCurrency"),
      payeeAccount: this.optional(row, columns, "payeeAccount", 100, "收方账户"),
      payeeName: this.optional(row, columns, "payeeName", 200, "收方名称"),
      payeeBank: this.optional(row, columns, "payeeBank", 200, "收方开户行"),
      payeeCurrency: this.currency(row, columns, "payeeCurrency"),
      amount: this.decimal(this.readField(row, columns, "amount"), "交易金额"),
      balance: this.optionalDecimal(row, columns, "balance"),
      transactionTime: this.date(row, columns, rowNumber),
      transactionNo,
      transactionType: this.optional(row, columns, "transactionType", 100, "交易类型"),
      summary: this.optional(row, columns, "summary", 500, "摘要"),
      rawData,
    };
  }

  private readField(row: ExcelJS.Row, columns: Map<number, { field: SourceField }>, field: Field): string {
    const entry = [...columns.entries()].find(([, value]) => value.field === field);
    return entry ? this.cellText(row.getCell(entry[0])) : "";
  }

  private optional(
    row: ExcelJS.Row,
    columns: Map<number, { field: SourceField }>,
    field: Field,
    maxLength: number,
    label: string,
  ) {
    const value = this.readField(row, columns, field).trim() || null;
    if (value && value.length > maxLength) throw new Error(`${label}不能超过${maxLength}个字符`);
    return value;
  }

  private currency(row: ExcelJS.Row, columns: Map<number, { field: SourceField }>, field: Field) {
    const source = this.readField(row, columns, field).trim();
    if (!source) return null;
    const value = source.replaceAll(/\s/g, "").toUpperCase();
    const currency = CURRENCY_ALIASES[value] ?? (/^[A-Z]{3}$/.test(value) ? value : null);
    if (!currency) throw new Error(`币种格式错误：${source}`);
    return currency;
  }

  private optionalDecimal(row: ExcelJS.Row, columns: Map<number, { field: SourceField }>, field: Field) {
    const value = this.readField(row, columns, field).trim();
    return value ? this.decimal(value, "余额") : null;
  }

  private decimal(input: string, label: string): string {
    let value = input.trim().replaceAll(",", "").replace(/^¥|^￥|^CNY\s*/i, "");
    if (/^\(.+\)$/.test(value)) value = `-${value.slice(1, -1)}`;
    if (!/^-?\d{1,15}(?:\.\d{1,4})?$/.test(value)) throw new Error(`${label}格式错误：${input}`);
    return value;
  }

  private date(row: ExcelJS.Row, columns: Map<number, { field: SourceField }>, rowNumber: number): Date {
    const entry = [...columns.entries()].find(([, value]) => value.field === "transactionTime");
    const cell = entry ? row.getCell(entry[0]) : undefined;
    if (cell?.value instanceof Date && !Number.isNaN(cell.value.getTime())) return cell.value;
    const input = cell ? this.cellText(cell).trim() : "";
    const match = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) throw new Error(`第${rowNumber}行交易时间格式错误：${input}`);
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
    const result = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    if (
      Number.isNaN(result.getTime()) ||
      result.getFullYear() !== Number(year) ||
      result.getMonth() !== Number(month) - 1 ||
      result.getDate() !== Number(day) ||
      result.getHours() !== Number(hour) ||
      result.getMinutes() !== Number(minute) ||
      result.getSeconds() !== Number(second)
    ) {
      throw new Error(`第${rowNumber}行交易时间无效`);
    }
    return result;
  }

  private cellText(cell: ExcelJS.Cell): string {
    return cell.text?.trim() ?? "";
  }

  private hasField(columns: Map<number, { field: SourceField }>, field: SourceField): boolean {
    return [...columns.values()].some((column) => column.field === field);
  }

  private readSourceField(
    row: ExcelJS.Row,
    columns: Map<number, { field: SourceField }>,
    field: SourceField,
  ): string {
    const entry = [...columns.entries()].find(([, value]) => value.field === field);
    return entry ? this.cellText(row.getCell(entry[0])) : "";
  }

  private parseDebitCreditRow(
    row: ExcelJS.Row,
    rowNumber: number,
    columns: Map<number, { original: string; field: SourceField }>,
    rawData: Record<string, string | null>,
    transactionNo: string,
  ): ParsedBankTransaction {
    const debit = this.readSourceField(row, columns, "debitAmount").trim();
    const credit = this.readSourceField(row, columns, "creditAmount").trim();
    if (debit && credit) throw new Error("借方金额和贷方金额不能同时有值");
    if (!debit && !credit) throw new Error("借方金额和贷方金额不能同时为空");

    const isDebit = Boolean(debit);
    const amount = this.decimal(isDebit ? debit : credit, isDebit ? "借方金额" : "贷方金额");
    const ownAccount = this.optionalSource(row, columns, "account", 100, "账号");
    const ownName = this.optionalSource(row, columns, "accountName", 200, "账号名称");
    const currency = this.currencySource(row, columns, "currency");
    const counterpartyAccount = this.optional(row, columns, "payeeAccount", 100, "收(付)方账号");
    const counterpartyName = this.optional(row, columns, "payeeName", 200, "收(付)方名称");
    const counterpartyBank = this.optional(row, columns, "payeeBank", 200, "收(付)方开户行");

    return {
      payerAccount: isDebit ? ownAccount : counterpartyAccount,
      payerName: isDebit ? ownName : counterpartyName,
      payerBank: isDebit ? null : counterpartyBank,
      payerCurrency: currency,
      payeeAccount: isDebit ? counterpartyAccount : ownAccount,
      payeeName: isDebit ? counterpartyName : ownName,
      payeeBank: isDebit ? counterpartyBank : null,
      payeeCurrency: currency,
      amount: isDebit && amount !== "0" ? `-${amount}` : amount,
      balance: this.optionalDecimal(row, columns, "balance"),
      transactionTime: this.dateAndTime(row, columns, rowNumber),
      transactionNo,
      transactionType: this.optional(row, columns, "transactionType", 100, "交易类型"),
      summary: this.optional(row, columns, "summary", 500, "摘要"),
      rawData,
    };
  }

  private optionalSource(
    row: ExcelJS.Row,
    columns: Map<number, { field: SourceField }>,
    field: SourceField,
    maxLength: number,
    label: string,
  ) {
    const value = this.readSourceField(row, columns, field).trim() || null;
    if (value && value.length > maxLength) throw new Error(`${label}不能超过${maxLength}个字符`);
    return value;
  }

  private currencySource(
    row: ExcelJS.Row,
    columns: Map<number, { field: SourceField }>,
    field: SourceField,
  ) {
    const source = this.readSourceField(row, columns, field).trim();
    if (!source) return null;
    const value = source.replaceAll(/\s/g, "").toUpperCase();
    const currency = CURRENCY_ALIASES[value] ?? (/^[A-Z]{3}$/.test(value) ? value : null);
    if (!currency) throw new Error(`币种格式错误：${source}`);
    return currency;
  }

  private dateAndTime(
    row: ExcelJS.Row,
    columns: Map<number, { field: SourceField }>,
    rowNumber: number,
  ): Date {
    const date = this.readSourceField(row, columns, "transactionDate").trim();
    const time = this.readField(row, columns, "transactionTime").trim();
    const input = time ? `${date} ${time}` : date;
    const match = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) throw new Error(`第${rowNumber}行交易时间格式错误：${input}`);
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
    const result = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    if (
      Number.isNaN(result.getTime()) ||
      result.getFullYear() !== Number(year) ||
      result.getMonth() !== Number(month) - 1 ||
      result.getDate() !== Number(day) ||
      result.getHours() !== Number(hour) ||
      result.getMinutes() !== Number(minute) ||
      result.getSeconds() !== Number(second)
    ) {
      throw new Error(`第${rowNumber}行交易时间无效`);
    }
    return result;
  }
}
