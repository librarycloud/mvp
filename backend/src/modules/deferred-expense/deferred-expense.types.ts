export interface CreateDeferredExpenseInput {
  expenseNo: string;
  name: string;
  originalValue: string;
  usefulLifeMonths: number;
  startDate: string;
  department?: string;
  custodian?: string;
  expenseAccountId?: number;
}

export interface DeferredExpenseFilter {
  status?: number;
  keyword?: string;
}
