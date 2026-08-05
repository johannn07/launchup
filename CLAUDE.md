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

Database: **Neon (hosted Postgres), not Docker.** `backend/.env` points `DB_HOST` at an `…aws.neon.tech` endpoint, so `docker-compose.yml` (local `launchup_db`) is unused — don't tell the user to run it. Each developer should work on their own Neon branch, because `main.ts` auto-syncs schema and seeds demo data on every boot against whatever DB is configured.

Both apps read DB/JWT config from their own `.env` (see `backend/.env.example`, `frontend/.env.example`). **`JWT_SECRET` must be identical in both `.env` files** — the frontend verifies the JWT itself rather than calling the backend (see Auth below).

## Git commit conventions

Do not include a `Co-Authored-By` line in commit messages.

## Comment & documentation style
- Keep all code comments short and to the point — one line where possible.
- Explain *why*, not *what* — don't describe what the code obviously already shows.
- No filler phrases ("this function is responsible for...", "this method will...").
- Same rule for docs/markdown: short sentences, no padding, no repeating the same
  point in different words. Bullet points over paragraphs where it fits.
- If a comment or doc line doesn't add information a reader wouldn't already have,
  cut it.

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
- **File storage is unconfigured.** `upload.service.ts` reads five `S3_*` vars; none are set, so `enabled = false` and all uploads 503. It uses the generic `@aws-sdk/client-s3` `S3` class with a configurable `endpoint`, so any S3-compatible provider is a drop-in — only env values change.

### Capstone context (this is a rebase, not a greenfield build)

This repo is **LaunchUp Enhanced**, a capstone extending a prior team's LaunchUp. Four objectives drive all new work: reduce AI hallucination (RAG + output validation), improve readiness differentiation (tiers + weighted scoring + gap analysis), add multimodal/handwriting intake (OCR + sketch recognition), and correct AI leniency bias (adversarial prompting + score normalization). Source documents live in the team's capstone folder, not the repo.

Things that look implemented but are not — check before building on them:
- **RAG now exists, with a real verified-knowledge corpus (as of 2026-07-28), and as of 2026-08-05 it is measured to improve readiness-level placement.** `EmbeddingService` calls `gemini-embedding-2` (768 dims) and `EmbeddingIndexService` writes `vector_embeddings` on every `recordRagContext`, plus a boot-time backfill. `RagQueryService.queryVectorDatabase()` (`rna/rag-query.service.ts`) runs three channels: readiness rubrics, business frameworks, and peer capsule proposals — `verifiedFrameworks`/`businessModels` are **no longer hardcoded `[]`**. The corpus (`rag_contexts`, seeded idempotently by `backend/seed-rag-corpus.js` / `RagCorpusSeederService`) is 54 readiness-rubric rows + 10 business-framework rows, and **every row carries a `provenance` field** — read it before treating any of this as externally validated: only the 9 Technology/TRL rubric rows are transcribed from a public standard (EU Horizon Europe TRL, ISO 16290:2013); 36 rows (Market/Acceptance/Organizational/Regulatory) are authored against BRLa's (2021) published dimension framework rather than transcribed from it; the remaining 9 (Investment/IRL, which isn't in BRLa at all) are authored outright with no external source. Two env vars gate it: `AI_RAG_CORPUS_ENABLED` (default `true`) and `AI_RAG_RUBRIC_MODE` (`deterministic` default, exact `(readinessType, level)` key lookup; `semantic`, pgvector nearest-neighbour, exists because SDD §3.2 specifies it but was measured — `measurement/measure-grounding.js` — to retrieve nothing against this corpus). Live-verified against the running server (2026-07-28): a real assembled RNA/RNS prompt contains the `--- Verified Readiness Rubrics (authoritative) ---` section with the correct dimension's rubric text, and `AI_RAG_CORPUS_ENABLED=false` removes it. **Measured 2026-08-05, and the answer is positive for level placement:** the corpus arm assigns readiness levels at **0.22 MAE against baseline's 0.69** (36/36 vs 29/36 within one rung, n=3), and is *exactly* right on Organizational, Regulatory and Investment where the corpus-free arms inflate them. The reference-free figure is the one to quote — baseline asserts evidence absent from the source document in **61%** of checked placements, the corpus arm in **0%**. Read against the byte-identical null control, whose spread is 0.25 MAE. **This reverses a negative result these docs carried from 2026-07-30 to 2026-08-04**, which was scored against demo fixtures contradicted by their own documents in ten of twelve cells; the reference now lives in `src/demo-readiness-levels.ts`. **Still unmeasured:** RNA *generation* quality — every figure above is the levels probe, and production's RNA path retrieves 12 rubric rows rather than 54. See `TODO_CHECKLIST.md` §0 and `measurement/README.md`.
- **`rna/output-validator.service.ts` and `rna/recommendation-storage.service.ts` are stubs** — every method body is a `// TODO`. `validateEach()` returns `isValid: true` unconditionally.
- **Weights resolve via a cascade, not `TierConfig`.** `TierConfig.weights` was deleted (it was keyed per tier, which made the composite non-monotonic). `WeightProfileService` resolves weights from `weight_profiles`, keyed on sector and business model, falling back to `DEFAULT_WEIGHTS` in `backend/src/readiness/readiness.weights.ts` when nothing in the table validates.
- **Scored dimensions now match the spec:** TRL/MRL/RRL/ARL/ORL/IRL — Technology, Market, Acceptance, Organizational, Regulatory, and Investment are all scored.

The model and the four pipeline enhancements (grounding, RAG, bias review, score normalization) are configured through `AiConfigService` (`src/ai/ai-config.service.ts`), which resolves them from env vars (`GEMINI_MODEL`, `AI_TEMPERATURE`, `AI_GROUNDING_ENABLED`, `AI_RAG_ENABLED`, `AI_RAG_STRATEGY`, `AI_RAG_CORPUS_ENABLED`, `AI_RAG_RUBRIC_MODE`, `AI_BIAS_REVIEW_ENABLED`, `AI_SCORE_NORMALIZATION_ENABLED`; see `backend/.env.example`), with an optional per-request override via the `X-Ai-Pipeline-Config` header gated on `AI_ALLOW_REQUEST_OVERRIDE` and a privileged (Manager/Admin) caller.
The four enable/disable flags default to `true` and `GEMINI_MODEL` still defaults to `gemini-2.5-flash-lite` (`AI_TEMPERATURE` defaults to `0`) — the model tier itself hasn't changed, only how it's configured, so **`gemini-2.5-flash-lite` is still not the right model** for bias/hallucination work; see `TODO_CHECKLIST.md` §5 before adding AI calls.
Every AI generation call opens an `ai_generation_runs` row (via `AiRunService.track()`) recording the resolved config, timing, and status, so runs are attributable to the exact arm of a baseline-vs-enhanced comparison.

Structured outputs should still use `responseMimeType: 'application/json'` + `responseSchema` rather than the current regex fence-stripping in `extractJsonPayload` — that part is unchanged.

**`PROJECT_OVERVIEW.md` and `TODO_CHECKLIST.md` in the repo root are the maintained reference** for architecture, known gaps, and prioritized work. Read them before a broad change; update them when findings change.

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
