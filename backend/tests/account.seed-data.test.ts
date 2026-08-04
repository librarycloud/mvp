import { describe, expect, it } from "vitest";
import { STANDARD_ACCOUNTS } from "../src/modules/account/account.seed-data.js";

describe("standard chart of accounts", () => {
  it("contains unique codes and the official general-enterprise mappings", () => {
    const byCode = new Map(STANDARD_ACCOUNTS.map((account) => [account.code, account]));

    expect(byCode.size).toBe(STANDARD_ACCOUNTS.length);
    expect(STANDARD_ACCOUNTS.length).toBeGreaterThanOrEqual(90);
    expect(byCode.get("1001")?.name).toBe("库存现金");
    expect(byCode.get("1002")?.name).toBe("银行存款");
    expect(byCode.get("5001")?.name).toBe("生产成本");
    expect(byCode.get("6001")?.name).toBe("主营业务收入");
    expect(byCode.get("6601")?.name).toBe("销售费用");
    expect(byCode.get("6602")?.name).toBe("管理费用");
    expect(byCode.get("6603")?.name).toBe("财务费用");
  });

  it("contains the complete general-taxpayer VAT hierarchy", () => {
    const byCode = new Map(STANDARD_ACCOUNTS.map((account) => [account.code, account]));
    expect(byCode.get("222101")).toMatchObject({ name: "应交增值税", parentCode: "2221" });
    const detailNames = [
      "进项税额", "销项税额抵减", "已交税金", "转出未交增值税", "减免税款",
      "出口抵减内销产品应纳税额", "销项税额", "出口退税", "进项税额转出", "转出多交增值税",
    ];
    detailNames.forEach((name, index) => {
      const code = `222101${String(index + 1).padStart(2, "0")}`;
      expect(byCode.get(code)).toMatchObject({ name, parentCode: "222101", normalDirection: "CREDIT" });
    });
    ["222102", "222103", "222104", "222105", "222106", "222107", "222108", "222109", "222110"].forEach((code) => {
      expect(byCode.get(code)?.parentCode).toBe("2221");
    });
  });

  it("contains common non-VAT tax accounts under taxes payable", () => {
    const byCode = new Map(STANDARD_ACCOUNTS.map((account) => [account.code, account]));
    const commonTaxes = new Map([
      ["222111", "应交消费税"], ["222112", "应交城市维护建设税"],
      ["222113", "应交教育费附加"], ["222114", "应交地方教育附加"],
      ["222115", "应交企业所得税"], ["222116", "应交个人所得税"],
      ["222117", "应交房产税"], ["222118", "应交城镇土地使用税"],
      ["222119", "应交车船税"], ["222120", "应交印花税"],
      ["222121", "应交土地增值税"], ["222122", "应交资源税"],
      ["222123", "应交环境保护税"], ["222124", "应交关税"],
      ["222125", "应交契税"], ["222126", "应交耕地占用税"],
      ["222199", "其他应交税费"],
    ]);
    for (const [code, name] of commonTaxes) {
      expect(byCode.get(code)).toMatchObject({ name, parentCode: "2221", normalDirection: "CREDIT" });
    }
  });
});
