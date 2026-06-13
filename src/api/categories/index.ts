import { createHandler } from "@/lib/handler";
import { verifyAdmin } from "@/lib/auth";
import { ok } from "@/lib/utils";
import { sendJson, readJsonBody } from "@/lib/response";
import { HTTP } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import { createCategoryBodySchema } from "@/schemas/blog-api.schema";
import { toCategoryDto } from "@/types/blog-api";
import type { CreateCategoryInput } from "@/types/documents/category";

export default createHandler(
  async (req, res, ctx) => {
    const repos = ctx.repos!;

    if (req.method === "GET") {
      const categories = await repos.categories.list();
      sendJson(res, HTTP.OK, ok(categories.map(toCategoryDto)));
      return;
    }

    if (req.method === "POST") {
      await verifyAdmin(req, ctx.config);
      let body: unknown = req.body;
      if (body === undefined) {
        body = await readJsonBody(req);
      }
      const parsed = createCategoryBodySchema.parse(body);
      const category = await repos.categories.create({
        name: parsed.name,
        slug: parsed.slug ?? parsed.name.toLowerCase().replace(/\s+/g, "-"),
        description: parsed.description ?? null,
      } as CreateCategoryInput);
      sendJson(res, HTTP.CREATED, ok(toCategoryDto(category)));
      return;
    }

    throw new NotFoundError("Route");
  },
  { methods: ["GET", "POST"], mongo: true, auth: false },
);
