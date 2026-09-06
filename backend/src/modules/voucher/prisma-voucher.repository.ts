import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { AI_SUGGESTION_STATUS, VOUCHER_STATUS } from "../../common/status-codes.js";
import type { VoucherRepository } from "./voucher.repository.js";
import { voucherDetailInclude, voucherFilterWhere } from "./voucher-prisma.helpers.js";
import { getNextVoucherNumber } from "./voucher-numbering.helper.js";
import type {
  AiSuggestionForVoucher,
  VoucherActor,
  VoucherFilter,
  VoucherMutationRecord,
  VoucherWriteData,
} from "./voucher.types.js";

export class PrismaVoucherRepository implements VoucherRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAccountsForPosting(ids: number[]) {
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: ids }, deletedAt: null, isEnabled: true, isLeaf: true },
      select: { id: true },
    });
    return new Set(accounts.map((item) => item.id));
  }

  async findForMutation(id: number): Promise<VoucherMutationRecord | null> {
    const item = await this.prisma.voucher.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        voucherNo: true,
        status: true,
        createdById: true,
        summary: true,
        fiscalYear: true,
        fiscalPeriod: true,
        voucherDate: true,
        postingDate: true,
        periodId: true,
        reviewerId: true,
        reviewedAt: true,
        totalDebit: true,
        totalCredit: true,
      },
    });
    return item
      ? { ...item, totalDebit: item.totalDebit.toString(), totalCredit: item.totalCredit.toString() }
      : null;
  }

  findManagedSource(id: number) {
    return this.prisma.accountingEvent.findFirst({
      where: { voucherId: id, deletedAt: null },
      select: { eventType: true, sourceType: true },
    });
  }

  async findOperationMode(): Promise<"SIMPLE" | "STANDARD"> {
    const profile = await this.prisma.companyProfile.findFirst({
      where: { deletedAt: null },
      select: { operationMode: true },
    });
    return profile?.operationMode ?? "SIMPLE";
  }

  findSuggestion(id: number): Promise<AiSuggestionForVoucher | null> {
    return this.prisma.aiSuggestion.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        requestedById: true,
        bankTransactionId: true,
        invoiceId: true,
        suggestion: true,
      },
    });
  }

  async listActiveEntriesForReview(id: number) {
    const entries = await this.prisma.voucherEntry.findMany({
      where: { voucherId: id, deletedAt: null },
      select: { accountId: true, debitAmount: true, creditAmount: true },
    });
    return entries.map((entry) => ({
      accountId: entry.accountId,
      debitAmount: entry.debitAmount.toString(),
      creditAmount: entry.creditAmount.toString(),
    }));
  }

  createManual(data: VoucherWriteData, actor: VoucherActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertDimensions(tx, data.entries);
      const numbering = await getNextVoucherNumber(tx, data.fiscalYear);
      const voucher = await tx.voucher.create({
        data: this.createData(data, numbering, "MANUAL", actor.actorId),
        include: voucherDetailInclude(),
      });
      await this.saveDimensions(tx, voucher.id, data.entries);
      await tx.auditLog.create({ data: this.audit("CREATE", voucher.id, "手工凭证创建", actor) });
      return voucher;
    });
  }

  createFromSuggestion(
    suggestion: AiSuggestionForVoucher,
    data: VoucherWriteData,
    actor: VoucherActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertDimensions(tx, data.entries);
      const claimed = await tx.aiSuggestion.updateMany({
        where: { id: suggestion.id, status: AI_SUGGESTION_STATUS.GENERATED, voucherId: null, deletedAt: null },
        data: { status: AI_SUGGESTION_STATUS.ACCEPTED, acceptedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new AppError("AI_SUGGESTION_STATE_INVALID", "AI 建议已处理或状态无效", 409);
      }
      const numbering = await getNextVoucherNumber(tx, data.fiscalYear);
      const sourceType = suggestion.bankTransactionId && suggestion.invoiceId
        ? "MIXED"
        : suggestion.bankTransactionId
          ? "BANK_TRANSACTION"
          : "INVOICE";
      const voucher = await tx.voucher.create({
        data: this.createData(data, numbering, sourceType, actor.actorId),
        include: voucherDetailInclude(),
      });
      await this.saveDimensions(tx, voucher.id, data.entries);
      const sources = [
        ...(suggestion.bankTransactionId
          ? [{ voucherId: voucher.id, bankTransactionId: suggestion.bankTransactionId }]
          : []),
        ...(suggestion.invoiceId ? [{ voucherId: voucher.id, invoiceId: suggestion.invoiceId }] : []),
      ];
      if (sources.length) await tx.voucherSource.createMany({ data: sources });
      if (suggestion.bankTransactionId) {
        const linked = await tx.bankTransaction.updateMany({ where: { id: suggestion.bankTransactionId, deletedAt: null, voucherId: null }, data: { voucherId: voucher.id } });
        if (linked.count !== 1) throw new AppError("SOURCE_ALREADY_VOUCHERED", "银行流水已关联其他凭证，不能覆盖原有关联", 409);
      }
      if (suggestion.invoiceId) {
        const linked = await tx.invoice.updateMany({ where: { id: suggestion.invoiceId, deletedAt: null, voucherId: null }, data: { voucherId: voucher.id } });
        if (linked.count !== 1) throw new AppError("SOURCE_ALREADY_VOUCHERED", "发票已关联其他凭证，不能覆盖原有关联", 409);
      }
      await tx.aiSuggestion.update({ where: { id: suggestion.id }, data: { voucherId: voucher.id } });
      await tx.auditLog.create({ data: this.audit("CREATE", voucher.id, "AI 建议确认生成凭证", actor) });
      return tx.voucher.findUniqueOrThrow({ where: { id: voucher.id }, include: voucherDetailInclude() });
    });
  }

  update(current: VoucherMutationRecord, data: VoucherWriteData, actor: VoucherActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertDimensions(tx, data.entries);
      const voucher = await tx.voucher.update({
        where: { id: current.id },
        data: {
          voucherDate: data.voucherDate,
          postingDate: data.postingDate,
          periodId: data.periodId!,
          fiscalYear: data.fiscalYear,
          fiscalPeriod: data.fiscalPeriod,
          summary: data.summary,
          category: data.category,
          totalDebit: data.totalDebit,
          totalCredit: data.totalCredit,
        },
      });
      const existing = await tx.voucherEntry.findMany({
        where: { voucherId: current.id },
        orderBy: { lineNo: "asc" },
      });
      for (const entry of data.entries) {
        const old = existing.find((item) => item.lineNo === entry.lineNo);
        const entryData = this.entryData(entry);
        const saved = old
          ? await tx.voucherEntry.update({ where: { id: old.id }, data: { ...entryData, deletedAt: null } })
          : await tx.voucherEntry.create({ data: { ...entryData, voucherId: current.id, lineNo: entry.lineNo } });
        await tx.voucherEntryDimension.deleteMany({ where: { voucherEntryId: saved.id } });
        await this.saveEntryDimensions(tx, saved.id, entry.dimensionMemberIds);
      }
      const deletedIds = existing.filter((item) => item.lineNo > data.entries.length).map((item) => item.id);
      if (deletedIds.length) {
        await tx.voucherEntry.updateMany({ where: { id: { in: deletedIds } }, data: { deletedAt: new Date() } });
      }
      await tx.auditLog.create({ data: this.audit("UPDATE", voucher.id, "凭证修改", actor) });
      return tx.voucher.findUniqueOrThrow({ where: { id: voucher.id }, include: voucherDetailInclude() });
    });
  }

  async softDelete(current: VoucherMutationRecord, actor: VoucherActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.voucher.update({ where: { id: current.id }, data: { deletedAt } });
      await tx.voucherEntry.updateMany({ where: { voucherId: current.id, deletedAt: null }, data: { deletedAt } });
      await tx.voucherSource.updateMany({ where: { voucherId: current.id, deletedAt: null }, data: { deletedAt } });
      await tx.voucherAttachment.updateMany({ where: { voucherId: current.id, deletedAt: null }, data: { deletedAt } });
      await tx.aiSuggestion.updateMany({
        where: { voucherId: current.id, status: AI_SUGGESTION_STATUS.ACCEPTED, deletedAt: null },
        data: { status: AI_SUGGESTION_STATUS.GENERATED, voucherId: null, acceptedAt: null },
      });
      await tx.auditLog.create({ data: this.audit("DELETE", current.id, "凭证删除", actor) });
    });
  }

  changeStatus(current: VoucherMutationRecord, to: number, actor: VoucherActor, voidReason?: string) {
    return this.changeVoucherStatus(current, to, actor, voidReason);
  }

  async list(filter: VoucherFilter) {
    const where = voucherFilterWhere(filter);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.voucher.findMany({
        where,
        include: { _count: { select: { entries: true, attachments: true, accountingEvents: { where: { deletedAt: null } } } }, reviewer: { select: { id: true, displayName: true } }, postedBy: { select: { id: true, displayName: true } }, voidBy: { select: { id: true, displayName: true } }, period: { select: { id: true, periodCode: true, status: true } } },
        orderBy: [{ voucherDate: "desc" }, { sequenceNo: "desc" }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.voucher.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: number) {
    return this.prisma.voucher.findFirst({
      where: { id, deletedAt: null },
      include: voucherDetailInclude(),
    });
  }

  addAttachment(
    voucher: VoucherMutationRecord,
    file: { originalName: string; storagePath: string; mimeType: string; fileSize: bigint; fileHash: string },
    actor: VoucherActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const attachment = await tx.voucherAttachment.create({ data: { ...file, voucherId: voucher.id } });
      await tx.voucher.update({ where: { id: voucher.id }, data: { attachmentCount: { increment: 1 } } });
      await tx.auditLog.create({ data: this.audit("UPDATE", voucher.id, "凭证附件上传", actor) });
      return attachment;
    });
  }

  private async changeVoucherStatus(current: VoucherMutationRecord, to: number, actor: VoucherActor, voidReason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const data = to === VOUCHER_STATUS.PENDING
        ? current.status === VOUCHER_STATUS.DRAFT
          ? { status: VOUCHER_STATUS.PENDING }
          : current.status === VOUCHER_STATUS.POSTED
            ? { status: VOUCHER_STATUS.PENDING, postedById: null, postedAt: null }
            : { reviewerId: actor.actorId, reviewedAt: now }
        : to === VOUCHER_STATUS.POSTED
          ? { status: VOUCHER_STATUS.POSTED, postedById: actor.actorId, postedAt: now }
          : to === VOUCHER_STATUS.VOID
            ? { status: VOUCHER_STATUS.VOID, voidById: actor.actorId, voidAt: now, voidReason: voidReason! }
            : current.status === VOUCHER_STATUS.VOID || current.status === VOUCHER_STATUS.POSTED
              ? { status: VOUCHER_STATUS.DRAFT, reviewerId: null, reviewedAt: null, postedById: null, postedAt: null, voidById: null, voidAt: null, voidReason: null }
              : { status: VOUCHER_STATUS.DRAFT, reviewerId: null, reviewedAt: null };
      const updated = await tx.voucher.updateMany({
        where: { id: current.id, status: current.status, deletedAt: null },
        data,
      });
      if (updated.count !== 1) throw new AppError("VOUCHER_STATE_CONFLICT", "凭证状态已发生变化", 409);
      const sources = await tx.voucherSource.findMany({
        where: { voucherId: current.id, deletedAt: null },
        select: { bankTransactionId: true, invoiceId: true },
      });
      if (to === VOUCHER_STATUS.VOID && sources.length) {
        const bankIds = sources.flatMap(source => source.bankTransactionId ? [source.bankTransactionId] : []);
        const invoiceIds = sources.flatMap(source => source.invoiceId ? [source.invoiceId] : []);
        if (bankIds.length) await tx.bankTransaction.updateMany({ where: { id: { in: bankIds }, voucherId: current.id }, data: { voucherId: null } });
        for (const invoiceId of invoiceIds) {
          const replacement = await tx.voucherSource.findFirst({
            where: { invoiceId, voucherId: { not: current.id }, deletedAt: null, voucher: { deletedAt: null, status: { not: VOUCHER_STATUS.VOID } } },
            select: { voucherId: true },
            orderBy: { createdAt: "asc" },
          });
          await tx.invoice.updateMany({ where: { id: invoiceId, voucherId: current.id }, data: { voucherId: replacement?.voucherId ?? null } });
        }
        await tx.aiSuggestion.updateMany({ where: { voucherId: current.id, deletedAt: null }, data: { voucherId: null, status: AI_SUGGESTION_STATUS.GENERATED, acceptedAt: null } });
      }
      if (to === VOUCHER_STATUS.DRAFT && current.status === VOUCHER_STATUS.VOID && sources.length) {
        const bankIds = sources.flatMap(source => source.bankTransactionId ? [source.bankTransactionId] : []);
        const invoiceIds = sources.flatMap(source => source.invoiceId ? [source.invoiceId] : []);
        const occupiedBanks = bankIds.length ? await tx.bankTransaction.count({ where: { id: { in: bankIds }, voucherId: { not: null } } }) : 0;
        if (occupiedBanks) throw new AppError("VOUCHER_SOURCE_ALREADY_USED", "银行流水已被其他凭证使用，不能恢复", 409);
        if (bankIds.length) await tx.bankTransaction.updateMany({ where: { id: { in: bankIds } }, data: { voucherId: current.id } });
        if (invoiceIds.length) await tx.invoice.updateMany({ where: { id: { in: invoiceIds }, voucherId: null }, data: { voucherId: current.id } });
        await tx.aiSuggestion.updateMany({ where: { deletedAt: null, OR: [{ bankTransactionId: { in: bankIds } }, { invoiceId: { in: invoiceIds } }] }, data: { voucherId: current.id, status: AI_SUGGESTION_STATUS.ACCEPTED, acceptedAt: now } });
      }
      await tx.auditLog.create({ data: this.audit("UPDATE", current.id, `Voucher status: ${current.status} -> ${to}`, actor, { fromStatus: current.status, toStatus: to, voidReason: voidReason ?? null }) });
      return tx.voucher.findUniqueOrThrow({ where: { id: current.id }, include: voucherDetailInclude() });
    });
  }

  private createData(
    data: VoucherWriteData,
    numbering: { sequenceNo: number; voucherNo: string },
    sourceType: "MANUAL" | "BANK_TRANSACTION" | "INVOICE" | "MIXED",
    actorId: number,
  ) {
    return {
      ...numbering,
      voucherDate: data.voucherDate,
      postingDate: data.postingDate,
      periodId: data.periodId!,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.fiscalPeriod,
      summary: data.summary,
      category: data.category,
      sourceType,
      totalDebit: data.totalDebit,
      totalCredit: data.totalCredit,
      createdById: actorId,
      entries: { create: data.entries.map((entry) => this.entryData(entry)) },
    } as const;
  }

  private entryData(entry: VoucherWriteData["entries"][number]) {
    return {
      lineNo: entry.lineNo,
      accountId: entry.accountId,
      summary: entry.summary,
      debitAmount: entry.debitAmount,
      creditAmount: entry.creditAmount,
    };
  }

  private async assertDimensions(tx: Prisma.TransactionClient, entries: VoucherWriteData["entries"]) {
    const memberIds = [...new Set(entries.flatMap((entry) => entry.dimensionMemberIds))];
    const members = memberIds.length
      ? await tx.accountingDimensionMember.findMany({
          where: { id: { in: memberIds }, enabled: true, deletedAt: null, dimension: { enabled: true, deletedAt: null } },
          select: { id: true, dimensionId: true },
        })
      : [];
    if (members.length !== memberIds.length) throw new AppError("INVALID_DIMENSION_MEMBER", "辅助核算成员不存在、已停用或不属于启用的核算维度", 400);
    const memberDimension = new Map(members.map((member) => [member.id, member.dimensionId]));
    for (const entry of entries) {
      const dimensions = entry.dimensionMemberIds.map((id) => memberDimension.get(id));
      if (dimensions.some((id) => id === undefined) || new Set(dimensions).size !== dimensions.length) {
        throw new AppError("DUPLICATE_DIMENSION", "同一分录不能重复选择同一核算维度", 400);
      }
    }
    const accountIds = [...new Set(entries.map((entry) => entry.accountId))];
    const rules = await tx.accountDimensionRule.findMany({ where: { accountId: { in: accountIds }, required: true }, select: { accountId: true, dimensionId: true } });
    for (const rule of rules) {
      const matchedEntries = entries.filter((item) => item.accountId === rule.accountId);
      if (matchedEntries.some((entry) => !entry.dimensionMemberIds.some((id) => memberDimension.get(id) === rule.dimensionId))) {
        throw new AppError("REQUIRED_DIMENSION_MISSING", `科目 ${rule.accountId} 必须填写指定辅助核算`, 400);
      }
    }
  }

  private async saveDimensions(tx: Prisma.TransactionClient, voucherId: number, entries: VoucherWriteData["entries"]) {
    for (const entry of entries) {
      const saved = await tx.voucherEntry.findFirstOrThrow({ where: { voucherId, lineNo: entry.lineNo } });
      await this.saveEntryDimensions(tx, saved.id, entry.dimensionMemberIds);
    }
  }

  private async saveEntryDimensions(tx: Prisma.TransactionClient, voucherEntryId: number, memberIds: number[]) {
    if (!memberIds.length) return;
    const members = await tx.accountingDimensionMember.findMany({ where: { id: { in: memberIds } }, select: { id: true, dimensionId: true } });
    await tx.voucherEntryDimension.createMany({ data: members.map((member) => ({ voucherEntryId, dimensionId: member.dimensionId, dimensionMemberId: member.id })) });
  }

  private audit(
    action: "CREATE" | "UPDATE" | "DELETE" | "REVIEW" | "UNREVIEW",
    id: number,
    description: string,
    actor: VoucherActor,
    afterData?: Record<string, unknown>,
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      actorId: actor.actorId,
      action,
      resourceType: "Voucher",
      resourceId: id,
      description,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      requestId: actor.requestId ?? null,
      ...(afterData ? { afterData: afterData as Prisma.InputJsonObject } : {}),
    };
  }
}
