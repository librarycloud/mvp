import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/http/response.js";
import type { SalaryService } from "./salary.service.js";
import type { EmployeeInput, SalaryAccounts, SalaryItemInput } from "./salary.types.js";
export class SalaryController {
  constructor(private readonly service: SalaryService) {}
  employees = async (_: FastifyRequest, p: FastifyReply) => sendSuccess(p, await this.service.listEmployees());
  createEmployee = async (r: FastifyRequest<{ Body: EmployeeInput }>, p: FastifyReply) => sendSuccess(p, await this.service.createEmployee(r.body, this.actor(r)), "员工创建成功", 201);
  updateEmployee = async (r: FastifyRequest<{ Params:{id: number}; Body:Partial<EmployeeInput> }>, p: FastifyReply) => sendSuccess(p, await this.service.updateEmployee(r.params.id, r.body, this.actor(r)));
  items = async (_: FastifyRequest, p: FastifyReply) => sendSuccess(p, await this.service.listItems());
  createItem = async (r: FastifyRequest<{ Body: SalaryItemInput }>, p: FastifyReply) => sendSuccess(p, await this.service.createItem(r.body, this.actor(r)), "工资项目创建成功", 201);
  updateItem = async (r: FastifyRequest<{ Params:{id: number}; Body:Partial<SalaryItemInput> }>, p: FastifyReply) => sendSuccess(p, await this.service.updateItem(r.params.id, r.body, this.actor(r)));
  deleteItem = async (r: FastifyRequest<{ Params:{id: number} }>, p: FastifyReply) => { await this.service.deleteItem(r.params.id, this.actor(r)); return sendSuccess(p, null, "工资项目已删除"); };
  salaries = async (r: FastifyRequest<{ Params:{periodId: number} }>, p: FastifyReply) => sendSuccess(p, await this.service.listSalaries(r.params.periodId));
  summary = async (r: FastifyRequest<{ Params:{periodId: number} }>, p: FastifyReply) => sendSuccess(p, await this.service.summary(r.params.periodId));
  generate = async (r: FastifyRequest<{ Params:{periodId: number}; Body:SalaryAccounts }>, p: FastifyReply) => sendSuccess(p, await this.service.generate(r.params.periodId, r.body, this.actor(r)), "工资单及凭证已生成", 201);
  cancel = async (r: FastifyRequest<{ Params:{id: number}; Body:{reason:string} }>, p: FastifyReply) => sendSuccess(p, await this.service.cancel(r.params.id, r.body.reason, this.actor(r)), "工资计提已撤销");
  export = async (r: FastifyRequest<{ Params:{periodId: number} }>, p: FastifyReply) => p.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", 'attachment; filename="salary.xlsx"').send(await this.service.export(r.params.periodId));
  import = async (r: FastifyRequest<{ Params:{periodId: number} }>, p: FastifyReply) => { const file = await r.file({ limits: { fileSize: 20 * 1024 * 1024, files: 1 } }); if (!file) throw new AppError("SALARY_FILE_REQUIRED", "请选择工资 Excel 文件", 400); const expenseAccountId = Number((file.fields.expenseAccountId as any)?.value); const payableAccountId = Number((file.fields.payableAccountId as any)?.value); if (!Number.isInteger(expenseAccountId) || expenseAccountId < 1 || !Number.isInteger(payableAccountId) || payableAccountId < 1) throw new AppError("INVALID_SALARY_ACCOUNTS", "请提供工资费用科目和应付工资科目", 400); return sendSuccess(p, await this.service.importWorkbook(r.params.periodId, await file.toBuffer(), { expenseAccountId, payableAccountId }, this.actor(r)), "工资导入完成", 201); };
  private actor(r: FastifyRequest) { return { actorId: Number(r.user.sub), role: r.user.role }; }
}
