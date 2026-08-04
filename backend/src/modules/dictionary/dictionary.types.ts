import type { AuthRole } from "../auth/auth.types.js";

export interface DictionaryActor { actorId: number; role: AuthRole; requestId?: string; ipAddress?: string; userAgent?: string; }
export interface DictionaryItemRecord { id: number; categoryId: number; code: string; name: string; value: string; sortOrder: number; color: string | null; icon: string | null; isDefault: boolean; enabled: boolean; remark: string | null; }
export interface DictionaryCategoryRecord { id: number; code: string; description: string | null; sortOrder: number; enabled: boolean; items: DictionaryItemRecord[]; }
export interface DictionaryRepository {
  listAll(): Promise<DictionaryCategoryRecord[]>;
  findCategory(code: string): Promise<DictionaryCategoryRecord | null>;
  createCategory(data: { code: string; description?: string | null; sortOrder?: number; enabled?: boolean }, actor: DictionaryActor): Promise<unknown>;
  updateCategory(id: number, data: { description?: string | null; sortOrder?: number; enabled?: boolean }, actor: DictionaryActor): Promise<unknown>;
  createItem(categoryId: number, data: Omit<DictionaryItemRecord, "id" | "categoryId">, actor: DictionaryActor): Promise<unknown>;
  updateItem(id: number, data: Partial<Omit<DictionaryItemRecord, "id" | "categoryId" | "code">>, actor: DictionaryActor): Promise<unknown>;
  softDeleteItem(id: number, actor: DictionaryActor): Promise<void>;
}
