import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/http/response.js";
import type { AttachmentRelationService } from "./attachment-relation.service.js";
import type { AttachmentActor } from "./attachment-relation.types.js";
import type { IdParams, SourceParams, UploadQuery } from "./dto/attachment-relation.dto.js";

export class AttachmentRelationController {
  constructor(private readonly service: AttachmentRelationService) {}

  upload = async (request: FastifyRequest<{ Querystring: UploadQuery }>, reply: FastifyReply) => {
    const file = await request.file();
    if (!file) throw new AppError("ATTACHMENT_REQUIRED", "请选择附件", 400);
    return sendSuccess(reply, await this.service.uploadAndRelate(
      { originalName: file.filename, mimeType: file.mimetype, data: await file.toBuffer() },
      { ...request.query, relationType: request.query.relationType ?? "OTHER" },
      this.actor(request),
    ), "附件关联成功", 201);
  };

  listSource = async (request: FastifyRequest<{ Params: SourceParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.listSource(request.params.sourceType, request.params.sourceId, this.actor(request)));

  content = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    const file = await this.service.getContent(request.params.id, this.actor(request));
    const safeInlineTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "application/pdf"]);
    const inline = safeInlineTypes.has(file.mimeType);
    const extension = file.extension.replace(/[^a-z0-9]/gi, "") || "bin";
    const fallbackName = `attachment-${file.id}.${extension}`;
    return reply
      .header("content-type", inline ? file.mimeType : "application/octet-stream")
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "private, max-age=300")
      .header("content-disposition", `${inline ? "inline" : "attachment"}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`)
      .send(file.data);
  };

  listRelations = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await this.service.listRelations(request.params.id, this.actor(request)));

  unlink = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    await this.service.unlink(request.params.id, this.actor(request));
    return sendSuccess(reply, null, "附件关联已解除");
  };

  private actor(request: FastifyRequest): AttachmentActor {
    const userAgent = request.headers["user-agent"];
    return { actorId: Number(request.user.sub), role: request.user.role, requestId: request.id, ipAddress: request.ip, ...(userAgent ? { userAgent } : {}) };
  }
}
