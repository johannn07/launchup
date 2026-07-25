# LaunchUp — Remaining Work Checklist

Prioritized backlog derived from a full read of the codebase (see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)), plus a second verification pass specifically hunting broken frontend→backend calls, missing guards, and dead code.

**Type legend**

| Tag | Meaning |
|---|---|
| 🔒 **SEC** | Security fix — do it regardless of scope decisions |
| 🐞 **BUG** | Broken code with an unambiguous correct behaviour — just fix it |
| ❓ **SCOPE** | Unfinished feature. Needs *your* decision: **fix it / cut it / leave it hidden**. Not a pure code fix. |
| 🧹 **DEBT** | Cleanup. No user-visible impact. |

**Effort:** S ≈ under an hour · M ≈ half a day · L ≈ multiple days

> **Suggested order:** everything in §1 → the §2 items your demo actually touches → make §3 decisions → §4 last.

---

## 1. Security issues

### P0 — do these first

- [ ] 🔒 **SEC · S · Remove the hardcoded JWT secret fallback**
  `backend/src/auth/auth.module.ts:18` and `backend/src/auth/strategy/jwt.strategy.ts:19` both do `config.get('JWT_SECRET') || 'launchup-dev-secret'`.
  **Why it matters:** if `JWT_SECRET` is unset in a deployed environment, every token is signed with a string that is committed to a public repo — anyone can forge an Admin token. The `||` fallback means this fails *silently*, with no boot error.
  **Fix:** throw on startup if `JWT_SECRET` is missing. Also decide whether `frontend/src/hooks.server.ts:45` should keep its matching fallback (it must not, for the same reason).
  *No dependencies. Do this one first — it's ten minutes.*

- [ ] 🔒 **SEC · M · Add `JwtGuard` to the entire coaching core — currently 100% public**
  `backend/src/rna/rna.controller.ts`, `backend/src/rns/rns.controller.ts`, `backend/src/initiative/initiative.controller.ts` have **no `@UseGuards` and no guard import anywhere in the file**. That is 21 routes — full CRUD plus all the AI-generation endpoints.
  `backend/src/roadblock/roadblock.controller.ts` is nearly as bad: only `@Delete(':id')` is guarded (`:43-44`), leaving 5 of 6 routes open.
  **Why it matters:** an unauthenticated request can read, create, edit, and delete every startup's RNA, next steps, initiatives, and roadblocks. It can also trigger `POST /rns/generate-tasks` etc., which spend your Gemini quota. This is the single largest hole in the app.
  **Fix:** class-level `@UseGuards(JwtGuard)` on all four controllers.
  *Blocks the ownership work below — add guards before adding ownership checks.*

- [ ] 🔒 **SEC · S · Un-comment the guard on chat history**
  `backend/src/chat_history/chat-history.controller.ts:5` — `// @UseGuards(JwtGuard)`.
  **Why it matters:** all four endpoints expose full AI conversation transcripts for any RNA/RNS/initiative/roadblock id, unauthenticated. These transcripts contain the startup's business details.
  *Same change as the item above; do them together.*

- [ ] 🔒 **SEC · S · Guard the file-upload endpoints**
  `backend/src/upload/upload.controller.ts:15` — no guard on `POST /upload/single` or `POST /upload/multiple`.
  **Why it matters:** anyone on the internet can upload arbitrary files (up to 10 at a time) into your DigitalOcean Spaces bucket at your cost. There is also no file-type or size validation.
  **Fix:** add `JwtGuard`, plus a MIME/extension allowlist and a size cap.

### P1 — before any real deployment

- [ ] 🔒 **SEC · M · Add ownership checks to startup detail endpoints (IDOR)**
  `backend/src/startup/startup.controller.ts:135-137` (`GET /startups/:startupId`) and every sibling route are `JwtGuard`-only. Row-level filtering exists **only** in the list endpoint, `StartupService.getStartups()` (`backend/src/startup/startup.service.ts:43-82`).
  **Why it matters:** any logged-in founder can read any other startup's full record — capsule proposal, members, waitlist messages — just by changing the id in the URL. Same for the readiness, RNA, and RNS endpoints once they're behind a guard.
  **Fix:** a reusable guard or service helper that asserts the requester owns / is a member of / mentors the startup, unless their role is Manager or Admin.
  *Depends on the guard work above.*

- [ ] 🔒 **SEC · S · Restrict the admissions endpoints to Manager/Admin**
  `POST /startups/:id/approve-applicant`, `PATCH /:id/waitlist-applicant`, `POST /:id/appoint-mentors`, `PATCH /:id/change-mentor`, `PATCH /:id/mark-complete` are all `JwtGuard`-only (`backend/src/startup/startup.controller.ts:30`).
  **Why it matters:** any authenticated founder can approve their own application, assign themselves a mentor, and mark themselves complete. The UI hides these, but the API doesn't.
  **Fix:** a `RolesGuard` + `@Roles(Role.Manager, Role.Admin)` decorator. `AdminGuard` (`backend/src/auth/guard/admin.guard.ts`) is a good template — generalize it rather than copying it.

- [ ] 🔒 **SEC · S · Guard the remaining unauthenticated modules**
  All public today: `backend/src/readiness/readiness.controller.ts:4`, `backend/src/progress/progress.controller.ts:4`, `backend/src/elevate/elevate.controller.ts:14`, `backend/src/ocr/ocr.controller.ts:4`, `backend/src/ai/baseline.controller.ts:4`, `backend/src/ai/ai-metrics.controller.ts:4`.
  **Why it matters:** leaks readiness scores and progress reports; `POST /ai/baseline/update` lets anyone rewrite the bias-normalization baseline that all AI scoring depends on.
  **Fix:** `JwtGuard` on all; `AdminGuard` additionally on `POST /ai/baseline/update`.

- [ ] 🔒 **SEC · S · Delete the raw-SQL debug endpoints**
  `backend/src/startup/startup.controller.ts:62` (`GET /startups/debug-evals`) and `backend/src/admin/admin.controller.ts:157` (`GET /admin/tiers/check-evals`) both execute hand-written SQL via `em.getConnection().execute()`.
  **Why it matters:** the first is reachable by any logged-in user and dumps every startup's score. Both are exactly the kind of thing a capstone panel will spot.
  **Fix:** delete both. Neither is called from the frontend (verified).

- [ ] 🔒 **SEC · S · Align cookie lifetime with token lifetime**
  Cookie `maxAge: 60 * 5 * 60` = **5 hours** (`frontend/src/routes/(auth)/login/+page.server.ts:54`, mirrored in `(auth-admin)/admin-login/+page.server.ts:57`) vs JWT `expiresIn: '24h'` (`backend/src/auth/auth.module.ts:19`).
  **Why it matters:** two different session lengths, neither intentional. The 24h token stays valid for 19 hours after the browser stops sending it — so a leaked token outlives the visible session. Also see the matching bug in §2.
  **Fix:** pick one duration and derive the other from it.

- [ ] 🔒 **SEC · S · Fix `@GetUser('sub')`, which silently ignores its argument**
  `backend/src/auth/decorator/get-user.decorator.ts:5-7` returns the whole `request.user` regardless of the key passed. So `updateProfile(userId, …)` at `backend/src/user/user.controller.ts:33` actually receives a full `User` entity, not a number.
  **Why it matters:** it currently works only because MikroORM coerces an entity to its PK inside a filter. The signature lies, the types lie, and the next person to use this decorator with a key will get a silent wrong value.
  **Fix:** honour the `data` argument (`return data ? request.user?.[data] : request.user`) and correct the call site — note `sub` is not a property of the `User` entity, so it should be `'id'`.

- [ ] 🔒 **SEC · S · Reconsider client-side role checking on the admin login**
  `frontend/src/routes/(auth-admin)/admin-login/+page.server.ts:41-49` base64-decodes the JWT payload and rejects non-Admins *without verifying the signature*.
  **Why it matters:** it runs server-side so it isn't directly exploitable, and `/admin/*` is separately guarded — but it reads as "we trust an unverified JWT," and a reviewer will flag it. Verify with `jose` (already a dependency) or just call a `/auth/me` endpoint.

---

## 2. Broken functionality

Each of these was verified by reading **both** sides of the call.

- [ ] 🐞 **BUG · M · Readiness-level rubric submission posts to two endpoints that don't exist**
  `frontend/src/routes/(app)/startups/[id]/readiness-level/+page.server.ts:64` posts to `/readiness-level-criterion-answers/bulk-create/` and `:78` to `/startup-readiness-levels/bulk-create/`. **Neither route exists anywhere in the backend.** The whole block sits in a `try` whose `catch` is empty (`:104`), so it fails silently, and on "success" it redirects to `/mentor/startups/qualified/:id` — also not a route.
  **Why it matters:** this is the mentor's core task and the gate for the entire coaching chain (`allow-rnas` depends on `StartupReadinessLevel` rows existing). If the working path is really `POST /readinesslevel/startup/:startupId/rate`, this legacy action is dead weight that will burn you in a demo.
  **Fix:** confirm which path the UI actually uses, then rewrite or delete this action. Remove the empty `catch` either way — silent failure is what hid this.
  *Highest-value item in this section.*

- [ ] 🐞 **BUG · S · Removing a team member uses the wrong verb and payload shape**
  `frontend/src/routes/(app)/startups/[id]/overview/members/+page.svelte:155` calls `axiosInstance.delete('/startups/remove-member/:memberId/')` with `{startupId}` in the body. The backend is `@Post('remove-member')` reading `userId` **and** `startupId` from the body (`backend/src/startup/startup.controller.ts:97-103`).
  **Why it matters:** wrong method *and* wrong shape — removing a member always fails.
  **Fix:** `axiosInstance.post('/startups/remove-member', { userId: memberId, startupId })`.

- [ ] 🐞 **BUG · S · Assessment preview dialog calls a non-existent `/fields` route**
  `frontend/src/lib/components/dashboard/sub/AssessmentPreviewDialog.svelte:30` fetches `/assessments/:id/fields`. No `fields` route exists in `backend/src/assessment/`.
  **Why it matters:** this component *is* mounted — `QualifiedDialog` → `/applications` (Manager) and `ApprovalDialog` → `PendingDialog`/`WaitlistedDialog`. So a Manager opening an applicant's assessment preview gets an empty or erroring dialog.
  **Fix:** point at `GET /assessments/:id`, or add the endpoint if per-field data is genuinely needed.

- [ ] 🐞 **BUG · S · Re-uploading a capsule proposal during edit hits a commented-out endpoint**
  `frontend/src/routes/(app)/startups/+page.server.ts:63` calls `PATCH /startups/:id/with-capsule-proposal`. The handler is commented out at `backend/src/startup/startup.controller.ts:231`.
  **Why it matters:** editing a startup *and* attaching a new proposal PDF silently fails. Editing without a file works (different branch), so this is easy to miss in testing.
  **Fix:** either restore the handler or route the file through `POST /startups/parse-capsule-proposal` + `PATCH /startups/:id/capsule-proposal`.

- [ ] 🐞 **BUG · S · Admin "create assessment type" posts to a GET-only route**
  `frontend/src/routes/(app)/admin/assessments/+page.server.ts:47` does `POST /assessments/types`; the backend only declares `@Get('types')` (`backend/src/assessment/assessment.controller.ts:41`).
  **Why it matters:** the action always 404s. Note `AssessmentType` is a **TypeScript enum** (`backend/src/entities/enums/assessment-type.enum.ts`), not a table — so "creating a type" at runtime isn't possible without a schema change. This may be a ❓SCOPE item in disguise.
  **Fix:** decide whether types are fixed (remove the UI) or dynamic (needs a new table + endpoints — that's L, not S).

- [ ] 🐞 **BUG · S · Elevate page queries a non-existent `/startup-rna/` endpoint**
  `frontend/src/routes/(app)/startups/[id]/overview/elevate/+page.svelte:71` calls `getData('/startup-rna/?startup_id=…')`. The real prefix is `/rna` (`backend/src/rna/rna.controller.ts:15`).
  **Why it matters:** the RNA panel on the Elevate tab never populates.
  **Fix:** change to `/rna?startupId=…` to match `@Get()` + `@Query('startupId')`.

- [ ] 🐞 **BUG · S · Approve-applicant is two non-transactional calls**
  `frontend/src/routes/(app)/applications/+page.svelte:80-113` fires `approve-applicant`, then `appoint-mentors`, with no rollback between them.
  **Why it matters:** if the second call fails, the startup is `QUALIFIED` with no mentor — it lands in a state no screen is designed to show, and the Manager gets no error.
  **Fix:** either a single backend endpoint that does both in one `em.transactional()`, or handle the partial failure explicitly in the UI.

- [ ] 🐞 **BUG · S · `GET /readiness/:startupId` writes to the database on every read**
  `backend/src/readiness/readiness.service.ts:196-241` persists a new `readiness_evaluations` row plus one `readiness_gaps` row per dimension on every call.
  **Why it matters:** the table grows by 6 rows per page view. Any "evaluation history" feature built on it will be meaningless noise, and `readinessEvaluations` is eagerly populated in several `getStartups` queries — so payloads grow unboundedly too.
  **Fix:** move persistence to the explicit `POST /readiness/score` endpoint and make the `GET` pure. *(Check `ReadinessDashboard.svelte` — it already calls `/readiness/score`, so the write may simply be redundant.)*

- [ ] 🐞 **BUG · S · Logout clears a `Refresh` cookie that is never set**
  `frontend/src/routes/(auth)/logout/+page.server.ts:19-22`. The refresh interceptor in `frontend/src/lib/axios.ts:13-45` is fully commented out and no `/tokens/refresh/` endpoint exists.
  **Why it matters:** harmless on its own, but it implies a refresh flow that doesn't exist. Combined with the 5h cookie, users are silently logged out mid-session with no renewal path.
  **Fix:** delete the dead cookie clear, and decide whether refresh tokens are in scope (❓SCOPE if yes — that's M–L).

---

## 3. Incomplete features — need a scope decision

These are **not** simple code fixes. Each needs a *fix it / cut it / leave it hidden* call from you. For a capstone, "cut it cleanly" is usually the stronger answer than "leave it half-built."

- [ ] ❓ **SCOPE · L · Analytics and Cohorts pages have no backend at all**
  `frontend/src/routes/(app)/analytics/+page.svelte:16,31,46` and `.../cohorts/+page.svelte:16,31,46` call `/analytics/startups/`, `/analytics/elevate-logs/`, and `/cohorts`. **There is no analytics controller and no cohorts controller in the backend** — and no cohort entity either. Both pages are ~190 lines of finished UI, Manager-gated, and commented out of the nav (`frontend/src/lib/access.ts:104-113`).
  **Decision:** *Cut* (delete both routes + nav entries — recommended, cohorts are a whole domain concept that doesn't exist), or *Fix* (build a cohort entity, controller, and aggregation service — this is genuinely large).

- [ ] ❓ **SCOPE · M · `ManageAssessmentTypes.svelte` is orphaned and every call in it is broken**
  `frontend/src/lib/components/admin/assessment/ManageAssessmentTypes.svelte` — **not imported anywhere** (verified). All 8 fetches target `/assessment/*` (singular); the real prefix is `/assessments`, and no `fields` routes exist: `:39`, `:56`, `:64`, `:75`, `:85`, `:108`, `:114`, `:126`.
  **Decision:** *Cut* (delete the file — recommended), or *Fix* (needs the dynamic assessment-type work from §2 first).
  *Related to the "create assessment type" bug above — decide both together.*

- [ ] ❓ **SCOPE · S · Regulatory readiness is collected but never scored**
  `ReadinessService` maps only 5 of the 6 readiness types (`backend/src/readiness/readiness.service.ts:38-73`): Acceptance→team, Market→market, Technology→product, Organizational→traction, Investment→funding. **Regulatory (`ReadinessType.R`) has no weight and no dimension.**
  **Why it matters:** founders answer Regulatory questions in the application and mentors grade Regulatory rubrics, and none of it affects the score. If a panel asks "why six dimensions but five weights?", there needs to be an answer.
  **Decision:** *Fix* (add a 6th dimension and rebalance weights so they still sum to 1.0), or *Leave + document* (state explicitly in the SDD that Regulatory is tracked but not scored, and say why).

- [ ] ❓ **SCOPE · S · Readiness scores are clamped to 0–5 but levels run 1–9**
  `backend/src/readiness/readiness.service.ts:129` — `Math.min(5, …)`, while `readiness_levels.level` is populated 1–9 and the rubric UI renders 9 levels.
  **Why it matters:** a startup at level 9 scores identically to one at level 5. That directly undermines "Enhance Startup Readiness Differentiation," which is objective 2.3 in `docs/SRS.md`.
  **Decision:** *Fix* (clamp to 9 and divide by 9 — small change, but it shifts every tier boundary, so `tier_configs` needs revisiting too), or *Leave + document* the 5-level design intent.
  *If you fix this, re-check the §1 tier thresholds and any seeded `tier_configs`.*

- [ ] ❓ **SCOPE · S · Three finished features are hidden from navigation**
  Commented out in `frontend/src/lib/access.ts`: Progress Report (`:36-40`), Analytics (`:104-108`), Cohorts (`:109-113`). Progress Report is fully working — UI plus `GET /progress/:startupId/progress-report`.
  **Decision:** Progress Report looks like a *re-enable* (one line, and it works). Analytics/Cohorts fold into the first item in this section.

- [ ] ❓ **SCOPE · M · "Rate applicant" was designed but never built**
  `frontend/src/lib/components/admin/PendingTab.svelte:105-107` — a commented-out call to `/startups/:id/rate-applicant/` with the note *"COMMENT FOR NOW, NEED TO IMPLEMENT BACKEND FIRST."* The `RatedTab` component and a `rated` tab in `/applications` both exist.
  **Why it matters:** there's a visible "rated" state in the admissions UI with no way to reach it.
  **Decision:** *Cut* the rated tab and the three orphaned Tab components, or *Fix* by building the scoring endpoint.

- [ ] ❓ **SCOPE · M · `overview` module is an empty shell**
  `backend/src/overview/overview.controller.ts` declares `@Controller('overview')` with **zero routes**, yet the module is imported in `backend/src/app.module.ts:69`. The frontend's four Overview tabs get their data from `/startups/:id` instead.
  **Decision:** *Cut* the module (recommended — the tabs work without it), or *Fix* by moving the overview aggregation here.

- [ ] ❓ **SCOPE · L · No refresh-token flow**
  See the logout bug in §2. Deliberate omission or missing feature?
  **Decision:** *Leave* (document that sessions are fixed-length — fine for a capstone), or *Fix* (refresh endpoint + rotation + interceptor).

---

## 4. Cleanup / tech debt

- [ ] 🧹 **DEBT · S · Delete three orphaned admin Tab components**
  `frontend/src/lib/components/admin/PendingTab.svelte`, `AcceptedTab.svelte`, `RatedTab.svelte` — **none are imported anywhere** (verified). `RatedTab.svelte` also calls `/readinesslevel/:id/calculator-final-scores/`, which doesn't exist (the real route is `/startups/:id/calculator-final-scores`).
  *Coupled to the "rate applicant" scope decision — resolve that first.*

- [ ] 🧹 **DEBT · S · Delete `ReadinessCard.svelte`**
  `frontend/src/lib/components/dashboard/ReadinessCard.svelte` — orphaned (verified). Note `ReadinessDashboard.svelte`, which it wraps, *is* used in three places, so delete only the card.

- [ ] 🧹 **DEBT · S · Drop three unused entities and their tables**
  Never referenced by any service or controller (verified across the whole backend):
  - `MentorAssignment` (`backend/src/entities/mentor-assignment.entity.ts`) — mentor assignment actually writes to the `startups`↔`users` pivot (`backend/src/startup/startup.service.ts:942-963). Misleading, because the entity looks like the source of truth and even has an `assignedBy` audit field the real path lacks.
  - `ConsultationRequest` (`consultation-request.entity.ts`)
  - `ScoringGuide` (`scoring-guide.entity.ts`)
  **Fix:** delete the entities and add a migration to drop the tables. *If the `assignedBy`/`isActive` audit trail is actually wanted, that's a ❓SCOPE item instead — switch mentor assignment over to this entity.*

- [ ] 🧹 **DEBT · S · Consolidate duplicate enums and tables**
  - `RnsStatus` (integer-backed, `backend/src/entities/enums/rns.enum.ts`) and `Status` (string-backed, `enums/status.enum.ts`) define the same seven states. `Status` also carries a Cebuano comment (`// basin pwede sa RNS…`) that should go before submission.
  - `recommendations` (`recommendation.entity.ts`, written by `rna/recommendation-storage.service.ts`) and `ai_recommendations` (`ai-recommendation.entity.ts`, written by `ai/ai.service.ts:135`) overlap heavily.
  **Fix:** pick one of each and migrate.

- [ ] 🧹 **DEBT · S · Remove committed scratch files**
  All tracked in git: `backend/test-login.js` (0 bytes), `frontend/fix-page.cjs`, `frontend/src/routes/(app)/admin/assessments/+page.svelte.backup`, `frontend/src/routes/(app)/admin/assessments/temp_fix.txt`, `chumcheck_2025-03-04_025337.sql` (561 KB).
  Also untracked but sitting in the repo root: `backend.zip` (116 MB) and `frontend.zip` (84 MB) — add to `.gitignore` or delete.
  **Why it matters:** `.backup` and `temp_fix.txt` files next to the code they patch are the first thing a reviewer notices.

- [ ] 🧹 **DEBT · S · Purge `chumcheck` references**
  `scripts/reset_db.sh`, `scripts/reset_db.ps1`, `scripts/delete_db.sh` all target a database named `chumcheck` with user `postgres`, while `docker-compose.yml` creates `launchup_db` / `launchup_user`.
  **Why it matters:** running any of these scripts does nothing to your actual dev database — or worse, drops an unrelated one. Update or delete them.

- [ ] 🧹 **DEBT · M · Resolve migrations vs. `updateSchema()`**
  `backend/src/main.ts:292` calls `orm.getSchemaGenerator().updateSchema()` on every boot, while 93 migration files sit in `backend/src/migrations/`.
  **Why it matters:** the migrations are effectively inert; the auto-sync is what shapes the dev DB. Schema drift is invisible, and a migration you write won't obviously do anything. Auto-sync on boot is also unsafe against a production database.
  **Fix:** pick one strategy. For a capstone, gating `updateSchema()` behind `if (process.env.NODE_ENV !== 'production')` is a reasonable compromise.

- [ ] 🧹 **DEBT · S · Move demo seeding out of `bootstrap()`**
  `backend/src/main.ts:16-268` — ~250 lines of seeding logic (including a large commented-out block at `:97-148`) runs on every startup, with `console.log` output per record.
  **Fix:** move to a seeder script (`backend/seed-*.js` already exist) invoked by an npm script, and gate it on a `SEED_DEMO` env flag.

- [ ] 🧹 **DEBT · S · Remove `console.log` debugging from request paths**
  e.g. `backend/src/startup/startup.controller.ts:216-226` logs full request and response bodies on every capsule-proposal PATCH; `frontend/src/routes/(app)/admin/+page.server.ts:14,19` logs on every admin page load.
  **Why it matters:** the backend one writes startup proposal contents to logs.

- [ ] 🧹 **DEBT · S · Fix the doubled route segment `/startups/startups`**
  `backend/src/startup/startup.controller.ts:31` (`@Controller('startups')`) + `:38` (`@Get('/startups')`).
  **Why it matters:** cosmetic, but confusing — and note `backend/src/assessment/startup-assessment.controller.ts:16` *also* claims the `startups` prefix, so route ownership is already split across two files.
  **Fix:** change to `@Get()`; update the two frontend callers (`(app)/startups/+page.server.ts:11`, `(app)/startups/+page.svelte`).

- [ ] 🧹 **DEBT · S · Delete commented-out dead code**
  Largest blocks: `backend/src/startup/startup.controller.ts:231-310` (the `with-capsule-proposal` handler — resolve the §2 bug first), `frontend/src/lib/axios.ts:13-45` (refresh interceptor), `backend/src/app.controller.ts:75-89`, `frontend/src/routes/(app)/startups/[id]/+layout.server.ts:12-40`.

- [ ] 🧹 **DEBT · S · Add `README.md` corrections**
  `README.md:29` lists `DISQUALIFIED` as a qualification status; the enum has no such value — it has `COMPLETED` (`backend/src/entities/enums/qualification-status.enum.ts`). The README also doesn't mention that `JWT_SECRET` must match across both `.env` files, which is the most common setup failure.

---

## Quick reference — what's *not* broken

Checked and confirmed fine, so you don't re-investigate:

- ✅ `.env` files are **not** tracked in git — only `.env.example` (verified via `git ls-files`).
- ✅ `backend.zip` / `frontend.zip` are untracked (though they should still be gitignored).
- ✅ Admin module guard coverage is correct — class-level `@UseGuards(JwtGuard, AdminGuard)` on all 18 routes.
- ✅ Assessment module guards are correct — class-level `JwtGuard` + method-level `AdminGuard` on create/update/delete.
- ✅ Password handling is sound — argon2 hashing, `@Property({hidden: true})` on `User.hash`, and old-password verification on change.
- ✅ Cookies are `httpOnly` + `sameSite: 'strict'` + `secure` outside dev.
- ✅ The global `ValidationPipe` uses `whitelist: true`, so DTOs strip unknown properties.
