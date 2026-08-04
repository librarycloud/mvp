import type { AuthRole } from "../auth/auth.types.js";

export interface AccountingPeriodActor {
  actorId: number;
  role: AuthRole;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AccountingPeriodRecord {
  id: number;
  year: number;
  month: number;
  periodCode: string;
  startDate: Date;
  endDate: Date;
  status: number;
  closedAt: Date | null;
  closedById: number | null;
}

export interface AccountingPeriodFilter {
  year?: number;
  status?: number;
}

export interface AccountingPeriodRepository {
  create(input: { year: number; month: number; periodCode: string; startDate: Date; endDate: Date }): Promise<unknown>;
  list(filter: AccountingPeriodFilter): Promise<unknown[]>;
  findById(id: number): Promise<AccountingPeriodRecord | null>;
  findByPostingDate(date: Date): Promise<AccountingPeriodRecord | null>;
  close(id: number, actor: AccountingPeriodActor): Promise<unknown>;
  reopen(id: number, actor: AccountingPeriodActor): Promise<unknown>;
  update(id: number, input: { year: number; month: number; periodCode: string; startDate: Date; endDate: Date }, actor: AccountingPeriodActor): Promise<unknown>;
}

export interface AccountingPeriodResolver {
  resolveOpenPeriod(postingDate: Date): Promise<AccountingPeriodRecord>;
  assertOpenPeriod(periodId: number): Promise<void>;
  assertVoucherOperation(periodId: number): Promise<void>;
}
