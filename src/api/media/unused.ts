import { createHandler } from "@/lib/handler";
import { ok } from "@/lib/utils";
import { sendJson } from "@/lib/response";
import { HTTP } from "@/lib/constants";
import { createMediaService } from "@/services/media.service";

export default createHandler(
  async (_req, res, ctx) => {
    const repos = ctx.repos!;
    const mediaService = createMediaService(ctx.config, repos);
    const removed = await mediaService.deleteUnused();
    sendJson(res, HTTP.OK, ok({ removed }));
  },
  { methods: ["DELETE"], mongo: true, auth: true },
);
