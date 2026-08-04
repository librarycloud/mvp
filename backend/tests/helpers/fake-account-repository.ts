import type {
  AccountRepository,
  CreateAccountData,
  UpdateAccountData,
} from "../../src/modules/account/account.repository.js";
import type {
  AccountListFilter,
  AccountMutationContext,
  AccountRecord,
} from "../../src/modules/account/account.types.js";

export class FakeAccountRepository implements AccountRepository {
  accounts: AccountRecord[] = [];
  entryCounts = new Map<number, number>();

  async list(filter: AccountListFilter) {
    return this.accounts
      .filter((item) => !item.deletedAt)
      .filter((item) => filter.category === undefined || item.category === filter.category)
      .filter((item) => filter.isEnabled === undefined || item.isEnabled === filter.isEnabled)
      .filter(
        (item) =>
          !filter.keyword || item.code.includes(filter.keyword) || item.name.includes(filter.keyword),
      )
      .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));
  }

  async findById(id: number) {
    return this.accounts.find((item) => item.id === id && !item.deletedAt) ?? null;
  }

  async findByCode(code: string) {
    return this.accounts.find((item) => item.code === code) ?? null;
  }

  async countChildren(id: number) {
    return this.accounts.filter((item) => item.parentId === id && !item.deletedAt).length;
  }

  async countVoucherEntries(id: number) {
    return this.entryCounts.get(id) ?? 0;
  }

  async create(data: CreateAccountData, _context: AccountMutationContext) {
    const now = new Date();
    const account: AccountRecord = {
      id: this.accounts.length + 1,
      ...data,
      isLeaf: true,
      isEnabled: true,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.accounts.push(account);
    const parent = data.parentId ? await this.findById(data.parentId) : null;
    if (parent) parent.isLeaf = false;
    return account;
  }

  async update(current: AccountRecord, data: UpdateAccountData, _context: AccountMutationContext) {
    const oldParentId = current.parentId;
    Object.assign(current, data, { updatedAt: new Date() });
    if (data.parentId && data.parentId !== oldParentId) {
      const parent = await this.findById(data.parentId);
      if (parent) parent.isLeaf = false;
    }
    if (oldParentId && data.parentId !== undefined && data.parentId !== oldParentId) {
      const oldParent = await this.findById(oldParentId);
      if (oldParent && (await this.countChildren(oldParentId)) === 0) oldParent.isLeaf = true;
    }
    return current;
  }

  async softDelete(current: AccountRecord, _context: AccountMutationContext) {
    current.deletedAt = new Date();
    current.isEnabled = false;
    if (current.parentId) {
      const parent = await this.findById(current.parentId);
      if (parent && (await this.countChildren(parent.id)) === 0) parent.isLeaf = true;
    }
  }
}

export function accountFixture(overrides: Partial<AccountRecord> = {}): AccountRecord {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: 100,
    code: "1002",
    name: "银行存款",
    category: "ASSET",
    normalDirection: "DEBIT",
    parentId: null,
    level: 1,
    isLeaf: true,
    isEnabled: true,
    isSystem: true,
    cashFlowCode: null,
    sortOrder: 10,
    maintainedById: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}
