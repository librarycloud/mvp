import { describe, expect, it } from "vitest";
import type { PasswordHasher } from "../src/modules/auth/password-hasher.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { JwtTokenService } from "../src/modules/auth/token-service.js";
import type { AuthUserRecord } from "../src/modules/auth/auth.types.js";
import { FakeAuthRepository } from "./helpers/fake-auth-repository.js";

const user: AuthUserRecord = {
  id: 1,
  username: "admin",
  displayName: "管理员",
  passwordHash: "correct-password",
  role: "ADMIN",
  status: 0,
};

const hasher: PasswordHasher = {
  compare: async (plain, hash) => plain === hash,
  hash: async (plain) => plain,
};

function setup() {
  const repository = new FakeAuthRepository();
  repository.users.push({ ...user });
  const tokens = new JwtTokenService({
    secret: "test-secret-with-at-least-32-characters",
    issuer: "test-issuer",
    audience: "test-audience",
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 3600,
  });
  return { repository, service: new AuthService(repository, hasher, tokens) };
}

describe("AuthService", () => {
  it("logs in an active user and stores a hashed refresh session", async () => {
    const { repository, service } = setup();
    const result = await service.login({ username: "admin", password: "correct-password" }, {});

    expect(result.user.role).toBe("ADMIN");
    expect(result.accessToken).not.toBe(result.refreshToken);
    expect([...repository.sessions.values()][0]?.tokenHash).not.toBe(result.refreshToken);
    expect(repository.loginEvents).toEqual([{ userId: user.id, succeeded: true }]);
  });

  it("uses the same public error for wrong passwords and disabled users", async () => {
    const { repository, service } = setup();
    await expect(service.login({ username: "admin", password: "wrong-password" }, {})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "用户名或密码错误",
    });
    repository.users[0]!.status = 1;
    await expect(service.login({ username: "admin", password: "correct-password" }, {})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "用户名或密码错误",
    });
  });

  it("rotates refresh tokens and rejects replay", async () => {
    const { service } = setup();
    const login = await service.login({ username: "admin", password: "correct-password" }, {});
    const refreshed = await service.refresh(login.refreshToken);

    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    await expect(service.refresh(login.refreshToken)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a refresh after the configured idle window", async () => {
    const { repository, service } = setup();
    const login = await service.login({ username: "admin", password: "correct-password" }, {});
    const session = [...repository.sessions.values()][0]!;
    session.lastActivityAt = new Date(Date.now() - 31 * 60_000);

    await expect(service.refresh(login.refreshToken)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
