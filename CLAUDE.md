# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

LaunchUp is a startup assessment and readiness platform: it manages startup qualification, tracks readiness levels across multiple assessment types (RNA, RNS, calculator-based), and surfaces AI-generated (Gemini) recommendations, roadblocks, and initiatives.

The repo is **two independent apps**, not a monorepo with shared tooling — there is no workspace config linking them, each has its own lockfile and must be installed/run separately.

- `backend/` — NestJS (TypeScript) API, MikroORM + PostgreSQL
- `frontend/` — SvelteKit 2 (Svelte 5) + TailwindCSS
- `docker-compose.yml` — local Postgres only (`launchup_db` on port 5432)
- `scripts/` — raw `psql` scripts to drop/recreate a local DB (reference a `chumcheck` DB name, not `launchup_db` — check before running)

## Common commands

Backend (`cd backend`, pnpm):
```bash
pnpm dev            # nest start --watch
pnpm build           # nest build
pnpm lint            # eslint --fix over src/apps/libs/test
pnpm test            # jest unit tests
pnpm test -- <pattern>   # run a single spec, e.g. pnpm test -- readiness.service
pnpm test:e2e        # jest e2e (test/jest-e2e.json)
pnpm test:cov        # jest with coverage
```

Frontend (`cd frontend`, pnpm):
```bash
pnpm dev             # vite dev --host
pnpm build           # vite build
pnpm check           # svelte-kit sync && svelte-check (type checking)
pnpm lint            # prettier --check . && eslint .
pnpm format          # prettier --write .
```

Local database:
```bash
docker-compose up -d db
```
Both apps read DB/JWT config from their own `.env` (see `backend/.env.example`, `frontend/.env.example`). **`JWT_SECRET` must be identical in both `.env` files** — the frontend verifies the JWT itself rather than calling the backend (see Auth below).

## Architecture

### Backend (NestJS + MikroORM)

Standard Nest feature-module layout under `backend/src/<feature>/` (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`). All entities live centrally in `backend/src/entities/` (not colocated with feature modules) with shared enums in `entities/enums/`.

Notable non-obvious behavior:
- **Schema is auto-synced on every boot, not migration-driven in practice.** `main.ts` calls `orm.getSchemaGenerator().updateSchema()` and then seeds demo users/startups (`demo@launchup.local`, `admin@launchup.local`, etc., password `password123`) on every startup, even though a `src/migrations/` directory with MikroORM migrations exists. Don't assume migrations are what actually shapes the dev DB — schema drift is masked by the auto-sync.
- **`app.module.ts`'s `MikroOrmModule.forFeature()` entity list is not exhaustive.** Many entities under `src/entities/` (e.g. most assessment/readiness/RAG entities) aren't in that array. If a new module's repository injection fails to resolve, check whether the entity needs to be added there.
- Route prefixes can stack: controllers sometimes declare a sub-path on top of the `@Controller()` prefix (e.g. `@Controller('startups')` + `@Get('/startups')` → `/startups/startups`). Check the actual controller before assuming a route path from convention alone.
- Auth: `JwtGuard` (passport `jwt` strategy) is applied per-controller via `@UseGuards`; `AdminGuard` is a separate `CanActivate` checking `req.user.role === Role.Admin` and must be paired with `JwtGuard` (it reads `req.user`, it doesn't authenticate). Roles: `Startup | Mentor | Manager | Admin` (`entities/enums/role.enum.ts`).
- `mikro-orm.config.ts` falls back to an in-memory SQLite DB when `DB_HOST` isn't set — useful for quick local runs without Docker, but state won't persist and won't match Postgres-only SQL behavior.
- OCR (`src/ocr/`, Tesseract.js) and AI baseline scoring (`src/ai/`, Gemini) are separate modules from the core assessment domain — the "AI insights" and "OCR document parsing" features are additive layers on top of the assessment/readiness data, not built into it.

### Frontend (SvelteKit)

Route groups under `frontend/src/routes/`:
- `(app)/` — authenticated app shell (startups, admin, analytics, applications, cohorts, account, apply)
- `(auth)/` — user login/register
- `(auth-admin)/` — separate admin login flow

Auth is a **BFF (backend-for-frontend) pattern**, not a proxy to the backend on every request:
1. `+page.server.ts` form actions (e.g. `routes/(auth)/login/+page.server.ts`) call the NestJS backend directly (`POST /auth/signin`) and set the JWT as an httpOnly `Access` cookie themselves.
2. `hooks.server.ts` verifies that cookie locally with `jose` using `JWT_SECRET` (no backend round-trip) on every request, populates `event.locals.user`, and enforces route protection (`protectedRoutes`/`publicOnlyRoutes` arrays) — admin paths redirect to `/admin-login`, everything else to `/login`.
3. `routes/(app)/+layout.server.ts` re-derives role from `locals.user`, with a cookie-driven `isMentorRole` override that maps `Manager` → a synthetic `Manager as Mentor` role.

Because of this, **role/permission changes must be kept in sync in three places**: the backend `Role` enum, `hooks.server.ts`'s protected-route logic, and `frontend/src/lib/access.ts` (the module/submodule nav config keyed by role, including the synthetic `Manager as Mentor` role).

Client-side API calls go through `frontend/src/lib/axios.ts` (baseURL from `PUBLIC_API_URL`); server-side load functions/actions use SvelteKit's `fetch` directly against the same backend URL rather than the axios instance.

Component organization under `src/lib/components/` is by domain area (`admin/`, `applications/`, `dashboard/`, `landing/`, `startup/`, `startups/`, `charts/`) plus a shared `ui/` (shadcn-svelte-style primitives) and `shared/` for cross-domain components.
