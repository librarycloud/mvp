import { describe, expect, it } from "vitest"; import { AttachmentRelationService } from "../src/modules/attachment-relation/attachment-relation.service.js"; import { FakeAttachmentRepository } from "./helpers/fake-attachment-repository.js"; import { MemoryFileStorage } from "./helpers/memory-file-storage.js";
const actor={actorId:1,role:"ACCOUNTANT" as const}; const sourceA=101; const sourceB=102;
describe("AttachmentRelationService",()=>{
  it("deduplicates by SHA-256 and keeps the file until its last relation is removed",async()=>{const repo=new FakeAttachmentRepository();const service=new AttachmentRelationService(repo,new MemoryFileStorage());const file={originalName:"invoice.xml",mimeType:"text/xml",data:Buffer.from("same-file")};const first=await service.uploadAndRelate(file,{sourceType:"Voucher",sourceId:sourceA,relationType:"ORIGINAL"},actor);const second=await service.uploadAndRelate(file,{sourceType:"Invoice",sourceId:sourceB,relationType:"SOURCE"},actor);expect(second).toMatchObject({attachmentId:first.attachmentId,reused:true});await service.unlink((first.relation as any).id, actor);expect(repo.attachments.get(first.attachmentId).deleted).toBe(false);await service.unlink((second.relation as any).id, actor);expect(repo.attachments.get(first.attachmentId).deleted).toBe(true);});

  it("returns stored attachment content for preview", async () => {
    const repo = new FakeAttachmentRepository();
    const service = new AttachmentRelationService(repo, new MemoryFileStorage());
    const uploaded = await service.uploadAndRelate(
      { originalName: "receipt.png", mimeType: "image/png", data: Buffer.from("image-data") },
      { sourceType: "Reimbursement", sourceId: sourceA, relationType: "RECEIPT" },
      actor,
    );

    const file = await service.getContent(uploaded.attachmentId, actor);

    expect(file).toMatchObject({ originalName: "receipt.png", mimeType: "image/png" });
    expect(file.data.toString()).toBe("image-data");
  });
});
