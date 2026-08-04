import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import type { AuthRole } from "../auth/auth.types.js";
import type { CreateTemplateBody, TemplateConfigBody } from "./dto/report-template.dto.js";

export interface TemplateActor { actorId: number; role: AuthRole; }

export class ReportTemplateService {
  constructor(private readonly prisma: PrismaClient) {}

  list(code?: string) {
    return this.prisma.reportTemplate.findMany({
      where: { deletedAt: null, ...(code ? { code } : {}) },
      include: { _count: { select: { items: { where: { deletedAt: null } }, reports: { where: { deletedAt: null } } } } },
      orderBy: [{ code: "asc" }, { version: "desc" }],
    });
  }

  async detail(id: number) {
    const row = await this.prisma.reportTemplate.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: {
          where: { deletedAt: null }, orderBy: { sortOrder: "asc" },
          include: {
            accountMappings: { where: { deletedAt: null }, include: { account: { select: { id: true, code: true, name: true } } } },
            dependenciesAsTarget: { where: { deletedAt: null }, include: { sourceItem: { select: { itemCode: true, name: true } } }, orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });
    if (!row) throw new AppError("REPORT_TEMPLATE_NOT_FOUND", "报表模板不存在", 404);
    return row;
  }

  async create(input: CreateTemplateBody, actor: TemplateActor) {
    this.admin(actor);
    const exists = await this.prisma.reportTemplate.findFirst({ where: { code: input.code } });
    if (exists) throw new AppError("REPORT_TEMPLATE_CODE_EXISTS", "报表模板编码已经存在", 409);
    await this.validate(input);
    return this.persist(input.code, input.type, 1, input, actor.actorId);
  }

  async publish(sourceId: number, input: TemplateConfigBody, actor: TemplateActor) {
    this.admin(actor);
    const source = await this.detail(sourceId);
    await this.validate(input);
    const latest = await this.prisma.reportTemplate.aggregate({ where: { code: source.code }, _max: { version: true } });
    return this.persist(source.code, source.type, (latest._max.version ?? 0) + 1, input, actor.actorId);
  }

  async activate(id: number, actor: TemplateActor) {
    this.admin(actor);
    const row = await this.detail(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.reportTemplate.updateMany({ where: { code: row.code, deletedAt: null }, data: { isActive: false } });
      const active = await tx.reportTemplate.update({ where: { id }, data: { isActive: true, maintainedById: actor.actorId } });
      await this.audit(tx, actor.actorId, "UPDATE", id, `启用报表模板 ${row.code} V${row.version}`);
      return active;
    });
  }

  async deactivate(id: number, actor: TemplateActor) {
    this.admin(actor);
    const row = await this.detail(id);
    const result = await this.prisma.reportTemplate.update({ where: { id }, data: { isActive: false, maintainedById: actor.actorId } });
    await this.prisma.auditLog.create({ data: { actorId: actor.actorId, action: "UPDATE", resourceType: "ReportTemplate", resourceId: id, description: `停用报表模板 ${row.code} V${row.version}` } });
    return result;
  }

  private async validate(input: TemplateConfigBody) {
    const codes = input.items.map((item) => item.itemCode.trim());
    const sorts = input.items.map((item) => item.sortOrder);
    if (new Set(codes).size !== codes.length) throw new AppError("REPORT_ITEM_CODE_DUPLICATE", "报表项目编码不能重复", 400);
    if (new Set(sorts).size !== sorts.length) throw new AppError("REPORT_ITEM_SORT_DUPLICATE", "报表项目排序不能重复", 400);
    const codeSet = new Set(codes);
    for (const item of input.items) {
      if (item.dependencies.some((dependency) => !codeSet.has(dependency.sourceItemCode))) {
        throw new AppError("REPORT_DEPENDENCY_INVALID", `项目 ${item.itemCode} 引用了不存在的公式项目`, 400);
      }
      if (item.dependencies.some((dependency) => dependency.sourceItemCode === item.itemCode)) {
        throw new AppError("REPORT_DEPENDENCY_SELF", `项目 ${item.itemCode} 不能引用自身`, 400);
      }
    }
    this.assertAcyclic(input);
    const accountIds = [...new Set(input.items.flatMap((item) => item.mappings.map((mapping) => mapping.accountId)))];
    if (accountIds.length) {
      const count = await this.prisma.account.count({ where: { id: { in: accountIds }, deletedAt: null } });
      if (count !== accountIds.length) throw new AppError("REPORT_MAPPING_ACCOUNT_INVALID", "科目映射包含不存在或已删除的会计科目", 400);
    }
  }

  private assertAcyclic(input: TemplateConfigBody) {
    const graph = new Map(input.items.map((item) => [item.itemCode, item.dependencies.map((dependency) => dependency.sourceItemCode)]));
    const visiting = new Set<string>(); const visited = new Set<string>();
    const visit = (code: string) => {
      if (visiting.has(code)) throw new AppError("REPORT_TEMPLATE_CYCLE", "报表公式存在循环依赖", 400);
      if (visited.has(code)) return;
      visiting.add(code); for (const source of graph.get(code) ?? []) visit(source); visiting.delete(code); visited.add(code);
    };
    for (const code of graph.keys()) visit(code);
  }

  private persist(code: string, type: CreateTemplateBody["type"], version: number, input: TemplateConfigBody, actorId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.reportTemplate.updateMany({ where: { code, deletedAt: null }, data: { isActive: false } });
      const template = await tx.reportTemplate.create({ data: { code, name: input.name.trim(), type, version, isActive: true, description: input.description?.trim() || null, maintainedById: actorId } });
      const ids = new Map<string, number>();
      for (const item of [...input.items].sort((a, b) => a.sortOrder - b.sortOrder)) {
        const created = await tx.reportItem.create({ data: { templateId: template.id, itemCode: item.itemCode.trim(), name: item.name.trim(), lineNumber: item.lineNumber ?? null, sortOrder: item.sortOrder, normalDirection: item.normalDirection ?? null, valueType: item.valueType ?? null, formula: item.dependencies.length ? item.dependencies.map((d) => `${d.operator}(${d.sourceItemCode})*${d.coefficient}`).join(" ") : null, isSubtotal: item.isSubtotal, displayLevel: item.displayLevel } });
        ids.set(item.itemCode, created.id);
        if (item.mappings.length) await tx.reportItemAccountMapping.createMany({ data: item.mappings.map((mapping) => ({ reportItemId: created.id, accountId: mapping.accountId, operator: mapping.operator, valueType: mapping.valueType, direction: mapping.direction ?? null, includeChildren: mapping.includeChildren })) });
      }
      for (const item of input.items) if (item.dependencies.length) await tx.reportFormulaDependency.createMany({ data: item.dependencies.map((dependency, index) => ({ targetItemId: ids.get(item.itemCode)!, sourceItemId: ids.get(dependency.sourceItemCode)!, operator: dependency.operator, coefficient: new Prisma.Decimal(dependency.coefficient), sortOrder: index + 1 })) });
      await this.audit(tx, actorId, "CREATE", template.id, `发布报表模板 ${code} V${version}`);
      return tx.reportTemplate.findUniqueOrThrow({ where: { id: template.id } });
    });
  }

  private admin(actor: TemplateActor) { if (actor.role !== "ADMIN") throw new AppError("FORBIDDEN", "仅管理员可以维护报表模板", 403); }
  private audit(tx: Prisma.TransactionClient, actorId: number, action: "CREATE" | "UPDATE", id: number, description: string) { return tx.auditLog.create({ data: { actorId, action, resourceType: "ReportTemplate", resourceId: id, description } }); }
}
