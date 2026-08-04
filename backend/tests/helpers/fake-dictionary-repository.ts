import type { DictionaryActor, DictionaryCategoryRecord, DictionaryRepository } from "../../src/modules/dictionary/dictionary.types.js";
export class FakeDictionaryRepository implements DictionaryRepository {
  categories: DictionaryCategoryRecord[] = [{ id: 901, code: "voucher_status", description: "凭证状态", sortOrder: 1, enabled: true, items: [{ id: 902, categoryId: 901, code: "DRAFT", name: "草稿", value: "0", sortOrder: 1, color: null, icon: null, isDefault: true, enabled: true, remark: null }] }];
  async listAll() { return this.categories.map(category => ({ ...category, items: [...category.items] })); }
  async findCategory(code: string) { return this.categories.find(category => category.code === code) ?? null; }
  async createCategory(data: any, _actor: DictionaryActor) { const row = { id: this.categories.length + 1000, code: data.code, description: data.description ?? null, sortOrder: data.sortOrder ?? 0, enabled: data.enabled ?? true, items: [] }; this.categories.push(row); return row; }
  async updateCategory(id: number, data: any, _actor: DictionaryActor) { const row = this.categories.find(category => category.id === id)!; Object.assign(row, data); return row; }
  async createItem(categoryId: number, data: any, _actor: DictionaryActor) { const category = this.categories.find(item => item.id === categoryId)!; const row = { id: category.items.length + 2000, categoryId, ...data }; category.items.push(row); return row; }
  async updateItem(id: number, data: any, _actor: DictionaryActor) { for (const category of this.categories) { const item = category.items.find(row => row.id === id); if (item) { Object.assign(item, data); return item; } } throw new Error("missing"); }
  async softDeleteItem(id: number, _actor: DictionaryActor) { for (const category of this.categories) { const item = category.items.find(row => row.id === id); if (item) item.enabled = false; } }
}
