import { createHandler } from "@/lib/handler";
import { isAdminRequest, verifyAdmin } from "@/lib/auth";
import { ok } from "@/lib/utils";
import { sendJson, readJsonBody } from "@/lib/response";
import { HTTP } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import {
  slugParamSchema,
  mongoIdParamSchema,
  updatePostBodySchema,
} from "@/schemas/blog-api.schema";
import { toPostDto } from "@/types/blog-api";
import { asObjectId, isObjectId } from "@/types/documents/common";

export default createHandler(
  async (req, res, ctx) => {
    const repos = ctx.repos!;
    const slugParam = req.query.slug;
    const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

    if (!slug) {
      throw new NotFoundError("Post");
    }

    if (req.method === "GET") {
      const parsed = slugParamSchema.safeParse({ slug });
      if (!parsed.success) throw new NotFoundError("Post");

      const post = await repos.posts.findBySlugOrPrevious(parsed.data.slug);
      if (!post) throw new NotFoundError("Post");

      const isAdmin = await isAdminRequest(req, ctx.config);
      if (!isAdmin && !repos.posts.isPubliclyVisible(post)) {
        throw new NotFoundError("Post");
      }

      const meta =
        post.slug !== parsed.data.slug ? { redirect_slug: post.slug } : undefined;
      sendJson(res, HTTP.OK, ok(toPostDto(post), meta));
      return;
    }

    if ((req.method === "PUT" || req.method === "DELETE") && isObjectId(slug)) {
      await verifyAdmin(req, ctx.config);

      const idParsed = mongoIdParamSchema.safeParse({ id: slug });
      if (!idParsed.success) throw new NotFoundError("Post");

      if (req.method === "DELETE") {
        await repos.posts.delete(idParsed.data.id);
        res.status(HTTP.NO_CONTENT).end();
        return;
      }

      let body: unknown = req.body;
      if (body === undefined) {
        body = await readJsonBody(req);
      }
      const parsedBody = updatePostBodySchema.parse(body);
      const patch: Parameters<typeof repos.posts.update>[1] = {};

      if (parsedBody.title !== undefined) patch.title = parsedBody.title;
      if (parsedBody.slug !== undefined) patch.slug = parsedBody.slug;
      if (parsedBody.excerpt !== undefined) patch.excerpt = parsedBody.excerpt;
      if (parsedBody.content_markdown !== undefined) {
        patch.content_markdown = parsedBody.content_markdown;
      }
      if (parsedBody.featured_image !== undefined) patch.featured_image = parsedBody.featured_image;
      if (parsedBody.status !== undefined) patch.status = parsedBody.status;
      if (parsedBody.category_id !== undefined) {
        patch.category_id = parsedBody.category_id ? asObjectId(parsedBody.category_id) : null;
      }
      if (parsedBody.tag_ids !== undefined) {
        patch.tag_ids = parsedBody.tag_ids.map(asObjectId);
      }
      if (parsedBody.seo_title !== undefined) patch.seo_title = parsedBody.seo_title;
      if (parsedBody.seo_description !== undefined) {
        patch.seo_description = parsedBody.seo_description;
      }
      if (parsedBody.canonical_url !== undefined) patch.canonical_url = parsedBody.canonical_url;
      if (parsedBody.published_at !== undefined) {
        patch.published_at = parsedBody.published_at ? new Date(parsedBody.published_at) : null;
      }

      const post = await repos.posts.update(idParsed.data.id, patch);
      sendJson(res, HTTP.OK, ok(toPostDto(post)));
      return;
    }

    throw new NotFoundError("Post");
  },
  { methods: ["GET", "PUT", "DELETE"], mongo: true },
);
