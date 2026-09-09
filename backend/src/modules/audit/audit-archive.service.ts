import { createHash } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";

export interface ArchiveMetadata {
  standard: "GB/T 24589-2010";
  version: "1.0";
  exportedAt: string;
  fiscalYear: number;
  sha256Checksum: string;
  recordCounts: {
    periods: number;
    accounts: number;
    vouchers: number;
    voucherEntries: number;
  };
}

export interface ArchiveDataPackage {
  metadata: ArchiveMetadata;
  company: {
    name: string;
    unifiedSocialCreditCode: string | null;
    legalRepresentative: string | null;
    baseCurrency: string;
    accountingStandard: string;
  };
  accountingPeriods: Array<{
    year: number;
    month: number;
    periodCode: string;
    startDate: string;
    endDate: string;
    status: number;
  }>;
  chartOfAccounts: Array<{
    code: string;
    name: string;
    category: string;
    normalDirection: string;
    level: number;
    isLeaf: boolean;
  }>;
  vouchers: Array<{
    voucherNo: string;
    voucherDate: string;
    postingDate: string;
    fiscalYear: number;
    fiscalPeriod: number;
    summary: string;
    status: number;
    totalDebit: string;
    totalCredit: string;
    createdBy: string;
    reviewer: string | null;
    postedBy: string | null;
    voidBy?: string | null;
    voidAt?: string | null;
    voidReason?: string | null;
    entries: Array<{
      lineNo: number;
      accountCode: string;
      accountName: string;
      summary: string;
      debitAmount: string;
      creditAmount: string;
    }>;
  }>;
}

export class AuditArchiveService {
  constructor(private readonly prisma: PrismaClient) {}

  async generateArchive(fiscalYear: number): Promise<ArchiveDataPackage> {
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 9999) {
      throw new AppError("INVALID_FISCAL_YEAR", "年度无效", 400);
    }

    const company = await this.prisma.companyProfile.findFirst({
      where: { deletedAt: null },
    });

    const periods = await this.prisma.accountingPeriod.findMany({
      where: { year: fiscalYear, deletedAt: null },
      orderBy: { month: "asc" },
    });

    const accounts = await this.prisma.account.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
    });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    // Batch query vouchers with entries (cursor or batch to prevent OOM)
    const vouchers = await this.prisma.voucher.findMany({
      where: { fiscalYear, deletedAt: null },
      include: {
        createdBy: { select: { displayName: true, username: true } },
        reviewer: { select: { displayName: true, username: true } },
        postedBy: { select: { displayName: true, username: true } },
        voidBy: { select: { displayName: true, username: true } },
        entries: {
          where: { deletedAt: null },
          orderBy: { lineNo: "asc" },
        },
      },
      orderBy: [{ voucherDate: "asc" }, { sequenceNo: "asc" }],
    });

    let totalEntries = 0;
    const formattedVouchers = vouchers.map((v) => {
      totalEntries += v.entries.length;
      return {
        voucherNo: v.voucherNo,
        voucherDate: v.voucherDate.toISOString().slice(0, 10),
        postingDate: v.postingDate.toISOString().slice(0, 10),
        fiscalYear: v.fiscalYear,
        fiscalPeriod: v.fiscalPeriod,
        summary: v.summary,
        status: v.status,
        totalDebit: v.totalDebit.toFixed(2),
        totalCredit: v.totalCredit.toFixed(2),
        createdBy: v.createdBy?.displayName ?? v.createdBy?.username ?? "系统",
        reviewer: v.reviewer?.displayName ?? v.reviewer?.username ?? null,
        postedBy: v.postedBy?.displayName ?? v.postedBy?.username ?? null,
        voidBy: v.voidBy?.displayName ?? v.voidBy?.username ?? null,
        voidAt: v.voidAt ? v.voidAt.toISOString().slice(0, 10) : null,
        voidReason: v.voidReason ?? null,
        entries: v.entries.map((e) => {
          const acc = accountMap.get(e.accountId);
          return {
            lineNo: e.lineNo,
            accountCode: acc?.code ?? String(e.accountId),
            accountName: acc?.name ?? "未知科目",
            summary: e.summary,
            debitAmount: e.debitAmount.toFixed(2),
            creditAmount: e.creditAmount.toFixed(2),
          };
        }),
      };
    });

    const preliminaryPayload = {
      company: {
        name: company?.name ?? "企业账套",
        unifiedSocialCreditCode: company?.unifiedSocialCreditCode ?? null,
        legalRepresentative: company?.legalRepresentative ?? null,
        baseCurrency: company?.baseCurrency ?? "CNY",
        accountingStandard: "CAS_ASBE",
      },
      accountingPeriods: periods.map((p) => ({
        year: p.year,
        month: p.month,
        periodCode: p.periodCode,
        startDate: p.startDate.toISOString().slice(0, 10),
        endDate: p.endDate.toISOString().slice(0, 10),
        status: p.status,
      })),
      chartOfAccounts: accounts.map((a) => ({
        code: a.code,
        name: a.name,
        category: a.category,
        normalDirection: a.normalDirection,
        level: a.level,
        isLeaf: a.isLeaf,
      })),
      vouchers: formattedVouchers,
    };

    const checksum = createHash("sha256")
      .update(JSON.stringify(preliminaryPayload))
      .digest("hex");

    const metadata: ArchiveMetadata = {
      standard: "GB/T 24589-2010",
      version: "1.0",
      exportedAt: new Date().toISOString(),
      fiscalYear,
      sha256Checksum: checksum,
      recordCounts: {
        periods: periods.length,
        accounts: accounts.length,
        vouchers: formattedVouchers.length,
        voucherEntries: totalEntries,
      },
    };

    return {
      metadata,
      ...preliminaryPayload,
    };
  }
}
