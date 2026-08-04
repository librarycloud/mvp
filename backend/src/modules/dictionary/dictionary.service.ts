import { AppError } from "../../common/errors/app-error.js";
import type { DictionaryActor, DictionaryCategoryRecord, DictionaryRepository } from "./dictionary.types.js";

export class DictionaryService {
  private cache = new Map<string, DictionaryCategoryRecord>();
  constructor(private readonly repository: DictionaryRepository) {}
  async warmup() { await this.refresh(); }
  async refresh() { const categories = await this.repository.listAll(); this.cache = new Map(categories.map(category => [category.code, category])); }
  listCategories() { return [...this.cache.values()].map(({ items, ...category }) => ({ ...category, itemCount: items.length })); }
  getCategory(code: string) { const category = this.cache.get(code); if (!category) throw new AppError("DICTIONARY_CATEGORY_NOT_FOUND", "数据字典分类不存在", 404); return category; }
  getItems(code: string, includeDisabled = false) { const category = this.getCategory(code); if (!category.enabled && !includeDisabled) return []; return category.items.filter(item => includeDisabled || item.enabled); }
  async createCategory(input: { code: string; description?: string | null; sortOrder?: number; enabled?: boolean }, actor: DictionaryActor) { this.admin(actor); const code = this.code(input.code); const row = await this.repository.createCategory({ ...input, code }, actor); await this.refresh(); return row; }
  async updateCategory(id: number, input: { description?: string | null; sortOrder?: number; enabled?: boolean }, actor: DictionaryActor) { this.admin(actor); const row = await this.repository.updateCategory(id, input, actor); await this.refresh(); return row; }
  async createItem(categoryCode: string, input: { code: string; name: string; value: string; sortOrder?: number; color?: string | null; icon?: string | null; isDefault?: boolean; enabled?: boolean; remark?: string | null }, actor: DictionaryActor) { this.admin(actor); const category = this.getCategory(categoryCode); const row = await this.repository.createItem(category.id, { ...input, code: this.code(input.code), name: this.text(input.name, "名称"), value: this.text(input.value, "实际值"), sortOrder: input.sortOrder ?? 0, color: input.color ?? null, icon: input.icon ?? null, isDefault: input.isDefault ?? false, enabled: input.enabled ?? true, remark: input.remark ?? null }, actor); await this.refresh(); return row; }
  async updateItem(id: number, input: { name?: string; value?: string; sortOrder?: number; color?: string | null; icon?: string | null; isDefault?: boolean; enabled?: boolean; remark?: string | null }, actor: DictionaryActor) { this.admin(actor); const row = await this.repository.updateItem(id, { ...input, ...(input.name !== undefined ? { name: this.text(input.name, "名称") } : {}), ...(input.value !== undefined ? { value: this.text(input.value, "实际值") } : {}) }, actor); await this.refresh(); return row; }
  async removeItem(id: number, actor: DictionaryActor) { this.admin(actor); await this.repository.softDeleteItem(id, actor); await this.refresh(); }
  private admin(actor: DictionaryActor) { if (actor.role !== "ADMIN") throw new AppError("FORBIDDEN", "仅管理员可以维护数据字典", 403); }
  private code(value: string) { const code = value.trim(); if (!/^[A-Z0-9_]{1,64}$/i.test(code)) throw new AppError("INVALID_DICTIONARY_CODE", "字典编码仅支持字母、数字和下划线", 400); return code; }
  private text(value: string, label: string) { const text = value.trim(); if (!text || text.length > 255) throw new AppError("INVALID_DICTIONARY_VALUE", `${label}不能为空且长度不能超过255`, 400); return text; }
}
