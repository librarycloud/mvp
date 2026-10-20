import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";

export interface CompanyProfileInput {
  name: string;
  unifiedSocialCreditCode: string;
  bankName?: string | null;
  bankAccount?: string | null;
  operationMode?: "SIMPLE" | "STANDARD";
  vatTaxpayerType?: "UNKNOWN" | "SMALL_SCALE" | "GENERAL";
  vatFilingPeriod?: "UNKNOWN" | "MONTH" | "QUARTER";
  citFilingPeriod?: "UNKNOWN" | "MONTH" | "QUARTER";
  citTaxCollectionMethod?: "UNKNOWN" | "ACCOUNTING" | "ASSESSED";
  smallProfitEnterpriseEligible?: "UNKNOWN" | "YES" | "NO";
  surchargeReductionEligible?: "UNKNOWN" | "YES" | "NO";
  urbanMaintenanceRate?: string | null;
  educationSurchargeRate?: string;
  localEducationSurchargeRate?: string;
  surchargeReductionRate?: string;
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
    const validateRate = (value: string | null | undefined, field: string, optional = false) => {
      if (value == null || value === "") {
        if (optional) return null;
        throw new AppError("INVALID_TAX_PROFILE", `${field}不能为空`, 400);
      }
      if (!/^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/.test(value)) throw new AppError("INVALID_TAX_PROFILE", `${field}必须在 0% 到 100% 之间`, 400);
      return value;
    };
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.companyProfile.findFirst({ where: { deletedAt: null } });
      const operationMode = input.operationMode ?? current?.operationMode ?? "SIMPLE";
      const taxProfile = {
        vatTaxpayerType: input.vatTaxpayerType ?? current?.vatTaxpayerType ?? "UNKNOWN",
        vatFilingPeriod: input.vatFilingPeriod ?? current?.vatFilingPeriod ?? "UNKNOWN",
        citFilingPeriod: input.citFilingPeriod ?? current?.citFilingPeriod ?? "UNKNOWN",
        citTaxCollectionMethod: input.citTaxCollectionMethod ?? current?.citTaxCollectionMethod ?? "UNKNOWN",
        smallProfitEnterpriseEligible: input.smallProfitEnterpriseEligible ?? current?.smallProfitEnterpriseEligible ?? "UNKNOWN",
        surchargeReductionEligible: input.surchargeReductionEligible ?? current?.surchargeReductionEligible ?? "UNKNOWN",
        urbanMaintenanceRate: validateRate(input.urbanMaintenanceRate ?? current?.urbanMaintenanceRate?.toString(), "城建税税率", true),
        educationSurchargeRate: validateRate(input.educationSurchargeRate ?? current?.educationSurchargeRate?.toString() ?? "0.03", "教育费附加率")!,
        localEducationSurchargeRate: validateRate(input.localEducationSurchargeRate ?? current?.localEducationSurchargeRate?.toString() ?? "0.02", "地方教育附加率")!,
        surchargeReductionRate: validateRate(input.surchargeReductionRate ?? current?.surchargeReductionRate?.toString() ?? "0", "附加税减征比例")!,
      };
      const profile = current
        ? await tx.companyProfile.update({ where: { id: current.id }, data: { name, unifiedSocialCreditCode: code, bankName, bankAccount, operationMode, ...taxProfile } })
        : await tx.companyProfile.create({ data: { name, unifiedSocialCreditCode: code, bankName, bankAccount, operationMode, ...taxProfile } });
      await tx.invoice.updateMany({ where: { deletedAt: null }, data: { direction: "UNKNOWN" } });
      await tx.invoice.updateMany({ where: { deletedAt: null, sellerIdNum: code }, data: { direction: "SALE" } });
      await tx.invoice.updateMany({ where: { deletedAt: null, buyerIdNum: code, sellerIdNum: { not: code } }, data: { direction: "PURCHASE" } });
      await tx.auditLog.create({ data: { actorId, action: "UPDATE", resourceType: "CompanyProfile", resourceId: profile.id, description: "更新企业资料、税务口径和流程模式并重新识别发票方向", afterData: { name, unifiedSocialCreditCode: code, operationMode, ...taxProfile } } });
      return profile;
    });
  }
}
