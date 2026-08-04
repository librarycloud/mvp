import { afterEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/app-config.js";
import type { AuthUserRecord } from "../src/modules/auth/auth.types.js";
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

const user: AuthUserRecord = {
  id: 1,
  username: "admin",
  displayName: "管理员",
  passwordHash: "$2b$12$9UQ62ziJ0gQx7ZQkRrH5K.4rQ3zRf1TLCIIFD2mVgDcGCDQOQqH.2",
  role: "ADMIN",
  status: 0,
};

describe("auth API", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it("returns a uniform validation error", async () => {
    const repository = new FakeAuthRepository();
    const app = await buildApp({ config, authRepository: repository, logger: false });
    apps.push(app);
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("用户名") },
    });
    expect(response.json().error.message).not.toBe("请求参数校验失败");
  });

  it("returns 401 rather than exposing an unknown username", async () => {
    const repository = new FakeAuthRepository();
    const app = await buildApp({ config, authRepository: repository, logger: false });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "missing", password: "not-the-password" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED", message: "用户名或密码错误" },
    });
  });

  it("rejects unauthenticated access to the current-user endpoint", async () => {
    const repository = new FakeAuthRepository();
    repository.users.push(user);
    const app = await buildApp({ config, authRepository: repository, logger: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/auth/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
  });

  it("logs in and accepts the returned access token", async () => {
    const repository = new FakeAuthRepository();
    repository.users.push({ ...user, passwordHash: await bcrypt.hash("correct-password", 4) });
    const app = await buildApp({ config, authRepository: repository, logger: false });
    apps.push(app);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin", password: "correct-password" },
    });
    expect(login.statusCode).toBe(200);
    const accessToken = login.json().data.accessToken as string;

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ success: true, data: { username: "admin", role: "ADMIN" } });
  });
});
