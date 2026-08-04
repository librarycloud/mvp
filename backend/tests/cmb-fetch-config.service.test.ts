import { describe, expect, it } from "vitest";
import { CmbFetchConfigService } from "../src/modules/bank-transaction/cmb-fetch-config.service.js";

const config = {
  apiUrl: "https://cdc.cmbchina.com/cdcserver/api/v2",
  userId: "U001",
  cardNbr: "TEST-CORPORATE-ACCOUNT",
  beginDate: "2026-07-31",
  endDate: "2026-07-31",
  currencyCode: "",
  privateKey: "private-key-base64",
  bankPublicKey: "bank-public-key-base64",
  symKey: "1234567890123456",
};

describe("CmbFetchConfigService", () => {
  it("encrypts saved credentials and restores them for the same user", async () => {
    let encryptedPayload: string | null = null;
    const database = {
      cmbFetchConfig: {
        findUnique: async () => encryptedPayload ? { encryptedPayload } : null,
        upsert: async (args: { create: { encryptedPayload: string } }) => { encryptedPayload = args.create.encryptedPayload; },
      },
    };
    const service = new CmbFetchConfigService(database, "test-secret-with-at-least-32-characters");

    await expect(service.save(config)).resolves.toEqual({
      apiUrl: config.apiUrl,
      userId: config.userId,
      cardNbr: config.cardNbr,
      beginDate: config.beginDate,
      endDate: config.endDate,
      currencyCode: config.currencyCode,
      hasPrivateKey: true,
      hasBankPublicKey: true,
      hasSymKey: true,
    });
    expect(encryptedPayload).not.toContain(config.privateKey);
    expect(encryptedPayload).not.toContain(config.symKey);
    await expect(service.get()).resolves.toMatchObject({
      apiUrl: config.apiUrl,
      hasPrivateKey: true,
      hasBankPublicKey: true,
      hasSymKey: true,
    });
    await expect(service.getForFetch()).resolves.toEqual(config);
  });
});
