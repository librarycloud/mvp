import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";

export interface CompanyProfileInput {
  name: string;
  unifiedSocialCreditCode: string;
  bankName?: string | null;
  bankAccount?: string | null;
  operationMode?: "SIMPLE" | "STANDARD";
}

export class CompanyProfileService {
  constructor(private readonly prisma: PrismaClient) {}

  get = () => this.prisma.companyProfile.findFirst({ where: { deletedAt: null } });

  async save(input: CompanyProfileInput, actorId: number) {
    const name = input.name.trim();
    const code = input.unifiedSocialCreditCode.trim().toUpperCase();
    const bankName = input.bankName?.trim() || null;
    const bankAccount = input.bankAccount?.replace(/\s+/g, "").trim() || null;
    if (!name || name.length > 200) throw new AppError("INVALID_COMPANY_PROFILE", "企业名称不能为空且不能超过 200 个字符", 400);
    if (!/^[0-9A-Z]{15,18}$/.test(code)) throw new AppError("INVALID_COMPANY_PROFILE", "统一社会信用代码格式不正确", 400);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.companyProfile.findFirst({ where: { deletedAt: null } });
      const operationMode = input.operationMode ?? current?.operationMode ?? "SIMPLE";
      const profile = current
        ? await tx.companyProfile.update({ where: { id: current.id }, data: { name, unifiedSocialCreditCode: code, bankName, bankAccount, operationMode } })
        : await tx.companyProfile.create({ data: { name, unifiedSocialCreditCode: code, bankName, bankAccount, operationMode } });
      await tx.invoice.updateMany({ where: { deletedAt: null }, data: { direction: "UNKNOWN" } });
      await tx.invoice.updateMany({ where: { deletedAt: null, sellerIdNum: code }, data: { direction: "SALE" } });
      await tx.invoice.updateMany({ where: { deletedAt: null, buyerIdNum: code, sellerIdNum: { not: code } }, data: { direction: "PURCHASE" } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "CompanyProfile", resourceId: profile.id, description: "更新企业资料、流程模式并重新识别发票方向", afterData: { name, unifiedSocialCreditCode: code, operationMode } } });
      return profile;
    });
  }
}
