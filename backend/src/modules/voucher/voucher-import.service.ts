import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { VOUCHER_STATUS } from "../../common/status-codes.js";
import type { AccountingPeriodResolver } from "../accounting-period/accounting-period.types.js";
import { allocateVoucherNumbers } from "./voucher-numbering.helper.js";
import type { VoucherActor, VoucherCategory } from "./voucher.types.js";

export interface ParsedImportEntry {
  groupKey: string;
  voucherDate: Date;
  summary: string;
  category: VoucherCategory;
  accountCode: string;
  accountName?: string;
  debitAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  entrySummary?: string;
  rowNumber: number;
}

export interface ValidatedImportVoucher {
  groupKey: string;
  voucherDate: Date;
  postingDate: Date;
  periodId?: number | undefined;
  fiscalYear: number;
  fiscalPeriod: number;
  summary: string;
  category: VoucherCategory;
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
  entries: Array<{
    lineNo: number;
    accountId: number;
    accountCode: string;
    summary: string;
    debitAmount: Prisma.Decimal;
    creditAmount: Prisma.Decimal;
  }>;
}

export interface VoucherImportResult {
  totalImported: number;
  voucherNos: string[];
}

export class VoucherImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly periods?: AccountingPeriodResolver,
  ) {}

  /**
   * 生成标准 Excel 凭证批量导入模板
   */
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "China Finance System";
    const sheet = workbook.addWorksheet("记账凭证导入");

    // 表头定义
    sheet.columns = [
      { header: "凭证组号*", key: "groupKey", width: 14 },
      { header: "凭证日期*", key: "voucherDate", width: 15 },
      { header: "凭证摘要*", key: "summary", width: 26 },
      { header: "凭证类别", key: "category", width: 12 },
      { header: "科目编码*", key: "accountCode", width: 16 },
      { header: "科目名称(选填)", key: "accountName", width: 18 },
      { header: "借方金额", key: "debitAmount", width: 15 },
      { header: "贷方金额", key: "creditAmount", width: 15 },
      { header: "分录摘要(选填)", key: "entrySummary", width: 24 },
    ];

    // 表头样式
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF337ECC" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 26;

    // 示例数据（两张平衡的凭证）
    const today = new Date().toISOString().slice(0, 10);
    const sampleRows = [
      {
        groupKey: "1",
        voucherDate: today,
        summary: "支付办公耗材费",
        category: "付款",
        accountCode: "6602",
        accountName: "管理费用",
        debitAmount: "350.00",
        creditAmount: "0.00",
        entrySummary: "购买打印纸与硒鼓",
      },
      {
        groupKey: "1",
        voucherDate: today,
        summary: "支付办公耗材费",
        category: "付款",
        accountCode: "1002",
        accountName: "银行存款",
        debitAmount: "0.00",
        creditAmount: "350.00",
        entrySummary: "网银转账付款",
      },
      {
        groupKey: "2",
        voucherDate: today,
        summary: "收到甲公司商品货款",
        category: "收款",
        accountCode: "1002",
        accountName: "银行存款",
        debitAmount: "50000.00",
        creditAmount: "0.00",
        entrySummary: "收甲公司货款",
      },
      {
        groupKey: "2",
        voucherDate: today,
        summary: "收到甲公司商品货款",
        category: "收款",
        accountCode: "1122",
        accountName: "应收账款",
        debitAmount: "0.00",
        creditAmount: "50000.00",
        entrySummary: "结清甲公司应收账款",
      },
    ];

    for (const row of sampleRows) {
      sheet.addRow(row);
    }

    // 设置数据行单元格边框与对齐
    for (let r = 2; r <= sampleRows.length + 1; r++) {
      const row = sheet.getRow(r);
      row.height = 20;
      row.alignment = { vertical: "middle" };
      row.getCell("groupKey").alignment = { horizontal: "center" };
      row.getCell("voucherDate").alignment = { horizontal: "center" };
      row.getCell("category").alignment = { horizontal: "center" };
      row.getCell("accountCode").alignment = { horizontal: "center" };
      row.getCell("debitAmount").alignment = { horizontal: "right" };
      row.getCell("creditAmount").alignment = { horizontal: "right" };
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE0E0E0" } },
          bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
          left: { style: "thin", color: { argb: "FFE0E0E0" } },
          right: { style: "thin", color: { argb: "FFE0E0E0" } },
        };
      });
    }

    // 说明工作表
    const helpSheet = workbook.addWorksheet("导入说明");
    helpSheet.columns = [{ width: 80 }];
    helpSheet.addRow(["【凭证导入规范说明】"]);
    helpSheet.addRow(["1. 凭证组号：相同组号的多行分录将合并为同一张记账凭证（支持如 1, 2 或 A, B）。"]);
    helpSheet.addRow(["2. 凭证日期：格式必须为 YYYY-MM-DD，其所在会计期间必须已在系统中启用且未结账。"]);
    helpSheet.addRow(["3. 凭证类别：可选填写 收款、付款、转账、计提、结转、其他（留空默认转账）。"]);
    helpSheet.addRow(["4. 科目编码：必须为系统中已存在、已启用且为末级科目（例如 6602 或 660201）。"]);
    helpSheet.addRow(["5. 借贷平衡：同一组号下的所有分录，借方合计金额必须精确等于贷方合计金额。"]);
    helpSheet.addRow(["6. 分录要求：每张凭证至少包含 2 条分录，每条分录借贷必须且只能填写其中一方金额。"]);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * 解析并校验上传的 Excel 或 CSV 文件
   */
  async parseAndValidate(data: Buffer, extension: "xlsx" | "csv"): Promise<ValidatedImportVoucher[]> {
    const MAX_IMPORT_ROWS = 1000;

    const workbook = new ExcelJS.Workbook();
    if (extension === "xlsx") {
      await workbook.xlsx.load(new Uint8Array(data).buffer);
    } else {
      await workbook.csv.read(Readable.from(data));
    }

    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
      throw new AppError("EMPTY_IMPORT_FILE", "导入文件为空或缺少数据行", 400);
    }
    if (sheet.rowCount > MAX_IMPORT_ROWS + 1) {
      throw new AppError(
        "IMPORT_TOO_MANY_ROWS",
        `导入文件行数超出限制（最多 ${MAX_IMPORT_ROWS} 条分录，当前约 ${sheet.rowCount - 1} 行）`,
        400,
      );
    }

    // 表头映射定位
    const headerRow = sheet.getRow(1);
    const colMap = new Map<string, number>();
    headerRow.eachCell((cell, col) => {
      const text = String(cell.value ?? "").replaceAll("*", "").replace(/[（(].*?[）)]/g, "").replaceAll(/\s/g, "");
      colMap.set(text, col);
    });

    const getCol = (names: string[]): number | undefined => {
      for (const n of names) {
        if (colMap.has(n)) return colMap.get(n);
      }
      return undefined;
    };

    const groupKeyCol = getCol(["凭证组号", "组号", "凭证号", "序号", "组ID"]);
    const dateCol = getCol(["凭证日期", "日期", "业务日期"]);
    const summaryCol = getCol(["凭证摘要", "摘要", "主摘要"]);
    const categoryCol = getCol(["凭证类别", "类别"]);
    const accountCodeCol = getCol(["科目编码", "科目代码", "科目"]);
    const accountNameCol = getCol(["科目名称"]);
    const debitCol = getCol(["借方金额", "借方", "借"]);
    const creditCol = getCol(["贷方金额", "贷方", "贷"]);
    const entrySummaryCol = getCol(["分录摘要", "行摘要"]);

    if (!groupKeyCol || !dateCol || !accountCodeCol || !debitCol || !creditCol) {
      throw new AppError(
        "INVALID_IMPORT_HEADERS",
        "导入模板缺少必要表头：必须包含【凭证组号】、【凭证日期】、【科目编码】、【借方金额】、【贷方金额】",
        400,
      );
    }

    const categoryMap: Record<string, VoucherCategory> = {
      收款: "RECEIPT",
      付款: "PAYMENT",
      转账: "TRANSFER",
      计提: "ACCRUAL",
      结转: "CLOSING",
      其他: "OTHER",
      RECEIPT: "RECEIPT",
      PAYMENT: "PAYMENT",
      TRANSFER: "TRANSFER",
      ACCRUAL: "ACCRUAL",
      CLOSING: "CLOSING",
      OTHER: "OTHER",
    };

    const parsedEntries: ParsedImportEntry[] = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      if (!row.hasValues) continue;

      const rawGroup = String(row.getCell(groupKeyCol).value ?? "").trim();
      const rawDate = row.getCell(dateCol).value;
      const rawSummary = summaryCol ? String(row.getCell(summaryCol).value ?? "").trim() : "";
      const rawCategory = categoryCol ? String(row.getCell(categoryCol).value ?? "").trim() : "";
      const rawAccountCode = String(row.getCell(accountCodeCol).value ?? "").trim();
      const rawAccountName = accountNameCol ? String(row.getCell(accountNameCol).value ?? "").trim() : "";
      const rawDebit = String(row.getCell(debitCol).value ?? "0").trim();
      const rawCredit = String(row.getCell(creditCol).value ?? "0").trim();
      const rawEntrySummary = entrySummaryCol ? String(row.getCell(entrySummaryCol).value ?? "").trim() : "";

      if (!rawGroup && !rawAccountCode && !rawDebit && !rawCredit) {
        continue; // skip blank row
      }

      if (!rawGroup) {
        throw new AppError("IMPORT_VALIDATION_FAILED", `第 ${r} 行：凭证组号不能为空`, 400);
      }
      if (!rawAccountCode) {
        throw new AppError("IMPORT_VALIDATION_FAILED", `第 ${r} 行：科目编码不能为空`, 400);
      }

      let parsedDate: Date;
      if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
        parsedDate = rawDate;
      } else {
        const dateStr = String(rawDate ?? "").trim();
        parsedDate = new Date(dateStr);
        if (Number.isNaN(parsedDate.getTime())) {
          throw new AppError("IMPORT_VALIDATION_FAILED", `第 ${r} 行：凭证日期格式无效（应为 YYYY-MM-DD）`, 400);
        }
      }

      const parseDecimal = (val: string, label: string) => {
        const sanitized = val.replaceAll(",", "").trim() || "0";
        if (!/^-?\d{1,15}(\.\d{1,4})?$/.test(sanitized)) {
          throw new AppError("IMPORT_VALIDATION_FAILED", `第 ${r} 行：${label}金额格式错误 (${val})`, 400);
        }
        return new Prisma.Decimal(sanitized);
      };

      const debitAmount = parseDecimal(rawDebit, "借方");
      const creditAmount = parseDecimal(rawCredit, "贷方");

      if ((!debitAmount.isZero() ? 1 : 0) + (!creditAmount.isZero() ? 1 : 0) !== 1) {
        throw new AppError(
          "IMPORT_VALIDATION_FAILED",
          `第 ${r} 行：借方和贷方必须且只能有一方填写金额`,
          400,
        );
      }

      const category = categoryMap[rawCategory] ?? "TRANSFER";

      parsedEntries.push({
        groupKey: rawGroup,
        voucherDate: parsedDate,
        summary: rawSummary,
        category,
        accountCode: rawAccountCode,
        accountName: rawAccountName,
        debitAmount,
        creditAmount,
        entrySummary: rawEntrySummary,
        rowNumber: r,
      });
    }

    if (parsedEntries.length === 0) {
      throw new AppError("EMPTY_IMPORT_DATA", "未读取到有效的分录数据", 400);
    }

    // 批量查询科目并验证有效性及末级科目
    const allAccountCodes = [...new Set(parsedEntries.map((e) => e.accountCode))];
    const accounts = await this.prisma.account.findMany({
      where: { code: { in: allAccountCodes }, deletedAt: null },
      select: { id: true, code: true, name: true, isEnabled: true, isLeaf: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.code, a]));

    for (const code of allAccountCodes) {
      const acc = accountMap.get(code);
      if (!acc) {
        throw new AppError("IMPORT_ACCOUNT_NOT_FOUND", `科目编码 [${code}] 在系统中不存在`, 400);
      }
      if (!acc.isEnabled) {
        throw new AppError("IMPORT_ACCOUNT_DISABLED", `科目 [${code} ${acc.name}] 已停用`, 400);
      }
      if (!acc.isLeaf) {
        throw new AppError(
          "IMPORT_ACCOUNT_NOT_LEAF",
          `科目 [${code} ${acc.name}] 不是末级明细科目，不可直接记账`,
          400,
        );
      }
    }

    // 分组整理凭证
    const groupMap = new Map<string, ParsedImportEntry[]>();
    for (const entry of parsedEntries) {
      const list = groupMap.get(entry.groupKey) ?? [];
      list.push(entry);
      groupMap.set(entry.groupKey, list);
    }

    const validatedVouchers: ValidatedImportVoucher[] = [];

    for (const [groupKey, entries] of groupMap.entries()) {
      if (entries.length < 2) {
        throw new AppError(
          "IMPORT_VALIDATION_FAILED",
          `凭证组 [${groupKey}] 只有 ${entries.length} 条分录，凭证分录至少需要 2 条`,
          400,
        );
      }
      if (entries.length > 100) {
        throw new AppError(
          "IMPORT_VALIDATION_FAILED",
          `凭证组 [${groupKey}] 包含超过 100 条分录`,
          400,
        );
      }

      const first = entries[0]!;
      const voucherDate = first.voucherDate;
      const postingDate = voucherDate;
      const fiscalYear = postingDate.getFullYear();
      const fiscalPeriod = postingDate.getMonth() + 1;

      // 验证会计期间开启状态
      let periodId: number | undefined;
      if (this.periods) {
        const period = await this.periods.resolveOpenPeriod(postingDate);
        periodId = period.id;
      }

      const voucherSummary = entries.find((e) => e.summary.trim())?.summary.trim() || "批量导入凭证";

      let totalDebit = new Prisma.Decimal(0);
      let totalCredit = new Prisma.Decimal(0);

      const formattedEntries = entries.map((entry, idx) => {
        totalDebit = totalDebit.plus(entry.debitAmount);
        totalCredit = totalCredit.plus(entry.creditAmount);
        const acc = accountMap.get(entry.accountCode)!;
        const lineSummary = entry.entrySummary?.trim() || entry.summary.trim() || voucherSummary;
        return {
          lineNo: idx + 1,
          accountId: acc.id,
          accountCode: acc.code,
          summary: lineSummary,
          debitAmount: entry.debitAmount,
          creditAmount: entry.creditAmount,
        };
      });

      // 校验借贷平衡
      if (totalDebit.isZero() || !totalDebit.equals(totalCredit)) {
        throw new AppError(
          "IMPORT_NOT_BALANCED",
          `凭证组 [${groupKey}] 借贷不平衡！借方合计：${totalDebit.toFixed(2)}，贷方合计：${totalCredit.toFixed(2)}，差额：${totalDebit.minus(totalCredit).toFixed(2)}`,
          400,
        );
      }

      validatedVouchers.push({
        groupKey,
        voucherDate,
        postingDate,
        ...(periodId !== undefined ? { periodId } : {}),
        fiscalYear,
        fiscalPeriod,
        summary: voucherSummary,
        category: first.category,
        totalDebit,
        totalCredit,
        entries: formattedEntries,
      });
    }

    return validatedVouchers;
  }

  /**
   * 批量导入凭证到数据库（使用预分配序列号防死锁）
   */
  async importVouchers(
    data: Buffer,
    extension: "xlsx" | "csv",
    actor: VoucherActor,
  ): Promise<VoucherImportResult> {
    const validated = await this.parseAndValidate(data, extension);

    // 按会计年度分组进行批次号预分配
    const yearGroups = new Map<number, ValidatedImportVoucher[]>();
    for (const v of validated) {
      const list = yearGroups.get(v.fiscalYear) ?? [];
      list.push(v);
      yearGroups.set(v.fiscalYear, list);
    }

    const createdVoucherNos: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const [year, vouchers] of yearGroups.entries()) {
        // 原子批量预分配年度凭证号
        const allocated = await allocateVoucherNumbers(tx, year, vouchers.length);

        for (let i = 0; i < vouchers.length; i++) {
          const v = vouchers[i]!;
          const numbering = allocated[i]!;

          const created = await tx.voucher.create({
            data: {
              sequenceNo: numbering.sequenceNo,
              voucherNo: numbering.voucherNo,
              voucherDate: v.voucherDate,
              postingDate: v.postingDate,
              ...(v.periodId !== undefined ? { periodId: v.periodId } : {}),
              fiscalYear: v.fiscalYear,
              fiscalPeriod: v.fiscalPeriod,
              summary: v.summary,
              category: v.category,
              sourceType: "MANUAL",
              status: VOUCHER_STATUS.DRAFT,
              totalDebit: v.totalDebit.toString(),
              totalCredit: v.totalCredit.toString(),
              createdById: actor.actorId,
              entries: {
                create: v.entries.map((entry) => ({
                  lineNo: entry.lineNo,
                  accountId: entry.accountId,
                  summary: entry.summary,
                  debitAmount: entry.debitAmount.toString(),
                  creditAmount: entry.creditAmount.toString(),
                })),
              },
            },
          });

          await tx.auditLog.create({
            data: {
              actorId: actor.actorId,
              action: "IMPORT",
              resourceType: "Voucher",
              resourceId: created.id,
              beforeData: Prisma.JsonNull,
              afterData: {
                voucherNo: created.voucherNo,
                totalDebit: created.totalDebit.toString(),
                entriesCount: v.entries.length,
              },
            },
          });

          createdVoucherNos.push(created.voucherNo);
        }
      }
    });

    return {
      totalImported: createdVoucherNos.length,
      voucherNos: createdVoucherNos,
    };
  }
}
