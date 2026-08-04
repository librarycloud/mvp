import { describe, expect, it } from "vitest";
import { AiSuggestionService } from "../src/modules/ai-suggestion/ai-suggestion.service.js";
import { UnconfiguredVoucherSuggestionProvider } from "../src/modules/ai-suggestion/voucher-suggestion.provider.js";
import type { VoucherSuggestionOutput } from "../src/modules/ai-suggestion/ai-suggestion.types.js";
import {
  FakeAiSuggestionRepository,
  accountCandidates,
  bankSourceFixture,
} from "./helpers/fake-ai-suggestion-repository.js";
import { FakeVoucherSuggestionProvider } from "./helpers/fake-voucher-suggestion-provider.js";

const requester = {
  actorId: 1,
  role: "ACCOUNTANT" as const,
};
const validOutput: VoucherSuggestionOutput = {
  summary: "支付办公用品款",
  entries: [
    { direction: "DEBIT", accountCode: "6602", rationale: "办公用品计入管理费用" },
    { direction: "CREDIT", accountCode: "1002", rationale: "银行存款减少" },
  ],
};

function setup(output: VoucherSuggestionOutput = validOutput) {
  const repository = new FakeAiSuggestionRepository();
  repository.bankSources.set(bankSourceFixture.id, bankSourceFixture);
  repository.accounts.push(...accountCandidates);
  const provider = new FakeVoucherSuggestionProvider(output);
  return { repository, provider, service: new AiSuggestionService(repository, provider) };
}

describe("AiSuggestionService", () => {
  it("passes source amounts as strings and stores only account suggestions", async () => {
    const { provider, service } = setup();
    const result = await service.generate({ bankTransactionId: bankSourceFixture.id }, requester);

    expect(provider.inputs[0]?.bankTransaction?.amount).toBe("1130.00");
    expect(result).toMatchObject({ status: 1, model: "fake-accounting-model" });
    expect(JSON.stringify(result.suggestion)).not.toContain("amount");
  });

  it("rejects extra model fields such as amounts and marks the attempt failed", async () => {
    const malicious = {
      ...validOutput,
      entries: validOutput.entries.map((entry) => ({ ...entry, amount: "1130.00" })),
    } as unknown as VoucherSuggestionOutput;
    const { repository, service } = setup(malicious);

    await expect(service.generate({ bankTransactionId: bankSourceFixture.id }, requester)).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
    expect([...repository.records.values()][0]?.status).toBe(3);
  });

  it("rejects account codes outside the enabled leaf candidates", async () => {
    const output: VoucherSuggestionOutput = {
      ...validOutput,
      entries: [
        validOutput.entries[0]!,
        { direction: "CREDIT", accountCode: "9999", rationale: "不存在的科目" },
      ],
    };
    const { service } = setup(output);
    await expect(service.generate({ bankTransactionId: bankSourceFixture.id }, requester)).rejects.toMatchObject({
      code: "AI_ACCOUNT_INVALID",
    });
  });

  it("returns a clear configuration error when the provider is disabled", async () => {
    const repository = new FakeAiSuggestionRepository();
    repository.bankSources.set(bankSourceFixture.id, bankSourceFixture);
    repository.accounts.push(...accountCandidates);
    const service = new AiSuggestionService(repository, new UnconfiguredVoucherSuggestionProvider());

    await expect(service.generate({ bankTransactionId: bankSourceFixture.id }, requester)).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
      statusCode: 503,
    });
  });

  it("enforces ownership and allows the owner to reject a generated suggestion", async () => {
    const { service } = setup();
    const generated = await service.generate({ bankTransactionId: bankSourceFixture.id }, requester);

    await expect(
      service.getById(generated.id, {
        actorId: 99,
        role: "ACCOUNTANT",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const rejected = await service.reject(generated.id, requester);
    expect(rejected.status).toBe(3);
  });
});
