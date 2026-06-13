import { createHandler } from "@/lib/handler";
import { verifyAdmin } from "@/lib/auth";
import { ok } from "@/lib/utils";
import { sendJson, readJsonBody } from "@/lib/response";
import { HTTP } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import { createTagBodySchema } from "@/schemas/blog-api.schema";
import { toTagDto } from "@/types/blog-api";
import type { CreateTagInput } from "@/types/documents/tag";

export default createHandler(
  async (req, res, ctx) => {
    const repos = ctx.repos!;

    if (req.method === "GET") {
      const tags = await repos.tags.list();
      sendJson(res, HTTP.OK, ok(tags.map(toTagDto)));
      return;
    }

    if (req.method === "POST") {
      await verifyAdmin(req, ctx.config);
      let body: unknown = req.body;
      if (body === undefined) {
        body = await readJsonBody(req);
      }
      const parsed = createTagBodySchema.parse(body);
      const tag = await repos.tags.create({
        name: parsed.name,
        slug: parsed.slug ?? parsed.name.toLowerCase().replace(/\s+/g, "-"),
      } as CreateTagInput);
      sendJson(res, HTTP.CREATED, ok(toTagDto(tag)));
      return;
    }

    throw new NotFoundError("Route");
  },
  { methods: ["GET", "POST"], mongo: true, auth: false },
);
