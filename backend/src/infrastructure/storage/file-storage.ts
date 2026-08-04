import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface FileStorage {
  saveBankImport(
    extension: "xlsx" | "csv" | "json",
    hash: string,
    data: Buffer,
  ): Promise<{ storagePath: string; created: boolean }>;
  saveInvoiceImport(
    extension: "xml" | "ofd" | "pdf",
    hash: string,
    data: Buffer,
  ): Promise<{ storagePath: string; created: boolean }>;
  saveVoucherAttachment(
    extension: string,
    hash: string,
    data: Buffer,
  ): Promise<{ storagePath: string; created: boolean }>;
  read(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
}

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(
    root: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.root = path.resolve(root);
  }

  async saveBankImport(
    extension: "xlsx" | "csv" | "json",
    hash: string,
    data: Buffer,
  ): Promise<{ storagePath: string; created: boolean }> {
    return this.save("bank", extension, hash, data);
  }

  async saveInvoiceImport(
    extension: "xml" | "ofd" | "pdf",
    hash: string,
    data: Buffer,
  ): Promise<{ storagePath: string; created: boolean }> {
    return this.save("invoice", extension, hash, data);
  }

  async saveVoucherAttachment(extension: string, hash: string, data: Buffer) {
    return this.save("voucher", extension, hash, data);
  }

  private async save(
    area: "bank" | "invoice" | "voucher",
    extension: string,
    hash: string,
    data: Buffer,
  ) {
    const date = this.now();
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const relativePath = path.join(area, year, month, `${hash}.${extension}`);
    const absolutePath = path.resolve(this.root, relativePath);
    if (!absolutePath.startsWith(`${this.root}${path.sep}`)) throw new Error("Invalid storage path");
    await mkdir(path.dirname(absolutePath), { recursive: true });
    let created = true;
    await writeFile(absolutePath, data, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
      created = false;
    });
    return { storagePath: relativePath.replaceAll(path.sep, "/"), created };
  }

  async remove(storagePath: string): Promise<void> {
    const absolutePath = path.resolve(this.root, storagePath);
    if (!absolutePath.startsWith(`${this.root}${path.sep}`)) return;
    await rm(absolutePath, { force: true });
  }

  async read(storagePath: string): Promise<Buffer> {
    const absolutePath = path.resolve(this.root, storagePath);
    if (!absolutePath.startsWith(`${this.root}${path.sep}`)) throw new Error("Invalid storage path");
    return readFile(absolutePath);
  }
}
