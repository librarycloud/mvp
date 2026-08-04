import { describe, expect, it } from "vitest";
import { DictionaryService } from "../src/modules/dictionary/dictionary.service.js";
import { FakeDictionaryRepository } from "./helpers/fake-dictionary-repository.js";
const admin = { actorId: 1, role: "ADMIN" as const };
describe("DictionaryService", () => {
  it("warms cache, resolves items by code and refreshes after mutation", async () => {
    const service = new DictionaryService(new FakeDictionaryRepository()); await service.warmup();
    expect(service.getItems("voucher_status")).toHaveLength(1);
    await service.createItem("voucher_status", { code: "POSTED", name: "已记账", value: "2" }, admin);
    expect(service.getItems("voucher_status").map(item => item.code)).toEqual(["DRAFT", "POSTED"]);
  });
  it("rejects dictionary writes by normal users", async () => {
    const service = new DictionaryService(new FakeDictionaryRepository()); await service.warmup();
    await expect(service.createCategory({ code: "currency" }, { ...admin, role: "ACCOUNTANT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
