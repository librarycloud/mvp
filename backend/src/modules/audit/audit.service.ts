import type { PrismaClient } from "../../generated/prisma/client.js";

export interface AuditFilter {
  page: number;
  pageSize: number;
  actorId?: number;
  action?: string;
  resourceType?: string;
  requestId?: string;
  startAt?: Date;
  endAt?: Date;
}

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filter: AuditFilter) {
    const where = {
      deletedAt: null,
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.action ? { action: filter.action as never } : {}),
      ...(filter.resourceType ? { resourceType: filter.resourceType } : {}),
      ...(filter.requestId ? { requestId: filter.requestId } : {}),
      ...(filter.startAt || filter.endAt ? { createdAt: { ...(filter.startAt ? { gte: filter.startAt } : {}), ...(filter.endAt ? { lte: filter.endAt } : {}) } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, username: true, displayName: true, role: true } } },
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: filter.pageSize, totalPages: Math.ceil(total / filter.pageSize) };
  }
}
