# NovaSafe Blog CMS API (Vercel)

Serverless API for the NovaSafe Blog CMS. Replaces the former Cloudflare Workers backend.

## Architecture

```
Admin UI (Netlify)  ──►  Vercel API  ──►  MongoDB Atlas
Public Website      ──►  Vercel API  ──►  MongoDB Atlas
Media storage       ──►  Local filesystem (MEDIA_STORAGE_PATH) — Cloudinary/R2 ready via MediaProvider
```

## Stack

- Node.js 22
- TypeScript
- Vercel Serverless Functions
- MongoDB Atlas (official `mongodb` driver)
- JWT authentication (jose)
- Zod validation

## Quick start

```bash
cd vercel-api
cp .env.example .env.local
npm install
npm run dev
```

API base URL: `http://localhost:3000/api` (legacy `/api/v1/*` rewrites to `/api/*`)

## Environment variables

See `.env.example`. Required:

- `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `MONGODB_HOST`
- `DATABASE_NAME`
- `JWT_SECRET`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` (for login until admins DB is migrated)

## API routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | — |
| GET | `/api/health/ready` | — |
| POST | `/api/auth/login` | — |
| POST | `/api/auth/logout` | — |
| GET | `/api/auth/me` | JWT |
| GET | `/api/posts` | Optional JWT |
| POST | `/api/posts` | JWT |
| GET | `/api/posts/:slug` | Optional JWT |
| GET | `/api/posts/id/:id` | Optional JWT |
| PUT | `/api/posts/:id` | JWT |
| DELETE | `/api/posts/:id` | JWT |
| GET/POST | `/api/categories` | POST: JWT |
| GET/POST | `/api/tags` | POST: JWT |
| GET | `/api/media` | JWT |
| POST | `/api/media/upload` | JWT |
| DELETE | `/api/media/unused` | JWT |
| GET/DELETE | `/api/media/:id` | DELETE: JWT |
| GET | `/sitemap.xml`, `/robots.txt`, `/feed.xml` | — |

Response envelope: `{ success: true, data, meta? }` or `{ success: false, error }`.

## Project structure

```
src/
├── api/           # Vercel serverless route handlers
├── lib/           # mongodb singleton, jwt, response helpers
├── repositories/  # MongoDB repositories (ported from Workers)
├── services/      # auth, media, seo
├── middleware/    # requireAuth, requireMongo
└── types/         # config, DTOs, document types, zod schemas
```

## Deploy

```bash
vercel link
vercel env pull .env.local
vercel deploy
```

Do not commit secrets. Set production env vars in the Vercel dashboard.
