import { Buffer } from "node:buffer";
import smCrypto from "sm-crypto";

export interface CmbDirectConfig {
  uid: string;
  privateKey: string;
  bankPublicKey: string;
  symKey: string;
  platformName?: string;
}

type JsonRecord = Record<string, any>;
const { sm2, sm4 } = smCrypto;

export class CmbDirectClient {
  async request(
    url: string,
    funcode: string,
    payload: JsonRecord,
    config: CmbDirectConfig,
  ): Promise<JsonRecord> {
    const uid = config.uid.trim();
    const userId = uid.padEnd(16, "0");
    if (userId.length !== 16) throw new Error("招商银行用户 ID 不能超过 16 个字符");
    const privateKey = this.decodeBase64(config.privateKey, "客户私钥");
    const bankPublicKey = this.decodeBase64(config.bankPublicKey, "招商银行公钥");
    const symKey = Buffer.from(config.symKey, "utf8").toString("hex");
    if (Buffer.byteLength(config.symKey, "utf8") !== 16) throw new Error("对称密钥必须是 16 字节");
    const now = this.timestamp();
    const requestJson: JsonRecord = {
      request: {
        body: payload,
        head: {
          funcode,
          userid: uid,
          reqid: `${now}${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
        },
      },
      signature: { sigdat: "__signature_sigdat__", sigtim: now.slice(0, 14) },
    };
    const sortedRequest = JSON.stringify(this.sort(requestJson));
    const signature = sm2.doSignature(sortedRequest, privateKey, { hash: true, userId });
    requestJson.signature.sigdat = Buffer.from(signature, "hex").toString("base64");
    const encrypted = sm4.encrypt(JSON.stringify(requestJson), symKey, { iv: Buffer.from(userId, "ascii").toString("hex"), mode: "cbc", output: "array" });
    const data = Buffer.from(encrypted).toString("base64");
    const form = new URLSearchParams({ UID: uid, FUNCODE: funcode, ALG: "SM", DATA: data });
    if (config.platformName?.trim()) form.set("INSPLAT", config.platformName.trim());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(error instanceof Error && error.name === "AbortError" ? "招商银行接口请求超时" : "无法连接招商银行接口");
    } finally {
      clearTimeout(timer);
    }
    const responseText = await response.text();
    if (responseText.startsWith("CDCServer:")) throw new Error(`招商银行接口网关错误：${responseText}`);
    if (!response.ok) throw new Error(`招商银行接口返回 HTTP ${response.status}：${responseText.slice(0, 500)}`);
    let decrypted: string;
    try {
      decrypted = sm4.decrypt(Buffer.from(responseText, "base64").toString("hex"), symKey, { iv: Buffer.from(userId, "ascii").toString("hex"), mode: "cbc" });
    } catch {
      throw new Error("招商银行响应解密失败，请检查密钥和用户 ID");
    }
    let responseJson: JsonRecord;
    try {
      responseJson = JSON.parse(decrypted) as JsonRecord;
    } catch {
      throw new Error("招商银行解密后的响应不是有效 JSON");
    }
    const responseSignature = responseJson.signature?.sigdat;
    if (typeof responseSignature !== "string" || !responseSignature) throw new Error("招商银行响应缺少签名");
    responseJson.signature.sigdat = "__signature_sigdat__";
    const verified = sm2.doVerifySignature(JSON.stringify(this.sort(responseJson)), Buffer.from(responseSignature, "base64").toString("hex"), bankPublicKey, { hash: true, userId });
    if (!verified) throw new Error("招商银行响应签名校验失败");
    return responseJson;
  }

  private decodeBase64(value: string, label: string): string {
    const source = value.trim();
    if (!source) throw new Error(`${label}不能为空`);
    return Buffer.from(source, "base64").toString("hex");
  }

  private timestamp(): string {
    const date = new Date();
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}${String(date.getMilliseconds()).padStart(3, "0")}`;
  }

  private sort(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sort(item));
    if (!value || typeof value !== "object") return value;
    const record = value as JsonRecord;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, this.sort(record[key])]));
  }
}
