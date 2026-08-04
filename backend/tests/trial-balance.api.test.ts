import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/app-config.js";
import { FakeAuthRepository } from "./helpers/fake-auth-repository.js";
import { FakeTrialBalanceRepository } from "./helpers/fake-trial-balance-repository.js";

const config: AppConfig = {
  host: "127.0.0.1", port: 3000, databaseUrl: "mysql://unused:unused@127.0.0.1:3306/unused",
  jwtSecret: "test-secret-with-at-least-32-characters", jwtIssuer: "test-issuer", jwtAudience: "test-audience",
  accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 3600, uploadDir: "./data/test-uploads",
  openAiApiKey: null, aiModel: null, openAiBaseUrl: null, nodeEnv: "test",
};

describe("trial balance API", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it("returns trial balances only to authenticated users", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1, username: "user", displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4), role: "ACCOUNTANT", status: 0,
    });
    const app = await buildApp({ config, authRepository, trialBalanceRepository: new FakeTrialBalanceRepository(), logger: false });
    apps.push(app);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "user", password: "correct-password" } });
    const response = await app.inject({
      method: "GET", url: "/api/v1/trial-balance?startDate=2026-07-01&endDate=2026-07-31",
      headers: { authorization: `Bearer ${login.json().data.accessToken as string}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { isBalanced: true } });
  });
});
