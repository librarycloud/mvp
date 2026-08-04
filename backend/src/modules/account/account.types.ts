export type AccountCategoryValue =
  | "ASSET"
  | "LIABILITY"
  | "COMMON"
  | "EQUITY"
  | "COST"
  | "PROFIT_AND_LOSS";
export type BalanceDirectionValue = "DEBIT" | "CREDIT";

export interface AccountRecord {
  id: number;
  code: string;
  name: string;
  category: AccountCategoryValue;
  normalDirection: BalanceDirectionValue;
  parentId: number | null;
  level: number;
  isLeaf: boolean;
  isEnabled: boolean;
  isSystem: boolean;
  cashFlowCode: string | null;
  sortOrder: number;
  maintainedById: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AccountTreeNode extends AccountRecord {
  children: AccountTreeNode[];
}

export interface AccountListFilter {
  keyword?: string;
  category?: AccountCategoryValue;
  isEnabled?: boolean;
}

export interface AccountMutationContext {
  actorId: number;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}
