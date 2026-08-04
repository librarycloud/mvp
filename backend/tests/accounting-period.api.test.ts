import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/app-config.js";
import { FakeAuthRepository } from "./helpers/fake-auth-repository.js";
import { FakeAccountingPeriodRepository } from "./helpers/fake-accounting-period-repository.js";

const config: AppConfig = { host: "127.0.0.1", port: 3000, databaseUrl: "mysql://unused:unused@127.0.0.1:3306/unused", jwtSecret: "test-secret-with-at-least-32-characters", jwtIssuer: "test-issuer", jwtAudience: "test-audience", accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 3600, uploadDir: "./data/test-uploads", openAiApiKey: null, aiModel: null, openAiBaseUrl: null, nodeEnv: "test" };

describe("accounting period API", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  async function setup(role: "ADMIN" | "ACCOUNTANT") {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({ id: 1, username: role.toLowerCase(), displayName: "测试用户", passwordHash: await bcrypt.hash("correct-password", 4), role, status: 0 });
    const repository = new FakeAccountingPeriodRepository();
    const app = await buildApp({ config, authRepository, accountingPeriodRepository: repository, logger: false }); apps.push(app);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: role.toLowerCase(), password: "correct-password" } });
    return { app, repository, headers: { authorization: `Bearer ${login.json().data.accessToken as string}` } };
  }

  it("creates, closes and reopens a period for administrators", async () => {
    const { app, headers } = await setup("ADMIN");
    const create = await app.inject({ method: "POST", url: "/api/v1/accounting-periods", headers, payload: { year: 2026, month: 7 } });
    expect(create.statusCode).toBe(201); const id = create.json().data.id as string;
    expect((await app.inject({ method: "POST", url: `/api/v1/accounting-periods/${id}/close`, headers })).json()).toMatchObject({ data: { status: 1 } });
    expect((await app.inject({ method: "POST", url: `/api/v1/accounting-periods/${id}/reopen`, headers })).json()).toMatchObject({ data: { status: 0 } });
  });

  it("does not allow ordinary users to close a period", async () => {
    const { app, headers, repository } = await setup("ACCOUNTANT");
    const seeded = await repository.create({ year: 2026, month: 7, periodCode: "2026-07", startDate: new Date(Date.UTC(2026, 6, 1)), endDate: new Date(Date.UTC(2026, 6, 31)) });
    const id = (seeded as { id: number }).id;
    const close = await app.inject({ method: "POST", url: `/api/v1/accounting-periods/${id}/close`, headers });
    expect(close.statusCode).toBe(403);
  });

  it("allows administrators to update a period date range", async () => {
    const { app, headers } = await setup("ADMIN");
    const create = await app.inject({ method: "POST", url: "/api/v1/accounting-periods", headers, payload: { year: 2026, month: 6 } });
    const id = create.json().data.id as string;

    const update = await app.inject({
      method: "PUT",
      url: `/api/v1/accounting-periods/${id}`,
      headers,
      payload: { startDate: "2026-06-01", endDate: "2026-07-05" },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ data: { periodCode: "2026-06", startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-07-05T00:00:00.000Z" } });
  });

  it("does not allow ordinary users to update a period", async () => {
    const { app, headers, repository } = await setup("ACCOUNTANT");
    const seeded = await repository.create({ year: 2026, month: 6, periodCode: "2026-06", startDate: new Date(Date.UTC(2026, 5, 1)), endDate: new Date(Date.UTC(2026, 5, 30)) });
    const id = (seeded as { id: number }).id;

    const update = await app.inject({ method: "PUT", url: `/api/v1/accounting-periods/${id}`, headers, payload: { startDate: "2026-06-01", endDate: "2026-07-05" } });

    expect(update.statusCode).toBe(403);
  });
});
