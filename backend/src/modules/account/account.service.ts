import { AppError } from "../../common/errors/app-error.js";
import type {
  AccountRepository,
  CreateAccountData,
  UpdateAccountData,
} from "./account.repository.js";
import type {
  AccountCategoryValue,
  AccountListFilter,
  AccountMutationContext,
  AccountRecord,
  AccountTreeNode,
  BalanceDirectionValue,
} from "./account.types.js";

export interface CreateAccountInput {
  code: string;
  name: string;
  category: AccountCategoryValue;
  normalDirection: BalanceDirectionValue;
  parentId?: number | null;
  cashFlowCode?: string | null;
  sortOrder?: number;
}

export interface UpdateAccountInput {
  code?: string;
  name?: string;
  category?: AccountCategoryValue;
  normalDirection?: BalanceDirectionValue;
  parentId?: number | null;
  isEnabled?: boolean;
  cashFlowCode?: string | null;
  sortOrder?: number;
}

export class AccountService {
  constructor(private readonly repository: AccountRepository) {}

  async list(filter: AccountListFilter, tree: true): Promise<AccountTreeNode[]>;
  async list(filter: AccountListFilter, tree: false): Promise<AccountRecord[]>;
  async list(filter: AccountListFilter, tree: boolean): Promise<AccountRecord[] | AccountTreeNode[]>;
  async list(filter: AccountListFilter, tree: boolean) {
    const accounts = await this.repository.list(filter);
    return tree ? this.buildTree(accounts) : accounts;
  }

  async getById(id: number): Promise<AccountRecord> {
    const account = await this.repository.findById(id);
    if (!account) throw new AppError("ACCOUNT_NOT_FOUND", "会计科目不存在", 404);
    return account;
  }

  async create(input: CreateAccountInput, context: AccountMutationContext) {
    const code = input.code.trim();
    const name = input.name.trim();
    this.ensureName(name);
    await this.ensureCodeAvailable(code);
    const parent = await this.getParent(input.parentId ?? null);
    this.validateParent(code, input.category, input.normalDirection, parent);

    const data: CreateAccountData = {
      code,
      name,
      category: input.category,
      normalDirection: input.normalDirection,
      parentId: parent?.id ?? null,
      level: parent ? parent.level + 1 : 1,
      cashFlowCode: input.cashFlowCode?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
      maintainedById: context.actorId,
    };
    return this.repository.create(data, context);
  }

  async update(id: number, input: UpdateAccountInput, context: AccountMutationContext) {
    const current = await this.getById(id);
    const childCount = await this.repository.countChildren(id);
    this.validateSystemChanges(current, input);
    if (childCount > 0 && (input.code !== undefined || input.parentId !== undefined)) {
      throw new AppError("ACCOUNT_HAS_CHILDREN", "存在下级科目时不能修改编码或上级科目", 409);
    }

    const code = input.code?.trim() ?? current.code;
    if (code !== current.code) await this.ensureCodeAvailable(code);
    const parent = input.parentId === undefined ? undefined : await this.getParent(input.parentId);
    if (parent?.id === current.id) {
      throw new AppError("INVALID_ACCOUNT_PARENT", "科目不能作为自己的上级科目", 400);
    }
    const category = input.category ?? current.category;
    const direction = input.normalDirection ?? current.normalDirection;
    const effectiveParent =
      input.parentId === undefined ? await this.getParent(current.parentId) : parent ?? null;
    this.validateParent(code, category, direction, effectiveParent);

    const data: UpdateAccountData = { maintainedById: context.actorId };
    if (input.code !== undefined) data.code = code;
    if (input.name !== undefined) {
      data.name = input.name.trim();
      this.ensureName(data.name);
    }
    if (input.category !== undefined) data.category = input.category;
    if (input.normalDirection !== undefined) data.normalDirection = input.normalDirection;
    if (input.parentId !== undefined) {
      data.parentId = parent?.id ?? null;
      data.level = parent ? parent.level + 1 : 1;
    }
    if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
    if (input.cashFlowCode !== undefined) data.cashFlowCode = input.cashFlowCode?.trim() || null;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    return this.repository.update(current, data, context);
  }

  async remove(id: number, context: AccountMutationContext): Promise<void> {
    const current = await this.getById(id);
    if (current.isSystem) throw new AppError("SYSTEM_ACCOUNT_PROTECTED", "系统内置科目不能删除", 409);
    if ((await this.repository.countChildren(id)) > 0) {
      throw new AppError("ACCOUNT_HAS_CHILDREN", "存在下级科目，不能删除", 409);
    }
    if ((await this.repository.countVoucherEntries(id)) > 0) {
      throw new AppError("ACCOUNT_IN_USE", "科目已被凭证使用，不能删除", 409);
    }
    await this.repository.softDelete(current, context);
  }

  private async ensureCodeAvailable(code: string): Promise<void> {
    if (await this.repository.findByCode(code)) {
      throw new AppError("ACCOUNT_CODE_EXISTS", "科目编码已存在", 409);
    }
  }

  private ensureName(name: string): void {
    if (!name) throw new AppError("INVALID_ACCOUNT_NAME", "科目名称不能为空", 400);
  }

  private async getParent(id: number | null | undefined): Promise<AccountRecord | null> {
    if (!id) return null;
    const parent = await this.repository.findById(id);
    if (!parent) throw new AppError("PARENT_ACCOUNT_NOT_FOUND", "上级科目不存在", 400);
    if (!parent.isEnabled) throw new AppError("PARENT_ACCOUNT_DISABLED", "上级科目已停用", 409);
    return parent;
  }

  private validateParent(
    code: string,
    category: AccountCategoryValue,
    direction: BalanceDirectionValue,
    parent: AccountRecord | null,
  ): void {
    if (!parent) return;
    if (!code.startsWith(parent.code) || code.length <= parent.code.length) {
      throw new AppError("INVALID_ACCOUNT_CODE", "明细科目编码必须以上级科目编码开头", 400);
    }
    if (category !== parent.category || direction !== parent.normalDirection) {
      throw new AppError("INVALID_ACCOUNT_CLASSIFICATION", "明细科目类别和余额方向必须与上级一致", 400);
    }
  }

  private validateSystemChanges(current: AccountRecord, input: UpdateAccountInput): void {
    if (!current.isSystem) return;
    const protectedChange =
      (input.code !== undefined && input.code.trim() !== current.code) ||
      (input.parentId !== undefined && input.parentId !== current.parentId) ||
      (input.category !== undefined && input.category !== current.category) ||
      (input.normalDirection !== undefined && input.normalDirection !== current.normalDirection);
    if (protectedChange) {
      throw new AppError("SYSTEM_ACCOUNT_PROTECTED", "系统内置科目的编码、层级和分类不能修改", 409);
    }
  }

  private buildTree(accounts: AccountRecord[]): AccountTreeNode[] {
    const nodes = new Map(accounts.map((item) => [item.id, { ...item, children: [] as AccountTreeNode[] }]));
    const roots: AccountTreeNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }
}
