import type { VoucherFilter } from "./voucher.types.js";

export function voucherDetailInclude() {
  return {
    entries: {
      where: { deletedAt: null },
      include: {
        account: { select: { id: true, code: true, name: true } },
        dimensions: {
          include: {
            dimension: { select: { id: true, code: true, name: true } },
            dimensionMember: { select: { id: true, code: true, name: true } },
          },
          orderBy: { dimensionId: "asc" as const },
        },
      },
      orderBy: { lineNo: "asc" as const },
    },
    attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" as const } },
    sources: { where: { deletedAt: null } },
    reviewer: { select: { id: true, displayName: true } },
    postedBy: { select: { id: true, displayName: true } },
    voidBy: { select: { id: true, displayName: true } },
    period: { select: { id: true, periodCode: true, status: true } },
  };
}

export function voucherFilterWhere(filter: VoucherFilter) {
  return {
    deletedAt: null,
    ...(filter.status !== undefined ? { status: filter.status } : {}),
    ...(filter.category !== undefined ? { category: filter.category } : {}),
    ...(filter.fiscalYear ? { fiscalYear: filter.fiscalYear } : {}),
    ...(filter.fiscalPeriod ? { fiscalPeriod: filter.fiscalPeriod } : {}),
    ...(filter.periodId ? { periodId: filter.periodId } : {}),
    ...(filter.startDate || filter.endDate
      ? {
          voucherDate: {
            ...(filter.startDate ? { gte: filter.startDate } : {}),
            ...(filter.endDate ? { lte: filter.endDate } : {}),
          },
        }
      : {}),
    ...(filter.keyword
      ? { OR: [{ voucherNo: { contains: filter.keyword } }, { summary: { contains: filter.keyword } }] }
      : {}),
  };
}
