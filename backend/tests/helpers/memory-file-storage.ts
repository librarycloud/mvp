import type { FileStorage } from "../../src/infrastructure/storage/file-storage.js";

export class MemoryFileStorage implements FileStorage {
  files = new Map<string, Buffer>();
  removed: string[] = [];

  async saveBankImport(extension: "xlsx" | "csv" | "json", hash: string, data: Buffer) {
    return this.save("bank", extension, hash, data);
  }

  async saveInvoiceImport(extension: "xml" | "ofd", hash: string, data: Buffer) {
    return this.save("invoice", extension, hash, data);
  }

  async saveVoucherAttachment(extension: string, hash: string, data: Buffer) {
    return this.save("voucher", extension, hash, data);
  }

  private save(area: "bank" | "invoice" | "voucher", extension: string, hash: string, data: Buffer) {
    const storagePath = `${area}/${hash}.${extension}`;
    const created = !this.files.has(storagePath);
    this.files.set(storagePath, data);
    return Promise.resolve({ storagePath, created });
  }

  async remove(storagePath: string) {
    this.files.delete(storagePath);
    this.removed.push(storagePath);
  }

  async read(storagePath: string) {
    const data = this.files.get(storagePath);
    if (!data) throw new Error("File not found");
    return data;
  }
}
