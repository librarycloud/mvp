import { createHash } from "node:crypto";
import path from "node:path";
import { AppError } from "../../common/errors/app-error.js";
import { ACCOUNTING_PERIOD_STATUS } from "../../common/status-codes.js";
import type { FileStorage } from "../../infrastructure/storage/file-storage.js";
import type { BankFileParser } from "./bank-file-parser.js";
import type {
  BankImportSummary,
  BankTransactionRepository,
} from "./bank-transaction.repository.js";
import type {
  BankImportContext,
  BankTransactionFilter,
} from "./bank-transaction.types.js";
import type { AccountingPeriodRepository } from "../accounting-period/accounting-period.types.js";
import { CmbDirectClient } from "./cmb-direct-client.js";

export interface BankFetchConfig {
  apiUrl: string;
  userId: string;
  cardNbr: string;
  beginDate: string;
  endDate: string;
  transactionSequence?: string;
  currencyCode?: string;
  queryAcctNbr?: string;
  reserve?: string;
  privateKey: string;
  bankPublicKey: string;
  symKey: string;
}

export interface BankImportFile {
  originalName: string;
  data: Buffer;
}

export class BankTransactionService {
  constructor(
    private readonly repository: BankTransactionRepository,
    private readonly parser: BankFileParser,
    private readonly storage: FileStorage,
    private readonly periodRepository?: Pick<AccountingPeriodRepository, "findByPostingDate">,
    private readonly cmbClient: Pick<CmbDirectClient, "request"> = new CmbDirectClient(),
    private readonly allowedBankHosts: readonly string[] = ["cdc.cmbchina.com"],
  ) {}

  async fetchAndImport(config: BankFetchConfig, context: BankImportContext): Promise<BankImportSummary> {
    const apiUrl = this.validateApiUrl(config.apiUrl);
    const beginDate = this.compactDate(config.beginDate, "开始日期");
    const endDate = this.compactDate(config.endDate, "结束日期");
    if (beginDate > endDate) throw new AppError("INVALID_DATE_RANGE", "开始日期不能晚于结束日期", 400);

    const firstInput = {
      cardNbr: config.cardNbr.trim(),
      beginDate,
      endDate,
      transactionSequence: config.transactionSequence?.trim() || "1",
      currencyCode: config.currencyCode?.trim() || "",
      queryAcctNbr: config.queryAcctNbr?.trim() || "",
      reserve: config.reserve?.trim() || "",
    };
    let nextQueryAcctNbr = firstInput.queryAcctNbr;
    let continuationY1: unknown[] | undefined;
    const allTransactions: unknown[] = [];
    let lastResponse: Record<string, any> | null = null;
    let pages = 0;

    while (pages < 100) {
      const requestBody: Record<string, unknown> = {
        TRANSQUERYBYBREAKPOINT_X1: [{ ...firstInput, queryAcctNbr: nextQueryAcctNbr }],
      };
      if (continuationY1?.length) requestBody.TRANSQUERYBYBREAKPOINT_Y1 = continuationY1;
      let payload: Record<string, any>;
      try {
        payload = await this.cmbClient.request(
          apiUrl,
          "trsQryByBreakPoint",
          requestBody,
          {
            uid: config.userId.trim(),
            privateKey: config.privateKey,
            bankPublicKey: config.bankPublicKey,
            symKey: config.symKey,
          },
        );
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError("BANK_API_ERROR", error instanceof Error ? error.message : "招商银行接口请求失败", 502);
      }
      const responseHead = this.record(this.record(payload.response)?.head) ?? this.record(payload.head);
      const resultCode = this.text(responseHead?.resultcode);
      if (resultCode && resultCode !== "SUC0000") {
        throw new AppError("BANK_API_ERROR", this.text(responseHead?.resultmsg) || `招商银行接口返回错误码 ${resultCode}`, 502);
      }
      lastResponse = this.record(payload.response) ?? this.record(payload) ?? null;
      const body = this.record(lastResponse?.body) ?? lastResponse;
      const pageRows = this.arrayOrSingle(body?.TRANSQUERYBYBREAKPOINT_Z2) ?? this.arrayOrSingle(body?.transQueryByBreakPointZ2) ?? [];
      allTransactions.push(...pageRows);
      const z1 = this.record((this.arrayOrSingle(body?.TRANSQUERYBYBREAKPOINT_Z1) ?? [])[0]);
      if (this.text(z1?.ctnFlag).toUpperCase() !== "Y") break;
      const continuationAccount = this.text(z1?.queryAcctNbr);
      continuationY1 = this.arrayOrSingle(body?.TRANSQUERYBYBREAKPOINT_Y1) ?? undefined;
      if (!continuationAccount || !continuationY1?.length) {
        throw new AppError("BANK_CONTINUATION_INVALID", "招商银行返回了不完整的断点续传信息", 502);
      }
      nextQueryAcctNbr = continuationAccount;
      pages += 1;
    }
    if (pages >= 100) throw new AppError("BANK_CONTINUATION_LIMIT", "招商银行流水续传次数超过安全上限", 502);
    if (!allTransactions.length) throw new AppError("EMPTY_BANK_DATA", "招商银行没有返回交易流水", 400);

    const aggregate = {
      request: {
        body: { TRANSQUERYBYBREAKPOINT_X1: [firstInput] },
        head: { funcode: "trsQryByBreakPoint", userid: config.userId.trim() },
      },
      response: {
        ...(lastResponse ?? {}),
        body: {
          ...(this.record(lastResponse?.body) ?? {}),
          TRANSQUERYBYBREAKPOINT_Z2: allTransactions,
        },
      },
    };
    return this.importFile(
      { originalName: `cmb-trsQryByBreakPoint-${beginDate}-${endDate}.json`, data: Buffer.from(JSON.stringify(aggregate)) },
      context,
    );
  }

  async importFile(file: BankImportFile, context: BankImportContext): Promise<BankImportSummary> {
    const extension = path.extname(file.originalName).slice(1).toLowerCase();
    if (extension !== "xlsx" && extension !== "csv" && extension !== "json") {
      throw new AppError("UNSUPPORTED_BANK_FILE", "仅支持 xlsx、csv 和招商银行 JSON 银行流水文件", 400);
    }
    if (file.data.length === 0) throw new AppError("EMPTY_BANK_FILE", "上传文件为空", 400);

    const parsed = await this.parser.parse(file.data, extension);
    if (parsed.totalCount === 0) throw new AppError("EMPTY_BANK_DATA", "文件中没有银行流水数据", 400);
    const hash = createHash("sha256").update(file.data).digest("hex");
    const storedFile = await this.storage.saveBankImport(extension, hash, file.data);
    try {
      const result = await this.repository.createImport(
        {
          type: extension === "xlsx" ? "BANK_XLSX" : extension === "csv" ? "BANK_CSV" : "BANK_JSON",
          originalName: path.basename(file.originalName),
          storagePath: storedFile.storagePath,
          fileHash: hash,
          totalCount: parsed.totalCount,
          transactions: parsed.transactions,
          errors: parsed.errors,
        },
        context,
      );
      if (!this.periodRepository) return result;
      const warnings = [] as NonNullable<BankImportSummary["periodWarnings"]>;
      for (const transaction of parsed.transactions) {
        const period = await this.periodRepository.findByPostingDate(transaction.transactionTime);
        if (period?.status === ACCOUNTING_PERIOD_STATUS.CLOSED) {
          warnings.push({ code: "ACCOUNTING_PERIOD_CLOSED", message: "该银行流水属于已关账期间。", periodId: period.id, periodCode: period.periodCode, transactionNo: transaction.transactionNo });
        }
      }
      return warnings.length ? { ...result, periodWarnings: warnings } : result;
    } catch (error) {
      if (storedFile.created) await this.storage.remove(storedFile.storagePath);
      throw error;
    }
  }

  async list(filter: BankTransactionFilter) {
    const result = await this.repository.list(filter);
    return {
      ...result,
      page: filter.page,
      pageSize: filter.pageSize,
      totalPages: Math.ceil(result.total / filter.pageSize),
    };
  }

  async getById(id: number) {
    const transaction = await this.repository.findById(id);
    if (!transaction) throw new AppError("BANK_TRANSACTION_NOT_FOUND", "银行流水不存在", 404);
    return transaction;
  }

  async linkVoucher(id: number, voucherId: number, actorId: number) {
    await this.repository.linkVoucher(id, voucherId, actorId);
    return this.getById(id);
  }

  private validateApiUrl(value: string): string {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new AppError("INVALID_BANK_API_URL", "招商银行接口地址格式错误", 400);
    }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !this.allowedBankHosts.some((host) => host.toLowerCase() === hostname)) {
      throw new AppError("INVALID_BANK_API_URL", "招商银行接口地址必须使用 HTTPS 且位于允许的银行域名", 400);
    }
    return url.toString();
  }

  private compactDate(value: string, label: string): string {
    const compact = value.trim().replaceAll(/[\-/.]/g, "");
    if (!/^\d{8}$/.test(compact)) throw new AppError("INVALID_BANK_DATE", `${label}格式应为 YYYY-MM-DD`, 400);
    const date = new Date(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8)));
    if (date.getFullYear() !== Number(compact.slice(0, 4)) || date.getMonth() !== Number(compact.slice(4, 6)) - 1 || date.getDate() !== Number(compact.slice(6, 8))) {
      throw new AppError("INVALID_BANK_DATE", `${label}不是有效日期`, 400);
    }
    return compact;
  }

  private record(value: unknown): Record<string, any> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
  }

  private arrayOrSingle(value: unknown): unknown[] | null {
    if (Array.isArray(value)) return value;
    return value && typeof value === "object" ? [value] : null;
  }

  private text(value: unknown): string {
    return value === null || value === undefined ? "" : String(value).trim();
  }
}
