import { createHandler } from "@/lib/handler";
import { verifyAdmin } from "@/lib/auth";
import { HTTP } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import { mongoIdParamSchema } from "@/schemas/blog-api.schema";
import { createMediaService } from "@/services/media.service";

export default createHandler(
  async (req, res, ctx) => {
    const repos = ctx.repos!;
    const idParam = req.query.id;
    const parsed = mongoIdParamSchema.safeParse({
      id: Array.isArray(idParam) ? idParam[0] : idParam,
    });

    if (!parsed.success) {
      throw new NotFoundError("Media");
    }

    const asset = await repos.media.findById(parsed.data.id);
    if (!asset) throw new NotFoundError("Media");

    const mediaService = createMediaService(ctx.config, repos);

    if (req.method === "GET") {
      const url = req.url ?? "";
      const searchParams = new URL(url, `https://${req.headers.host ?? "localhost"}`).searchParams;
      const transform = mediaService.parseTransformParams(searchParams);
      await mediaService.serve(asset, res, transform);
      return;
    }

    if (req.method === "DELETE") {
      await verifyAdmin(req, ctx.config);
      const force = req.query.force === "true";
      await mediaService.delete(parsed.data.id, { force });
      res.status(HTTP.NO_CONTENT).end();
      return;
    }

    throw new NotFoundError("Media");
  },
  { methods: ["GET", "DELETE"], mongo: true, auth: false },
);
