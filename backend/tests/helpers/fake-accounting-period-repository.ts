import type {
  AccountingPeriodActor,
  AccountingPeriodFilter,
  AccountingPeriodRecord,
  AccountingPeriodRepository,
} from "../../src/modules/accounting-period/accounting-period.types.js";
import { AppError } from "../../src/common/errors/app-error.js";

type StoredPeriod = AccountingPeriodRecord & { createdAt: Date; updatedAt: Date; closedBy: null };

export class FakeAccountingPeriodRepository implements AccountingPeriodRepository {
  periods = new Map<number, StoredPeriod>();
  sequence = 1;

  async create(input: { year: number; month: number; periodCode: string; startDate: Date; endDate: Date }) {
    if ([...this.periods.values()].some((item) => item.year === input.year && item.month === input.month)) {
      const error = { code: "P2002" };
      throw error;
    }
    if ([...this.periods.values()].some((item) => item.startDate <= input.endDate && item.endDate >= input.startDate)) {
      throw new AppError("ACCOUNTING_PERIOD_OVERLAP", "会计期间日期范围与其他期间重叠", 409);
    }
    const now = new Date(); const id = this.sequence++;
    const period: StoredPeriod = { id, ...input, status: 0, closedAt: null, closedById: null, createdAt: now, updatedAt: now, closedBy: null };
    this.periods.set(id, period); return period;
  }

  async list(filter: AccountingPeriodFilter) {
    return [...this.periods.values()].filter((item) => (!filter.year || item.year === filter.year) && (!filter.status || item.status === filter.status));
  }

  async findById(id: number) { return this.periods.get(id) ?? null; }

  async findByPostingDate(date: Date) {
    return [...this.periods.values()].find((item) => item.startDate <= date && item.endDate >= date) ?? null;
  }

  async close(id: number, actor: AccountingPeriodActor) {
    const period = this.periods.get(id)!; period.status = 1; period.closedAt = new Date(); period.closedById = actor.actorId; period.updatedAt = new Date(); return period;
  }

  async reopen(id: number, _actor: AccountingPeriodActor) {
    const period = this.periods.get(id)!; period.status = 0; period.closedAt = null; period.closedById = null; period.updatedAt = new Date(); return period;
  }

  async update(id: number, input: { year: number; month: number; periodCode: string; startDate: Date; endDate: Date }, _actor: AccountingPeriodActor) {
    if ([...this.periods.values()].some((item) => item.id !== id && (item.year === input.year && item.month === input.month || item.startDate <= input.endDate && item.endDate >= input.startDate))) throw { code: "P2002" };
    const period = this.periods.get(id)!; Object.assign(period, input); period.updatedAt = new Date(); return period;
  }
}
