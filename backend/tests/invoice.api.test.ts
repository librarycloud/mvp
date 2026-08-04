import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/app-config.js";
import { invoiceXml } from "./fixtures/invoice-xml.js";
import { FakeAccountRepository } from "./helpers/fake-account-repository.js";
import { FakeAuthRepository } from "./helpers/fake-auth-repository.js";
import { FakeBankTransactionRepository } from "./helpers/fake-bank-transaction-repository.js";
import { FakeInvoiceRepository } from "./helpers/fake-invoice-repository.js";
import { MemoryFileStorage } from "./helpers/memory-file-storage.js";
import { USER_STATUS } from "../src/common/status-codes.js";

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

describe("invoice API", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it("imports an XML invoice through multipart", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1,
      username: "user",
      displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4),
      role: "ACCOUNTANT",
      status: USER_STATUS.ACTIVE,
    });
    const app = await buildApp({
      config,
      authRepository,
      accountRepository: new FakeAccountRepository(),
      bankTransactionRepository: new FakeBankTransactionRepository(),
      invoiceRepository: new FakeInvoiceRepository(),
      fileStorage: new MemoryFileStorage(),
      logger: false,
    });
    apps.push(app);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "user", password: "correct-password" },
    });
    const boundary = "----invoice-import-test";
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="invoice.xml"\r\nContent-Type: application/xml\r\n\r\n${invoiceXml("API-INV-001")}\r\n--${boundary}--\r\n`,
      "utf8",
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/invoices/import/xml",
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        totalCount: 1,
        successCount: 1,
        skippedCount: 0,
        failedCount: 0,
        results: [{ fileName: "invoice.xml", invoiceNumber: "API-INV-001", itemCount: 2, duplicate: false }],
        errors: [],
      },
    });
  });

  it("imports multiple XML invoices in one request", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1,
      username: "user",
      displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4),
      role: "ACCOUNTANT",
      status: USER_STATUS.ACTIVE,
    });
    const app = await buildApp({
      config,
      authRepository,
      accountRepository: new FakeAccountRepository(),
      bankTransactionRepository: new FakeBankTransactionRepository(),
      invoiceRepository: new FakeInvoiceRepository(),
      fileStorage: new MemoryFileStorage(),
      logger: false,
    });
    apps.push(app);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "user", password: "correct-password" },
    });
    const boundary = "----invoice-batch-import-test";
    const parts = ["BATCH-INV-001", "BATCH-INV-002"].map((invoiceNumber, index) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="invoice-${index + 1}.xml"\r\nContent-Type: application/xml\r\n\r\n${invoiceXml(invoiceNumber)}\r\n`,
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/invoices/import/xml",
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.from(`${parts.join("")}--${boundary}--\r\n`, "utf8"),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        totalCount: 2,
        successCount: 2,
        skippedCount: 0,
        failedCount: 0,
        results: [
          { fileName: "invoice-1.xml", invoiceNumber: "BATCH-INV-001", duplicate: false },
          { fileName: "invoice-2.xml", invoiceNumber: "BATCH-INV-002", duplicate: false },
        ],
        errors: [],
      },
    });
  });

  it("allows only administrators to change invoice voucher links", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1,
      username: "user",
      displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4),
      role: "ACCOUNTANT",
      status: USER_STATUS.ACTIVE,
    });
    const app = await buildApp({
      config,
      authRepository,
      accountRepository: new FakeAccountRepository(),
      bankTransactionRepository: new FakeBankTransactionRepository(),
      invoiceRepository: new FakeInvoiceRepository(),
      fileStorage: new MemoryFileStorage(),
      logger: false,
    });
    apps.push(app);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "user", password: "correct-password" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/invoices/1/vouchers",
      headers: { authorization: `Bearer ${login.json().data.accessToken as string}` },
      payload: { voucherId: 10 },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
  });
});
