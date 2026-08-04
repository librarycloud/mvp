import ExcelJS from "exceljs";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import { EMPLOYEE_STATUS, VOUCHER_STATUS } from "../../common/status-codes.js";
import type { AccountingPeriodResolver } from "../accounting-period/accounting-period.types.js";
import type { EmployeeInput, SalaryAccounts, SalaryActor, SalaryItemInput, SalaryOverride } from "./salary.types.js";

const ZERO = new Prisma.Decimal(0);
type Transaction = Prisma.TransactionClient;

export class SalaryService {
  constructor(private readonly prisma: PrismaClient, private readonly periods: AccountingPeriodResolver) {}

  listEmployees() { return this.prisma.employee.findMany({ where: { deletedAt: null }, orderBy: { employeeNo: "asc" } }); }
  listItems() { return this.prisma.salaryItem.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }); }
  listSalaries(periodId: number) { return this.prisma.salary.findMany({ where: { periodId, deletedAt: null }, include: { employee: true, voucher: true }, orderBy: { employee: { employeeNo: "asc" } } }); }

  async createEmployee(input: EmployeeInput, actor: SalaryActor) {
    this.admin(actor); const data = this.employeeData(input);
    return this.prisma.$transaction(async tx => { const employee = await tx.employee.create({ data: { ...data, createdById: actor.actorId } }); await this.audit(tx, actor.actorId, "CREATE", "Employee", employee.id, { employeeNo: employee.employeeNo }); return employee; });
  }
  async updateEmployee(id: number, input: Partial<EmployeeInput>, actor: SalaryActor) {
    this.admin(actor); const current = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } }); if (!current) throw new AppError("EMPLOYEE_NOT_FOUND", "员工不存在", 404);
    const data = this.employeeData(input, true);
    return this.prisma.$transaction(async tx => { const employee = await tx.employee.update({ where: { id }, data }); await this.audit(tx, actor.actorId, "UPDATE", "Employee", id, { previousEmployeeNo: current.employeeNo, employeeNo: employee.employeeNo }); return employee; });
  }
  async createItem(input: SalaryItemInput, actor: SalaryActor) {
    this.admin(actor); const data = this.itemData(input);
    return this.prisma.$transaction(async tx => {
      const row = await tx.salaryItem.create({ data });
      await this.audit(tx, actor.actorId, "CREATE", "SalaryItem", row.id, { code: row.code, name: row.name, category: row.category });
      return row;
    });
  }
  async updateItem(id: number, input: Partial<SalaryItemInput>, actor: SalaryActor) {
    this.admin(actor); const current = await this.prisma.salaryItem.findFirst({ where: { id, deletedAt: null } }); if (!current) throw new AppError("SALARY_ITEM_NOT_FOUND", "工资项目不存在", 404);
    return this.prisma.$transaction(async tx => {
      const row = await tx.salaryItem.update({ where: { id }, data: this.itemData(input, true) });
      await this.audit(tx, actor.actorId, "UPDATE", "SalaryItem", id, { previousCode: current.code, code: row.code, name: row.name, category: row.category });
      return row;
    });
  }
  async deleteItem(id: number, actor: SalaryActor) {
    this.admin(actor);
    return this.prisma.$transaction(async tx => {
      if (typeof tx.$queryRaw === "function") await tx.$queryRaw`SELECT id FROM salary_items WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const current = await tx.salaryItem.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new AppError("SALARY_ITEM_NOT_FOUND", "工资项目不存在", 404);
      await tx.salaryItem.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } });
      await this.audit(tx, actor.actorId, "UPDATE", "SalaryItem", id, {
        from: { code: current.code, name: current.name, enabled: current.enabled },
        to: { deleted: true, enabled: false },
      });
    });
  }

  async generate(periodId: number, accounts: SalaryAccounts, actor: SalaryActor, overrides = new Map<string, SalaryOverride>()) {
    this.admin(actor); await this.periods.assertVoucherOperation(periodId);
    return this.prisma.$transaction(async tx => {
      const period = await tx.accountingPeriod.findUnique({ where: { id: periodId } }); if (!period) throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "会计期间不存在", 404);
      await this.assertAccounts(tx, accounts);
      const [employees, items] = await Promise.all([tx.employee.findMany({ where: { deletedAt: null, status: EMPLOYEE_STATUS.ACTIVE }, orderBy: { employeeNo: "asc" } }), tx.salaryItem.findMany({ where: { deletedAt: null, enabled: true }, orderBy: { sortOrder: "asc" } })]);
      const generated: unknown[] = []; let skipped = 0;
      for (const employee of employees) {
        const existing = await tx.salary.findFirst({ where: { employeeId: employee.id, periodId } });
        if (existing?.status === VOUCHER_STATUS.POSTED) { skipped++; continue; }
        generated.push(await this.createSalary(tx, employee, period, items, accounts, actor, overrides.get(employee.employeeNo), existing?.id));
      }
      return { generated, skipped, totalEmployees: employees.length };
    });
  }

  async summary(periodId: number) {
    const rows = await this.listSalaries(periodId);
    const totals = rows.reduce((sum, row) => ({ grossAmount: sum.grossAmount.plus(row.grossAmount), netAmount: sum.netAmount.plus(row.netAmount), individualIncomeTax: sum.individualIncomeTax.plus(row.individualIncomeTax), socialInsurance: sum.socialInsurance.plus(row.socialInsurance), housingFund: sum.housingFund.plus(row.housingFund) }), { grossAmount: ZERO, netAmount: ZERO, individualIncomeTax: ZERO, socialInsurance: ZERO, housingFund: ZERO });
    return { employeeCount: rows.length, ...totals };
  }

  async cancel(id: number, reason: string, actor: SalaryActor) {
    this.admin(actor);
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 500) throw new AppError("INVALID_VOID_REASON", "撤销原因不能为空且不能超过500字", 400);
    const salary = await this.prisma.salary.findFirst({ where: { id, deletedAt: null }, include: { voucher: true } });
    if (!salary) throw new AppError("SALARY_NOT_FOUND", "工资记录不存在", 404);
    if (salary.status !== VOUCHER_STATUS.POSTED) throw new AppError("SALARY_NOT_POSTED", "仅已记账工资可以撤销", 409);
    await this.periods.assertVoucherOperation(salary.periodId);
    return this.prisma.$transaction(async tx => {
      await tx.voucher.update({ where: { id: salary.voucherId }, data: { status: VOUCHER_STATUS.VOID, voidById: actor.actorId, voidAt: new Date(), voidReason: trimmed } });
      const row = await tx.salary.update({ where: { id }, data: { status: VOUCHER_STATUS.VOID } });
      await this.audit(tx, actor.actorId, "UPDATE", "Salary", id, { from: VOUCHER_STATUS.POSTED, to: VOUCHER_STATUS.VOID, reason: trimmed });
      return row;
    });
  }

  async export(periodId: number) {
    const rows = await this.listSalaries(periodId); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("工资汇总");
    sheet.addRow(["员工编号", "姓名", "部门", "基本工资", "奖金", "补贴", "扣款", "社保", "公积金", "个税", "应发", "实发", "凭证号"]);
    for (const row of rows) sheet.addRow([row.employee.employeeNo, row.employee.name, row.employee.department ?? "", row.baseSalary.toString(), row.bonus.toString(), row.allowance.toString(), row.deduction.toString(), row.socialInsurance.toString(), row.housingFund.toString(), row.individualIncomeTax.toString(), row.grossAmount.toString(), row.netAmount.toString(), row.voucher.voucherNo]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importWorkbook(periodId: number, data: Buffer, accounts: SalaryAccounts, actor: SalaryActor) {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(data as unknown as ExcelJS.Buffer); const sheet = workbook.worksheets[0]; if (!sheet) throw new AppError("EMPTY_SALARY_FILE", "工资导入文件没有工作表", 400);
    const headers = new Map<string, number>(); sheet.getRow(1).eachCell((cell, column) => headers.set(String(cell.text).trim(), column)); const column = (name: string) => headers.get(name);
    if (!column("员工编号")) throw new AppError("INVALID_SALARY_FILE", "工资导入文件缺少“员工编号”列", 400);
    const value = (row: ExcelJS.Row, name: string) => { const col = column(name); return col ? String(row.getCell(col).text).trim() : undefined; };
    const overrides = new Map<string, SalaryOverride>();
    for (let i = 2; i <= sheet.rowCount; i++) { const row = sheet.getRow(i); const employeeNo = value(row, "员工编号"); if (!employeeNo) continue; overrides.set(employeeNo, { employeeNo, baseSalary: value(row, "基本工资"), bonus: value(row, "奖金"), allowance: value(row, "补贴"), deduction: value(row, "扣款"), socialInsurance: value(row, "社保"), housingFund: value(row, "公积金"), individualIncomeTax: value(row, "个税") }); }
    if (!overrides.size) throw new AppError("EMPTY_SALARY_FILE", "工资导入文件没有有效数据", 400);
    const result = await this.generate(periodId, accounts, actor, overrides); return { ...result, importedRows: overrides.size };
  }

  private async createSalary(tx: Transaction, employee: any, period: any, items: any[], accounts: SalaryAccounts, actor: SalaryActor, override?: SalaryOverride, salaryId?: number) {
    const bucket = this.itemBuckets(items); const baseSalary = this.override(override?.baseSalary, employee.baseSalary); const bonus = this.override(override?.bonus, bucket.bonus); const allowance = this.override(override?.allowance, bucket.allowance); const deduction = this.override(override?.deduction, bucket.deduction); const socialInsurance = this.override(override?.socialInsurance, employee.socialInsurance.plus(bucket.socialInsurance)); const housingFund = this.override(override?.housingFund, employee.housingFund.plus(bucket.housingFund)); const individualIncomeTax = this.override(override?.individualIncomeTax, ZERO);
    const grossAmount = baseSalary.plus(bonus).plus(allowance); const netAmount = grossAmount.minus(deduction).minus(socialInsurance).minus(housingFund).minus(individualIncomeTax); if (netAmount.lessThan(0)) throw new AppError("INVALID_SALARY_AMOUNT", `员工 ${employee.employeeNo} 的实发工资不能为负数`, 400);
    const summary = `计提${period.periodCode}工资：${employee.name}`; const sequence = await this.nextNumber(tx, period.year);
    const voucher = await tx.voucher.create({ data: { ...sequence, fiscalYear: period.year, fiscalPeriod: period.month, voucherDate: period.endDate, postingDate: period.endDate, periodId: period.id, summary, sourceType: "MANUAL", category: "ACCRUAL", status: VOUCHER_STATUS.POSTED, totalDebit: grossAmount, totalCredit: grossAmount, createdById: actor.actorId, reviewerId: actor.actorId, reviewedAt: new Date(), postedById: actor.actorId, postedAt: new Date(), entries: { create: [{ lineNo: 1, accountId: accounts.expenseAccountId, summary, debitAmount: grossAmount, creditAmount: ZERO }, { lineNo: 2, accountId: accounts.payableAccountId, summary, debitAmount: ZERO, creditAmount: grossAmount }] } } });
    const event = await tx.accountingEvent.create({ data: { eventType: "SALARY", sourceType: "Salary", sourceId: employee.id, voucherId: voucher.id, description: summary, createdById: actor.actorId } });
    const salaryData = { employeeId: employee.id, periodId: period.id, baseSalary, bonus, allowance, deduction, socialInsurance, housingFund, individualIncomeTax, grossAmount, netAmount, status: VOUCHER_STATUS.POSTED, eventId: event.id, voucherId: voucher.id, createdById: actor.actorId };
    const salary = salaryId ? await tx.salary.update({ where: { id: salaryId }, data: salaryData }) : await tx.salary.create({ data: salaryData });
    await this.audit(tx, actor.actorId, salaryId ? "UPDATE" : "CREATE", "Salary", salary.id, { employeeNo: employee.employeeNo, periodId: period.id, grossAmount: grossAmount.toString() }); return salary;
  }
  private itemBuckets(items: any[]) { const result = { bonus: ZERO, allowance: ZERO, deduction: ZERO, socialInsurance: ZERO, housingFund: ZERO }; for (const item of items) { if (item.category === "BONUS") result.bonus = result.bonus.plus(item.defaultAmount); else if (item.category === "ALLOWANCE") result.allowance = result.allowance.plus(item.defaultAmount); else if (item.category === "DEDUCTION") result.deduction = result.deduction.plus(item.defaultAmount); else if (item.category === "SOCIAL_INSURANCE") result.socialInsurance = result.socialInsurance.plus(item.defaultAmount); else if (item.category === "HOUSING_FUND") result.housingFund = result.housingFund.plus(item.defaultAmount); } return result; }
  private employeeData(input: Partial<EmployeeInput>, partial = false): any { const out: Record<string, unknown> = {}; for (const key of ["employeeNo", "name", "idNumber", "department", "position", "bankName", "bankAccount"] as const) if (input[key] !== undefined) out[key] = input[key]?.trim() || null; if (input.status !== undefined) out.status = Number(input.status); if (!partial && (!input.employeeNo?.trim() || !input.name?.trim())) throw new AppError("INVALID_EMPLOYEE", "员工编号和姓名不能为空", 400); if (input.joinDate !== undefined) out.joinDate = input.joinDate ? this.date(input.joinDate) : null; for (const key of ["baseSalary", "socialInsurance", "housingFund"] as const) if (input[key] !== undefined) out[key] = this.money(input[key] as string, key); if (!partial && input.baseSalary === undefined) throw new AppError("INVALID_SALARY_AMOUNT", "基本工资不能为空", 400); return out; }
  private itemData(input: Partial<SalaryItemInput>, partial = false): any { const out: Record<string, unknown> = {}; for (const key of ["code", "name", "category", "remark", "enabled", "sortOrder"] as const) if (input[key] !== undefined) out[key] = typeof input[key] === "string" ? input[key]?.trim() || null : input[key]; if (!partial && (!input.code?.trim() || !input.name?.trim() || !input.category)) throw new AppError("INVALID_SALARY_ITEM", "工资项目编码、名称和类别不能为空", 400); if (input.category && !["BONUS", "ALLOWANCE", "DEDUCTION", "SOCIAL_INSURANCE", "HOUSING_FUND"].includes(input.category)) throw new AppError("INVALID_SALARY_ITEM", "工资项目类别无效", 400); if (input.defaultAmount !== undefined) out.defaultAmount = this.money(input.defaultAmount, "默认金额"); if (!partial && input.defaultAmount === undefined) throw new AppError("INVALID_SALARY_AMOUNT", "工资项目默认金额不能为空", 400); return out; }
  private money(value: string, field: string) { if (!/^\d{1,15}(\.\d{1,4})?$/.test(value)) throw new AppError("INVALID_SALARY_AMOUNT", `${field}必须是非负金额，最多四位小数`, 400); return new Prisma.Decimal(value); }
  private override(value: string | undefined, fallback: Prisma.Decimal) { return value === undefined || value === "" ? fallback : this.money(value, "工资导入金额"); }
  private date(value: string) { const date = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(date.getTime())) throw new AppError("INVALID_DATE", "日期无效", 400); return date; }
  private async assertAccounts(tx: Transaction, accounts: SalaryAccounts) { if (accounts.expenseAccountId === accounts.payableAccountId) throw new AppError("INVALID_SALARY_ACCOUNTS", "工资费用科目与应付工资科目不能相同", 400); const rows = await tx.account.findMany({ where: { id: { in: [accounts.expenseAccountId, accounts.payableAccountId] }, deletedAt: null, isEnabled: true, isLeaf: true }, select: { id: true } }); if (rows.length !== 2) throw new AppError("ACCOUNT_NOT_POSTABLE", "工资凭证科目不存在、未启用或不是末级科目", 400); }
  private async nextNumber(tx: Transaction, year: number) { await tx.$executeRaw`INSERT IGNORE INTO voucher_sequences (fiscal_year,next_value,created_at,updated_at,deleted_at) VALUES (${year},1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL)`; const rows = await tx.$queryRaw<Array<{ next_value:number }>>`SELECT next_value FROM voucher_sequences WHERE fiscal_year=${year} FOR UPDATE`; const sequenceNo = Number(rows[0]?.next_value); await tx.voucherSequence.update({ where: { fiscalYear: year }, data: { nextValue: sequenceNo + 1 } }); return { sequenceNo, voucherNo: `${year}-${String(sequenceNo).padStart(6, "0")}` }; }
  private audit(tx: Transaction, actorId: number, action: "CREATE"|"UPDATE", resourceType: string, resourceId: number, afterData: object) { return tx.auditLog.create({ data: { actorId, action, resourceType, resourceId, beforeData: Prisma.JsonNull, afterData } }); }
  private admin(actor: SalaryActor) { if (actor.role !== "ADMIN") throw new AppError("FORBIDDEN", "仅管理员可以维护工资数据或生成工资单", 403); }
}

