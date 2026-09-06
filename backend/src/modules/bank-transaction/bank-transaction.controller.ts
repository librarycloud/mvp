import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/http/response.js";
import type { BankTransactionService } from "./bank-transaction.service.js";
import type {
  BankImportContext,
  BankTransactionFilter,
} from "./bank-transaction.types.js";
import type {
  BankFetchBody,
  BankTransactionParams,
  BankTransactionQuery,
  SavedBankFetchConfig,
} from "./dto/bank-transaction.dto.js";
import type { CmbFetchConfigService } from "./cmb-fetch-config.service.js";
import type { BankFetchConfig } from "./bank-transaction.service.js";

export class BankTransactionController {
  constructor(
    private readonly service: BankTransactionService,
    private readonly cmbFetchConfigService: CmbFetchConfigService,
  ) {}

  getFetchConfig = async (request: FastifyRequest, reply: FastifyReply) =>
    sendSuccess(reply, await this.cmbFetchConfigService.get());

  saveFetchConfig = async (
    request: FastifyRequest<{ Body: SavedBankFetchConfig }>,
    reply: FastifyReply,
  ) => sendSuccess(
    reply,
    await this.cmbFetchConfigService.save(request.body, this.context(request)),
    "招商银行配置已保存",
  );

  fetchTransactions = async (
    request: FastifyRequest<{ Body: BankFetchBody }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.fetchAndImport(await this.resolveFetchConfig(request.body), this.context(request)), "银行流水获取并导入完成", 201);

  importFile = async (request: FastifyRequest, reply: FastifyReply) => {
    const upload = await request.file({ limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
    if (upload?.filename.toLowerCase().endsWith(".json")) {
      throw new AppError("BANK_JSON_FETCH_ONLY", "招商银行 JSON 流水请使用接口拉取功能", 400);
    }
    if (!upload) throw new AppError("BANK_FILE_REQUIRED", "请选择银行流水文件", 400);
    const data = await upload.toBuffer();
    const result = await this.service.importFile(
      { originalName: upload.filename, data },
      this.context(request),
    );
    return sendSuccess(reply, result, "银行流水导入完成", 201);
  };

  list = async (
    request: FastifyRequest<{ Querystring: BankTransactionQuery }>,
    reply: FastifyReply,
  ) => {
    const filter: BankTransactionFilter = {
      page: request.query.page ?? 1,
      pageSize: request.query.pageSize ?? 20,
    };
    if (request.query.keyword !== undefined) filter.keyword = request.query.keyword;
    if (request.query.startTime !== undefined) filter.startTime = new Date(request.query.startTime);
    if (request.query.endTime !== undefined) filter.endTime = new Date(request.query.endTime);
    if (request.query.voucherStatus !== undefined) filter.voucherStatus = request.query.voucherStatus;
    if (request.query.reconciliationStatus !== undefined) {
      filter.reconciliationStatus = request.query.reconciliationStatus;
    }
    if (filter.startTime && filter.endTime && filter.startTime > filter.endTime) {
      throw new AppError("INVALID_DATE_RANGE", "开始时间不能晚于结束时间", 400);
    }
    return sendSuccess(reply, await this.service.list(filter));
  };

  getById = async (
    request: FastifyRequest<{ Params: BankTransactionParams }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.getById(request.params.id));

  linkVoucher = async (
    request: FastifyRequest<{ Params: BankTransactionParams; Body: { voucherId: number } }>,
    reply: FastifyReply,
  ) => sendSuccess(reply, await this.service.linkVoucher(request.params.id, request.body.voucherId, Number(request.user.sub)));

  private context(request: FastifyRequest): BankImportContext {
    const context: BankImportContext = {
      actorId: Number(request.user.sub),
      requestId: request.id,
      ipAddress: request.ip,
    };
    const userAgent = request.headers["user-agent"];
    if (userAgent) context.userAgent = userAgent;
    return context;
  }

  private async resolveFetchConfig(input: BankFetchBody): Promise<BankFetchConfig> {
    const stored = await this.cmbFetchConfigService.getForFetch();
    const privateKey = input.privateKey || stored?.privateKey;
    const bankPublicKey = input.bankPublicKey || stored?.bankPublicKey;
    const symKey = input.symKey || stored?.symKey;
    if (!privateKey || !bankPublicKey || !symKey) {
      throw new AppError("CMB_CONFIG_REQUIRED", "请先保存招商银行接口密钥配置", 400);
    }
    return { ...input, privateKey, bankPublicKey, symKey };
  }
}
