import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/app-config.js";
import { FakeAccountRepository } from "./helpers/fake-account-repository.js";
import { FakeAuthRepository } from "./helpers/fake-auth-repository.js";
import { FakeBankTransactionRepository } from "./helpers/fake-bank-transaction-repository.js";
import { MemoryFileStorage } from "./helpers/memory-file-storage.js";

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

describe("bank transaction API", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it("imports a csv multipart upload for an authenticated user", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1,
      username: "user",
      displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4),
      role: "ACCOUNTANT",
      status: 0,
    });
    const app = await buildApp({
      config,
      authRepository,
      accountRepository: new FakeAccountRepository(),
      bankTransactionRepository: new FakeBankTransactionRepository(),
      fileStorage: new MemoryFileStorage(),
      logger: false,
    });
    apps.push(app);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "user", password: "correct-password" },
    });
    const token = login.json().data.accessToken as string;
    const boundary = "----bank-import-test";
    const csv = "交易金额,交易时间,交易流水号,摘要\r\n12.34,2026-07-01 08:00:00,API-001,测试\r\n";
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bank.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`,
      "utf8",
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/bank-transactions/import",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ success: true, data: { successCount: 1 } });
  });

  it("passes paging, date and processing filters to the list query", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1,
      username: "user",
      displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4),
      role: "ACCOUNTANT",
      status: 0,
    });
    const repository = new FakeBankTransactionRepository();
    const app = await buildApp({
      config,
      authRepository,
      accountRepository: new FakeAccountRepository(),
      bankTransactionRepository: repository,
      fileStorage: new MemoryFileStorage(),
      logger: false,
    });
    apps.push(app);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "user", password: "correct-password" },
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/bank-transactions?page=2&pageSize=50&keyword=供应商&startTime=2026-07-01T00%3A00%3A00.000Z&endTime=2026-07-31T23%3A59%3A59.999Z&voucherStatus=UNPOSTED&reconciliationStatus=MATCHED",
      headers: { authorization: `Bearer ${login.json().data.accessToken as string}` },
    });

    expect(response.statusCode).toBe(200);
    expect(repository.lastFilter).toMatchObject({
      page: 2,
      pageSize: 50,
      keyword: "供应商",
      voucherStatus: "UNPOSTED",
      reconciliationStatus: "MATCHED",
    });
    expect(repository.lastFilter?.startTime?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(repository.lastFilter?.endTime?.toISOString()).toBe("2026-07-31T23:59:59.999Z");
  });
});
