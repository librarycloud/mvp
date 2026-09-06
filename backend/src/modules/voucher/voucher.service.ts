import { createHash } from "node:crypto";
import path from "node:path";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError, VoucherStatusException } from "../../common/errors/app-error.js";
import { canManageAccounting } from "../../common/auth/authorization.js";
import { AI_SUGGESTION_STATUS, VOUCHER_STATUS } from "../../common/status-codes.js";
import type { FileStorage } from "../../infrastructure/storage/file-storage.js";
import type { VoucherRepository } from "./voucher.repository.js";
import type { AccountingPeriodResolver } from "../accounting-period/accounting-period.types.js";
import type {
  AiSuggestionForVoucher,
  NormalizedVoucherEntry,
  VoucherActor,
  VoucherCategory,
  VoucherEntryInput,
  VoucherFilter,
  VoucherMutationRecord,
  VoucherWriteData,
} from "./voucher.types.js";

export interface VoucherWriteInput {
  voucherDate: Date;
  postingDate?: Date;
  summary: string;
  category?: VoucherCategory;
  entries: VoucherEntryInput[];
}

const ATTACHMENT_EXTENSIONS = new Set([
  "pdf", "xml", "ofd", "xlsx", "xls", "csv", "png", "jpg", "jpeg", "webp",
]);

export class VoucherService {
  constructor(
    private readonly repository: VoucherRepository,
    private readonly storage: FileStorage,
    private readonly periodResolver?: AccountingPeriodResolver,
  ) {}

  async createManual(input: VoucherWriteInput, actor: VoucherActor) {
    return this.repository.createManual(await this.normalize(input), actor);
  }

  async createFromSuggestion(
    suggestionId: number,
    input: VoucherWriteInput,
    actor: VoucherActor,
  ) {
    const suggestion = await this.repository.findSuggestion(suggestionId);
    if (!suggestion) throw new AppError("AI_SUGGESTION_NOT_FOUND", "AI 凭证建议不存在", 404);
    this.assertSuggestionAccessible(suggestion, actor);
    if (suggestion.status !== AI_SUGGESTION_STATUS.GENERATED) {
      throw new AppError("AI_SUGGESTION_STATE_INVALID", "AI 建议状态不允许生成凭证", 409);
    }
    const suggestionSummary = this.suggestionSummary(suggestion);
    const writeInput = { ...input, summary: input.summary.trim() || suggestionSummary };
    return this.repository.createFromSuggestion(suggestion, await this.normalize(writeInput), actor);
  }

  async update(id: number, input: VoucherWriteInput, actor: VoucherActor) {
    const current = await this.getMutable(id);
    if ((input.postingDate ?? input.voucherDate).getFullYear() !== current.fiscalYear) {
      throw new AppError("VOUCHER_YEAR_IMMUTABLE", "凭证日期不能跨年度修改", 409);
    }
    return this.repository.update(current, await this.normalize(input), actor);
  }

  async remove(id: number, actor: VoucherActor): Promise<void> {
    const voucher = await this.getMutable(id);
    await this.assertDirectStatusChangeAllowed(voucher.id);
    await this.repository.softDelete(voucher, actor);
  }

  async submit(id: number, actor: VoucherActor) {
    return this.repository.changeStatus(await this.getByStatus(id, VOUCHER_STATUS.DRAFT), VOUCHER_STATUS.PENDING, actor);
  }

  async review(id: number, actor: VoucherActor) {
    this.assertAdmin(actor);
    const current = await this.getByStatus(id, VOUCHER_STATUS.PENDING);
    const operationMode = (await this.repository.findOperationMode?.()) ?? "STANDARD";
    if (operationMode === "STANDARD" && process.env.ENFORCE_SOD !== "false" && current.createdById === actor.actorId) {
      throw new AppError("SOD_VIOLATION", "标准模式下，制单人不能审核自己填制的凭证。如需单人操作，请在企业资料中切换为简易模式或由其他管理员审核", 403);
    }
    await this.validateStoredBalance(current);
    return this.repository.changeStatus(current, VOUCHER_STATUS.PENDING, actor);
  }

  async unreview(id: number, actor: VoucherActor) {
    this.assertAdmin(actor);
    return this.repository.changeStatus(await this.getByStatus(id, VOUCHER_STATUS.PENDING), VOUCHER_STATUS.DRAFT, actor);
  }

  async post(id: number, actor: VoucherActor) {
    this.assertAdmin(actor);
    const current = await this.getByStatus(id, VOUCHER_STATUS.PENDING);
    if (!current.reviewerId || !current.reviewedAt) throw new AppError("VOUCHER_NOT_REVIEWED", "凭证尚未审核，不能记账", 409);
    await this.validateStoredBalance(current);
    return this.repository.changeStatus(current, VOUCHER_STATUS.POSTED, actor);
  }

  async batch(action: "submit" | "review" | "post", ids: number[], actor: VoucherActor) {
    const succeededIds: number[] = [];
    const failures: Array<{ id: number; code: string; message: string }> = [];
    for (const id of ids) {
      try {
        if (action === "submit") await this.submit(id, actor);
        else if (action === "review") await this.review(id, actor);
        else await this.post(id, actor);
        succeededIds.push(id);
      } catch (error) {
        failures.push({
          id,
          code: error instanceof AppError ? error.code : "VOUCHER_BATCH_FAILED",
          message: error instanceof Error ? error.message : "凭证处理失败",
        });
      }
    }
    return { succeededIds, failures };
  }

  async unpost(id: number, actor: VoucherActor) {
    this.assertAdmin(actor);
    const current = await this.getByStatus(id, VOUCHER_STATUS.POSTED);
    await this.assertDirectStatusChangeAllowed(current.id);
    return this.repository.changeStatus(current, VOUCHER_STATUS.PENDING, actor);
  }

  async void(id: number, reason: string, actor: VoucherActor) {
    this.assertAdmin(actor);
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 500) throw new AppError("INVALID_VOID_REASON", "作废原因不能为空且不能超过500字", 400);
    const current = await this.getByStatus(id, VOUCHER_STATUS.POSTED);
    await this.assertDirectStatusChangeAllowed(current.id);
    return this.repository.changeStatus(current, VOUCHER_STATUS.VOID, actor, trimmed);
  }

  async restore(id: number, actor: VoucherActor) {
    this.assertAdmin(actor);
    const current = await this.getExisting(id);
    if (current.status !== VOUCHER_STATUS.VOID && current.status !== VOUCHER_STATUS.POSTED) {
      throw new VoucherStatusException("仅已记账或已作废凭证可以恢复为草稿", { status: current.status });
    }
    if (this.periodResolver && current.periodId) await this.periodResolver.assertVoucherOperation(current.periodId);
    await this.assertDirectStatusChangeAllowed(current.id);
    return this.repository.changeStatus(current, VOUCHER_STATUS.DRAFT, actor);
  }

  async list(filter: VoucherFilter) {
    const result = await this.repository.list(filter);
    return {
      ...result,
      page: filter.page,
      pageSize: filter.pageSize,
      totalPages: Math.ceil(result.total / filter.pageSize),
    };
  }

  async getById(id: number) {
    const voucher = await this.repository.findById(id);
    if (!voucher) throw new AppError("VOUCHER_NOT_FOUND", "凭证不存在", 404);
    return voucher;
  }

  async addAttachment(
    id: number,
    file: { originalName: string; mimeType: string; data: Buffer },
    actor: VoucherActor,
  ) {
    const voucher = await this.getMutable(id);
    const extension = path.extname(file.originalName).slice(1).toLowerCase();
    if (!ATTACHMENT_EXTENSIONS.has(extension)) {
      throw new AppError("UNSUPPORTED_ATTACHMENT", "不支持该附件格式", 400);
    }
    if (!file.data.length) throw new AppError("EMPTY_ATTACHMENT", "附件为空", 400);
    const hash = createHash("sha256").update(file.data).digest("hex");
    const stored = await this.storage.saveVoucherAttachment(extension, hash, file.data);
    try {
      return await this.repository.addAttachment(
        voucher,
        {
          originalName: path.basename(file.originalName),
          storagePath: stored.storagePath,
          mimeType: file.mimeType || "application/octet-stream",
          fileSize: BigInt(file.data.length),
          fileHash: hash,
        },
        actor,
      );
    } catch (error) {
      if (stored.created) await this.storage.remove(stored.storagePath);
      throw error;
    }
  }

  private async normalize(input: VoucherWriteInput): Promise<VoucherWriteData> {
    const postingDate = input.postingDate ?? input.voucherDate;
    if (Number.isNaN(input.voucherDate.getTime()) || Number.isNaN(postingDate.getTime())) throw new AppError("INVALID_VOUCHER_DATE", "凭证日期或入账日期无效", 400);
    const period = this.periodResolver ? await this.periodResolver.resolveOpenPeriod(postingDate) : null;
    const summary = input.summary.trim();
    if (!summary || summary.length > 500) throw new AppError("INVALID_VOUCHER_SUMMARY", "凭证摘要不能为空且不能超过500字", 400);
    if (input.entries.length < 2 || input.entries.length > 100) {
      throw new AppError("INVALID_VOUCHER_ENTRIES", "凭证分录必须为2至100条", 400);
    }
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    const entries: NormalizedVoucherEntry[] = input.entries.map((entry, index) => {
      const debit = this.amount(entry.debitAmount, "借方金额");
      const credit = this.amount(entry.creditAmount, "贷方金额");
      if ((!debit.isZero() ? 1 : 0) + (!credit.isZero() ? 1 : 0) !== 1) {
        throw new AppError("INVALID_VOUCHER_ENTRY", `第${index + 1}条分录必须且只能填写借方或贷方金额`, 400);
      }
      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);
      const lineSummary = entry.summary.trim() || summary;
      if (lineSummary.length > 500) throw new AppError("INVALID_ENTRY_SUMMARY", `第${index + 1}条摘要过长`, 400);
      return {
        accountId: entry.accountId,
        summary: lineSummary,
        debitAmount: debit.toString(),
        creditAmount: credit.toString(),
        dimensionMemberIds: [...new Set(entry.dimensionMemberIds ?? [])],
        lineNo: index + 1,
      };
    });
    if (totalDebit.isZero() || !totalDebit.equals(totalCredit)) {
      throw new AppError("VOUCHER_NOT_BALANCED", "凭证借贷金额不平衡", 400);
    }
    await this.validateAccounts(entries.map((entry) => entry.accountId));
    return {
      voucherDate: input.voucherDate,
      postingDate,
      ...(period ? { periodId: period.id } : {}),
      fiscalYear: postingDate.getFullYear(),
      fiscalPeriod: postingDate.getMonth() + 1,
      summary,
      category: input.category ?? "OTHER",
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
      entries,
    };
  }

  private amount(value: string, label: string): Prisma.Decimal {
    const text = value.trim();
    if (!/^-?\d{1,15}(?:\.\d{1,4})?$/.test(text)) {
      throw new AppError("INVALID_VOUCHER_AMOUNT", `${label}格式错误`, 400);
    }
    return new Prisma.Decimal(text);
  }

  private async validateAccounts(ids: number[]): Promise<void> {
    const unique = [...new Set(ids)];
    const valid = await this.repository.findAccountsForPosting(unique);
    const invalid = unique.filter((id) => !valid.has(id));
    if (invalid.length) throw new AppError("ACCOUNT_NOT_POSTABLE", "分录包含不存在、停用或非末级科目", 400, invalid);
  }

  private async getMutable(id: number) {
    return this.getByStatus(id, VOUCHER_STATUS.DRAFT);
  }

  private async getByStatus(id: number, status: VoucherMutationRecord["status"]) {
    const voucher = await this.getExisting(id);
    if (voucher.status !== status) {
      throw new VoucherStatusException(`当前凭证状态为 ${voucher.status}，不允许执行该操作`, { expectedStatus: status, actualStatus: voucher.status });
    }
    if (this.periodResolver && voucher.periodId) await this.periodResolver.assertVoucherOperation(voucher.periodId);
    return voucher;
  }

  private async getExisting(id: number) {
    const voucher = await this.repository.findForMutation(id);
    if (!voucher) throw new AppError("VOUCHER_NOT_FOUND", "凭证不存在", 404);
    return voucher;
  }

  private async validateStoredBalance(voucher: VoucherMutationRecord): Promise<void> {
    const entries = await this.repository.listActiveEntriesForReview(voucher.id);
    const invalidSide = entries.some((item) => {
      const debit = new Prisma.Decimal(item.debitAmount);
      const credit = new Prisma.Decimal(item.creditAmount);
      return (!debit.isZero() ? 1 : 0) + (!credit.isZero() ? 1 : 0) !== 1;
    });
    const debit = entries.reduce((sum, item) => sum.plus(item.debitAmount), new Prisma.Decimal(0));
    const credit = entries.reduce((sum, item) => sum.plus(item.creditAmount), new Prisma.Decimal(0));
    if (
      entries.length < 2 ||
      invalidSide ||
      !debit.equals(credit) ||
      !debit.equals(voucher.totalDebit) ||
      !credit.equals(voucher.totalCredit)
    ) {
      throw new AppError("VOUCHER_NOT_BALANCED", "凭证分录与借贷合计不一致，不能审核", 409);
    }
    await this.validateAccounts(entries.map((entry) => entry.accountId));
  }

  private assertAdmin(actor: VoucherActor): void {
    if (canManageAccounting(actor.role)) return;
    if (actor.role !== "ADMIN") throw new AppError("FORBIDDEN", "仅管理员可以执行审核、记账、作废或恢复操作", 403);
  }

  private async assertDirectStatusChangeAllowed(id: number): Promise<void> {
    const source = await this.repository.findManagedSource?.(id);
    if (!source) return;
    throw new AppError(
      "SOURCE_MANAGED_VOUCHER",
      `该凭证由${source.sourceType ?? source.eventType}自动生成，请在对应业务模块执行撤销`,
      409,
      source,
    );
  }

  private assertSuggestionAccessible(suggestion: AiSuggestionForVoucher, actor: VoucherActor): void {
    if (canManageAccounting(actor.role)) return;
    if (actor.role !== "ADMIN" && suggestion.requestedById !== actor.actorId) {
      throw new AppError("FORBIDDEN", "无权确认其他用户的 AI 建议", 403);
    }
  }

  private suggestionSummary(suggestion: AiSuggestionForVoucher): string {
    const output = suggestion.suggestion as { summary?: unknown } | null;
    return typeof output?.summary === "string" ? output.summary : "AI 建议凭证";
  }
}
