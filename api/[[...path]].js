// src/vercel-handler.ts
import { getRequestListener } from "@hono/node-server";

// src/app.ts
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { cors } from "hono/cors";

// src/lib/constants.ts
var HTTP = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503
};
var ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE"
};
var MEDIA_STORAGE_PREFIX = "media/";

// src/lib/errors.ts
var AppError = class extends Error {
  status;
  code;
  details;
  constructor(message, options = {}) {
    super(message);
    this.name = "AppError";
    this.status = options.status ?? HTTP.INTERNAL;
    this.code = options.code ?? ERROR_CODES.INTERNAL_ERROR;
    this.details = options.details;
  }
};
var NotImplementedError = class extends AppError {
  constructor(feature) {
    super(`${feature} is not implemented yet`, {
      status: HTTP.INTERNAL,
      code: ERROR_CODES.NOT_IMPLEMENTED
    });
    this.name = "NotImplementedError";
  }
};
var ValidationError = class extends AppError {
  constructor(message, details) {
    super(message, {
      status: HTTP.UNPROCESSABLE,
      code: ERROR_CODES.VALIDATION_ERROR,
      details
    });
    this.name = "ValidationError";
  }
};
var UnauthorizedError = class extends AppError {
  constructor(message = "Authentication required") {
    super(message, { status: HTTP.UNAUTHORIZED, code: ERROR_CODES.UNAUTHORIZED });
    this.name = "UnauthorizedError";
  }
};
var ForbiddenError = class extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, { status: HTTP.FORBIDDEN, code: ERROR_CODES.FORBIDDEN });
    this.name = "ForbiddenError";
  }
};
var NotFoundError = class extends AppError {
  constructor(resource) {
    super(`${resource} not found`, { status: HTTP.NOT_FOUND, code: ERROR_CODES.NOT_FOUND });
    this.name = "NotFoundError";
  }
};
var ConflictError = class extends AppError {
  constructor(message, details) {
    super(message, { status: HTTP.CONFLICT, code: ERROR_CODES.CONFLICT, details });
    this.name = "ConflictError";
  }
};
function isAppError(error) {
  return error instanceof AppError;
}

// src/lib/jwt.ts
import { SignJWT, jwtVerify } from "jose";
function secretKey(secret) {
  return new TextEncoder().encode(secret);
}
async function signAccessToken(config, claims) {
  const expiresIn = Number.parseInt(config.JWT_ACCESS_TTL_SECONDS, 10) || 3600;
  const now = Math.floor(Date.now() / 1e3);
  const token = await new SignJWT({
    email: claims.email,
    role: claims.role,
    type: "access"
  }).setProtectedHeader({ alg: "HS256" }).setSubject(claims.sub).setIssuer(config.JWT_ISSUER).setAudience(config.JWT_AUDIENCE).setIssuedAt(now).setExpirationTime(now + expiresIn).sign(secretKey(config.JWT_SECRET));
  return { token, expiresIn };
}
async function verifyAccessToken(config, token) {
  try {
    const { payload } = await jwtVerify(token, secretKey(config.JWT_SECRET), {
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE
    });
    if (payload.type !== "access" || typeof payload.sub !== "string") {
      return { valid: false, reason: "invalid" };
    }
    const email = typeof payload.email === "string" ? payload.email : "";
    const role = payload.role;
    if (role !== "super_admin" && role !== "admin" && role !== "editor") {
      return { valid: false, reason: "invalid" };
    }
    return {
      valid: true,
      claims: {
        sub: payload.sub,
        email,
        role,
        type: "access"
      }
    };
  } catch (error) {
    if (error instanceof Error && error.name === "JWTExpired") {
      return { valid: false, reason: "expired" };
    }
    return { valid: false, reason: "malformed" };
  }
}
function extractBearerToken(authorization) {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() || null;
}

// src/lib/auth.ts
async function verifyAdminFromHeader(authHeader, config) {
  const token = extractBearerToken(authHeader);
  if (!token) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }
  const result = await verifyAccessToken(config, token);
  if (!result.valid) {
    const message = result.reason === "expired" ? "Access token expired" : "Invalid access token";
    throw new UnauthorizedError(message);
  }
  return {
    id: result.claims.sub,
    email: result.claims.email,
    role: result.claims.role
  };
}
async function isAdminFromHeader(authHeader, config) {
  const token = extractBearerToken(authHeader);
  if (!token) return false;
  const result = await verifyAccessToken(config, token);
  return result.valid;
}

// src/lib/utils.ts
function ok(data, meta) {
  return meta ? { success: true, data, meta } : { success: true, data };
}
function slugify(input) {
  return input.trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
function newId() {
  return crypto.randomUUID();
}

// src/types/config.ts
function buildMongoUri(config) {
  const username = encodeURIComponent(config.MONGODB_USERNAME);
  const password = encodeURIComponent(config.MONGODB_PASSWORD);
  const host = config.MONGODB_HOST.trim().replace(/^mongodb(\+srv)?:\/\//, "").replace(/\/$/, "");
  const options = config.MONGODB_OPTIONS.trim();
  const query = options.startsWith("?") ? options : `?${options}`;
  return `mongodb+srv://${username}:${password}@${host}/${query}`;
}
function getConfig() {
  const required = (key, fallback) => {
    const value = process.env[key] ?? fallback;
    if (!value) throw new Error(`Missing required environment variable: ${key}`);
    return value;
  };
  return {
    ENVIRONMENT: process.env.ENVIRONMENT ?? "development",
    API_BASE_PATH: process.env.API_BASE_PATH ?? "/api",
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:8080,http://localhost:5173",
    JWT_SECRET: required("JWT_SECRET"),
    JWT_ISSUER: process.env.JWT_ISSUER ?? "novasafe-blog-api",
    JWT_AUDIENCE: process.env.JWT_AUDIENCE ?? "novasafe-blog-admin",
    JWT_ACCESS_TTL_SECONDS: process.env.JWT_ACCESS_TTL_SECONDS ?? "3600",
    MONGODB_USERNAME: required("MONGODB_USERNAME"),
    MONGODB_PASSWORD: required("MONGODB_PASSWORD"),
    MONGODB_HOST: required("MONGODB_HOST"),
    MONGODB_OPTIONS: process.env.MONGODB_OPTIONS ?? "retryWrites=true&w=majority",
    DATABASE_NAME: process.env.DATABASE_NAME ?? "blog_cms",
    SITE_URL: process.env.SITE_URL ?? "http://localhost:8080",
    SITE_NAME: process.env.SITE_NAME ?? "NovaSafe Blog",
    SITE_DESCRIPTION: process.env.SITE_DESCRIPTION ?? "Security insights and updates from the NovaSafe team.",
    MEDIA_MAX_BYTES: process.env.MEDIA_MAX_BYTES ?? "5242880",
    MEDIA_ALLOWED_MIME_TYPES: process.env.MEDIA_ALLOWED_MIME_TYPES ?? "image/jpeg,image/png,image/webp,image/gif,image/avif",
    MEDIA_STORAGE_PATH: process.env.MEDIA_STORAGE_PATH ?? "./uploads",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD
  };
}

// src/lib/mongodb.ts
import { MongoClient } from "mongodb";
function isMongoConfigured() {
  return Boolean(
    process.env.MONGODB_USERNAME?.trim() && process.env.MONGODB_PASSWORD?.trim() && process.env.MONGODB_HOST?.trim() && process.env.DATABASE_NAME?.trim()
  );
}
async function getMongoDatabase() {
  const config = getConfig();
  const uri = buildMongoUri(config);
  const { DATABASE_NAME } = config;
  if (!globalThis.__novasafeMongoCache) {
    const client = new MongoClient(uri);
    globalThis.__novasafeMongoCache = {
      client,
      db: client.db(DATABASE_NAME),
      connectPromise: client.connect()
    };
  }
  await globalThis.__novasafeMongoCache.connectPromise;
  return globalThis.__novasafeMongoCache.db;
}

// src/repositories/client/native-mongo.client.ts
import { MongoServerError } from "mongodb";

// src/repositories/client/errors.ts
var MongoClientError = class extends Error {
  status;
  code;
  constructor(message, options = {}) {
    super(message);
    this.name = "MongoClientError";
    this.status = options.status ?? 500;
    this.code = options.code ?? "MONGO_CLIENT_ERROR";
  }
};
var MongoNotFoundError = class extends MongoClientError {
  constructor(resource) {
    super(`${resource} not found`, { status: 404, code: "NOT_FOUND" });
    this.name = "MongoNotFoundError";
  }
};
var MongoDuplicateKeyError = class extends MongoClientError {
  constructor(field) {
    super(`Duplicate value for ${field}`, { status: 409, code: "DUPLICATE_KEY" });
    this.name = "MongoDuplicateKeyError";
  }
};

// src/repositories/client/native-mongo.client.ts
var NativeMongoClient = class {
  constructor(db) {
    this.db = db;
  }
  collection(name) {
    return this.db.collection(name);
  }
  async findOne(collection, filter, projection) {
    try {
      const doc = await this.collection(collection).findOne(filter, {
        ...projection ? { projection } : {}
      });
      return doc ?? null;
    } catch (error) {
      throw this.wrapError(error);
    }
  }
  async findMany(collection, options = {}) {
    try {
      let cursor = this.collection(collection).find(options.filter ?? {});
      if (options.projection) {
        cursor = cursor.project(options.projection);
      }
      if (options.sort) {
        cursor = cursor.sort(options.sort);
      }
      if (options.skip !== void 0) {
        cursor = cursor.skip(options.skip);
      }
      if (options.limit !== void 0) {
        cursor = cursor.limit(options.limit);
      }
      const docs = await cursor.toArray();
      return docs;
    } catch (error) {
      throw this.wrapError(error);
    }
  }
  async insertOne(collection, document) {
    try {
      const result = await this.collection(collection).insertOne(document);
      const insertedId = result.insertedId;
      return {
        insertedId: typeof insertedId === "string" ? insertedId : insertedId?.toString?.() ?? String(insertedId)
      };
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11e3) {
        throw new MongoDuplicateKeyError("unique index");
      }
      throw this.wrapError(error);
    }
  }
  async updateOne(collection, filter, update) {
    try {
      const result = await this.collection(collection).updateOne(filter, update);
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      throw this.wrapError(error);
    }
  }
  async deleteOne(collection, filter) {
    try {
      const result = await this.collection(collection).deleteOne(filter);
      return { deletedCount: result.deletedCount };
    } catch (error) {
      throw this.wrapError(error);
    }
  }
  async countDocuments(collection, filter = {}) {
    try {
      return await this.collection(collection).countDocuments(filter);
    } catch (error) {
      throw this.wrapError(error);
    }
  }
  wrapError(error) {
    if (error instanceof MongoClientError) return error;
    if (error instanceof Error) {
      return new MongoClientError(error.message);
    }
    return new MongoClientError("MongoDB operation failed");
  }
};
function createNativeMongoClient(db) {
  return new NativeMongoClient(db);
}

// src/repositories/indexes.ts
var COLLECTIONS = {
  POSTS: "posts",
  CATEGORIES: "categories",
  TAGS: "tags",
  MEDIA: "media"
};
var MONGODB_INDEXES = [
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_slug_unique",
    key: { slug: 1 },
    unique: true
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_status_published_at",
    key: { status: 1, published_at: -1 }
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_category_id",
    key: { category_id: 1 },
    sparse: true
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_tag_ids",
    key: { tag_ids: 1 }
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_author_id",
    key: { "author.id": 1 }
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_created_at",
    key: { created_at: -1 }
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_previous_slugs",
    key: { previous_slugs: 1 }
  },
  {
    collection: COLLECTIONS.POSTS,
    name: "posts_title_text",
    key: { title: "text", excerpt: "text", content_markdown: "text" }
  },
  {
    collection: COLLECTIONS.CATEGORIES,
    name: "categories_slug_unique",
    key: { slug: 1 },
    unique: true
  },
  {
    collection: COLLECTIONS.CATEGORIES,
    name: "categories_name",
    key: { name: 1 }
  },
  {
    collection: COLLECTIONS.TAGS,
    name: "tags_slug_unique",
    key: { slug: 1 },
    unique: true
  },
  {
    collection: COLLECTIONS.TAGS,
    name: "tags_name",
    key: { name: 1 }
  },
  {
    collection: COLLECTIONS.MEDIA,
    name: "media_uploaded_at",
    key: { uploaded_at: -1 }
  },
  {
    collection: COLLECTIONS.MEDIA,
    name: "media_mime_type",
    key: { mime_type: 1 }
  },
  {
    collection: COLLECTIONS.MEDIA,
    name: "media_filename",
    key: { filename: 1 }
  }
];

// src/types/schemas/category.schema.ts
import { z as z2 } from "zod";

// src/types/schemas/common.schema.ts
import { z } from "zod";

// src/types/documents/common.ts
var OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;
function asObjectId(value) {
  return value;
}

// src/types/schemas/common.schema.ts
var objectIdSchema = z.string().regex(OBJECT_ID_REGEX, "Invalid ObjectId");
var slugSchema = z.string().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens");
var urlSchema = z.string().url().max(2048);
var paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20)
});
var postAuthorSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320).optional()
});
var postStatusSchema = z.enum(["draft", "published", "scheduled", "archived"]);
var isoDateSchema = z.coerce.date();
var isoDateStringSchema = z.string().datetime();

// src/types/schemas/category.schema.ts
var createCategorySchema = z2.object({
  name: z2.string().min(1).max(120),
  slug: slugSchema.optional(),
  description: z2.string().max(500).nullable().optional()
});
var updateCategorySchema = createCategorySchema.partial();
var categoryDocumentSchema = createCategorySchema.extend({
  _id: objectIdSchema,
  created_at: isoDateSchema
});

// src/repositories/helpers.ts
var DATE_FIELDS = /* @__PURE__ */ new Set([
  "created_at",
  "updated_at",
  "published_at",
  "uploaded_at"
]);
function newObjectId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function serializeDoc(doc) {
  const out = { ...doc };
  for (const [key, value] of Object.entries(out)) {
    if (DATE_FIELDS.has(key)) {
      out[key] = coerceDate(value);
      continue;
    }
    if (value && typeof value === "object" && "$date" in value) {
      out[key] = new Date(String(value.$date));
    }
  }
  return out;
}
function coerceDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  if (typeof value === "object" && "$date" in value) {
    return new Date(String(value.$date));
  }
  return null;
}
function withTimestamps(patch) {
  return { ...patch, updated_at: /* @__PURE__ */ new Date() };
}
function toPaginated(items, total, pagination) {
  return {
    items,
    total,
    page: pagination.page,
    perPage: pagination.perPage,
    totalPages: Math.ceil(total / pagination.perPage) || 0
  };
}

// src/repositories/categories.repository.ts
var CategoriesRepository = class {
  constructor(client) {
    this.client = client;
  }
  async findById(id) {
    const doc = await this.client.findOne(COLLECTIONS.CATEGORIES, { _id: id });
    return doc ? serializeDoc(doc) : null;
  }
  async findBySlug(slug) {
    const doc = await this.client.findOne(COLLECTIONS.CATEGORIES, { slug });
    return doc ? serializeDoc(doc) : null;
  }
  async list() {
    const docs = await this.client.findMany(COLLECTIONS.CATEGORIES, {
      sort: { name: 1 }
    });
    return docs.map(serializeDoc);
  }
  async create(input) {
    const parsed = createCategorySchema.parse(input);
    const document = {
      _id: input._id ?? newObjectId(),
      name: parsed.name,
      slug: parsed.slug ?? parsed.name.toLowerCase().replace(/\s+/g, "-"),
      description: parsed.description ?? null,
      created_at: /* @__PURE__ */ new Date()
    };
    try {
      await this.client.insertOne(COLLECTIONS.CATEGORIES, document);
    } catch (error) {
      if (error instanceof Error && /duplicate/i.test(error.message)) {
        throw new MongoDuplicateKeyError("slug");
      }
      throw error;
    }
    return document;
  }
  async update(id, input) {
    const parsed = updateCategorySchema.parse(input);
    const result = await this.client.updateOne(
      COLLECTIONS.CATEGORIES,
      { _id: id },
      { $set: parsed }
    );
    if (result.matchedCount === 0) throw new MongoNotFoundError("Category");
    const updated = await this.findById(id);
    if (!updated) throw new MongoNotFoundError("Category");
    return updated;
  }
  async delete(id) {
    const result = await this.client.deleteOne(COLLECTIONS.CATEGORIES, { _id: id });
    if (result.deletedCount === 0) throw new MongoNotFoundError("Category");
  }
};

// src/types/schemas/media.schema.ts
import { z as z3 } from "zod";
var mimeTypeSchema = z3.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/i, "Invalid MIME type").max(100);
var createMediaSchema = z3.object({
  filename: z3.string().min(1).max(255),
  original_name: z3.string().min(1).max(255),
  r2_key: z3.string().min(1).max(512),
  url: urlSchema,
  mime_type: mimeTypeSchema,
  size: z3.number().int().positive().max(52428800),
  width: z3.number().int().positive().nullable().optional(),
  height: z3.number().int().positive().nullable().optional(),
  alt_text: z3.string().max(500).nullable().optional(),
  uploaded_by: z3.string().min(1).max(128)
});
var updateMediaSchema = createMediaSchema.partial();
var listMediaFilterSchema = paginationSchema.extend({
  mime_type: mimeTypeSchema.optional()
});
var mediaDocumentSchema = createMediaSchema.extend({
  _id: objectIdSchema,
  uploaded_at: isoDateSchema
});

// src/repositories/media.repository.ts
var MediaRepository = class {
  constructor(client) {
    this.client = client;
  }
  async findById(id) {
    const doc = await this.client.findOne(COLLECTIONS.MEDIA, { _id: id });
    return doc ? serializeDoc(doc) : null;
  }
  async list(filter, pagination) {
    const mongoFilter = {};
    if (filter.mime_type) mongoFilter.mime_type = filter.mime_type;
    const skip = (pagination.page - 1) * pagination.perPage;
    const [items, total] = await Promise.all([
      this.client.findMany(COLLECTIONS.MEDIA, {
        filter: mongoFilter,
        sort: { uploaded_at: -1 },
        skip,
        limit: pagination.perPage
      }),
      this.client.countDocuments(COLLECTIONS.MEDIA, mongoFilter)
    ]);
    return toPaginated(items.map(serializeDoc), total, pagination);
  }
  async create(input) {
    const parsed = createMediaSchema.parse(input);
    const document = {
      _id: input._id ?? newObjectId(),
      filename: parsed.filename,
      original_name: parsed.original_name,
      r2_key: parsed.r2_key,
      url: parsed.url,
      mime_type: parsed.mime_type,
      size: parsed.size,
      width: parsed.width ?? null,
      height: parsed.height ?? null,
      alt_text: parsed.alt_text ?? null,
      uploaded_by: parsed.uploaded_by,
      uploaded_at: input.uploaded_at ?? /* @__PURE__ */ new Date()
    };
    await this.client.insertOne(COLLECTIONS.MEDIA, document);
    return document;
  }
  async update(id, input) {
    const parsed = updateMediaSchema.parse(input);
    const result = await this.client.updateOne(COLLECTIONS.MEDIA, { _id: id }, { $set: parsed });
    if (result.matchedCount === 0) throw new MongoNotFoundError("Media");
    const updated = await this.findById(id);
    if (!updated) throw new MongoNotFoundError("Media");
    return updated;
  }
  async delete(id) {
    const result = await this.client.deleteOne(COLLECTIONS.MEDIA, { _id: id });
    if (result.deletedCount === 0) throw new MongoNotFoundError("Media");
  }
};

// src/types/schemas/post.schema.ts
import { z as z4 } from "zod";
var createPostSchema = z4.object({
  title: z4.string().min(1).max(300),
  slug: slugSchema.optional(),
  previous_slugs: z4.array(slugSchema).max(50).default([]),
  excerpt: z4.string().max(500).nullable().optional(),
  content_markdown: z4.string().max(5e5).default(""),
  featured_image: z4.string().max(2048).nullable().optional(),
  status: postStatusSchema.default("draft"),
  category_id: objectIdSchema.nullable().optional(),
  tag_ids: z4.array(objectIdSchema).max(50).default([]),
  seo_title: z4.string().max(70).nullable().optional(),
  seo_description: z4.string().max(160).nullable().optional(),
  canonical_url: urlSchema.nullable().optional(),
  author: postAuthorSchema,
  published_at: isoDateSchema.nullable().optional()
});
var updatePostSchema = createPostSchema.partial();
var listPostsFilterSchema = paginationSchema.extend({
  status: postStatusSchema.optional(),
  category_id: objectIdSchema.optional(),
  tag_id: objectIdSchema.optional(),
  author_id: z4.string().max(128).optional(),
  q: z4.string().max(200).optional()
});
var postDocumentSchema = createPostSchema.extend({
  _id: objectIdSchema,
  created_at: isoDateSchema,
  updated_at: isoDateSchema
});

// src/lib/slug.ts
var RESERVED_SLUGS = /* @__PURE__ */ new Set([
  "api",
  "auth",
  "admin",
  "blog",
  "editor",
  "posts",
  "media",
  "settings",
  "seo",
  "analytics",
  "team",
  "health",
  "id",
  "upload"
]);
function normalizeSlug(input) {
  const slug = slugify(input);
  if (!slug) {
    throw new ValidationError("Slug cannot be empty");
  }
  return slug;
}
function assertSlugAllowed(slug) {
  if (RESERVED_SLUGS.has(slug)) {
    throw new ValidationError(`Slug "${slug}" is reserved`, { reserved: [...RESERVED_SLUGS] });
  }
}
function slugFromTitle(title) {
  return normalizeSlug(title);
}

// src/lib/post-visibility.ts
function isPostPubliclyVisible(post, now = /* @__PURE__ */ new Date()) {
  if (post.status === "draft" || post.status === "archived") return false;
  if (post.status === "published") {
    if (post.published_at && post.published_at > now) return false;
    return true;
  }
  if (post.status === "scheduled") {
    return post.published_at !== null && post.published_at <= now;
  }
  return false;
}

// src/repositories/posts.repository.ts
var PostsRepository = class {
  constructor(client) {
    this.client = client;
  }
  async findById(id) {
    const doc = await this.client.findOne(COLLECTIONS.POSTS, { _id: id });
    return doc ? serializeDoc(doc) : null;
  }
  async findBySlug(slug) {
    const doc = await this.client.findOne(COLLECTIONS.POSTS, { slug });
    return doc ? serializeDoc(doc) : null;
  }
  async findBySlugOrPrevious(slug) {
    const direct = await this.findBySlug(slug);
    if (direct) return direct;
    const doc = await this.client.findOne(COLLECTIONS.POSTS, {
      previous_slugs: slug
    });
    return doc ? serializeDoc(doc) : null;
  }
  async countMediaReferences(mediaId, publicUrl) {
    const needle = `/media/${mediaId}`;
    const filter = {
      $or: [
        { featured_image: { $regex: needle } },
        { featured_image: publicUrl },
        { content_markdown: { $regex: needle } },
        { content_markdown: { $regex: publicUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } }
      ]
    };
    return this.client.countDocuments(COLLECTIONS.POSTS, filter);
  }
  async list(filter, pagination) {
    return this.query(filter, pagination);
  }
  async listPublished(filter, pagination) {
    const now = /* @__PURE__ */ new Date();
    const mongoFilter = {
      $or: [
        { status: "published", $or: [{ published_at: null }, { published_at: { $lte: now } }] },
        { status: "scheduled", published_at: { $lte: now } }
      ]
    };
    if (filter.category_id) mongoFilter.category_id = filter.category_id;
    if (filter.tag_id) mongoFilter.tag_ids = filter.tag_id;
    if (filter.author_id) mongoFilter["author.id"] = filter.author_id;
    if (filter.q) mongoFilter.$text = { $search: filter.q };
    const skip = (pagination.page - 1) * pagination.perPage;
    const [items, total] = await Promise.all([
      this.client.findMany(COLLECTIONS.POSTS, {
        filter: mongoFilter,
        sort: { published_at: -1, created_at: -1 },
        skip,
        limit: pagination.perPage
      }),
      this.client.countDocuments(COLLECTIONS.POSTS, mongoFilter)
    ]);
    return toPaginated(items.map(serializeDoc), total, pagination);
  }
  async query(filter, pagination, extraFilter = {}) {
    const mongoFilter = { ...extraFilter };
    if (filter.status) mongoFilter.status = filter.status;
    if (filter.category_id) mongoFilter.category_id = filter.category_id;
    if (filter.tag_id) mongoFilter.tag_ids = filter.tag_id;
    if (filter.author_id) mongoFilter["author.id"] = filter.author_id;
    if (filter.q) mongoFilter.$text = { $search: filter.q };
    const skip = (pagination.page - 1) * pagination.perPage;
    const [items, total] = await Promise.all([
      this.client.findMany(COLLECTIONS.POSTS, {
        filter: mongoFilter,
        sort: { created_at: -1 },
        skip,
        limit: pagination.perPage
      }),
      this.client.countDocuments(COLLECTIONS.POSTS, mongoFilter)
    ]);
    return toPaginated(items.map(serializeDoc), total, pagination);
  }
  async slugTaken(slug, excludeId) {
    const existing = await this.findBySlug(slug);
    if (existing && existing._id !== excludeId) return true;
    const redirected = await this.client.findOne(COLLECTIONS.POSTS, {
      previous_slugs: slug,
      ...excludeId ? { _id: { $ne: excludeId } } : {}
    });
    return Boolean(redirected);
  }
  async resolveUniqueSlug(desired, excludeId) {
    const base = normalizeSlug(desired);
    assertSlugAllowed(base);
    let candidate = base;
    let counter = 2;
    while (await this.slugTaken(candidate, excludeId)) {
      candidate = `${base}-${counter}`;
      assertSlugAllowed(candidate);
      counter += 1;
    }
    return candidate;
  }
  async create(input) {
    const parsed = createPostSchema.parse(input);
    const now = /* @__PURE__ */ new Date();
    const _id = input._id ?? newObjectId();
    const baseSlug = parsed.slug ? normalizeSlug(parsed.slug) : slugFromTitle(parsed.title);
    const slug = await this.resolveUniqueSlug(baseSlug);
    const document = {
      ...parsed,
      _id,
      slug,
      previous_slugs: parsed.previous_slugs ?? [],
      excerpt: parsed.excerpt ?? null,
      featured_image: parsed.featured_image ?? null,
      category_id: parsed.category_id ?? null,
      tag_ids: parsed.tag_ids ?? [],
      seo_title: parsed.seo_title ?? null,
      seo_description: parsed.seo_description ?? null,
      canonical_url: parsed.canonical_url ?? null,
      published_at: parsed.published_at ?? null,
      created_at: now,
      updated_at: now
    };
    try {
      await this.client.insertOne(COLLECTIONS.POSTS, document);
    } catch (error) {
      if (error instanceof Error && /duplicate/i.test(error.message)) {
        throw new MongoDuplicateKeyError("slug");
      }
      throw error;
    }
    return document;
  }
  async update(id, input) {
    const parsed = updatePostSchema.parse(input);
    const existing = await this.findById(id);
    if (!existing) throw new MongoNotFoundError("Post");
    const patch = { ...parsed };
    if (parsed.slug !== void 0 && parsed.slug !== existing.slug) {
      const nextSlug = await this.resolveUniqueSlug(parsed.slug, id);
      patch.slug = nextSlug;
      const previous = [...existing.previous_slugs ?? []];
      if (!previous.includes(existing.slug)) {
        previous.push(existing.slug);
      }
      patch.previous_slugs = previous;
    }
    const result = await this.client.updateOne(
      COLLECTIONS.POSTS,
      { _id: id },
      { $set: withTimestamps(patch) }
    );
    if (result.matchedCount === 0) throw new MongoNotFoundError("Post");
    const updated = await this.findById(id);
    if (!updated) throw new MongoNotFoundError("Post");
    return updated;
  }
  async delete(id) {
    const result = await this.client.deleteOne(COLLECTIONS.POSTS, { _id: id });
    if (result.deletedCount === 0) throw new MongoNotFoundError("Post");
  }
  isPubliclyVisible(post) {
    return isPostPubliclyVisible(post);
  }
};

// src/types/schemas/tag.schema.ts
import { z as z5 } from "zod";
var createTagSchema = z5.object({
  name: z5.string().min(1).max(80),
  slug: slugSchema.optional()
});
var updateTagSchema = createTagSchema.partial();
var tagDocumentSchema = createTagSchema.extend({
  _id: objectIdSchema,
  created_at: isoDateSchema
});

// src/repositories/tags.repository.ts
var TagsRepository = class {
  constructor(client) {
    this.client = client;
  }
  async findById(id) {
    const doc = await this.client.findOne(COLLECTIONS.TAGS, { _id: id });
    return doc ? serializeDoc(doc) : null;
  }
  async findBySlug(slug) {
    const doc = await this.client.findOne(COLLECTIONS.TAGS, { slug });
    return doc ? serializeDoc(doc) : null;
  }
  async list() {
    const docs = await this.client.findMany(COLLECTIONS.TAGS, {
      sort: { name: 1 }
    });
    return docs.map(serializeDoc);
  }
  async create(input) {
    const parsed = createTagSchema.parse(input);
    const document = {
      _id: input._id ?? newObjectId(),
      name: parsed.name,
      slug: parsed.slug ?? parsed.name.toLowerCase().replace(/\s+/g, "-"),
      created_at: /* @__PURE__ */ new Date()
    };
    try {
      await this.client.insertOne(COLLECTIONS.TAGS, document);
    } catch (error) {
      if (error instanceof Error && /duplicate/i.test(error.message)) {
        throw new MongoDuplicateKeyError("slug");
      }
      throw error;
    }
    return document;
  }
  async update(id, input) {
    const parsed = updateTagSchema.parse(input);
    const result = await this.client.updateOne(COLLECTIONS.TAGS, { _id: id }, { $set: parsed });
    if (result.matchedCount === 0) throw new MongoNotFoundError("Tag");
    const updated = await this.findById(id);
    if (!updated) throw new MongoNotFoundError("Tag");
    return updated;
  }
  async delete(id) {
    const result = await this.client.deleteOne(COLLECTIONS.TAGS, { _id: id });
    if (result.deletedCount === 0) throw new MongoNotFoundError("Tag");
  }
};

// src/repositories/index.ts
function createMongoRepositories(client) {
  return {
    posts: new PostsRepository(client),
    categories: new CategoriesRepository(client),
    tags: new TagsRepository(client),
    media: new MediaRepository(client)
  };
}

// src/repositories/factory.ts
async function getRepositories() {
  const db = await getMongoDatabase();
  return createMongoRepositories(createNativeMongoClient(db));
}

// src/middleware/requireMongo.ts
var ServiceUnavailableError = class extends AppError {
  constructor(message = "MongoDB is not configured") {
    super(message, { status: HTTP.SERVICE_UNAVAILABLE, code: ERROR_CODES.SERVICE_UNAVAILABLE });
    this.name = "ServiceUnavailableError";
  }
};
async function requireMongo() {
  if (!isMongoConfigured()) {
    throw new ServiceUnavailableError();
  }
  try {
    return await getRepositories();
  } catch (error) {
    if (error instanceof ServiceUnavailableError) throw error;
    throw new ServiceUnavailableError(
      error instanceof Error ? error.message : "MongoDB connection failed"
    );
  }
}

// src/schemas/auth.schema.ts
import { z as z6 } from "zod";
var loginBodySchema = z6.object({
  email: z6.string().email().max(320),
  password: z6.string().min(8).max(128)
});
var refreshBodySchema = z6.object({
  refreshToken: z6.string().min(1).optional()
});

// src/schemas/blog-api.schema.ts
import { z as z7 } from "zod";
var mongoIdParamSchema = z7.object({
  id: objectIdSchema
});
var slugParamSchema = z7.object({
  slug: slugSchema
});
var createPostBodySchema = z7.object({
  title: z7.string().min(1).max(300),
  slug: slugSchema.optional(),
  excerpt: z7.string().max(500).nullable().optional(),
  content_markdown: z7.string().max(5e5).default(""),
  featured_image: z7.string().max(2048).nullable().optional(),
  status: postStatusSchema.default("draft"),
  category_id: objectIdSchema.nullable().optional(),
  tag_ids: z7.array(objectIdSchema).max(50).default([]),
  seo_title: z7.string().max(70).nullable().optional(),
  seo_description: z7.string().max(160).nullable().optional(),
  canonical_url: urlSchema.nullable().optional(),
  author: postAuthorSchema.optional(),
  published_at: z7.string().datetime().nullable().optional()
});
var updatePostBodySchema = createPostBodySchema.partial();
var listPostsQuerySchema = paginationSchema.extend({
  status: postStatusSchema.optional(),
  category_id: objectIdSchema.optional(),
  category: objectIdSchema.optional(),
  tag_id: objectIdSchema.optional(),
  author_id: z7.string().max(128).optional(),
  q: z7.string().max(200).optional(),
  limit: z7.coerce.number().int().min(1).max(100).optional()
}).transform((data) => ({
  page: data.page,
  perPage: data.limit ?? data.perPage,
  status: data.status,
  category_id: data.category_id ?? data.category,
  tag_id: data.tag_id,
  author_id: data.author_id,
  q: data.q
}));
var createCategoryBodySchema = z7.object({
  name: z7.string().min(1).max(120),
  slug: slugSchema.optional(),
  description: z7.string().max(500).nullable().optional()
});
var createTagBodySchema = z7.object({
  name: z7.string().min(1).max(80),
  slug: slugSchema.optional()
});

// src/services/auth.service.ts
var AuthService = class {
  constructor(config) {
    this.config = config;
  }
  async login(input) {
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = this.config;
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      if (input.email !== ADMIN_EMAIL || input.password !== ADMIN_PASSWORD) {
        throw new UnauthorizedError("Invalid email or password");
      }
      return this.issueAccessToken({
        id: newId(),
        email: ADMIN_EMAIL,
        role: "super_admin"
      });
    }
    throw new NotImplementedError("AuthService.login");
  }
  async issueAccessToken(admin) {
    const { token } = await signAccessToken(this.config, {
      sub: admin.id,
      email: admin.email,
      role: admin.role
    });
    return {
      accessToken: token,
      user: {
        id: admin.id,
        email: admin.email,
        displayName: null,
        role: admin.role
      }
    };
  }
  assertAdminConfigured() {
    if (!this.config.ADMIN_EMAIL || !this.config.ADMIN_PASSWORD) {
      throw new ForbiddenError("Admin login is not configured");
    }
  }
};
function createAuthService(config) {
  return new AuthService(config);
}

// src/services/media/provider.ts
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
var LocalMediaProvider = class {
  constructor(basePath) {
    this.basePath = basePath;
  }
  resolvePath(key) {
    return join(this.basePath, key);
  }
  async put(key, data, _mimeType) {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }
  async get(key) {
    try {
      const buffer = await readFile(this.resolvePath(key));
      const ext = key.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = guessMimeType(ext);
      return { buffer, mimeType };
    } catch {
      return null;
    }
  }
  async delete(key) {
    try {
      await unlink(this.resolvePath(key));
    } catch {
    }
  }
};
function guessMimeType(ext) {
  const map = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif"
  };
  return map[ext] ?? "application/octet-stream";
}
function createMediaProvider(storagePath) {
  return new LocalMediaProvider(storagePath);
}

// src/services/media.service.ts
var MediaService = class {
  constructor(config, mongo, provider) {
    this.config = config;
    this.mongo = mongo;
    this.provider = provider ?? createMediaProvider(config.MEDIA_STORAGE_PATH);
  }
  provider;
  getMaxBytes() {
    return Number.parseInt(this.config.MEDIA_MAX_BYTES, 10) || 5242880;
  }
  getAllowedMimeTypes() {
    return new Set(
      this.config.MEDIA_ALLOWED_MIME_TYPES.split(",").map((t) => t.trim())
    );
  }
  validateFile(mimeType, size) {
    const allowed = this.getAllowedMimeTypes();
    if (!allowed.has(mimeType)) {
      throw new ValidationError("Unsupported file type", {
        allowed: [...allowed],
        received: mimeType
      });
    }
    if (size > this.getMaxBytes()) {
      throw new ValidationError("File too large", {
        maxBytes: this.getMaxBytes(),
        size
      });
    }
    if (size <= 0) {
      throw new ValidationError("File is empty");
    }
  }
  buildPublicUrl(requestUrl, mediaId, transform) {
    const base = new URL(requestUrl);
    const url = new URL(`${base.origin}${this.config.API_BASE_PATH}/media/${mediaId}`);
    if (transform?.width) url.searchParams.set("w", String(transform.width));
    if (transform?.height) url.searchParams.set("h", String(transform.height));
    if (transform?.format) url.searchParams.set("format", transform.format);
    if (transform?.quality) url.searchParams.set("q", String(transform.quality));
    if (transform?.fit) url.searchParams.set("fit", transform.fit);
    return url.toString();
  }
  async upload(input, admin, requestUrl) {
    this.validateFile(input.mimeType, input.size);
    const mediaId = newObjectId();
    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const storageKey = `${MEDIA_STORAGE_PREFIX}${mediaId}/${safeName}`;
    await this.provider.put(storageKey, input.buffer, input.mimeType);
    const url = this.buildPublicUrl(requestUrl, mediaId);
    return this.mongo.media.create({
      _id: mediaId,
      filename: safeName,
      original_name: input.filename,
      r2_key: storageKey,
      url,
      mime_type: input.mimeType,
      size: input.size,
      width: null,
      height: null,
      alt_text: input.altText ?? null,
      uploaded_by: admin.id
    });
  }
  resolveStorageKey(asset) {
    return asset.r2_key ?? `${MEDIA_STORAGE_PREFIX}${asset._id}/${asset.filename}`;
  }
  async delete(id, options = {}) {
    const asset = await this.mongo.media.findById(id);
    if (!asset) return;
    if (!options.force) {
      const refs = await this.mongo.posts.countMediaReferences(id, asset.url);
      if (refs > 0) {
        throw new ConflictError("Media is referenced by one or more posts", { references: refs });
      }
    }
    await this.provider.delete(this.resolveStorageKey(asset));
    await this.mongo.media.delete(id);
  }
  async deleteUnused() {
    const result = await this.mongo.media.list({}, { page: 1, perPage: 500 });
    let removed = 0;
    for (const asset of result.items) {
      const refs = await this.mongo.posts.countMediaReferences(asset._id, asset.url);
      if (refs === 0) {
        await this.provider.delete(this.resolveStorageKey(asset));
        await this.mongo.media.delete(asset._id);
        removed += 1;
      }
    }
    return removed;
  }
  parseTransformParams(searchParams) {
    const width = searchParams.get("w");
    const height = searchParams.get("h");
    const format = searchParams.get("format");
    const quality = searchParams.get("q");
    const fit = searchParams.get("fit");
    if (!width && !height && !format && !quality && !fit) return void 0;
    const transform = {};
    if (width) transform.width = Number.parseInt(width, 10);
    if (height) transform.height = Number.parseInt(height, 10);
    if (format && ["webp", "avif", "jpeg", "png", "auto"].includes(format)) {
      transform.format = format;
    }
    if (quality) transform.quality = Math.min(100, Math.max(1, Number.parseInt(quality, 10)));
    if (fit && ["scale-down", "contain", "cover", "crop", "pad"].includes(fit)) {
      transform.fit = fit;
    }
    return transform;
  }
  async serveBuffer(asset) {
    const stored = await this.provider.get(this.resolveStorageKey(asset));
    if (!stored) throw new NotFoundError("Media file");
    return { buffer: stored.buffer, mimeType: asset.mime_type };
  }
  async serve(asset, res, _transform) {
    const stored = await this.provider.get(this.resolveStorageKey(asset));
    if (!stored) throw new NotFoundError("Media file");
    res.setHeader("Content-Type", asset.mime_type);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(stored.buffer);
  }
};
function createMediaService(config, mongo) {
  return new MediaService(config, mongo);
}

// src/lib/feeds/xml.ts
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function toSitemapDate(date) {
  return date.toISOString().slice(0, 10);
}
function toRssDate(date) {
  return date.toUTCString();
}

// src/lib/site.ts
function getSiteConfig(config) {
  const url = config.SITE_URL.replace(/\/$/, "");
  return {
    url,
    name: config.SITE_NAME,
    description: config.SITE_DESCRIPTION
  };
}
function sitePath(site, path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${site.url}${normalized}`;
}

// src/services/seo-feeds.service.ts
var CMS_DISALLOW = [
  "/editor",
  "/posts",
  "/media",
  "/settings",
  "/seo",
  "/analytics",
  "/team",
  "/ai"
];
var SeoFeedsService = class {
  constructor(_config, mongo, siteConfig) {
    this.mongo = mongo;
    this.site = siteConfig ?? getSiteConfig(_config);
  }
  site;
  async fetchPublishedPosts() {
    const perPage = 100;
    let page = 1;
    const all = [];
    while (true) {
      const result = await this.mongo.posts.listPublished({}, { page, perPage });
      all.push(...result.items);
      if (page >= result.totalPages) break;
      page += 1;
    }
    return all;
  }
  async buildSitemapXml() {
    const posts = await this.fetchPublishedPosts();
    const urls = [];
    urls.push(this.urlEntry(sitePath(this.site, "/"), { changefreq: "weekly", priority: "1.0" }));
    urls.push(this.urlEntry(sitePath(this.site, "/blog"), { changefreq: "daily", priority: "0.9" }));
    for (const post of posts) {
      const lastmod = post.updated_at ?? post.published_at ?? post.created_at;
      urls.push(
        this.urlEntry(sitePath(this.site, `/blog/${post.slug}`), {
          lastmod: toSitemapDate(lastmod),
          changefreq: "monthly",
          priority: "0.8"
        })
      );
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  }
  buildRobotsTxt() {
    const lines = [
      "User-agent: *",
      "Allow: /",
      "Allow: /blog",
      ...CMS_DISALLOW.map((path) => `Disallow: ${path}`),
      "",
      `Sitemap: ${sitePath(this.site, "/sitemap.xml")}`
    ];
    return `${lines.join("\n")}
`;
  }
  async buildRssXml() {
    const posts = await this.fetchPublishedPosts();
    const feedUrl = sitePath(this.site, "/feed.xml");
    const blogUrl = sitePath(this.site, "/blog");
    const items = posts.map((post) => {
      const pubDate = post.published_at ?? post.created_at;
      const link = sitePath(this.site, `/blog/${post.slug}`);
      const description = post.excerpt ?? post.seo_description ?? "";
      const content = post.content_markdown.slice(0, 5e3);
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${toRssDate(pubDate)}</pubDate>
      <description>${escapeXml(description)}</description>
      <content:encoded><![CDATA[${content}]]></content:encoded>
      <dc:creator>${escapeXml(post.author.name)}</dc:creator>
    </item>`;
    }).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(this.site.name)}</title>
    <link>${escapeXml(blogUrl)}</link>
    <description>${escapeXml(this.site.description)}</description>
    <language>en-us</language>
    <lastBuildDate>${toRssDate(/* @__PURE__ */ new Date())}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
  }
  urlEntry(loc, opts) {
    const parts = [`  <url>`, `    <loc>${escapeXml(loc)}</loc>`];
    if (opts.lastmod) parts.push(`    <lastmod>${opts.lastmod}</lastmod>`);
    if (opts.changefreq) parts.push(`    <changefreq>${opts.changefreq}</changefreq>`);
    if (opts.priority) parts.push(`    <priority>${opts.priority}</priority>`);
    parts.push(`  </url>`);
    return parts.join("\n");
  }
};
function createSeoFeedsService(config, mongo) {
  return new SeoFeedsService(config, mongo);
}

// src/types/blog-api.ts
function toPostDto(doc) {
  return {
    id: doc._id,
    title: doc.title,
    slug: doc.slug,
    excerpt: doc.excerpt,
    content_markdown: doc.content_markdown,
    featured_image: doc.featured_image,
    status: doc.status,
    category_id: doc.category_id,
    tag_ids: doc.tag_ids,
    seo_title: doc.seo_title,
    seo_description: doc.seo_description,
    canonical_url: doc.canonical_url,
    author: doc.author,
    published_at: doc.published_at?.toISOString() ?? null,
    created_at: doc.created_at.toISOString(),
    updated_at: doc.updated_at.toISOString()
  };
}
function toCategoryDto(doc) {
  return {
    id: doc._id,
    name: doc.name,
    slug: doc.slug,
    description: doc.description,
    created_at: doc.created_at.toISOString()
  };
}
function toTagDto(doc) {
  return {
    id: doc._id,
    name: doc.name,
    slug: doc.slug,
    created_at: doc.created_at.toISOString()
  };
}
function toMediaDto(doc) {
  return {
    id: doc._id,
    filename: doc.filename,
    original_name: doc.original_name,
    url: doc.url,
    mime_type: doc.mime_type,
    size: doc.size,
    width: doc.width ?? null,
    height: doc.height ?? null,
    alt_text: doc.alt_text ?? null,
    uploaded_at: doc.uploaded_at.toISOString()
  };
}

// src/app.ts
var app = new Hono();
app.use("*", async (c, next) => {
  c.set("config", getConfig());
  await next();
});
app.use("*", async (c, next) => {
  const config = c.get("config");
  const origins = config.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  return cors({
    origin: origins.includes("*") ? "*" : origins,
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400
  })(c, next);
});
app.onError((err, c) => {
  if (err instanceof MongoClientError) {
    return c.json(
      { success: false, error: { code: err.code, message: err.message } },
      err.status
    );
  }
  if (isAppError(err)) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...err.details !== void 0 ? { details: err.details } : {}
        }
      },
      err.status
    );
  }
  console.error(err);
  return c.json(
    {
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: "An unexpected error occurred" }
    },
    HTTP.INTERNAL
  );
});
var withMongo = createMiddleware(async (c, next) => {
  c.set("repos", await requireMongo());
  await next();
});
app.get("/api/health", (c) => {
  const body = {
    status: "ok",
    environment: c.get("config").ENVIRONMENT,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  return c.json(ok(body));
});
app.get("/api/health/ready", (c) => c.json(ok({ ready: true })));
app.post("/api/auth/login", async (c) => {
  const body = await c.req.json();
  const input = loginBodySchema.parse(body);
  const auth = createAuthService(c.get("config"));
  const result = await auth.login(input);
  return c.json(ok(result));
});
app.post("/api/auth/logout", (c) => c.json(ok({ message: "Logged out" })));
app.get("/api/auth/me", async (c) => {
  const admin = await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  return c.json(ok({ admin }));
});
app.get("/api/posts", withMongo, async (c) => {
  const repos = c.get("repos");
  const query = listPostsQuerySchema.parse(c.req.query());
  const isAdmin = await isAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  const pagination = { page: query.page, perPage: query.perPage };
  const filter = {
    status: query.status,
    category_id: query.category_id ? asObjectId(query.category_id) : void 0,
    tag_id: query.tag_id ? asObjectId(query.tag_id) : void 0,
    author_id: query.author_id,
    q: query.q
  };
  const result = isAdmin ? await repos.posts.list(filter, pagination) : await repos.posts.listPublished(filter, pagination);
  return c.json(
    ok(result.items.map(toPostDto), {
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      totalPages: result.totalPages
    })
  );
});
app.post("/api/posts", withMongo, async (c) => {
  const repos = c.get("repos");
  const admin = await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  const body = createPostBodySchema.parse(await c.req.json());
  const input = {
    title: body.title,
    excerpt: body.excerpt ?? null,
    content_markdown: body.content_markdown,
    featured_image: body.featured_image ?? null,
    status: body.status,
    category_id: body.category_id ? asObjectId(body.category_id) : null,
    tag_ids: (body.tag_ids ?? []).map(asObjectId),
    seo_title: body.seo_title ?? null,
    seo_description: body.seo_description ?? null,
    canonical_url: body.canonical_url ?? null,
    author: body.author ?? {
      id: admin.id,
      name: admin.email,
      email: admin.email
    },
    published_at: body.published_at ? new Date(body.published_at) : null,
    ...body.slug ? { slug: body.slug } : {}
  };
  const post = await repos.posts.create(input);
  return c.json(ok(toPostDto(post)), 201);
});
app.get("/api/posts/id/:id", withMongo, async (c) => {
  const repos = c.get("repos");
  const parsed = mongoIdParamSchema.parse({ id: c.req.param("id") });
  const post = await repos.posts.findById(parsed.id);
  if (!post) throw new NotFoundError("Post");
  const isAdmin = await isAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  if (!isAdmin && !repos.posts.isPubliclyVisible(post)) {
    throw new NotFoundError("Post");
  }
  return c.json(ok(toPostDto(post)));
});
app.put("/api/posts/:id", withMongo, async (c) => {
  const repos = c.get("repos");
  await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  const parsed = mongoIdParamSchema.parse({ id: c.req.param("id") });
  const body = updatePostBodySchema.parse(await c.req.json());
  const patch = {};
  if (body.title !== void 0) patch.title = body.title;
  if (body.slug !== void 0) patch.slug = body.slug;
  if (body.excerpt !== void 0) patch.excerpt = body.excerpt;
  if (body.content_markdown !== void 0) patch.content_markdown = body.content_markdown;
  if (body.featured_image !== void 0) patch.featured_image = body.featured_image;
  if (body.status !== void 0) patch.status = body.status;
  if (body.category_id !== void 0) {
    patch.category_id = body.category_id ? asObjectId(body.category_id) : null;
  }
  if (body.tag_ids !== void 0) patch.tag_ids = body.tag_ids.map(asObjectId);
  if (body.seo_title !== void 0) patch.seo_title = body.seo_title;
  if (body.seo_description !== void 0) patch.seo_description = body.seo_description;
  if (body.canonical_url !== void 0) patch.canonical_url = body.canonical_url;
  if (body.published_at !== void 0) {
    patch.published_at = body.published_at ? new Date(body.published_at) : null;
  }
  const post = await repos.posts.update(parsed.id, patch);
  return c.json(ok(toPostDto(post)));
});
app.delete("/api/posts/:id", withMongo, async (c) => {
  const repos = c.get("repos");
  await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  const parsed = mongoIdParamSchema.parse({ id: c.req.param("id") });
  await repos.posts.delete(parsed.id);
  return c.body(null, 204);
});
app.get("/api/posts/:slug", withMongo, async (c) => {
  const repos = c.get("repos");
  const slug = c.req.param("slug");
  if (slug === "id") throw new NotFoundError("Post");
  const parsed = slugParamSchema.safeParse({ slug });
  if (!parsed.success) throw new NotFoundError("Post");
  const post = await repos.posts.findBySlugOrPrevious(parsed.data.slug);
  if (!post) throw new NotFoundError("Post");
  const isAdmin = await isAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  if (!isAdmin && !repos.posts.isPubliclyVisible(post)) {
    throw new NotFoundError("Post");
  }
  const meta = post.slug !== parsed.data.slug ? { redirect_slug: post.slug } : void 0;
  return c.json(ok(toPostDto(post), meta));
});
app.get("/api/categories", withMongo, async (c) => {
  const categories = await c.get("repos").categories.list();
  return c.json(ok(categories.map(toCategoryDto)));
});
app.post("/api/categories", withMongo, async (c) => {
  await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  const parsed = createCategoryBodySchema.parse(await c.req.json());
  const category = await c.get("repos").categories.create({
    name: parsed.name,
    slug: parsed.slug ?? parsed.name.toLowerCase().replace(/\s+/g, "-"),
    description: parsed.description ?? null
  });
  return c.json(ok(toCategoryDto(category)), 201);
});
app.get("/api/tags", withMongo, async (c) => {
  const tags = await c.get("repos").tags.list();
  return c.json(ok(tags.map(toTagDto)));
});
app.post("/api/tags", withMongo, async (c) => {
  await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  const parsed = createTagBodySchema.parse(await c.req.json());
  const tag = await c.get("repos").tags.create({
    name: parsed.name,
    slug: parsed.slug ?? parsed.name.toLowerCase().replace(/\s+/g, "-")
  });
  return c.json(ok(toTagDto(tag)), 201);
});
app.get("/api/media", withMongo, async (c) => {
  await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  const query = listPostsQuerySchema.parse(c.req.query());
  const result = await c.get("repos").media.list({}, { page: query.page, perPage: query.perPage });
  return c.json(
    ok(result.items.map(toMediaDto), {
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      totalPages: result.totalPages
    })
  );
});
app.post("/api/media/upload", withMongo, async (c) => {
  const repos = c.get("repos");
  const admin = await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) {
    throw new ValidationError("file is required (multipart field name: file)");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const altText = typeof form.altText === "string" ? form.altText : void 0;
  const requestUrl = new URL(c.req.url).toString();
  const mediaService = createMediaService(c.get("config"), repos);
  const media = await mediaService.upload(
    {
      buffer,
      filename: file.name,
      mimeType: file.type,
      size: buffer.length,
      altText
    },
    admin,
    requestUrl
  );
  return c.json(ok(toMediaDto(media)), 201);
});
app.delete("/api/media/unused", withMongo, async (c) => {
  await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  const removed = await createMediaService(c.get("config"), c.get("repos")).deleteUnused();
  return c.json(ok({ removed }));
});
app.get("/api/media/:id", withMongo, async (c) => {
  const repos = c.get("repos");
  const parsed = mongoIdParamSchema.parse({ id: c.req.param("id") });
  const asset = await repos.media.findById(parsed.id);
  if (!asset) throw new NotFoundError("Media");
  const mediaService = createMediaService(c.get("config"), repos);
  const { buffer, mimeType } = await mediaService.serveBuffer(asset);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
});
app.delete("/api/media/:id", withMongo, async (c) => {
  await verifyAdminFromHeader(c.req.header("Authorization"), c.get("config"));
  const parsed = mongoIdParamSchema.parse({ id: c.req.param("id") });
  const force = c.req.query("force") === "true";
  await createMediaService(c.get("config"), c.get("repos")).delete(parsed.id, { force });
  return c.body(null, 204);
});
app.get("/api/seo/sitemap", withMongo, async (c) => {
  const xml = await createSeoFeedsService(c.get("config"), c.get("repos")).buildSitemapXml();
  return c.body(xml, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600"
  });
});
app.get("/api/seo/robots", withMongo, (c) => {
  const text = createSeoFeedsService(c.get("config"), c.get("repos")).buildRobotsTxt();
  return c.body(text, 200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=86400"
  });
});
app.get("/api/seo/feed", withMongo, async (c) => {
  const xml = await createSeoFeedsService(c.get("config"), c.get("repos")).buildRssXml();
  return c.body(xml, 200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": "public, max-age=1800"
  });
});

// src/vercel-handler.ts
var vercel_handler_default = getRequestListener(app.fetch);
export {
  vercel_handler_default as default
};
