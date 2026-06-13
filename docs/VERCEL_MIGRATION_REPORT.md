# Vercel Migration Report

**Date:** 2026-05-30  
**From:** `cloudflare_workers/` (Cloudflare Workers + Hono)  
**To:** `vercel-api/` (Vercel Serverless Functions + Node.js 22)

**Status:** Migration complete. Cloudflare Worker entrypoints removed. **Not deployed.**

---

## Architecture change

| Layer | Before | After |
|-------|--------|-------|
| Runtime | Cloudflare Workers (`nodejs_compat`) | Vercel Serverless (Node 22) |
| HTTP framework | Hono | `@vercel/node` handlers |
| Config | `AppBindings` / wrangler.toml | `process.env` / Vercel env |
| Media storage | Cloudflare R2 | `MediaProvider` → `LocalMediaProvider` (filesystem) |
| Database | MongoDB Atlas (native driver) | MongoDB Atlas (unchanged) |
| Auth | JWT (jose) | JWT (jose, unchanged) |

---

## Removed (Cloudflare-specific)

| Item | Action |
|------|--------|
| `cloudflare_workers/wrangler.toml` | **Deleted** |
| `cloudflare_workers/src/index.ts` | **Deleted** |
| `cloudflare_workers/src/app.ts` | **Deleted** |
| Hono middleware / context | Replaced by `createHandler()` |
| `AppBindings`, `DB`, `MEDIA_BUCKET` | Removed |
| R2 `MEDIA_BUCKET.put/get/delete` | Replaced by `MediaProvider` |
| Cloudflare Image Resizing (`cf.image`) | Removed (serve raw files; Cloudinary-ready) |
| D1 services / legacy route stubs | Not ported (were unused) |
| `wrangler dev/deploy` scripts | Replaced by `vercel dev/deploy` |

`cloudflare_workers/` source remains as archive reference; it is **deprecated** and no longer deployable.

---

## Created project: `vercel-api/` (68 source files)

### API routes (`src/api/`)

| File | Endpoint |
|------|----------|
| `health/index.ts` | GET `/api/health` |
| `health/ready.ts` | GET `/api/health/ready` |
| `auth/login.ts` | POST `/api/auth/login` → `{ accessToken, user }` |
| `auth/logout.ts` | POST `/api/auth/logout` |
| `auth/me.ts` | GET `/api/auth/me` |
| `posts/index.ts` | GET/POST `/api/posts` |
| `posts/id/[id].ts` | GET `/api/posts/id/:id` |
| `posts/[slug].ts` | GET `/api/posts/:slug`, PUT/DELETE `/api/posts/:id` |
| `categories/index.ts` | GET/POST `/api/categories` |
| `tags/index.ts` | GET/POST `/api/tags` |
| `media/index.ts` | GET `/api/media` |
| `media/upload.ts` | POST `/api/media/upload` |
| `media/unused.ts` | DELETE `/api/media/unused` |
| `media/[id].ts` | GET/DELETE `/api/media/:id` |
| `seo/sitemap.ts` | GET `/sitemap.xml` (rewrite) |
| `seo/robots.ts` | GET `/robots.txt` (rewrite) |
| `seo/feed.ts` | GET `/feed.xml`, `/rss.xml` (rewrite) |

**Backward compatibility:** `vercel.json` rewrites `/api/v1/*` → `/api/*` for existing CMS clients.

### Preserved business logic

- MongoDB repositories (posts, categories, tags, media) — unchanged logic
- Post slug resolution, `previous_slugs`, visibility rules
- SEO feeds (sitemap, robots, RSS)
- JWT auth flow + optional admin on public reads
- Zod validation schemas
- API response envelope `{ success, data, meta? }`
- Post DTOs (`toPostDto`, etc.)

### New abstractions

| File | Purpose |
|------|---------|
| `src/lib/mongodb.ts` | Serverless-safe connection singleton |
| `src/lib/handler.ts` | Vercel handler wrapper (CORS, auth, mongo, errors) |
| `src/services/media/provider.ts` | `MediaProvider` interface + `LocalMediaProvider` |

---

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `MONGODB_USERNAME` | Yes | Atlas database user |
| `MONGODB_PASSWORD` | Yes | Atlas database password |
| `MONGODB_HOST` | Yes | Atlas cluster host (e.g. `cluster0.xxxxx.mongodb.net`) |
| `MONGODB_OPTIONS` | No | Connection query string (default `retryWrites=true&w=majority`) |
| `DATABASE_NAME` | Yes | e.g. `blog_cms` |
| `JWT_SECRET` | Yes | HS256 signing key |
| `ADMIN_EMAIL` | For login | Until admins DB migrated |
| `ADMIN_PASSWORD` | For login | Until admins DB migrated |
| `SITE_URL` | SEO | Public site origin |
| `MEDIA_STORAGE_PATH` | Media | Default `./uploads` |
| `CORS_ALLOWED_ORIGINS` | CORS | Comma-separated |

---

## Post-migration steps

1. **Local dev:** `cd vercel-api && cp .env.example .env.local && npm install && npm run dev`
2. **CMS:** Point `VITE_API_BASE_URL` to Vercel URL (`/api` or `/api/v1` via rewrite)
3. **Vercel:** Set env vars in dashboard; `vercel deploy`
4. **Media:** Local `uploads/` on Vercel is ephemeral — plan Cloudinary/R2 via `MediaProvider` for production
5. **Indexes:** Run `cloudflare_workers/scripts/mongodb/create-indexes.mongosh.js` against Atlas (unchanged)

---

## Verification

```bash
cd vercel-api
npm run typecheck   # passes
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'
curl http://localhost:3000/api/posts
```

---

## Risks / notes

- **Vercel filesystem is ephemeral** — use Cloudinary or S3/R2 `MediaProvider` for production media persistence.
- **Cold starts** — first MongoDB connect per cold function; singleton caches warm invocations.
- **Login** — env-based admin credentials until D1 `admins` table is migrated to MongoDB.
