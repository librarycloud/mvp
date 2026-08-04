import { describe, expect, it, vi } from "vitest";
import { PrismaAttachmentRepository } from "../src/modules/attachment-relation/attachment-relation.repository.js";

describe("PrismaAttachmentRepository", () => {
  it("serializes attachment sizes returned by source queries", async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: 3,
      sourceType: "Reimbursement",
      sourceId: 18,
      attachment: { id: 7, originalName: "receipt.pdf", size: 2048n },
    }]);
    const repository = new PrismaAttachmentRepository({ attachmentRelation: { findMany } } as any);

    const rows = await repository.listSource("Reimbursement", 18) as any[];

    expect(rows[0].attachment.size).toBe("2048");
    expect(() => JSON.stringify(rows)).not.toThrow();
  });
});
