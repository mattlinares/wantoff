# Mealmate / Circles Wantoff

Monorepo: `apps/backend` (Node/TS + Express + Prisma/Postgres), `apps/wantoff` (Next.js — general wants/offers
dashboard + public profiles, see `docs/wantoff-app-plan.md`). Protocol
design in `docs/exchange-protocol.md`. For a plain-language explainer of
what Mealmate is and the open "offers and wants" idea it's built on, see
`docs/about.md`.

## Local development

1. Install deps (root, npm workspaces):
   ```
   npm install
   ```

2. Start Postgres:
   ```
   docker compose up -d postgres
   ```
   Exposed on host port **5433** (5432 was taken by a local Postgres
   install on this machine — adjust `docker-compose.yml` if not).

3. Configure backend env:
   ```
   cp apps/backend/.env.example apps/backend/.env
   ```
   Defaults match `docker-compose.yml` (`mealmate`/`change-me`/port 5433).

4. Apply migrations:
   ```
   npm run prisma:migrate --workspace=@mealmate/backend
   ```

5. Run the backend:
   ```
   npm run dev --workspace=@mealmate/backend
   ```
   `GET /health` should return `{"status":"ok"}`. Default port 3000 — set
   `PORT` in `apps/backend/.env` if that's taken locally too.

6. Run Wantoff (Next.js):
   ```
   cp apps/wantoff/.env.example apps/wantoff/.env.local
   npm run dev --workspace=@mealmate/wantoff
   ```
   Logs in with the same account as Mealmate (`/login`); `/dashboard` lists
   your wants & offers across every `itemType` (`GET /listings?mine=true`);
   `/u/:id` is the public profile (add `?embed=1` for a chrome-free
   `<iframe>` view); `/protocol` is the public protocol overview page (with
   `/protocol/detail` for full specification and Valueflows prior-art notes).

## Testing

Backend pure-logic helpers (fee rules, reputation math, distance/sorting)
live in `apps/backend/src/lib.ts` with unit tests in
`apps/backend/src/lib.test.ts`. Run them with:

```
npm run test --workspace=@mealmate/backend
```

New business logic should be added as a tested function in `lib.ts` rather
than left inline and untested. See `CLAUDE.md` for the project's
tests-and-docs policy for new features.

## Production (Docker on a VPS)

1. Copy `.env.example` to `.env` at the repo root and set real
   `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`.

2. Build and run:
   ```
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   This builds `apps/backend/Dockerfile` (multi-stage: install → build →
   `prisma generate` → slim runtime image), runs `prisma migrate deploy`
   on container start, then serves on port 3000.

3. Postgres data persists in the `pgdata` named volume.

4. Schema changes: create a migration locally with
   `npm run prisma:migrate --workspace=@mealmate/backend` (commit the
   generated `apps/backend/prisma/migrations/*`), then redeploy — the
   container applies pending migrations automatically via
   `prisma migrate deploy`.
