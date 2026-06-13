import { createHandler } from "@/lib/handler";
import { isAdminRequest, verifyAdmin } from "@/lib/auth";
import { ok } from "@/lib/utils";
import { sendJson, readJsonBody } from "@/lib/response";
import { parseQuery } from "@/lib/validation";
import { HTTP } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import {
  createPostBodySchema,
  listPostsQuerySchema,
} from "@/schemas/blog-api.schema";
import { toPostDto } from "@/types/blog-api";
import { asObjectId } from "@/types/documents/common";
import type { CreatePostInput, ListPostsFilter } from "@/types/documents/post";

export default createHandler(
  async (req, res, ctx) => {
    const repos = ctx.repos!;

    if (req.method === "GET") {
      const query = parseQuery(req, listPostsQuerySchema);
      const isAdmin = await isAdminRequest(req, ctx.config);

      const pagination = { page: query.page, perPage: query.perPage };
      const filter: ListPostsFilter = {
        status: query.status,
        category_id: query.category_id ? asObjectId(query.category_id) : undefined,
        tag_id: query.tag_id ? asObjectId(query.tag_id) : undefined,
        author_id: query.author_id,
        q: query.q,
      };

      const result = isAdmin
        ? await repos.posts.list(filter, pagination)
        : await repos.posts.listPublished(filter, pagination);

      sendJson(
        res,
        HTTP.OK,
        ok(result.items.map(toPostDto), {
          page: result.page,
          perPage: result.perPage,
          total: result.total,
          totalPages: result.totalPages,
        }),
      );
      return;
    }

    if (req.method === "POST") {
      const admin = await verifyAdmin(req, ctx.config);
      let body: unknown = req.body;
      if (body === undefined) {
        body = await readJsonBody(req);
      }
      const parsed = createPostBodySchema.parse(body);

      const input = {
        title: parsed.title,
        excerpt: parsed.excerpt ?? null,
        content_markdown: parsed.content_markdown,
        featured_image: parsed.featured_image ?? null,
        status: parsed.status,
        category_id: parsed.category_id ? asObjectId(parsed.category_id) : null,
        tag_ids: (parsed.tag_ids ?? []).map(asObjectId),
        seo_title: parsed.seo_title ?? null,
        seo_description: parsed.seo_description ?? null,
        canonical_url: parsed.canonical_url ?? null,
        author: parsed.author ?? {
          id: admin.id,
          name: admin.email,
          email: admin.email,
        },
        published_at: parsed.published_at ? new Date(parsed.published_at) : null,
        ...(parsed.slug ? { slug: parsed.slug } : {}),
      } as CreatePostInput;

      const post = await repos.posts.create(input);
      sendJson(res, HTTP.CREATED, ok(toPostDto(post)));
      return;
    }

    throw new NotFoundError("Route");
  },
  { methods: ["GET", "POST"], auth: false, mongo: true },
);
