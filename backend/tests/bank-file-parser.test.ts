import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { BankFileParser } from "../src/modules/bank-transaction/bank-file-parser.js";

const headers = [
  "付方账户",
  "付方名称",
  "付方开户行",
  "付方账户币种",
  "收方账户",
  "收方名称",
  "收方开户银行",
  "收方账户币种",
  "交易金额",
  "余额",
  "交易时间",
  "交易流水号",
  "交易类型",
  "摘要",
];

describe("BankFileParser", () => {
  it("parses an xlsx row with Chinese bank headers", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("流水");
    sheet.addRow(headers);
    sheet.addRow([
      "62220001",
      "示例公司",
      "开户银行",
      "人民币",
      "62220002",
      "供应商",
      "收款银行",
      "人民币",
      1234.56,
      9000.12,
      new Date(2026, 6, 1, 9, 30, 0),
      "TX-001",
      "转账",
      "支付服务费",
    ]);
    const buffer = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);

    const result = await new BankFileParser().parse(buffer, "xlsx");
    expect(result.errors).toEqual([]);
    expect(result.transactions[0]).toMatchObject({
      transactionNo: "TX-001",
      amount: "1234.56",
      balance: "9000.12",
      payeeName: "供应商",
      payerCurrency: "CNY",
      payeeCurrency: "CNY",
    });
  });

  it("keeps valid csv rows and reports invalid rows", async () => {
    const csv = [
      headers.join(","),
      ",,,,,,,,88.50,,2026-07-02 10:20:30,TX-002,,收款",
      ",,,,,,,,金额错误,,2026-02-30 10:00:00,TX-003,,错误行",
    ].join("\n");

    const result = await new BankFileParser().parse(Buffer.from(csv, "utf8"), "csv");
    expect(result).toMatchObject({ totalCount: 2 });
    expect(result.transactions).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 3, transactionNo: "TX-003" });
  });

  it("parses debit and credit account-statement exports with preamble rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("对账单");
    sheet.addRow(["对账单"]);
    sheet.addRow([]);
    sheet.addRow([
      "账号", "账号名称", "币种", "交易日", "交易时间", "交易类型", "借方金额", "贷方金额", "余额", "摘要", "流水号", "收(付)方名称", "收(付)方账号", "收(付)方开户行名",
    ]);
    sheet.addRow(["TEST-CORPORATE-ACCOUNT", "示例公司", "人民币", "2026-07-29", "09:29:30", "对公转账", 417.64, null, 275.27, "报销", "TEST-TXN-DEBIT-001", "测试交易对手", "TEST-COUNTERPARTY-ACCOUNT", "测试银行"]);
    sheet.addRow(["TEST-CORPORATE-ACCOUNT", "示例公司", "人民币", "2026-07-30", "14:11:49", "收款", null, 500, 595.55, "还借款", "TEST-TXN-CREDIT-001", "测试交易对手", "TEST-COUNTERPARTY-ACCOUNT", "测试银行"]);

    const buffer = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    const result = await new BankFileParser().parse(buffer, "xlsx");

    expect(result.errors).toEqual([]);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      amount: "-417.64",
      payerAccount: "TEST-CORPORATE-ACCOUNT",
      payeeAccount: "TEST-COUNTERPARTY-ACCOUNT",
      payeeName: "测试交易对手",
      transactionTime: new Date(2026, 6, 29, 9, 29, 30),
    });
    expect(result.transactions[1]).toMatchObject({
      amount: "500",
      payerAccount: "TEST-COUNTERPARTY-ACCOUNT",
      payeeAccount: "TEST-CORPORATE-ACCOUNT",
      payeeName: "示例公司",
      transactionTime: new Date(2026, 6, 30, 14, 11, 49),
    });
  });

  it("parses a CMB trsQryByBreakPoint JSON response", async () => {
    const payload = {
      request: { body: { TRANSQUERYBYBREAKPOINT_X1: [{ cardNbr: "TEST-CORPORATE-ACCOUNT" }] } },
      response: {
        body: {
          TRANSQUERYBYBREAKPOINT_Z2: [
            {
              transDate: "20260730",
              transTime: "141149",
              transSequenceIdn: "TEST-TXN-CREDIT-001",
              loanCode: "D",
              transAmount: "-500.00",
              currencyNbr: "10",
              acctOnlineBal: "9500.00",
              ctpAcctNbr: "TEST-COUNTERPARTY-ACCOUNT",
              ctpAcctName: "供应商",
              ctpBankName: "测试银行",
              textCode: "EBPP",
              remarkTextClt: "采购付款",
            },
          ],
        },
      },
    };
    const result = await new BankFileParser().parse(Buffer.from(JSON.stringify(payload)), "json");
    expect(result.errors).toEqual([]);
    expect(result.transactions[0]).toMatchObject({
      amount: "-500.00",
      balance: "9500.00",
      payerAccount: "TEST-CORPORATE-ACCOUNT",
      payeeAccount: "TEST-COUNTERPARTY-ACCOUNT",
      payeeName: "供应商",
      payerCurrency: "CNY",
      transactionNo: "TEST-TXN-CREDIT-001",
      transactionType: "EBPP",
      summary: "采购付款",
    });
    expect(result.transactions[0]?.transactionTime).toEqual(new Date(2026, 6, 30, 14, 11, 49));
  });
});
