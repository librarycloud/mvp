import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/app-config.js";
import { FakeAuthRepository } from "./helpers/fake-auth-repository.js";
import { FakeReportRepository } from "./helpers/fake-report-repository.js";

const config: AppConfig = {
  host: "127.0.0.1", port: 3000, databaseUrl: "mysql://unused:unused@127.0.0.1:3306/unused",
  jwtSecret: "test-secret-with-at-least-32-characters", jwtIssuer: "test-issuer", jwtAudience: "test-audience",
  accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 3600, uploadDir: "./data/test-uploads",
  openAiApiKey: null, aiModel: null, openAiBaseUrl: null, nodeEnv: "test",
};

describe("report API", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it("generates a configured income statement for authenticated users", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1, username: "user", displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4), role: "ACCOUNTANT", status: 0,
    });
    const app = await buildApp({ config, authRepository, reportRepository: new FakeReportRepository(), logger: false });
    apps.push(app);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "user", password: "correct-password" } });
    const response = await app.inject({
      method: "POST", url: "/api/v1/reports/income-statement/generate",
      headers: { authorization: `Bearer ${login.json().data.accessToken as string}` },
      payload: { periodType: "MONTH", fiscalYear: 2026, period: 7 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ success: true, data: { template: { code: "INCOME_STATEMENT_CN_ASBE_V1" } } });
  });

  it("generates a report through the selected-template endpoint", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1, username: "user", displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4), role: "ACCOUNTANT", status: 0,
    });
    const app = await buildApp({ config, authRepository, reportRepository: new FakeReportRepository(), logger: false });
    apps.push(app);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "user", password: "correct-password" } });
    const response = await app.inject({
      method: "POST", url: "/api/v1/reports/generate",
      headers: { authorization: `Bearer ${login.json().data.accessToken as string}` },
      payload: { templateCode: "INCOME_STATEMENT_CN_ASBE_V1", periodType: "MONTH", fiscalYear: 2026, period: 7 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ success: true, data: { template: { code: "INCOME_STATEMENT_CN_ASBE_V1" } } });
  });

  it("exposes the configured cash-flow generation endpoint", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1, username: "user", displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4), role: "ACCOUNTANT", status: 0,
    });
    const reportRepository = new FakeReportRepository();
    reportRepository.template = { ...reportRepository.template!, code: "CASH_FLOW_STATEMENT_CN_ASBE_V1", type: "CASH_FLOW_STATEMENT" };
    const app = await buildApp({ config, authRepository, reportRepository, logger: false });
    apps.push(app);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "user", password: "correct-password" } });
    const response = await app.inject({
      method: "POST", url: "/api/v1/reports/cash-flow-statement/generate",
      headers: { authorization: `Bearer ${login.json().data.accessToken as string}` },
      payload: { periodType: "MONTH", fiscalYear: 2026, period: 7 },
    });
    expect(response.statusCode).toBe(201);
  });

  it("exposes the configured equity-change generation endpoint", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1, username: "user", displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4), role: "ACCOUNTANT", status: 0,
    });
    const reportRepository = new FakeReportRepository();
    reportRepository.template = { ...reportRepository.template!, code: "EQUITY_CHANGE_STATEMENT_CN_ASBE_V1", type: "EQUITY_CHANGE_STATEMENT" };
    const app = await buildApp({ config, authRepository, reportRepository, logger: false });
    apps.push(app);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "user", password: "correct-password" } });
    const response = await app.inject({
      method: "POST", url: "/api/v1/reports/equity-change-statement/generate",
      headers: { authorization: `Bearer ${login.json().data.accessToken as string}` },
      payload: { periodType: "MONTH", fiscalYear: 2026, period: 7 },
    });
    expect(response.statusCode).toBe(201);
  });
});
