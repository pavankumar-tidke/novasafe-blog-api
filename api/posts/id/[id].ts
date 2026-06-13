import { createHandler } from "@/lib/handler";
import { isAdminRequest } from "@/lib/auth";
import { ok } from "@/lib/utils";
import { sendJson } from "@/lib/response";
import { HTTP } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import { mongoIdParamSchema } from "@/schemas/blog-api.schema";
import { toPostDto } from "@/types/blog-api";

export default createHandler(
  async (req, res, ctx) => {
    const repos = ctx.repos!;
    const id = req.query.id;
    const parsed = mongoIdParamSchema.safeParse({ id: Array.isArray(id) ? id[0] : id });

    if (!parsed.success) {
      throw new NotFoundError("Post");
    }

    const post = await repos.posts.findById(parsed.data.id);
    if (!post) throw new NotFoundError("Post");

    const isAdmin = await isAdminRequest(req, ctx.config);
    if (!isAdmin && !repos.posts.isPubliclyVisible(post)) {
      throw new NotFoundError("Post");
    }

    sendJson(res, HTTP.OK, ok(toPostDto(post)));
  },
  { methods: ["GET"], mongo: true },
);
