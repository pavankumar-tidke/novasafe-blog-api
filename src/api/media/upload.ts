import { createHandler } from "@/lib/handler";
import { ok } from "@/lib/utils";
import { sendJson } from "@/lib/response";
import { parseMultipartUpload } from "@/lib/multipart";
import { HTTP } from "@/lib/constants";
import { createMediaService } from "@/services/media.service";
import { toMediaDto } from "@/types/blog-api";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default createHandler(
  async (req, res, ctx) => {
    const repos = ctx.repos!;
    const admin = ctx.admin!;
    const upload = await parseMultipartUpload(req);
    const requestUrl = `https://${req.headers.host ?? "localhost"}${req.url ?? ""}`;

    const mediaService = createMediaService(ctx.config, repos);
    const media = await mediaService.upload(
      {
        buffer: upload.buffer,
        filename: upload.filename,
        mimeType: upload.mimeType,
        size: upload.buffer.length,
        altText: upload.altText,
      },
      admin,
      requestUrl,
    );

    sendJson(res, HTTP.CREATED, ok(toMediaDto(media)));
  },
  { methods: ["POST"], mongo: true, auth: true },
);
