import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/app-config.js";
import { FakeAuthRepository } from "./helpers/fake-auth-repository.js";
import { MemoryFileStorage } from "./helpers/memory-file-storage.js";
import {
  FakeVoucherRepository,
  creditAccountId,
  debitAccountId,
} from "./helpers/fake-voucher-repository.js";

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

describe("voucher API", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it("lets a normal user create a balanced voucher but not review it", async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.users.push({
      id: 1,
      username: "user",
      displayName: "普通用户",
      passwordHash: await bcrypt.hash("correct-password", 4),
      role: "ACCOUNTANT",
      status: 0,
    });
    const voucherRepository = new FakeVoucherRepository();
    voucherRepository.postableAccounts.add(debitAccountId).add(creditAccountId);
    const app = await buildApp({
      config,
      authRepository,
      voucherRepository,
      fileStorage: new MemoryFileStorage(),
      logger: false,
    });
    apps.push(app);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "user", password: "correct-password" },
    });
    const headers = { authorization: `Bearer ${login.json().data.accessToken as string}` };
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/vouchers",
      headers,
      payload: {
        voucherDate: "2026-07-01",
        summary: "支付办公费",
        entries: [
          { accountId: debitAccountId, summary: "办公费", debitAmount: "100.00", creditAmount: "0" },
          { accountId: creditAccountId, summary: "银行付款", debitAmount: "0", creditAmount: "100.00" },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ success: true, data: { voucherNo: "2026-000001", status: 0 } });

    const boundary = "----voucher-attachment-test";
    const attachment = await app.inject({
      method: "POST",
      url: `/api/v1/vouchers/${created.json().data.id as string}/attachments`,
      headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="invoice.pdf"\r\nContent-Type: application/pdf\r\n\r\npdf\r\n--${boundary}--\r\n`,
      ),
    });
    expect(attachment.statusCode).toBe(201);
    expect(attachment.json()).toMatchObject({ success: true, data: { originalName: "invoice.pdf", fileSize: "3" } });

    const reviewed = await app.inject({
      method: "POST",
      url: `/api/v1/vouchers/${created.json().data.id as string}/review`,
      headers,
    });
    expect(reviewed.statusCode).toBe(403);
    expect(reviewed.json()).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/vouchers/${created.json().data.id as string}`,
      headers,
    });
    expect(deleted.statusCode).toBe(200);

    const missing = await app.inject({
      method: "GET",
      url: `/api/v1/vouchers/${created.json().data.id as string}`,
      headers,
    });
    expect(missing.statusCode).toBe(404);
  });
});
