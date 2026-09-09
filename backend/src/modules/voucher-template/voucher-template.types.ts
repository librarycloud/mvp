export interface VoucherTemplateEntryItem {
  id?: number | undefined;
  lineNo: number;
  accountId: number;
  accountCode?: string | undefined;
  accountName?: string | undefined;
  direction: "DEBIT" | "CREDIT";
  summary: string;
}

export interface VoucherTemplateItem {
  id: number;
  name: string;
  category: "SALARY" | "TAX" | "EXPENSE" | "FINANCE" | "COMMON";
  summary: string;
  description?: string | null | undefined;
  isBuiltIn?: boolean | undefined;
  entries: VoucherTemplateEntryItem[];
}

export interface CreateVoucherTemplateInput {
  name: string;
  category?: "SALARY" | "TAX" | "EXPENSE" | "FINANCE" | "COMMON";
  summary: string;
  description?: string;
  entries: Array<{
    lineNo: number;
    accountId: number;
    direction: "DEBIT" | "CREDIT";
    summary: string;
  }>;
}
