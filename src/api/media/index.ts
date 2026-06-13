import { createHandler } from "@/lib/handler";
import { ok } from "@/lib/utils";
import { sendJson } from "@/lib/response";
import { parseQuery } from "@/lib/validation";
import { HTTP } from "@/lib/constants";
import { listPostsQuerySchema } from "@/schemas/blog-api.schema";
import { toMediaDto } from "@/types/blog-api";

export default createHandler(
  async (req, res, ctx) => {
    const repos = ctx.repos!;
    const query = parseQuery(req, listPostsQuerySchema);
    const result = await repos.media.list({}, { page: query.page, perPage: query.perPage });

    sendJson(
      res,
      HTTP.OK,
      ok(result.items.map(toMediaDto), {
        page: result.page,
        perPage: result.perPage,
        total: result.total,
        totalPages: result.totalPages,
      }),
    );
  },
  { methods: ["GET"], mongo: true, auth: true },
);
