import { AppError, PeriodClosedException } from "../../common/errors/app-error.js";
import { canManageAccounting } from "../../common/auth/authorization.js";
import { ACCOUNTING_PERIOD_STATUS } from "../../common/status-codes.js";
import type {
  AccountingPeriodActor,
  AccountingPeriodFilter,
  AccountingPeriodRecord,
  AccountingPeriodRepository,
  AccountingPeriodResolver,
} from "./accounting-period.types.js";
import type { AccountingPeriodCloseChecker } from "./period-close-checker.js";

export class AccountingPeriodService implements AccountingPeriodResolver {
  constructor(private readonly repository: AccountingPeriodRepository, private readonly closeChecker?: AccountingPeriodCloseChecker) {}

  async create(year: number, month: number, actor: AccountingPeriodActor) {
    this.assertAdmin(actor);
    this.assertYearMonth(year, month);
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0));
    try {
      return await this.repository.create({ year, month, periodCode: `${year}-${String(month).padStart(2, "0")}`, startDate, endDate });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new AppError("ACCOUNTING_PERIOD_EXISTS", "该会计期间已存在", 409);
      throw error;
    }
  }

  async update(id: number, input: { year?: number; month?: number; startDate?: string; endDate?: string }, actor: AccountingPeriodActor) {
    this.assertAdmin(actor);
    const current = await this.require(id);
    if (current.status !== ACCOUNTING_PERIOD_STATUS.OPEN) throw new AppError("ACCOUNTING_PERIOD_NOT_OPEN", "仅可修改打开状态的会计期间", 409);
    const year = input.year ?? current.year;
    const month = input.month ?? current.month;
    this.assertYearMonth(year, month);
    if ((input.startDate && !input.endDate) || (!input.startDate && input.endDate)) {
      throw new AppError("INVALID_ACCOUNTING_PERIOD", "开始日期和结束日期必须同时填写", 400);
    }
    const startDate = input.startDate ? this.parseDate(input.startDate) : new Date(Date.UTC(year, month - 1, 1));
    const endDate = input.endDate ? this.parseDate(input.endDate) : new Date(Date.UTC(year, month, 0));
    if (startDate > endDate) throw new AppError("INVALID_ACCOUNTING_PERIOD", "开始日期不能晚于结束日期", 400);
    try {
      return await this.repository.update(id, { year, month, periodCode: `${year}-${String(month).padStart(2, "0")}`, startDate, endDate }, actor);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new AppError("ACCOUNTING_PERIOD_EXISTS", "该会计期间已存在或日期范围重叠", 409);
      throw error;
    }
  }

  list(filter: AccountingPeriodFilter) {
    return this.repository.list(filter);
  }

  async close(id: number, actor: AccountingPeriodActor) {
    this.assertAdmin(actor);
    const period = await this.require(id);
    if (period.status === ACCOUNTING_PERIOD_STATUS.CLOSED) throw new AppError("ACCOUNTING_PERIOD_ALREADY_CLOSED", "该会计期间已关账", 409);
    await this.closeChecker?.assertReady(period);
    return this.repository.close(id, actor);
  }

  async closeChecklist(id: number) {
    const period = await this.require(id);
    if (!this.closeChecker) return { ready: true, checks: [] };
    return this.closeChecker.inspect(period);
  }

  async reopen(id: number, actor: AccountingPeriodActor) {
    this.assertAdmin(actor);
    const period = await this.require(id);
    if (period.status === ACCOUNTING_PERIOD_STATUS.LOCKED) throw new AppError("ACCOUNTING_PERIOD_LOCKED", "该会计期间已锁定，不能直接反关账", 409);
    if (period.status === ACCOUNTING_PERIOD_STATUS.OPEN) throw new AppError("ACCOUNTING_PERIOD_ALREADY_OPEN", "该会计期间当前为打开状态", 409);
    return this.repository.reopen(id, actor);
  }

  async resolveOpenPeriod(postingDate: Date): Promise<AccountingPeriodRecord> {
    const period = await this.repository.findByPostingDate(postingDate);
    if (!period) throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "未找到入账日期所属的会计期间，请先创建会计期间", 409);
    if (period.status !== ACCOUNTING_PERIOD_STATUS.OPEN) throw new PeriodClosedException({ periodId: period.id, periodCode: period.periodCode, status: period.status });
    return period;
  }

  async assertOpenPeriod(periodId: number): Promise<void> {
    const period = await this.require(periodId);
    if (period.status !== ACCOUNTING_PERIOD_STATUS.OPEN) throw new PeriodClosedException({ periodId: period.id, periodCode: period.periodCode, status: period.status });
  }

  assertVoucherOperation(periodId: number): Promise<void> { return this.assertOpenPeriod(periodId); }

  private async require(id: number) {
    const period = await this.repository.findById(id);
    if (!period) throw new AppError("ACCOUNTING_PERIOD_NOT_FOUND", "会计期间不存在", 404);
    return period;
  }

  private assertYearMonth(year: number, month: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new AppError("INVALID_ACCOUNTING_PERIOD", "会计年度或月份无效", 400);
    }
  }

  private assertAdmin(actor: AccountingPeriodActor) {
    if (canManageAccounting(actor.role)) return;
    if (actor.role !== "ADMIN") throw new AppError("FORBIDDEN", "仅管理员可以关账或反关账", 403);
  }

  private parseDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new AppError("INVALID_ACCOUNTING_PERIOD", "会计期间日期无效", 400);
    return date;
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
  }
}
