import { describe, expect, it } from "vitest";
import { AccountService } from "../src/modules/account/account.service.js";
import { FakeAccountRepository, accountFixture } from "./helpers/fake-account-repository.js";

const context = { actorId: 1 };

describe("AccountService", () => {
  it("creates a child account and derives its hierarchy", async () => {
    const repository = new FakeAccountRepository();
    const parent = accountFixture();
    repository.accounts.push(parent);
    const service = new AccountService(repository);

    const result = await service.create(
      {
        code: "100201",
        name: "基本户",
        category: "ASSET",
        normalDirection: "DEBIT",
        parentId: parent.id,
      },
      context,
    );

    expect(result).toMatchObject({ parentId: parent.id, level: 2, isLeaf: true });
    expect(parent.isLeaf).toBe(false);
  });

  it("rejects a child code outside the parent prefix", async () => {
    const repository = new FakeAccountRepository();
    const parent = accountFixture();
    repository.accounts.push(parent);
    const service = new AccountService(repository);

    await expect(
      service.create(
        {
          code: "100301",
          name: "错误明细",
          category: "ASSET",
          normalDirection: "DEBIT",
          parentId: parent.id,
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "INVALID_ACCOUNT_CODE" });
  });

  it("protects system accounts and accounts used by vouchers", async () => {
    const repository = new FakeAccountRepository();
    const systemAccount = accountFixture();
    const customAccount = accountFixture({
      id: 101,
      code: "100201",
      isSystem: false,
    });
    repository.accounts.push(systemAccount, customAccount);
    repository.entryCounts.set(customAccount.id, 1);
    const service = new AccountService(repository);

    await expect(service.remove(systemAccount.id, context)).rejects.toMatchObject({
      code: "SYSTEM_ACCOUNT_PROTECTED",
    });
    await expect(service.remove(customAccount.id, context)).rejects.toMatchObject({
      code: "ACCOUNT_IN_USE",
    });
  });

  it("builds a stable account tree", async () => {
    const repository = new FakeAccountRepository();
    const parent = accountFixture();
    const child = accountFixture({
      id: 101,
      code: "100201",
      parentId: parent.id,
      level: 2,
      isSystem: false,
    });
    repository.accounts.push(parent, child);

    const result = await new AccountService(repository).list({}, true);
    expect(result).toHaveLength(1);
    expect(result[0]?.children[0]?.code).toBe("100201");
  });
});
