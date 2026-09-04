# LaunchUp — Architecture Reference

Written from a full read of the repository. Every claim cites its source file.

> **Accuracy:** this describes what the code does today, which in places differs from `README.md` and from what the UI implies. Broken paths, dead code, and known gaps are tracked in **[TODO_CHECKLIST.md](../TODO_CHECKLIST.md)**, not here.

---

## 1. What this system is

LaunchUp is a **startup incubation-and-readiness management platform**, almost certainly built for a **university-affiliated incubator or accelerator program** (startup records carry `universityName` and `groupName` — `backend/src/entities/startup.entity.ts:46-50`).

### The core domain model in one paragraph

A **Startup** applies with a *capsule proposal* (a PDF that AI parses into structured fields). It is scored on **six readiness dimensions** — Technology, Market, Acceptance, Organizational, Regulatory, Investment (`backend/src/entities/enums/readiness-type.enum.ts`) — each on a **1–9 level scale** with per-level rubric criteria. Those readiness levels drive a coaching chain:

```
Readiness Levels  →  RNA  →  RNS  →  Initiatives
(where you are)      (what      (what to    (concrete
                     you need)   do next)    tasks)
                                    ↘  Roadblocks (what's blocking you)
```

- **RNA** = *Readiness and Needs Assessment* — a narrative per readiness dimension
- **RNS** = *Recommended Next Steps* — prioritized, status-tracked, assignee-owned
- **Initiatives** = tasks hanging off an RNS, with measures/targets/remarks
- **Roadblocks** = risk-numbered obstacles with a proposed fix

Every one of those four artifacts can be **AI-generated** (`isAiGenerated` flag), **refined via chat** (each has its own chat-history table), and moves through a **status workflow with mentor approval**.

### Tech stack

| Layer | Choice | Where |
|---|---|---|
| Backend | NestJS 11 + TypeScript | `backend/src/` |
| ORM | MikroORM 6 (PostgreSQL driver; SQLite fallback) | `backend/src/mikro-orm.config.ts` |
| Auth | Passport JWT + argon2 hashing | `backend/src/auth/` |
| AI | Google Gemini, model/temperature/pipeline flags env-configured via `AiConfigService` (default model `gemini-3.6-flash`) | `backend/src/ai/ai-config.service.ts:21` |
| OCR | Tesseract.js (+ `eng.traineddata`), Gemini Vision for handwriting | `backend/src/ocr/` |
| File storage | `@aws-sdk/client-s3`, any S3-compatible endpoint via `S3_*` (unset by default) | `backend/src/upload/` |
| Frontend | SvelteKit 2 / Svelte 5 (runes) | `frontend/src/` |
| Styling | TailwindCSS + shadcn-svelte (`bits-ui`) | `frontend/tailwind.config.ts`, `frontend/src/lib/components/ui/` |
| Client data | `@sveltestack/svelte-query` + axios | `frontend/src/lib/axios.ts` |
| Forms | `sveltekit-superforms` + zod | e.g. `frontend/src/routes/(auth)/login/+page.server.ts` |

The two apps are **independent** — separate lockfiles, no workspace config, deployed separately (`backend/vercel.json`, `frontend/vercel.json`; CORS in `backend/src/main.ts:279-289` also whitelists a Render URL).

---

## 2. Roles and permissions

Three roles exist in the database, defined in `backend/src/entities/enums/role.enum.ts`:

```ts
Startup | Mentor | Manager
```

These are the three user classes SRS §2.3 defines. A fourth `Admin` role existed until 2026-09-04; SDD §1.4 puts every administrative function behind Manager, so it was drift and was removed.

**Manager is the administrative role and holds full capabilities** — a product decision taken 2026-09-04. Where the SRS/SDD describe a Manager surface as read-only (SDD's "Startup Capsule Proposal Viewer"), the documents are to be revised, not the code. Recorded here so the deviation reads as deliberate.

New signups **always** get `Role.Startup` — the enum default in `backend/src/entities/user.entity.ts:32` is never overridden by `AuthService.signup` (`backend/src/auth/auth.service.ts:17-34`). **Only a Manager can mint a Mentor or another Manager**, via `POST /admin/users/create-json` (`backend/src/admin/dto/create-user.dto.ts` requires an explicit `role`).

### 2.1 Where permissions are actually enforced

This is the single most important thing to understand about the codebase — **authorization is spread across five places that must agree**, and today they don't:

| # | Mechanism | File | What it controls |
|---|---|---|---|
| 1 | `JwtGuard` (passport) | `backend/src/auth/guard/jwt.guard.ts` | Is there a valid bearer token at all |
| 2 | `AdminGuard` | `backend/src/auth/guard/admin.guard.ts` | `req.user.role === Role.Manager` — named for the `/admin` surface, not a role; **reads `req.user`, so it must be paired with `JwtGuard`** |
| 3 | Service-level role branching | `backend/src/startup/startup.service.ts:43-82` | *Which rows* a user sees |
| 4 | SvelteKit route guards | `frontend/src/hooks.server.ts:7-13`, plus per-route `+page.server.ts` | Which pages render |
| 5 | Nav config | `frontend/src/lib/access.ts` | Which links appear |

Two caveats that matter a great deal:

- **#5 is cosmetic only** — hiding a nav item does not protect the route, and `frontend/src/lib/components/shared/can-access.svelte` is likewise a pure render-gate.
- **#1 and #2 are not applied consistently.** Ten of the 21 controllers have partial or zero guard coverage, including the three that own the coaching core. In practice #4 (SvelteKit route guards) is doing most of the real access control, which only works as long as every request goes through the SvelteKit server. See §4.4 for the full audit; the consequences are tracked in [TODO_CHECKLIST.md](../TODO_CHECKLIST.md) §1.

### 2.2 Role capability matrix

| Capability | Startup | Mentor | Manager |
|---|:---:|:---:|:---:|
| Register self | ✅ | — | — |
| Submit an application | ✅ | | |
| See **own** startups only | ✅ | | |
| See **assigned** startups only | | ✅ | |
| See **all** startups | | | ✅ |
| Approve / waitlist applicants | | | ✅ |
| Assign & change mentors | | | ✅ |
| Rate readiness levels (rubrics) | | ✅ | ✅ |
| Generate AI artifacts (RNA/RNS/etc.) | ✅¹ | ✅ | ✅ |
| **Approve** status changes | | ✅ | ✅ |
| *Request* status changes (needs approval) | ✅ | | |
| Admin hub (`/admin/*`) | | | ✅ |
| Create users with any role | | | ✅ |
| Configure scoring tiers | | | ✅ |
| Review AI bias audits / OCR docs | | | ✅ |
| Edit a capsule proposal | ✅ (own) | | ✅ (any) |

¹ Gated by pipeline state, not by role — see §2.4.

### 2.3 The row-level visibility rule

`StartupService.getStartups()` (`backend/src/startup/startup.service.ts:43-82`) switches on role:

```
Startup  →  startups where user is owner OR in members
Mentor   →  startups where user is in mentors
Manager  →  findAll()
```

This is the real data boundary. Everything else in the startup module is `JwtGuard`-only, meaning **any authenticated user can call `GET /startups/:id` for any startup id** — there is no ownership check on the detail endpoints (`backend/src/startup/startup.controller.ts:135-137`).

### 2.4 Pipeline gates (not role gates)

Four endpoints gate *features* on *data existing*, independent of who you are (`backend/src/startup/startup.service.ts:965-990`):

| Endpoint | Unlocks when |
|---|---|
| `GET /startups/:id/allow-rnas` | ≥1 `StartupReadinessLevel` row exists |
| `GET /startups/:id/allow-tasks` | ≥1 `StartupRNA` row exists |
| `GET /startups/:id/allow-initiatives` | ≥1 `StartupRNA` row exists |
| `GET /startups/:id/allow-roadblocks` | ≥1 `StartupRNA` row exists |

So the coaching chain is strictly sequential: **rate readiness → then RNA → then everything else**.

### 2.5 Manager rubric access (was the `Manager as Mentor` pseudo-role)

**Removed 2026-09-04.** A Manager used to flip a toggle at `/account/role`, setting an `isMentorRole=yes` cookie that rewrote `locals.user.role` to a synthetic `'Manager as Mentor'` string with its own `access.ts` entry. It was presentation-only — the JWT still said `Manager`, so every backend call already carried full Manager authority — but it was the *only* way a Manager reached the rubric-rating and member-management UI, both of which gated on the pseudo-role rather than on `Manager`.

Those gates now name `Manager` directly (`utils.ts`'s `canRateReadiness`, the `<Can>` block on the readiness page, three checks on the members page), so the capability is unconditional and matches §2.2. The toggle, its cookie, its route and the pseudo-role are gone.

---

## 3. End-to-end flows

### 3.1 Founder: signup → funded workspace

```
1.  /register  →  POST /auth/signup
      argon2.hash(password) → User{role: Startup} → signToken()
      (backend/src/auth/auth.service.ts:17-34)

2.  /login     →  POST /auth/signin
      argon2.verify → JWT{sub,email,role,firstName,lastName}, 24h
      SvelteKit action sets httpOnly cookie `Access`, then redirect 303 → /startups
      (frontend/src/routes/(auth)/login/+page.server.ts:47-58)

3.  /startups  →  empty state  →  /apply

4.  Wizard submit:
      POST /startups/apply                                  → Startup{PENDING}
      POST /readinesslevel/urat-question-answers/create      → 18 UratQuestionAnswer rows (6 types × 3)
      POST /readinesslevel/calculator-question-answers/create→ 7 CalculatorQuestionAnswer rows
      [optional] POST /startups/parse-capsule-proposal
                   → pdf-parse → Gemini → CapsuleProposal
      (frontend/src/routes/(app)/startups/+page.server.ts:216-258)

5.  → /startups/[id]/pending  (waiting room)

6.  ⏸ Manager decides (see 4.2)

7.  If QUALIFIED: workspace unlocks, but sub-modules stay gated
      until the mentor rates readiness (allow-rnas etc., §2.4)

8.  Ongoing loop:
      view RNA → work RNS kanban → drag a card
        → PATCH /rns/:id/roleDependent?role=Startup
        → approvalStatus='Pending'  ⏸ mentor must approve
```

### 3.2 Manager: application → admitted startup

```
1.  /login → /startups  (Managers land on the startups list, not /applications)

2.  /applications, tab=pending
      GET /startups/all      → every startup, populated with proposal + URAT + waitlist msgs
      GET /users?userRole=Mentor

3a. Approve:
      POST /startups/:id/approve-applicant   → qualificationStatus = QUALIFIED
      POST /startups/:id/appoint-mentors     → startup.mentors.set([...])
      then refetch all three svelte-query caches
      (frontend/src/routes/(app)/applications/+page.svelte:80-113)

3b. Waitlist:
      PATCH /startups/:id/waitlist-applicant {managerId, message}
        → WAITLISTED + StartupWaitlistMessage row
        → founder sees it via lib/components/startup/application/WaitlistedMessage.svelte

4.  Later: PATCH /startups/:id/mark-complete → COMPLETED
```

### 3.3 Mentor: assignment → approved next steps

```
1.  /login → /startups  → only assigned startups, PENDING filtered out

2.  /startups/[id]/readiness-level
      Score 6 dimensions × 9 levels × 6 criteria against rubric descriptions
      POST /readinesslevel/startup/:startupId/rate
        → StartupCriterionAnswer rows (unique on startup+criterion)
        → StartupReadinessLevel rows
      ⚡ This is the gate: allow-rnas now returns true

3.  /startups/[id]/rna
      GET /rna/:id/generate-rna
        → RagQueryService.queryVectorDatabase()      (rna/rag-query.service.ts:18)
        → GroundedPromptBuilderService.buildGroundedPrompt()
        → Gemini
        → OutputValidatorService.validateEach()      (flags unverifiable claims)
        → RecommendationStorageService.saveRecommendations()
      Refine conversationally: POST /rna/:id/refine  → RnaChatHistory rows

4.  Generate downstream artifacts:
      POST /rns/generate-tasks
      POST /initiatives/generate-initiatives
      POST /roadblocks/generate-roadblocks

5.  Approve founder requests:
      PATCH /rns/:id/roleDependent?role=Mentor
        → status applied directly, approvalStatus reset to 'Unchanged'
```

### 3.4 Manager: governance loop

```
1.  /manager-login  (separate door; Managers cannot sign in at /login, and
                    /login turns them away — both verify the JWT signature)
      → lands on /startups; /admin is reached from the main nav, which is
        the same header on every route (admin pages get a sub-row)
      → /admin dashboard, ActivityLog feed

2.  /admin/users        → provision Mentor / Manager accounts
                          (the ONLY way non-Startup roles are created;
                           the last Manager cannot be deleted)

3.  /admin/tiers        → set tier labels + thresholds
                          ⚡ changes classification for every startup, retroactively

4.  /admin/ai/bias-audits
                        → inspect raw vs corrected AI scores, override with justification
                          POST /admin/ai/bias-audits/override/:id

5.  /admin/ocr-documents
                        → review extracted text + confidence, flag illegible scans
                          POST /admin/ocr-documents/flag/:id
```

---

## 4. Frontend ↔ backend connection

### 4.1 Architecture: BFF, not proxy

The SvelteKit server is a **backend-for-frontend**, and it verifies tokens *itself* rather than asking NestJS:

```
Browser ──cookie: Access──▶ SvelteKit server ──Bearer: <same JWT>──▶ NestJS ──▶ Postgres
                                   │
                                   └─ jose.jwtVerify(cookie, JWT_SECRET)   ← no network hop
```

1. **Login** (`frontend/src/routes/(auth)/login/+page.server.ts`) — a form action calls `POST /auth/signin` server-side and sets the JWT as an httpOnly, `sameSite: 'strict'` cookie named `Access`.
2. **Every request** (`frontend/src/hooks.server.ts:43-69`) — `jose.jwtVerify` validates that cookie locally using `JWT_SECRET` and populates `event.locals.user`.
3. **Route protection** — `protectedRoutes = ['/account','/analytics','/applications','/startups','/admin']`; unauthenticated hits on `/admin*` go to `/admin-login`, everything else to `/login`, both preserving `?redirectTo=`.
4. **Data fetching** — `+page.server.ts` load functions forward the raw token as `Authorization: Bearer …` to NestJS.

⚠️ **This makes `JWT_SECRET` a shared secret between two apps.** If `backend/.env` and `frontend/.env` drift, every login silently produces a token the frontend rejects. Nothing checks this at boot.

### 4.2 Two client paths

| Path | Used by | Auth |
|---|---|---|
| SvelteKit `fetch` in `+page.server.ts` | Initial page loads, form actions | Manual `Authorization` header from `cookies.get('Access')` |
| `axios` (`frontend/src/lib/axios.ts`) + `svelte-query` | Client-side refetches, mutations | Manual header, passing `access` down from the load function |

Note the axios instance has **no auth interceptor** — the refresh-token logic is entirely commented out (`frontend/src/lib/axios.ts:13-45`), and there is no refresh endpoint on the backend. Sessions simply expire.

### 4.3 Backend auth internals

- **Signing** — `JwtModule.registerAsync`, `expiresIn: '24h'`, secret from `JWT_SECRET` with fallback `'launchup-dev-secret'` (`backend/src/auth/auth.module.ts:14-22`).
- **Validation** — `JwtStrategy.validate` **loads the full User from the database** on every request and returns it, so `req.user` is a hydrated `User` entity, not the raw payload (`backend/src/auth/strategy/jwt.strategy.ts:23-31`). That's why controllers use `req.user.id` and `req.user.role`.
- **Global pipes** — `ValidationPipe({whitelist: true, transform: true})` in `backend/src/main.ts:272-277`, so DTOs strip unknown properties.
- **CORS** — a fixed allowlist: `localhost:5173`, `127.0.0.1:5173`, `launchup.onrender.com`, `launchup.vercel.app` (`backend/src/main.ts:279-289`).

### 4.4 API surface by module

| Prefix | Controller | Notable endpoints |
|---|---|---|
| `/auth` | `auth/auth.controller.ts` | `POST /signup`, `POST /signin` |
| `/users` | `user/user.controller.ts` | `GET /?userRole=`, `GET /search`, `PATCH /profile`, `PATCH /password` |
| `/startups` | `startup/startup.controller.ts` | `GET /startups`, `GET /all`, `POST /apply`, `POST /parse-capsule-proposal`, `POST /:id/approve-applicant`, `PATCH /:id/waitlist-applicant`, `POST /:id/appoint-mentors`, `PATCH /:id/change-mentor`, `PATCH /:id/mark-complete`, `GET /:id/allow-*` |
| `/startups` (2nd) | `assessment/startup-assessment.controller.ts` | `POST /:id/assessments`, `GET /:id/assessments`, `POST /:id/responses` — **same prefix, different controller** |
| `/assessments` | `assessment/assessment.controller.ts` | `GET /`, `GET /grouped`, `GET /types`, `POST /` (Manager), `PATCH /:id` (Manager), `DELETE /:id` (Manager) |
| `/readinesslevel` | `readinesslevel/readinesslevel.controller.ts` | `GET /urat-questions`, `GET /calculator-questions`, `GET /readiness-levels`, `GET /criterion`, `POST /startup/:id/rate` |
| `/readiness` | `readiness/readiness.controller.ts` | `GET /:startupId`, `POST /score` — **no guard at all** |
| `/rna` | `rna/rna.controller.ts` | CRUD + `GET /:id/generate-rna`, `POST /:id/refine`, `GET /:id/check-complete` |
| `/rns` | `rns/rns.controller.ts` | CRUD + `POST /generate-tasks`, `POST /:id/refine`, `PATCH /:id/roleDependent` |
| `/initiatives` | `initiative/initiative.controller.ts` | CRUD + `POST /generate-initiatives`, `POST /:id/refine`, `PATCH /:id/roleDependent` |
| `/roadblocks` | `roadblock/roadblock.controller.ts` | CRUD + `POST /generate-roadblocks`, `POST /:id/refine` |
| `/chat-history` | `chat_history/chat-history.controller.ts` | `GET /{rns,initiatives,roadblocks,rna}/:id` — **guard commented out** (`:5`) |
| `/elevate` | `elevate/elevate.controller.ts` | `POST /`, `GET /:id` |
| `/progress` | `progress/progress.controller.ts` | `GET /:startupId/progress-report` |
| `/upload` | `upload/upload.controller.ts` | `GET /test-connection`, `POST /single`, `POST /multiple` → DO Spaces |
| `/ocr` | `ocr/ocr.controller.ts` | `GET /parse?file=` |
| `/ai/metrics`, `/ai/baseline` | `ai/*.controller.ts` | `GET /`, `GET /normalize?score=`, `POST /update` |
| `/admin` | `admin/admin.controller.ts` | All 18 admin routes — the **only** module with `AdminGuard` |
| `/overview` | `overview/overview.controller.ts` | **Empty — zero routes** |

⚠️ **Guard coverage is the weakest part of the system.** Verified by auditing `@UseGuards` placement across all 21 controllers:

| Controller | Guarded routes | Status |
|---|---|---|
| `admin` | 18 / 18 | ✅ class-level `JwtGuard, AdminGuard` |
| `assessments` | 10 / 10 | ✅ class `JwtGuard` + method `AdminGuard` on writes |
| `startups`, `users`, `startup-assessment` | all | ✅ class-level `JwtGuard` (but no *ownership* checks — see [TODO_CHECKLIST.md](../TODO_CHECKLIST.md) §1) |
| `readinesslevel` | 7 / 11 | ⚠️ reference-data GETs unguarded |
| `roadblocks` | **1 / 6** | ❌ only `@Delete(':id')` (`roadblock.controller.ts:43-44`) |
| **`rna`** | **0 / 7** | ❌ **no guard import in the file** |
| **`rns`** | **0 / 7** | ❌ **no guard import in the file** |
| **`initiatives`** | **0 / 7** | ❌ **no guard import in the file** |
| `chat-history` | 0 / 4 | ❌ guard commented out (`:5`) |
| `readiness`, `progress`, `elevate`, `upload`, `ocr`, `ai/*` | 0 | ❌ fully public |

The three zero-guard modules — `rna`, `rns`, `initiatives` — are **the entire coaching core**. Together with `roadblocks` that is 26 unauthenticated routes covering full CRUD plus every AI-generation endpoint. See [TODO_CHECKLIST.md](../TODO_CHECKLIST.md) §1.

---

## 5. Database schema

MikroORM entities in `backend/src/entities/`, all mapped to explicit `tableName`s. ~30 tables.

### 5.1 Identity and membership

```
users (users)                          backend/src/entities/user.entity.ts
  id, email (unique), hash (hidden), firstName?, lastName?, role[enum]
    1─∞ startups.user           (owns)
    ∞─∞ startups.members        (is on the team)
    ∞─∞ startups.mentors        (mentors)
    1─∞ roadblocks.assignee, rns.assignee

startups (startups)                    backend/src/entities/startup.entity.ts
  id, name, user_id→users, qualificationStatus[enum], dataPrivacy, eligibility,
  links(text/JSON), groupName?, universityName?, datetimeDeleted? (soft delete)
    1─1 capsule_proposals
    1─∞ startups_readiness_level, rna, rns, roadblocks, initiatives,
        urat_question_answers, calculator_question_answers,
        startup_waitlist_messages, readiness_evaluations,
        recommendations, rag_retrieval_logs

mentor_assignments                     backend/src/entities/mentor-assignment.entity.ts
  startup, mentor, assignedBy?, assignedAt, isActive
  ⚠️ Defined but UNUSED — appointMentors() writes to the startups↔users
     pivot instead (startup.service.ts:942-963). Dead table.
```

`QualificationStatus` — `backend/src/entities/enums/qualification-status.enum.ts`:
```
PENDING=1 → WAITLISTED=2 → QUALIFIED=3 → COMPLETED=4
```
Stored as **integers**, so the frontend compares against numeric literals.

### 5.2 Readiness assessment core

```
readiness_levels                       readiness-level.entity.ts
  id, level (1..9), name, readinessType[T|M|A|O|R|I]
    1─∞ level_criteria, scoring_guide

level_criteria                         level-criterion.entity.ts
  criteria, excellent/good/fair/poor/very_poor_description, readinessLevel
    ↑ the rubric text a mentor grades against

startups_criterion_answers             startup-criterion-answer.entity.ts
  score, remark?, criterion→level_criteria, startup
  UNIQUE(startup, criterion)   ← one answer per criterion per startup

startups_readiness_level               startup-readiness-level.entity.ts
  readinessLevel, startup, remark?, createdAt, updatedAt
    ↑ THE pivot that says "this startup is at level N in dimension X"
      Gates allow-rnas; feeds ReadinessService scoring.

elevate_logs                           elevate-log.entity.ts
  startup, readinessLevel, level, createdAt   ← promotion history

scoring_guide                          scoring-guide.entity.ts
  readinessLevel, description
  ⚠️ Defined but UNUSED — no service or controller references it. Dead table.
```

### 5.3 Scoring and tiers

```
readiness_evaluations                  readiness-evaluation.entity.ts
  startup, compositeScore, tierLabel, isProvisional, warning?, timestamps
    1─∞ readiness_gaps (dimensionKey, score, tierThreshold, shortfall)

tier_configs                           tier-config.entity.ts
  tierLabel, threshold

weight_profiles                        weight-profile.entity.ts
  sector?, businessModel?, weights(json), timestamps
```

**How scoring works** (`backend/src/readiness/readiness.service.ts`) — worth understanding because the naming is misleading:

| Score dimension | Reads readiness type | Default weight |
|---|---|---|
| `team` | **A** — Acceptance | 0.28 |
| `market` | **M** — Market | 0.22 |
| `product` | **T** — Technology | 0.18 |
| `traction` | **O** — Organizational | 0.14 |
| `regulatory` | **R** — Regulatory | 0.10 |
| `funding` | **I** — Investment | 0.08 |

These default weights are authored, with no external source (`readiness.weights.ts`) — unlike the RAG corpus, no provenance citation applies here.

Three things to know:
- The 6 score dimensions are **relabelings** of readiness types, and the mapping is not intuitive (`team ← Acceptance`, `traction ← Organizational`).
- Weights are **not hardcoded any more**. `WeightProfileService.resolve(sector, businessModel)` walks a four-step cascade — `(sector, businessModel)` → `(sector, null)` → the global `(null, null)` row → the `DEFAULT_WEIGHTS` constants — falling through to `DEFAULT_WEIGHTS` if nothing in the table validates. Profiles that are missing a dimension or don't sum to 1.0 (±0.001) are skipped with a warning rather than applied. `tier_configs.weights` was **deleted**: it was keyed per *tier*, so a startup crossing a tier boundary would have had its weights swapped underneath it, making the composite non-monotonic.
- Levels score as a fraction of **9** (`MAX_LEVEL`), matching the 1–9 rubric. This was previously clamped to 0–5 and divided by 5, which inflated every score.
- Tier thresholds come from `tier_configs` if any rows exist, otherwise fall back to hardcoded Strong/Ready/Emerging/Developing/Early at 85/70/55/40/25 (`:159-180`). **This is what `/admin/tiers` edits.**
- Calling `GET /readiness/:startupId` **writes** a new `readiness_evaluations` row plus gap rows every single time (`:196-241`) — it's a read endpoint with a side effect, so this table grows on every page view.

### 5.4 Application intake

```
capsule_proposals                      capsule-proposal.entity.ts
  1─1 with startups. title, description, problemStatement, targetMarket,
  solutionDescription, objectives(json), historicalTimeline(json),
  competitiveAdvantageAnalysis(json), members(json),
  intellectualPropertyStatus, curriculumVitae?, scope, methodology,
  aiAnalysisSummary   ← the Gemini-written summary

urat_questions / urat_question_answers
  question + readinessType; answer has response(text) + score (default 1)

calculator_questions / calculator_question_answers
  question, score, category[7 CalculatorCategory values]

startup_waitlist_messages
  startup, manager→users, message, createdAt
```

### 5.5 The coaching chain

```
rna (rna)                              rna.entity.ts
  readiness_level_id, startup_id, is_ai_generated, rna(text), timestamps,
  generationRun?→ai_generation_runs

rns (rns)                              rns.entity.ts
  priorityNumber, description, targetLevel→readiness_levels, readinessType,
  status[RnsStatus], requestedStatus[RnsStatus], approvalStatus, isAiGenerated,
  clickedByMentor, clickedByStartup, startup, assignee→users,
  generationRun?→ai_generation_runs

initiatives                            initiative.entity.ts
  priorityNumber, initiativeNumber, rns→rns, description, measures, targets,
  remarks, status/requestedStatus/approvalStatus, clicked flags, assignee, startup,
  generationRun?→ai_generation_runs

roadblocks                             roadblock.entity.ts
  riskNumber, description, fix, status/requestedStatus/approvalStatus,
  clicked flags, assignee, startup, generationRun?→ai_generation_runs
```

`generationRun` (nullable FK, `ON DELETE SET NULL`) on rna/rns/initiatives/roadblocks/ai_recommendations/ai_bias_audits attributes each generated row back to the `ai_generation_runs` row that produced it — see §5.7.

The **triple-status pattern** (`status` + `requestedStatus` + `approvalStatus`) on rns/initiatives/roadblocks is the mechanical basis of the founder-requests / mentor-approves workflow in §3.1.

`RnsStatus` (`enums/rns.enum.ts`, integer-backed): New=1, Scheduled=2, On Track=3, Completed=4, Delayed=5, Discontinued=6, Long Term=7. Note `enums/status.enum.ts` defines the *same* set as strings — two parallel enums for one concept.

### 5.6 Chat history (one table per artifact)

```
RnaChatHistory        → rna,        role, content, createdAt, refinedRna?
RnsChatHistory        → rns,        …, refinedDescription?
RoadblockChatHistory  → roadblock,  …, refinedDescription?, refinedFix?
InitiativeChatHistory → initiative, …, refinedDescription?, refinedMeasures?,
                                       refinedTargets?, refinedRemarks?
```

Each stores the conversation *and* the refined field values the model proposed, so a refinement can be reviewed before it's applied. These four are the only entities **without** an explicit `tableName` — MikroORM derives snake_case names for them.

### 5.7 AI governance and RAG

```
ai_generation_runs   startup?, operation[rna|rna_refine|rns|rns_refine|
                     initiatives|initiatives_refine|roadblocks|roadblocks_refine],
                     model, config(json), status[running|completed|failed],
                     latencyMs?, promptTokens?, completionTokens?, error?
                       ↑ one row per AI generation call (AiRunService.track());
                         records the resolved AiPipelineConfig so every
                         generated artifact is attributable to the exact arm
                         of a baseline-vs-enhanced comparison
ai_recommendations   dimensionKey, recommendationKind, content,
                     validationStatus, confidenceStatus, notes?, generationRun?
ai_bias_audits       dimensionKey, rawScore, correctedScore, deviation,
                     threshold, biasFlagged, biasStatus, justification?,
                     generationRun?
                       ↑ surfaced at /admin/ai/bias-audits
recommendations      dimension, type, text, status[PENDING|APPLIED|DISMISSED],
                     inconsistency_reason?, mentor_decision?
rag_contexts         sourceType, title, content, metadata(json), confidence
rag_retrieval_logs   result_count, confidence_level, low_confidence_flagged,
                     retrieved_profile_ids(jsonb)
vector_embeddings    source_type, source_id, embedding(VectorType), metadata
                       ↑ pgvector; see Migration20260528160512_InstallVectorExtension
ocr_documents        originalFilename, extractedText, fieldConfidence(json),
                     processingStatus, legibilityStatus, sketchDetected,
                     sketchConfidence, visionLabels(json), imageWidth/Height
                       ↑ surfaced at /admin/ocr-documents
activity_logs        action, details, actor?, createdAt
                       ↑ surfaced at /admin
```

Note `recommendations` and `ai_recommendations` are **two different tables for overlapping purposes** — the former written by `rna/recommendation-storage.service.ts`, the latter by `ai/ai.service.ts:176`.

### 5.8 Assessments

```
assessments             assessmentType[6 types], name, description?,
                        answerType[ShortAnswer=1|LongAnswer=2|File=3]
startup_assessments     startup, assessment, isApplicable  ← which apply to whom
startup_responses       startup, assessment, answerValue?, fileUrl?, fileName?
consultation_requests   startup, mentor, status[pending|accepted|completed],
                        requestedAt, resolvedAt?
                          ⚠️ No controller or service references this. Dead table.
```

### 5.9 Schema management

`backend/src/main.ts:292` calls `orm.getSchemaGenerator().updateSchema()` on **every boot**, then seeds demo data. There are also **94 migration files** in `backend/src/migrations/` (including `Migration20260726120000_AiGenerationRuns`, hand-written rather than CLI-generated to avoid diffing against the shared Neon instance — see its file header). In practice the auto-sync is what shapes your dev database; the migrations are effectively inert unless you run the MikroORM CLI explicitly.

**Seeded demo accounts** (all password `password123`, `backend/src/main.ts:16-152`):
`demo@launchup.local` (Startup) · `manager@launchup.local` (Manager) · `mentor@launchup.local` (Mentor), plus two demo startups (AgroLink PH, MediSync Cebu).

---

## Related documents

This file covers architecture only — the domain model, authorization, interaction
flows, the frontend/backend contract, and the schema.

| Looking for | Read |
|---|---|
| Setup, usage, objectives, scope and limitations | [README.md](../README.md) |
| Broken paths, dead code, known gaps, prioritized work | [TODO_CHECKLIST.md](../TODO_CHECKLIST.md) |
| Per-objective measurement results | `backend/measurement/README.md` |
| Working conventions for AI coding assistants | [CLAUDE.md](../CLAUDE.md) |
