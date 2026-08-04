import type {
  AiSuggestionRecord,
  AiSuggestionRepository,
} from "../../src/modules/ai-suggestion/ai-suggestion.repository.js";
import type {
  AccountCandidate,
  BankSourceSnapshot,
  InvoiceSourceSnapshot,
  SuggestionRequester,
  VoucherSuggestionInput,
  VoucherSuggestionOutput,
} from "../../src/modules/ai-suggestion/ai-suggestion.types.js";

export class FakeAiSuggestionRepository implements AiSuggestionRepository {
  bankSources = new Map<number, BankSourceSnapshot>();
  invoiceSources = new Map<number, InvoiceSourceSnapshot>();
  accounts: AccountCandidate[] = [];
  records = new Map<number, AiSuggestionRecord>();

  async findBankSource(id: number) {
    return this.bankSources.get(id) ?? null;
  }

  async findInvoiceSource(id: number) {
    return this.invoiceSources.get(id) ?? null;
  }

  async listCandidateAccounts() {
    return this.accounts;
  }

  async createPending(input: {
    bankTransactionId: number | null;
    invoiceId: number | null;
    requesterId: number;
    model: string;
    snapshot: VoucherSuggestionInput;
  }) {
    const now = new Date();
    const record: AiSuggestionRecord = {
      id: 500,
      bankTransactionId: input.bankTransactionId,
      invoiceId: input.invoiceId,
      voucherId: null,
      requestedById: input.requesterId,
      status: 1,
      model: input.model,
      inputSnapshot: input.snapshot,
      suggestion: null,
      errorMessage: null,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.records.set(record.id, record);
    return record;
  }

  async markGenerated(id: number, suggestion: VoucherSuggestionOutput, _requester: SuggestionRequester) {
    const record = this.required(id);
    record.status = 1;
    record.suggestion = suggestion;
    return record;
  }

  async markFailed(id: number, message: string, _requester: SuggestionRequester) {
    const record = this.required(id);
    record.status = 3;
    record.errorMessage = message;
  }

  async findById(id: number) {
    return this.records.get(id) ?? null;
  }

  async markRejected(id: number, _requester: SuggestionRequester) {
    const record = this.required(id);
    record.status = 3;
    return record;
  }

  private required(id: number) {
    const record = this.records.get(id);
    if (!record) throw new Error("Suggestion not found");
    return record;
  }
}

export const bankSourceFixture: BankSourceSnapshot = {
  id: 301,
  payerName: "示例公司",
  payeeName: "供应商",
  amount: "1130.00",
  transactionTime: "2026-07-01T02:00:00.000Z",
  transactionType: "转账",
  summary: "支付办公用品款",
};

export const accountCandidates: AccountCandidate[] = [
  { code: "1002", name: "银行存款", category: "ASSET", normalDirection: "DEBIT" },
  { code: "6602", name: "管理费用", category: "PROFIT_AND_LOSS", normalDirection: "DEBIT" },
];
