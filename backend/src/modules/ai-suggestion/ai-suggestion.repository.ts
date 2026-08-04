import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type {
  AccountCandidate,
  BankSourceSnapshot,
  InvoiceSourceSnapshot,
  SuggestionRequester,
  VoucherSuggestionInput,
  VoucherSuggestionOutput,
} from "./ai-suggestion.types.js";
import { AI_SUGGESTION_STATUS } from "../../common/status-codes.js";

function redactParty(value: string | null): string | null {
  if (!value) return null;
  const chars = [...value];
  if (chars.length <= 2) return `${chars[0] ?? ""}*`;
  return `${chars[0]}***${chars.at(-1)}`;
}

function redactIdentifier(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

export interface AiSuggestionRecord {
  id: number;
  bankTransactionId: number | null;
  invoiceId: number | null;
  voucherId: number | null;
  requestedById: number;
  status: number;
  model: string;
  inputSnapshot: unknown;
  suggestion: unknown;
  errorMessage: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AiSuggestionRepository {
  findBankSource(id: number): Promise<BankSourceSnapshot | null>;
  findInvoiceSource(id: number): Promise<InvoiceSourceSnapshot | null>;
  listCandidateAccounts(): Promise<AccountCandidate[]>;
  createPending(input: {
    bankTransactionId: number | null;
    invoiceId: number | null;
    requesterId: number;
    model: string;
    snapshot: VoucherSuggestionInput;
  }): Promise<AiSuggestionRecord>;
  markGenerated(
    id: number,
    suggestion: VoucherSuggestionOutput,
    requester: SuggestionRequester,
  ): Promise<AiSuggestionRecord>;
  markFailed(id: number, message: string, requester: SuggestionRequester): Promise<void>;
  findById(id: number): Promise<AiSuggestionRecord | null>;
  markRejected(id: number, requester: SuggestionRequester): Promise<AiSuggestionRecord>;
}

export class PrismaAiSuggestionRepository implements AiSuggestionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBankSource(id: number): Promise<BankSourceSnapshot | null> {
    const item = await this.prisma.bankTransaction.findFirst({ where: { id, deletedAt: null } });
    if (!item) return null;
    return {
      id: item.id,
      payerName: redactParty(item.payerName),
      payeeName: redactParty(item.payeeName),
      amount: item.amount.toString(),
      transactionTime: item.transactionTime.toISOString(),
      transactionType: item.transactionType,
      summary: item.summary,
    };
  }

  async findInvoiceSource(id: number): Promise<InvoiceSourceSnapshot | null> {
    const item = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: { items: { where: { deletedAt: null }, orderBy: { lineNo: "asc" } } },
    });
    if (!item) return null;
    return {
      id: item.id,
      invoiceNumber: item.invoiceNumber,
      direction: item.direction,
      issueTime: item.issueTime.toISOString(),
      sellerName: redactParty(item.sellerName) ?? "",
      sellerIdNum: redactIdentifier(item.sellerIdNum),
      buyerName: redactParty(item.buyerName) ?? "",
      buyerIdNum: redactIdentifier(item.buyerIdNum),
      totalAmountWithoutTax: item.totalAmountWithoutTax.toString(),
      totalTaxAmount: item.totalTaxAmount.toString(),
      totalTaxIncludedAmount: item.totalTaxIncludedAmount.toString(),
      items: item.items.map((line) => ({
        itemName: line.itemName,
        amount: line.amount.toString(),
        taxRate: line.taxRate?.toString() ?? null,
        taxClassificationCode: line.taxClassificationCode,
      })),
    };
  }

  listCandidateAccounts() {
    return this.prisma.account.findMany({
      where: { deletedAt: null, isEnabled: true, isLeaf: true },
      select: { code: true, name: true, category: true, normalDirection: true },
      orderBy: { code: "asc" },
      take: 500,
    });
  }

  createPending(input: {
    bankTransactionId: number | null;
    invoiceId: number | null;
    requesterId: number;
    model: string;
    snapshot: VoucherSuggestionInput;
  }) {
    return this.prisma.aiSuggestion.create({
      data: {
        bankTransactionId: input.bankTransactionId,
        invoiceId: input.invoiceId,
        requestedById: input.requesterId,
        status: AI_SUGGESTION_STATUS.PENDING,
        model: input.model,
        inputSnapshot: input.snapshot as unknown as Prisma.InputJsonObject,
      },
    });
  }

  markGenerated(id: number, suggestion: VoucherSuggestionOutput, requester: SuggestionRequester) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.aiSuggestion.update({
        where: { id },
        data: { status: AI_SUGGESTION_STATUS.GENERATED, suggestion: suggestion as unknown as Prisma.InputJsonObject },
      });
      await tx.auditLog.create({
        data: this.audit("CREATE", id, "AI 凭证建议生成成功", requester),
      });
      return record;
    });
  }

  async markFailed(id: number, message: string, requester: SuggestionRequester): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.aiSuggestion.update({
        where: { id },
        data: { status: AI_SUGGESTION_STATUS.FAILED, errorMessage: message.slice(0, 5000) },
      });
      await tx.auditLog.create({
        data: this.audit("CREATE", id, "AI 凭证建议生成失败", requester),
      });
    });
  }

  findById(id: number) {
    return this.prisma.aiSuggestion.findFirst({ where: { id, deletedAt: null } });
  }

  markRejected(id: number, requester: SuggestionRequester) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.aiSuggestion.update({
        where: { id },
        data: { status: AI_SUGGESTION_STATUS.REJECTED },
      });
      await tx.auditLog.create({
        data: this.audit("UPDATE", id, "AI 凭证建议已拒绝", requester),
      });
      return record;
    });
  }

  private audit(
    action: "CREATE" | "UPDATE",
    id: number,
    description: string,
    requester: SuggestionRequester,
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      actorId: requester.actorId,
      action,
      resourceType: "AiSuggestion",
      resourceId: id,
      description,
      ipAddress: requester.ipAddress ?? null,
      userAgent: requester.userAgent ?? null,
      requestId: requester.requestId ?? null,
    };
  }
}
