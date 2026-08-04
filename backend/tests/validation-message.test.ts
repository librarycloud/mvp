import { describe, expect, it } from "vitest";
import { formatValidationMessage } from "../src/common/http/validation-message.js";

describe("formatValidationMessage", () => {
  it("identifies missing fields by their Chinese labels", () => {
    expect(formatValidationMessage([
      { instancePath: "", keyword: "required", params: { missingProperty: "paymentAccountId" } },
    ])).toBe("缺少付款科目");
  });

  it("identifies invalid optional IDs instead of returning a generic error", () => {
    expect(formatValidationMessage([
      { instancePath: "/bankTransactionId", keyword: "type", params: { type: "integer" } },
    ])).toBe("银行流水必须是整数");
  });

  it("shows nested list positions and date requirements", () => {
    expect(formatValidationMessage([
      { instancePath: "/entries/0/debitAmount", keyword: "pattern", params: {} },
      { instancePath: "/paymentDate", keyword: "format", params: { format: "date" } },
    ])).toBe("凭证分录 > 第1项 > 借方金额格式不正确；付款日期格式不正确，应为 YYYY-MM-DD");
  });

  it("collapses union internals into one useful field error", () => {
    expect(formatValidationMessage([
      { instancePath: "/status", keyword: "const", params: {} },
      { instancePath: "/status", keyword: "type", params: { type: "number" } },
      { instancePath: "/status", keyword: "anyOf", params: {} },
    ])).toBe("状态的值不在允许范围内");
  });
});
