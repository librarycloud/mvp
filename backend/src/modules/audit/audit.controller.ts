import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../common/http/response.js";
import type { AuditFilter, AuditService } from "./audit.service.js";

interface AuditQuery {
  page?: number;
  pageSize?: number;
  actorId?: number;
  action?: string;
  resourceType?: string;
  requestId?: string;
  startAt?: string;
  endAt?: string;
}

export class AuditController {
  constructor(private readonly service: AuditService) {}

  list = async (request: FastifyRequest<{ Querystring: AuditQuery }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.list(this.filter(request.query)));

  exportCsv = async (request: FastifyRequest<{ Querystring: AuditQuery }>, reply: FastifyReply) => {
    const result = await this.service.list({ ...this.filter(request.query), page: 1, pageSize: 10000 });
    const quote = (value: unknown) => {
      const text = String(value ?? "");
      const safe = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = [
      ["时间", "人员", "角色", "动作", "对象", "对象编号", "说明", "请求编号"],
      ...result.items.map((item) => [
        item.createdAt.toISOString(), item.actor?.displayName ?? item.actor?.username ?? "系统", item.actor?.role ?? "",
        item.action, item.resourceType, item.resourceId ?? "", item.description ?? "", item.requestId ?? "",
      ]),
    ];
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="audit-logs.csv"');
    return reply.send(`\uFEFF${rows.map((row) => row.map(quote).join(",")).join("\r\n")}`);
  };

  private filter(query: AuditQuery): AuditFilter {
    const filter: AuditFilter = { page: query.page ?? 1, pageSize: query.pageSize ?? 50 };
    if (query.actorId) filter.actorId = query.actorId;
    if (query.action) filter.action = query.action;
    if (query.resourceType) filter.resourceType = query.resourceType;
    if (query.requestId) filter.requestId = query.requestId;
    if (query.startAt) filter.startAt = new Date(query.startAt);
    if (query.endAt) filter.endAt = new Date(query.endAt);
    return filter;
  }
}
