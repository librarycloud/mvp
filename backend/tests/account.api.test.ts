import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/app-config.js";
import type { AuthRole } from "../src/modules/auth/auth.types.js";
import { FakeAccountRepository, accountFixture } from "./helpers/fake-account-repository.js";
import { FakeAuthRepository } from "./helpers/fake-auth-repository.js";

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

describe("account API", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  async function setup(role: AuthRole) {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1,
      username: role.toLowerCase(),
      displayName: "测试用户",
      passwordHash: await bcrypt.hash("correct-password", 4),
      role,
      status: 0,
    });
    const accountRepository = new FakeAccountRepository();
    accountRepository.accounts.push(accountFixture());
    const app = await buildApp({ config, authRepository, accountRepository, logger: false });
    apps.push(app);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: role.toLowerCase(), password: "correct-password" },
    });
    return { app, token: login.json().data.accessToken as string, accountRepository };
  }

  it("allows normal users to view accounts but not maintain them", async () => {
    const { app, token } = await setup("ACCOUNTANT");
    const headers = { authorization: `Bearer ${token}` };
    const list = await app.inject({ method: "GET", url: "/api/v1/accounts", headers });
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers,
      payload: {
        code: "100201",
        name: "基本户",
        category: "ASSET",
        normalDirection: "DEBIT",
        parentId: 100,
      },
    });

    expect(list.statusCode).toBe(200);
    expect(create.statusCode).toBe(403);
  });

  it("allows administrators to create a child account", async () => {
    const { app, token } = await setup("ADMIN");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        code: "100201",
        name: "基本户",
        category: "ASSET",
        normalDirection: "DEBIT",
        parentId: 100,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ success: true, data: { code: "100201", level: 2 } });
  });
});
