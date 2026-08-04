import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AppError } from "../../common/errors/app-error.js";
import type { SavedBankFetchConfig, SavedBankFetchConfigView } from "./dto/bank-transaction.dto.js";

interface CmbFetchConfigRecord {
  encryptedPayload: string;
}

interface CmbFetchConfigDelegate {
  findUnique(args: { where: { configKey: string } }): Promise<CmbFetchConfigRecord | null>;
  upsert(args: {
    where: { configKey: string };
    create: { configKey: string; encryptedPayload: string };
    update: { encryptedPayload: string; deletedAt: null };
  }): Promise<unknown>;
}

export interface CmbFetchConfigDatabase {
  cmbFetchConfig: CmbFetchConfigDelegate;
  auditLog?: { create(args: any): Promise<unknown> };
}

export interface CmbFetchConfigActor {
  actorId: number;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class CmbFetchConfigService {
  private readonly encryptionKey: Buffer;
  private static readonly globalKey = "GLOBAL";

  constructor(private readonly database: CmbFetchConfigDatabase, secret: string) {
    this.encryptionKey = createHash("sha256").update("cmb-fetch-config:v1:").update(secret).digest();
  }

  async get(): Promise<SavedBankFetchConfigView | null> {
    const record = await this.database.cmbFetchConfig.findUnique({ where: { configKey: CmbFetchConfigService.globalKey } });
    return record ? this.toView(this.decrypt(record.encryptedPayload)) : null;
  }

  async getForFetch(): Promise<SavedBankFetchConfig | null> {
    const record = await this.database.cmbFetchConfig.findUnique({ where: { configKey: CmbFetchConfigService.globalKey } });
    return record ? this.decrypt(record.encryptedPayload) : null;
  }

  async save(input: SavedBankFetchConfig, actor?: CmbFetchConfigActor): Promise<SavedBankFetchConfigView> {
    const config = this.normalize(input);
    await this.database.cmbFetchConfig.upsert({
      where: { configKey: CmbFetchConfigService.globalKey },
      create: { configKey: CmbFetchConfigService.globalKey, encryptedPayload: this.encrypt(config) },
      update: { encryptedPayload: this.encrypt(config), deletedAt: null },
    });
    if (actor) await this.database.auditLog?.create({ data: {
      actorId: actor.actorId,
      action: "UPDATE",
      resourceType: "CmbFetchConfig",
      resourceId: null,
      description: "Update CMB bank fetch configuration",
      afterData: { apiUrl: config.apiUrl, userId: config.userId, cardNbr: config.cardNbr.replace(/.(?=.{4})/g, "*"), hasPrivateKey: true, hasBankPublicKey: true, hasSymKey: true },
      requestId: actor.requestId ?? null,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
    } });
    return this.toView(config);
  }

  private toView(config: SavedBankFetchConfig): SavedBankFetchConfigView {
    return {
      apiUrl: config.apiUrl,
      userId: config.userId,
      cardNbr: config.cardNbr,
      beginDate: config.beginDate,
      endDate: config.endDate,
      currencyCode: config.currencyCode,
      hasPrivateKey: Boolean(config.privateKey),
      hasBankPublicKey: Boolean(config.bankPublicKey),
      hasSymKey: Boolean(config.symKey),
    };
  }

  private normalize(input: SavedBankFetchConfig): SavedBankFetchConfig {
    return {
      apiUrl: input.apiUrl.trim(),
      userId: input.userId.trim(),
      cardNbr: input.cardNbr.trim(),
      beginDate: input.beginDate.trim(),
      endDate: input.endDate.trim(),
      currencyCode: input.currencyCode.trim(),
      privateKey: input.privateKey.trim(),
      bankPublicKey: input.bankPublicKey.trim(),
      symKey: input.symKey,
    };
  }

  private encrypt(config: SavedBankFetchConfig): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(config), "utf8"), cipher.final()]);
    return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
  }

  private decrypt(value: string): SavedBankFetchConfig {
    try {
      const [version, ivText, authTagText, dataText] = value.split(".");
      if (version !== "v1" || !ivText || !authTagText || !dataText) throw new Error("Invalid encrypted payload");
      const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(ivText, "base64url"));
      decipher.setAuthTag(Buffer.from(authTagText, "base64url"));
      const json = Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
      return this.parse(JSON.parse(json) as unknown);
    } catch {
      throw new AppError("CMB_CONFIG_UNAVAILABLE", "招商银行配置无法读取，请重新保存配置", 500);
    }
  }

  private parse(value: unknown): SavedBankFetchConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid configuration");
    const record = value as Record<string, unknown>;
    const keys = ["apiUrl", "userId", "cardNbr", "beginDate", "endDate", "currencyCode", "privateKey", "bankPublicKey", "symKey"] as const;
    if (keys.some((key) => typeof record[key] !== "string")) throw new Error("Invalid configuration");
    return this.normalize(record as SavedBankFetchConfig);
  }
}
