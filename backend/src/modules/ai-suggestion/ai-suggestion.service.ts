import { AppError } from "../../common/errors/app-error.js";
import { AI_SUGGESTION_STATUS } from "../../common/status-codes.js";
import type {
  AiSuggestionRecord,
  AiSuggestionRepository,
} from "./ai-suggestion.repository.js";
import type {
  SuggestionRequester,
  VoucherSuggestionInput,
  VoucherSuggestionOutput,
} from "./ai-suggestion.types.js";
import type { VoucherSuggestionProvider } from "./voucher-suggestion.provider.js";

export interface CreateSuggestionInput {
  bankTransactionId?: number;
  invoiceId?: number;
  summary?: string;
}

export class AiSuggestionService {
  constructor(
    private readonly repository: AiSuggestionRepository,
    private readonly provider: VoucherSuggestionProvider,
  ) {}

  async generate(input: CreateSuggestionInput, requester: SuggestionRequester) {
    if (!input.bankTransactionId && !input.invoiceId) {
      throw new AppError("AI_SOURCE_REQUIRED", "请选择银行流水或电子发票", 400);
    }
    const bankTransaction = input.bankTransactionId
      ? await this.repository.findBankSource(input.bankTransactionId)
      : null;
    if (input.bankTransactionId && !bankTransaction) {
      throw new AppError("BANK_TRANSACTION_NOT_FOUND", "银行流水不存在", 404);
    }
    const invoice = input.invoiceId ? await this.repository.findInvoiceSource(input.invoiceId) : null;
    if (input.invoiceId && !invoice) throw new AppError("INVOICE_NOT_FOUND", "电子发票不存在", 404);
    const candidateAccounts = await this.repository.listCandidateAccounts();
    if (candidateAccounts.length === 0) {
      throw new AppError("ACCOUNT_CANDIDATES_EMPTY", "没有可用于制证的启用末级科目", 409);
    }
    const snapshot: VoucherSuggestionInput = {
      userSummary: input.summary?.trim() || null,
      bankTransaction,
      invoice,
      candidateAccounts,
    };
    const pending = await this.repository.createPending({
      bankTransactionId: input.bankTransactionId ?? null,
      invoiceId: input.invoiceId ?? null,
      requesterId: requester.actorId,
      model: this.provider.model,
      snapshot,
    });

    try {
      const heuristic = this.matchHeuristic(snapshot);
      const output = heuristic ?? await this.provider.suggest(snapshot);
      this.validateOutput(output, candidateAccounts.map((account) => account.code));
      return await this.repository.markGenerated(pending.id, output, requester);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知 AI 错误";
      await this.repository.markFailed(pending.id, message, requester).catch(() => undefined);
      if (error instanceof AppError) throw error;
      throw new AppError("AI_PROVIDER_ERROR", "AI 凭证建议生成失败", 502);
    }
  }

  private matchHeuristic(snapshot: VoucherSuggestionInput): VoucherSuggestionOutput | null {
    const summary = (snapshot.userSummary || snapshot.bankTransaction?.summary || "").trim();
    if (!summary) return null;

    const candidateCodes = new Set(snapshot.candidateAccounts.map((a) => a.code));
    const findCode = (prefix: string) => snapshot.candidateAccounts.find((a) => a.code.startsWith(prefix))?.code;
    const bankCode = findCode("1002") || findCode("1001");
    if (!bankCode) return null;

    if (summary.includes("结息") || summary.includes("利息收入")) {
      const finCode = findCode("6603") || findCode("5603");
      if (finCode && candidateCodes.has(finCode) && candidateCodes.has(bankCode)) {
        return {
          summary: `银行结息：${summary}`,
          entries: [
            { direction: "DEBIT", accountCode: bankCode, rationale: "银行存款结息增加记借方" },
            { direction: "CREDIT", accountCode: finCode, rationale: "利息收入冲减财务费用记贷方" },
          ],
        };
      }
    }

    if (summary.includes("手续费") || summary.includes("工本费") || summary.includes("服务费")) {
      const finCode = findCode("6603") || findCode("5603");
      if (finCode && candidateCodes.has(finCode) && candidateCodes.has(bankCode)) {
        return {
          summary: `支付银行手续费：${summary}`,
          entries: [
            { direction: "DEBIT", accountCode: finCode, rationale: "银行手续费计入财务费用借方" },
            { direction: "CREDIT", accountCode: bankCode, rationale: "银行存款支出记贷方" },
          ],
        };
      }
    }

    return null;
  }

  async getById(id: number, requester: SuggestionRequester) {
    const record = await this.getAccessible(id, requester);
    return record;
  }

  async reject(id: number, requester: SuggestionRequester) {
    const record = await this.getAccessible(id, requester);
    if (record.status !== AI_SUGGESTION_STATUS.GENERATED) {
      throw new AppError("AI_SUGGESTION_STATE_INVALID", "只有已生成的建议可以拒绝", 409);
    }
    return this.repository.markRejected(id, requester);
  }

  private async getAccessible(id: number, requester: SuggestionRequester): Promise<AiSuggestionRecord> {
    const record = await this.repository.findById(id);
    if (!record) throw new AppError("AI_SUGGESTION_NOT_FOUND", "AI 凭证建议不存在", 404);
    if (requester.role !== "ADMIN" && record.requestedById !== requester.actorId) {
      throw new AppError("FORBIDDEN", "无权访问其他用户的 AI 建议", 403);
    }
    return record;
  }

  private validateOutput(output: VoucherSuggestionOutput, accountCodes: string[]): void {
    const value = output as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) this.invalidOutput();
    const object = value as Record<string, unknown>;
    if (Object.keys(object).some((key) => !["summary", "entries"].includes(key))) this.invalidOutput();
    if (typeof object.summary !== "string" || !object.summary.trim() || object.summary.length > 500) {
      this.invalidOutput();
    }
    if (!Array.isArray(object.entries) || object.entries.length < 2 || object.entries.length > 20) {
      this.invalidOutput();
    }
    const allowed = new Set(accountCodes);
    let hasDebit = false;
    let hasCredit = false;
    for (const item of object.entries as unknown[]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) this.invalidOutput();
      const entry = item as Record<string, unknown>;
      if (Object.keys(entry).some((key) => !["direction", "accountCode", "rationale"].includes(key))) {
        this.invalidOutput();
      }
      if (!allowed.has(String(entry.accountCode))) {
        throw new AppError("AI_ACCOUNT_INVALID", `AI 返回了无效科目：${String(entry.accountCode)}`, 502);
      }
      if (entry.direction === "DEBIT") hasDebit = true;
      else if (entry.direction === "CREDIT") hasCredit = true;
      else this.invalidOutput();
      if (typeof entry.rationale !== "string" || !entry.rationale.trim() || entry.rationale.length > 500) {
        this.invalidOutput();
      }
    }
    if (!hasDebit || !hasCredit) this.invalidOutput();
  }

  private invalidOutput(): never {
    throw new AppError("AI_INVALID_RESPONSE", "AI 返回的凭证建议结构无效", 502);
  }
}
