import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/app-config.js";
import {
  FakeAiSuggestionRepository,
  accountCandidates,
  bankSourceFixture,
} from "./helpers/fake-ai-suggestion-repository.js";
import { FakeAuthRepository } from "./helpers/fake-auth-repository.js";
import { FakeVoucherSuggestionProvider } from "./helpers/fake-voucher-suggestion-provider.js";

const config: AppConfig = {
  host: "127.0.0.1",
  port: 3000,
  databaseUrl: "mysql://unused:unused@127.0.0.1:3306/unused",
  jwtSecret: "test-secret-with-at-least-32-characters",
  jwtIssuer: "test-issuer",
  jwtAudience: "test-audience",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 3600,
  uploadDir: "./data/test-uploads",
  openAiApiKey: null,
  aiModel: null,
  openAiBaseUrl: null,
  nodeEnv: "test",
};

describe("AI voucher suggestion API", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it("generates a validated suggestion for an authenticated user", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1,
      username: "user",
      displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4),
      role: "ACCOUNTANT",
      status: 0,
    });
    const aiSuggestionRepository = new FakeAiSuggestionRepository();
    aiSuggestionRepository.bankSources.set(bankSourceFixture.id, bankSourceFixture);
    aiSuggestionRepository.accounts.push(...accountCandidates);
    const provider = new FakeVoucherSuggestionProvider({
      summary: "支付办公用品款",
      entries: [
        { direction: "DEBIT", accountCode: "6602", rationale: "确认费用" },
        { direction: "CREDIT", accountCode: "1002", rationale: "支付款项" },
      ],
    });
    const app = await buildApp({
      config,
      authRepository,
      aiSuggestionRepository,
      voucherSuggestionProvider: provider,
      logger: false,
    });
    apps.push(app);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "user", password: "correct-password" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/voucher-suggestions",
      headers: { authorization: `Bearer ${login.json().data.accessToken as string}` },
      payload: { bankTransactionId: bankSourceFixture.id },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      data: { status: 1, suggestion: { summary: "支付办公用品款" } },
    });
  });
});
