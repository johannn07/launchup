# LaunchUp — Project Overview

Written from a full read of the repository. Every claim cites its source file.

> **Accuracy:** this describes what the code does today, which in places differs from `README.md` and from what the UI implies. Broken and dead paths are called out in [§7](#7-known-gaps-dead-code-and-discrepancies), not omitted.

---

## 1. What this system is

LaunchUp is a **startup incubation-and-readiness management platform**, almost certainly built for a **university-affiliated incubator or accelerator program** (startup records carry `universityName` and `groupName` — `backend/src/entities/startup.entity.ts:46-50`).

### The problem it solves

An incubator gets more applications than it can support. It must decide who to admit, measure each admitted startup's readiness across several dimensions, and run a coaching loop turning those measurements into next steps. By hand — spreadsheets, rubrics, mentor notes — that is slow and inconsistent between reviewers.

LaunchUp digitizes the pipeline and uses **Google Gemini** to draft the analytical work a mentor would otherwise write from scratch. The mentor edits and approves rather than authors.

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

### Who it's for

| Audience | What they get out of it |
|---|---|
| Incubator program managers | An application queue with ranking, approve/waitlist decisions, mentor assignment |
| Assigned mentors | A per-startup workspace to review AI drafts and approve status changes |
| Startup founders | A guided application, a readiness scorecard, and a task list they can move |
| Platform admins | User/startup CRUD, scoring-tier configuration, and AI-governance dashboards (bias audits, OCR review) |

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

Four roles exist in the database, defined in `backend/src/entities/enums/role.enum.ts`:

```ts
Startup | Mentor | Manager | Admin
```

New signups **always** get `Role.Startup` — the enum default in `backend/src/entities/user.entity.ts:32` is never overridden by `AuthService.signup` (`backend/src/auth/auth.service.ts:17-34`). **Only an Admin can mint a Mentor, Manager, or another Admin**, via `POST /admin/users/create-json` (`backend/src/admin/dto/create-user.dto.ts` requires an explicit `role`).

There is also a **fifth, frontend-only pseudo-role**: `Manager as Mentor`.

### 2.1 Where permissions are actually enforced

This is the single most important thing to understand about the codebase — **authorization is spread across five places that must agree**, and today they don't:

| # | Mechanism | File | What it controls |
|---|---|---|---|
| 1 | `JwtGuard` (passport) | `backend/src/auth/guard/jwt.guard.ts` | Is there a valid bearer token at all |
| 2 | `AdminGuard` | `backend/src/auth/guard/admin.guard.ts` | `req.user.role === Role.Admin`; **reads `req.user`, so it must be paired with `JwtGuard`** |
| 3 | Service-level role branching | `backend/src/startup/startup.service.ts:43-82` | *Which rows* a user sees |
| 4 | SvelteKit route guards | `frontend/src/hooks.server.ts:7-13`, plus per-route `+page.server.ts` | Which pages render |
| 5 | Nav config | `frontend/src/lib/access.ts` | Which links appear |

Two caveats that matter a great deal:

- **#5 is cosmetic only** — hiding a nav item does not protect the route, and `frontend/src/lib/components/shared/can-access.svelte` is likewise a pure render-gate.
- **#1 and #2 are not applied consistently.** Ten of the 21 controllers have partial or zero guard coverage, including the three that own the coaching core. In practice #4 (SvelteKit route guards) is doing most of the real access control, which only works as long as every request goes through the SvelteKit server. See §5.4 for the full audit and §7.3 for consequences.

### 2.2 Role capability matrix

| Capability | Startup | Mentor | Manager | Admin |
|---|:---:|:---:|:---:|:---:|
| Register self | ✅ | — | — | — |
| Submit an application | ✅ | | | |
| See **own** startups only | ✅ | | | |
| See **assigned** startups only | | ✅ | | |
| See **all** startups | | | ✅ | ✅ |
| Approve / waitlist applicants | | | ✅ | ✅¹ |
| Assign & change mentors | | | ✅ | ✅¹ |
| Rate readiness levels (rubrics) | | ✅ | ✅ | ✅ |
| Generate AI artifacts (RNA/RNS/etc.) | ✅² | ✅ | ✅ | ✅ |
| **Approve** status changes | | ✅ | ✅ | ✅ |
| *Request* status changes (needs approval) | ✅ | | | |
| Toggle "act as Mentor" | | | ✅ | |
| Admin hub (`/admin/*`) | | | | ✅ |
| Create users with any role | | | | ✅ |
| Configure scoring tiers | | | | ✅ |
| Review AI bias audits / OCR docs | | | | ✅ |

¹ Admin has API access (endpoints are `JwtGuard`-only, not role-restricted) but **no UI** — `/applications` hard-redirects non-Managers (`frontend/src/routes/(app)/applications/+page.server.ts:5-7`).
² Gated by pipeline state, not by role — see §2.4.

### 2.3 The row-level visibility rule

`StartupService.getStartups()` (`backend/src/startup/startup.service.ts:43-82`) switches on role:

```
Startup  →  startups where user is owner OR in members
Mentor   →  startups where user is in mentors
Manager  →  findAll()
Admin    →  findAll()
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

### 2.5 The `Manager as Mentor` pseudo-role

A Manager can flip a self-service toggle at `/account/role`, which sets an httpOnly cookie `isMentorRole=yes` (`frontend/src/routes/(app)/account/role/+page.server.ts:12-30`). On the next request, `frontend/src/routes/(app)/+layout.server.ts:14-16` rewrites `locals.user.role` to the string `'Manager as Mentor'`, which has its own entry in `frontend/src/lib/access.ts:151-167` (startup workspace + account, but **no** Applications tab).

**Critically: this is presentation-only.** The JWT still says `Manager`, so every backend call still carries full Manager authority. It narrows the UI, not the permissions.

---

## 3. Pages, screens, and available actions

### 3.1 Public / unauthenticated

| Route | File | Contents |
|---|---|---|
| `/` | `frontend/src/routes/+page.svelte` → `lib/components/landing/Landing.svelte` | Marketing landing: Hero, HowItWorks, AboutUs, Footer |
| `/login` | `frontend/src/routes/(auth)/login/+page.svelte` | Email + password → sets `Access` cookie → `/startups` |
| `/register` | `frontend/src/routes/(auth)/register/` | First/last name, email, password ×2 → creates a `Startup`-role account |
| `/admin-login` | `frontend/src/routes/(auth-admin)/admin-login/` | Separate admin door; **decodes the JWT client-side and rejects non-Admin before setting the cookie** (`+page.server.ts:41-49`) |
| `/objectives` | `frontend/src/routes/objectives/+page.svelte` | Static research-objectives page, fed by `GET /design/status` (`backend/src/app.controller.ts:19-73`) |

Logged-in users hitting `/login`, `/register`, or `/admin-login` are bounced — Admins to `/admin`, everyone else to `/startups` (`frontend/src/hooks.server.ts:64-69`).

---

### 3.2 Role: **Startup** (founder)

Nav comes from `startupModule` + `settingsModule` in `frontend/src/lib/access.ts:1-64`.

#### `/startups` — the founder's home
`frontend/src/routes/(app)/startups/+page.svelte`

- **Shows:** total-startup count, status tiles (Pending / Waitlisted / Qualified / Completed), a completion-percentage bar, filter buttons, and a card per startup.
- **Actions:** apply for a new startup (the page's default form action doubles as create *and* update), filter by status, click into a startup.
- **Data:** `GET /startups/startups` — note the doubled segment, `@Controller('startups')` + `@Get('/startups')` (`backend/src/startup/startup.controller.ts:31,38`).

#### `/apply` — the application wizard
`frontend/src/routes/(app)/apply/` with step components in `frontend/src/lib/components/startup/application/`

Multi-step: Data Privacy consent → Eligibility Agreement → Group Information → Project Details → Startup Details → Team Members → Incubation Plan → then six readiness questionnaires (Technology, Market, Acceptance, Organizational, Regulatory, Investment) → a Calculator step across seven categories (`backend/src/entities/enums/calculator-category.enum.ts`).

- **Submit →** `POST /startups/apply`, then two follow-up bulk POSTs for URAT answers and calculator answers (`frontend/src/routes/(app)/startups/+page.server.ts:216-258`).
- Optionally, a capsule-proposal PDF goes to `POST /startups/parse-capsule-proposal`, where `pdf-parse` extracts text and Gemini structures it (`backend/src/startup/startup.service.ts:177`).

#### `/startups/[id]/pending` — the waiting room
`frontend/src/routes/(app)/startups/[id]/pending/+page.svelte` — a 15-line card with an illustration and "your startup is currently under evaluation."

#### `/startups/[id]/…` — the workspace (once Qualified)

| Sub-page | File | Shows / does |
|---|---|---|
| `overview/general` | `…/overview/general/` | Startup profile fields, editable inline |
| `overview/members` | `…/overview/members/` | Team roster; add/remove via `POST /startups/add-member`, `/remove-member` |
| `overview/capsule_proposal` | `…/overview/capsule_proposal/` | The AI-parsed proposal; edits via `PATCH /startups/:id/capsule-proposal` |
| `overview/elevate` | `…/overview/elevate/` | Readiness-level promotion history (`GET /elevate/:id`, last 6 entries) |
| `assessment` | `…/assessment/` | Per-dimension assessment items; answer as short text, long text, or file upload (`AssessmentAnswerType`) |
| `readiness-level` | `…/readiness-level/` | The 9-level × 6-criteria rubric grid (`lib/components/startup/readiness_level/Rubrics.svelte`) |
| `rna` | `…/rna/` | RNA per dimension; **AI-generate** via `GET /rna/:id/generate-rna`, **refine by chat** via `POST /rna/:id/refine` |
| `rns` | `…/rns/` | Kanban board of Recommended Next Steps (`lib/components/shared/kanban.svelte`, drag via `svelte-dnd-action`) |
| `initiatives` | `…/initiatives/` | Tasks under each RNS, with measures/targets/remarks |
| `roadblocks` | `…/roadblocks/` | Risk-numbered obstacles + proposed fixes |
| `progress-report` | `…/progress-report/` | Aggregated progress (`GET /progress/:startupId/progress-report`) — **currently hidden from nav** (`lib/access.ts:36-40`) |

**The key Startup-role constraint:** on the RNS and Initiative boards, a founder dragging a card does *not* change its status. `RnsService.statusChange` (`backend/src/rns/rns.service.ts:138-161`) branches on role:

```ts
if (role === 'Startup') {
  rns.approvalStatus  = 'Pending';   // ← request only
  rns.requestedStatus = dto.status;
} else {
  rns.status          = dto.status;  // ← mentor/manager applies it directly
  rns.approvalStatus  = 'Unchanged';
}
```

So the founder's move creates a **pending request**; a Mentor or Manager has to confirm it.

#### `/account/*`
- `profile` — edit name/email (`PATCH /users/profile`) and change password (`PATCH /users/password`). Updating the profile **re-issues the JWT** and rewrites the cookie, because the token carries `firstName`/`lastName` (`frontend/src/routes/(app)/account/profile/+page.server.ts:44-51`).
- `appearance` — light/dark via `mode-watcher`.
- `password` — a standalone password form (also reachable from `profile`).

---

### 3.3 Role: **Mentor**

Same nav as Startup (`lib/access.ts:93-95`), but different data and different authority.

- **`/startups`** — only startups where they're in `mentors`. The page additionally filters out anything still `PENDING` (`frontend/src/routes/(app)/startups/+page.svelte:41-52`), so a mentor's list is effectively Qualified + Completed.
- **`/startups/[id]/readiness-level`** — this is the mentor's signature task: score the startup against the rubric. Each `LevelCriterion` carries five graded descriptions (excellent → very poor) at `backend/src/entities/level-criterion.entity.ts:10-23`, and the mentor picks one per criterion. Persisted through `POST /readinesslevel/startup/:startupId/rate`.
- **Approval authority** — on RNS, Initiatives, and Roadblocks, a mentor's status change applies immediately *and* resolves any founder's pending request (same `statusChange` branch as above).
- **Read receipts** — `clickedByMentor` / `clickedByStartup` booleans on `rns`, `initiatives`, and `roadblocks` let the UI badge items the other party hasn't opened yet.

---

### 3.4 Role: **Manager**

Nav: startup workspace + Applications + Account-with-Role (`lib/access.ts:96-127`). Analytics and Cohorts are defined but **commented out of the nav** (`lib/access.ts:104-113`).

#### `/applications` — the admissions console
`frontend/src/routes/(app)/applications/+page.svelte`, tabbed by `?tab=`

- **Shows:** tabbed tables of applicants (pending / qualified / rated), each row expandable into a dialog (`lib/components/applications/dialogs/{pending,qualified,rated}.svelte`) showing the capsule proposal, URAT answers, and calculator scores.
- **Actions:**
  - **Approve** — `POST /startups/:id/approve-applicant` sets status to `QUALIFIED`, immediately followed by `POST /startups/:id/appoint-mentors` with the chosen mentor (`+page.svelte:80-113`). *These are two separate calls with no transaction — approval can succeed while mentor assignment fails.*
  - **Waitlist** — `PATCH /startups/:id/waitlist-applicant` sets `WAITLISTED` **and** writes a `StartupWaitlistMessage` explaining why, which the founder later sees (`backend/src/startup/startup.service.ts:909-940`).
  - **Change mentor** — `PATCH /startups/:id/change-mentor`.
  - **Mark complete** — `PATCH /startups/:id/mark-complete` → `COMPLETED`.
- Mentor candidates come from `GET /users?userRole=Mentor` (`backend/src/user/user.controller.ts:23-26`).

#### `/analytics` and `/cohorts`
`frontend/src/routes/(app)/analytics/`, `…/cohorts/` — Manager-gated (both hard-redirect others) and each ~190 lines of built UI, but **unlinked from navigation**. Reachable only by typing the URL.

#### `/account/role`
The Mentor-mode toggle described in §2.5.

---

### 3.5 Role: **Admin**

Admin has **two parallel experiences**: the normal startup workspace (`lib/access.ts:128-150`) and a separate admin hub with its own chrome. `frontend/src/routes/(app)/+layout.svelte:29` suppresses the standard header when `isAdminRoute`, and `admin/+layout.svelte` renders `lib/components/shared/admin-header.svelte` instead.

Every `/admin/*` route is double-guarded: `frontend/src/routes/(app)/admin/+layout.server.ts:12-14` redirects non-Admins to `/startups`, and every backend endpoint sits behind `@UseGuards(JwtGuard, AdminGuard)` (`backend/src/admin/admin.controller.ts:47`).

| Route | File | Shows | Actions |
|---|---|---|---|
| `/admin` | `admin/+page.server.ts` | 25 most recent `ActivityLog` rows (`GET /admin/recent-activity`) | — |
| `/admin/users` | `admin/users/` | All users sorted by id | Create (any role), edit, delete |
| `/admin/startups` | `admin/startups/` | All startups + all users (for owner assignment) | Create, edit, delete |
| `/admin/assessments` | `admin/assessments/` | Assessment items grouped by type (`GET /assessments/grouped`) | Create/update/delete assessment items |
| `/admin/tiers` | `admin/tiers/` | `TierConfig` rows — label and threshold (the dimension-weights field was removed; weights live in `weight_profiles`) | `POST /admin/tiers/update` (upsert) |
| `/admin/ocr-documents` | `admin/ocr-documents/` | OCR'd uploads with extracted text, per-field confidence, sketch detection | Flag legibility / override sketch detection |
| `/admin/ai/bias-audits` | `admin/ai/bias-audits/` | `AiBiasAudit` rows — raw vs corrected score, deviation, flag | Override a corrected score with written justification |

The last two are the **AI-governance surface**: a human-in-the-loop review of what the model produced, backed by `ai_bias_audits` and `ocr_documents`. The tiers page is the lever that changes how *every* startup gets classified — see §6.3.

---

## 4. End-to-end flows

### 4.1 Founder: signup → funded workspace

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

### 4.2 Manager: application → admitted startup

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

### 4.3 Mentor: assignment → approved next steps

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

### 4.4 Admin: governance loop

```
1.  /admin-login  (separate door; JWT role checked client-side before cookie is set)
      → /admin dashboard, ActivityLog feed

2.  /admin/users        → provision Mentor / Manager accounts
                          (the ONLY way non-Startup roles are created)

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

## 5. Frontend ↔ backend connection

### 5.1 Architecture: BFF, not proxy

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

### 5.2 Two client paths

| Path | Used by | Auth |
|---|---|---|
| SvelteKit `fetch` in `+page.server.ts` | Initial page loads, form actions | Manual `Authorization` header from `cookies.get('Access')` |
| `axios` (`frontend/src/lib/axios.ts`) + `svelte-query` | Client-side refetches, mutations | Manual header, passing `access` down from the load function |

Note the axios instance has **no auth interceptor** — the refresh-token logic is entirely commented out (`frontend/src/lib/axios.ts:13-45`), and there is no refresh endpoint on the backend. Sessions simply expire.

### 5.3 Backend auth internals

- **Signing** — `JwtModule.registerAsync`, `expiresIn: '24h'`, secret from `JWT_SECRET` with fallback `'launchup-dev-secret'` (`backend/src/auth/auth.module.ts:14-22`).
- **Validation** — `JwtStrategy.validate` **loads the full User from the database** on every request and returns it, so `req.user` is a hydrated `User` entity, not the raw payload (`backend/src/auth/strategy/jwt.strategy.ts:23-31`). That's why controllers use `req.user.id` and `req.user.role`.
- **Global pipes** — `ValidationPipe({whitelist: true, transform: true})` in `backend/src/main.ts:272-277`, so DTOs strip unknown properties.
- **CORS** — a fixed allowlist: `localhost:5173`, `127.0.0.1:5173`, `launchup.onrender.com`, `launchup.vercel.app` (`backend/src/main.ts:279-289`).

### 5.4 API surface by module

| Prefix | Controller | Notable endpoints |
|---|---|---|
| `/auth` | `auth/auth.controller.ts` | `POST /signup`, `POST /signin` |
| `/users` | `user/user.controller.ts` | `GET /?userRole=`, `GET /search`, `PATCH /profile`, `PATCH /password` |
| `/startups` | `startup/startup.controller.ts` | `GET /startups`, `GET /all`, `POST /apply`, `POST /parse-capsule-proposal`, `POST /:id/approve-applicant`, `PATCH /:id/waitlist-applicant`, `POST /:id/appoint-mentors`, `PATCH /:id/change-mentor`, `PATCH /:id/mark-complete`, `GET /:id/allow-*` |
| `/startups` (2nd) | `assessment/startup-assessment.controller.ts` | `POST /:id/assessments`, `GET /:id/assessments`, `POST /:id/responses` — **same prefix, different controller** |
| `/assessments` | `assessment/assessment.controller.ts` | `GET /`, `GET /grouped`, `GET /types`, `POST /` (Admin), `PATCH /:id` (Admin), `DELETE /:id` (Admin) |
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
| `/admin` | `admin/admin.controller.ts` | Everything in §3.5 — the **only** module with `AdminGuard` |
| `/overview` | `overview/overview.controller.ts` | **Empty — zero routes** |

⚠️ **Guard coverage is the weakest part of the system.** Verified by auditing `@UseGuards` placement across all 21 controllers:

| Controller | Guarded routes | Status |
|---|---|---|
| `admin` | 18 / 18 | ✅ class-level `JwtGuard, AdminGuard` |
| `assessments` | 10 / 10 | ✅ class `JwtGuard` + method `AdminGuard` on writes |
| `startups`, `users`, `startup-assessment` | all | ✅ class-level `JwtGuard` (but see §7.3 — no *ownership* checks) |
| `readinesslevel` | 7 / 11 | ⚠️ reference-data GETs unguarded |
| `roadblocks` | **1 / 6** | ❌ only `@Delete(':id')` (`roadblock.controller.ts:43-44`) |
| **`rna`** | **0 / 7** | ❌ **no guard import in the file** |
| **`rns`** | **0 / 7** | ❌ **no guard import in the file** |
| **`initiatives`** | **0 / 7** | ❌ **no guard import in the file** |
| `chat-history` | 0 / 4 | ❌ guard commented out (`:5`) |
| `readiness`, `progress`, `elevate`, `upload`, `ocr`, `ai/*` | 0 | ❌ fully public |

The three zero-guard modules — `rna`, `rns`, `initiatives` — are **the entire coaching core**. Together with `roadblocks` that is 26 unauthenticated routes covering full CRUD plus every AI-generation endpoint. See §7.3.

---

## 6. Database schema

MikroORM entities in `backend/src/entities/`, all mapped to explicit `tableName`s. ~30 tables.

### 6.1 Identity and membership

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

### 6.2 Readiness assessment core

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

### 6.3 Scoring and tiers

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

### 6.4 Application intake

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

### 6.5 The coaching chain

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

`generationRun` (nullable FK, `ON DELETE SET NULL`) on rna/rns/initiatives/roadblocks/ai_recommendations/ai_bias_audits attributes each generated row back to the `ai_generation_runs` row that produced it — see §6.7.

The **triple-status pattern** (`status` + `requestedStatus` + `approvalStatus`) on rns/initiatives/roadblocks is the mechanical basis of the founder-requests / mentor-approves workflow in §3.2.

`RnsStatus` (`enums/rns.enum.ts`, integer-backed): New=1, Scheduled=2, On Track=3, Completed=4, Delayed=5, Discontinued=6, Long Term=7. Note `enums/status.enum.ts` defines the *same* set as strings — two parallel enums for one concept.

### 6.6 Chat history (one table per artifact)

```
RnaChatHistory        → rna,        role, content, createdAt, refinedRna?
RnsChatHistory        → rns,        …, refinedDescription?
RoadblockChatHistory  → roadblock,  …, refinedDescription?, refinedFix?
InitiativeChatHistory → initiative, …, refinedDescription?, refinedMeasures?,
                                       refinedTargets?, refinedRemarks?
```

Each stores the conversation *and* the refined field values the model proposed, so a refinement can be reviewed before it's applied. These four are the only entities **without** an explicit `tableName` — MikroORM derives snake_case names for them.

### 6.7 AI governance and RAG

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

### 6.8 Assessments

```
assessments             assessmentType[6 types], name, description?,
                        answerType[ShortAnswer=1|LongAnswer=2|File=3]
startup_assessments     startup, assessment, isApplicable  ← which apply to whom
startup_responses       startup, assessment, answerValue?, fileUrl?, fileName?
consultation_requests   startup, mentor, status[pending|accepted|completed],
                        requestedAt, resolvedAt?
                          ⚠️ No controller or service references this. Dead table.
```

### 6.9 Schema management

`backend/src/main.ts:292` calls `orm.getSchemaGenerator().updateSchema()` on **every boot**, then seeds demo data. There are also **94 migration files** in `backend/src/migrations/` (including `Migration20260726120000_AiGenerationRuns`, hand-written rather than CLI-generated to avoid diffing against the shared Neon instance — see its file header). In practice the auto-sync is what shapes your dev database; the migrations are effectively inert unless you run the MikroORM CLI explicitly.

**Seeded demo accounts** (all password `password123`, `backend/src/main.ts:16-152`):
`demo@launchup.local` (Startup) · `admin@launchup.local` (Admin) · `manager@launchup.local` (Manager) · `mentor@launchup.local` (Mentor), plus two demo startups (AgroLink PH, MediSync Cebu).

---

## 7. Known gaps, dead code, and discrepancies

Established by diffing **every** frontend API call against a complete backend route inventory, and by auditing `@UseGuards` placement across all 21 controllers. Both sides of every call below were read. Worth knowing before you trust a screen.

> Actionable, prioritized version of this section: **[TODO_CHECKLIST.md](TODO_CHECKLIST.md)**.

### 7.1 Frontend calls endpoints that don't exist

Eleven distinct broken calls, in three clusters.

**Cluster A — routes that were never built**

| Frontend call | File | Reality |
|---|---|---|
| `POST /readiness-level-criterion-answers/bulk-create/` | `(app)/startups/[id]/readiness-level/+page.server.ts:64` | **No such route anywhere in the backend.** Wrapped in a `try` whose `catch` is empty (`:104`), so it fails silently. On "success" it redirects to `/mentor/startups/qualified/:id`, also not a route. This is the mentor's core task and the gate for the whole coaching chain. |
| `POST /startup-readiness-levels/bulk-create/` | same file, `:78` | Same — no such route. |
| `GET /analytics/startups/` | `(app)/analytics/+page.svelte:16`, `(app)/cohorts/+page.svelte:16` | **No analytics controller exists in the backend at all.** |
| `GET /analytics/elevate-logs/` | same files, `:31` | Same. |
| `GET /cohorts` | same files, `:46` | **No cohorts controller and no cohort entity** — the concept doesn't exist server-side. |
| `GET /assessments/:id/fields` | `lib/components/dashboard/sub/AssessmentPreviewDialog.svelte:30` | No `fields` route in the assessment module. **This component is mounted** (QualifiedDialog → `/applications`; ApprovalDialog → Pending/Waitlisted dialogs), so it breaks a Manager-facing screen. |

**Cluster B — wrong prefix, verb, or payload shape**

| Frontend call | File | Reality |
|---|---|---|
| `DELETE /startups/remove-member/:memberId/` | `(app)/startups/[id]/overview/members/+page.svelte:155` | Backend is `@Post('remove-member')` reading `userId` **and** `startupId` from the body (`startup.controller.ts:97-103`). Wrong method *and* wrong shape — removing a team member always fails. |
| `GET /startup-rna/?startup_id=` | `(app)/startups/[id]/overview/elevate/+page.svelte:71` | The prefix is `/rna`, and the query param is `startupId`. The RNA panel on the Elevate tab never populates. |
| `GET /readinesslevel/:id/calculator-final-scores/` | `lib/components/admin/RatedTab.svelte` | Real route is `/startups/:id/calculator-final-scores`. (Component is orphaned anyway — see §7.5.) |
| `/assessment/types`, `/assessment/types/:id`, `/assessment/types/:id/fields`, `/assessment/fields`, `/assessment/fields/:id` | `lib/components/admin/assessment/ManageAssessmentTypes.svelte:39,56,64,75,85,108,114,126` | Prefix is `assessments` (plural) and **no `fields` routes exist**. All 8 calls in the component are broken — though the component is imported nowhere (§7.5). |

**Cluster C — handler exists but is disabled**

| Frontend call | File | Reality |
|---|---|---|
| `PATCH /startups/:id/with-capsule-proposal` | `(app)/startups/+page.server.ts:63` | Handler is **commented out** (`startup.controller.ts:231`). Re-uploading a capsule proposal during edit silently fails; editing without a file takes a different branch and works, so this is easy to miss. |
| `POST /assessments/types` | `(app)/admin/assessments/+page.server.ts:47` | Backend has only `@Get('types')` (`assessment.controller.ts:41`). Note `AssessmentType` is a **TypeScript enum**, not a table — so runtime type creation isn't possible without a schema change. |

### 7.2 Auth and session

- **Cookie lifetime ≠ token lifetime.** The cookie is set with `maxAge: 60 * 5 * 60` = **5 hours** (`login/+page.server.ts:54`) while the JWT is signed for **24h** (`auth.module.ts:19`). Users get logged out at 5h with a still-valid token.
- **No refresh flow.** The logout action clears a `Refresh` cookie that is never set, and the axios refresh interceptor is fully commented out.
- **`JWT_SECRET` falls back to `'launchup-dev-secret'`** on the backend (`auth.module.ts:18`, `jwt.strategy.ts:19`) — if the env var is missing in production, tokens are signed with a public constant.
- **`@GetUser('sub')` ignores its argument.** The decorator returns the whole `request.user` regardless of the key passed (`auth/decorator/get-user.decorator.ts:5-7`), so `updateProfile(userId, …)` in `user.controller.ts:33` actually receives a full `User` entity. It happens to work because MikroORM coerces an entity to its PK in a filter, but the signature lies.

### 7.3 Authorization gaps

This is the most serious category. Full per-controller audit is in §5.4.

- **The entire coaching core is unauthenticated.** `rna`, `rns`, and `initiatives` controllers contain **no `@UseGuards` and no guard import at all**; `roadblocks` guards only `@Delete(':id')` (`roadblock.controller.ts:43-44`). That is **26 public routes** covering full CRUD on every startup's RNA, next steps, initiatives, and roadblocks — plus the AI-generation endpoints (`POST /rns/generate-tasks`, `/initiatives/generate-initiatives`, `/roadblocks/generate-roadblocks`), which an anonymous caller can use to burn your Gemini quota.
- **Chat transcripts are public.** `chat_history/chat-history.controller.ts:5` has its `@UseGuards(JwtGuard)` explicitly commented out, exposing full AI conversation history — which contains startup business details — for any artifact id.
- **File upload is public.** `upload.controller.ts:15` — anyone can push up to 10 arbitrary files per request into your DigitalOcean Spaces bucket. No MIME or size validation either.
- **Other unguarded modules:** `/readiness`, `/progress`, `/elevate`, `/ocr`, `/ai/metrics`, `/ai/baseline`. Note `POST /ai/baseline/update` lets anyone rewrite the bias-normalization baseline that all AI scoring depends on.
- **No ownership checks anywhere (IDOR).** `GET /startups/:id` and siblings only check that you're logged in — row-level filtering exists solely in `getStartups()`, the *list* endpoint (`startup.service.ts:43-82`). Any founder can read any other startup's full record by changing the id in the URL.
- **`AdminGuard` is only applied in the admin module.** Approve / waitlist / appoint-mentors / change-mentor / mark-complete are `JwtGuard`-only (`startup.controller.ts:30`), so any authenticated founder can approve their own application and assign themselves a mentor. The UI hides these; the API doesn't.
- **Hardcoded secret fallback.** `JWT_SECRET` falls back to the literal `'launchup-dev-secret'` in `auth.module.ts:18` and `jwt.strategy.ts:19`. If the env var is missing in a deployed environment, every token is signed with a string committed to a public repo — and the `||` makes it fail silently.
- **Debug endpoints ship enabled:** `GET /startups/debug-evals` and `GET /admin/tiers/check-evals` run hand-written SQL via `em.getConnection().execute()` (`startup.controller.ts:62`, `admin.controller.ts:157`). Neither is called from the frontend.
- **Unverified JWT decode on the admin login.** `(auth-admin)/admin-login/+page.server.ts:41-49` base64-decodes the token payload to check `role` without verifying the signature. Server-side and separately guarded, so not directly exploitable — but it reads badly.

### 7.4 Data model

- **Three dead entities** — `MentorAssignment`, `ConsultationRequest`, and `ScoringGuide` are defined and migrated but referenced by **no service or controller anywhere** in the backend (verified across all `.ts` outside `entities/` and `migrations/`). `mentor_assignments` is the most misleading: it looks like the source of truth for mentor↔startup links and even has an `assignedBy` audit field, but `appointMentors()` writes to the `startups`↔`users` pivot instead (`startup.service.ts:942-963`).
- **`recommendations` vs `ai_recommendations`** — two tables, overlapping purpose, written by different services.
- **`RnsStatus` vs `Status`** — the same seven-state workflow defined twice, once integer-backed and once string-backed.
- **README says `DISQUALIFIED`** is a qualification status; the enum has no such value — it has `COMPLETED` instead.
- ~~**Regulatory readiness is collected but never scored**~~ — fixed (2026-08-04); it is the sixth scored dimension (§6.3).
- ~~**Readiness scores clamp to 0–5 while levels run 1–9**~~ — fixed (2026-08-04); scores are now a fraction of 9. Note this **narrowed** the demo spread rather than widening it: the AgroLink/MediSync gap went from 44 points to 24, because dividing by 5 was inflating both scores (§6.3).
- **`GET /readiness/:startupId` writes on read**, adding 6+ rows per page view and growing `readiness_evaluations` unboundedly.

### 7.5 Unfinished / orphaned UI

**Orphaned components — imported nowhere** (verified by grepping every `.svelte`/`.ts` for each name):
- `lib/components/admin/assessment/ManageAssessmentTypes.svelte` — and all 8 of its API calls are broken (§7.1).
- `lib/components/admin/PendingTab.svelte`, `AcceptedTab.svelte`, `RatedTab.svelte` — `PendingTab:105-107` has a commented-out call to `/startups/:id/rate-applicant/` with the note *"NEED TO IMPLEMENT BACKEND FIRST"*, so applicant rating was designed but never built. A `rated` tab still exists in `/applications` with no way to reach that state.
- `lib/components/dashboard/ReadinessCard.svelte` — note the `ReadinessDashboard` it wraps *is* used in three places.

**Built but hidden from nav** (`lib/access.ts`):
- `/startups/[id]/progress-report` — fully working, endpoint and all, commented out at `:36-40`.
- `/analytics` and `/cohorts` — ~190 lines each, commented out at `:104-113`. Unlike Progress Report, these have **no backend whatsoever** (§7.1).

**Leftovers:**
- `backend/src/overview/overview.controller.ts` — an empty `@Controller('overview')` with zero routes, though the module is imported in `app.module.ts:69`.
- `/dashboard` (14 lines) and `frontend/fix-page.cjs` — scaffolding.
- Committed scratch files, all tracked in git: `admin/assessments/+page.svelte.backup`, `admin/assessments/temp_fix.txt`, `backend/test-login.js` (0 bytes), `chumcheck_2025-03-04_025337.sql` (561 KB).
- `scripts/reset_db.{sh,ps1}` and `scripts/delete_db.sh` target a **`chumcheck`** database with user `postgres`, while `docker-compose.yml` creates `launchup_db` / `launchup_user` — so running them does nothing to your dev DB, or drops an unrelated one. This project appears to be a rename/fork of an earlier one.
- `backend.zip` (116 MB) and `frontend.zip` (84 MB) sit in the repo root — untracked, but not gitignored either.

### 7.6 Verified *not* broken

Checked, so don't re-investigate:

- `.env` files are not tracked in git (only `.env.example`); the zips are untracked
- `admin` and `assessments` have correct guard coverage
- Password handling is sound — argon2, `hidden: true` on `User.hash`, old-password verification on change
- Cookies are `httpOnly` + `sameSite: 'strict'` + `secure` outside dev
- The global `ValidationPipe` uses `whitelist: true`

---

## 8. Running it locally

**The database is Neon (hosted Postgres), not Docker.** `backend/.env` points `DB_HOST` at an `…aws.neon.tech` endpoint, so `docker-compose.yml` is currently unused — see §9.

```bash
cd backend && pnpm install && pnpm dev      # :3000, auto-syncs schema + seeds demo data
```

```bash
cd frontend && pnpm install && pnpm dev     # :5173
```

Both need their own `.env` (`backend/.env.example`, `frontend/.env.example`). **`JWT_SECRET` must match in both files** (§5.1). The backend also wants `GEMINI_API_KEY` for any AI feature, and the `S3_*` vars for uploads — unset by default, so uploads return 503 (`upload.service.ts:51-57`). With `DB_HOST` unset it falls back to in-memory SQLite (`backend/src/mikro-orm.config.ts:8-16`), which starts fine but loses everything on restart.

⚠️ **`backend/src/main.ts:292` runs `updateSchema()` and seeds demo data on every boot.** Against a shared Neon database that means every developer's `pnpm dev` mutates the same schema and re-inserts demo rows. Give each developer their own **Neon branch**, and gate the auto-sync on `NODE_ENV`.

Log in with any seeded account at `password123`; use `/admin-login` for `admin@launchup.local`.

---

## 9. Capstone objectives vs. implementation

The four objectives come from `Team_07_LaunchUpEnhanced_Software Proposal.pdf` (Part 2). Item-by-item status and remediation work: **[TODO_CHECKLIST.md §0](TODO_CHECKLIST.md)**.

| Objective | Status |
|---|---|
| 1. Reduce hallucination (prompt templates, **RAG**, output validation) | 🟡 RAG implemented (corpus seeded, deterministic rubric lookup working); validator built but scope-limited — checks retrieval confidence and declared length only, not groundedness (see TODO_CHECKLIST §0 1c) |
| 2. Readiness differentiation (tiers, weighted scoring, gap analysis) | 🟢 Tiers, gap analysis, and sector-aware weighted scoring all built — components built; differentiation itself did **not** improve, see §7.4 |
| 3. Multimodal intake (handwriting OCR, sketch recognition) | 🟡 OCR partial; canvas-section recognition minimal |
| 4. Leniency bias correction (adversarial prompting, normalization) | 🟡 Normalization + audit trail built; prompting is post-hoc review, not adversarial |

Three findings the scaffolding hides:

- **RAG is implemented with a verified-knowledge corpus.** `EmbeddingService` calls `gemini-embedding-2` (768 dims); `EmbeddingIndexService` writes `vector_embeddings` on every `recordRagContext`, plus a boot-time backfill. `RagQueryService.queryVectorDatabase()` returns three populated channels: readiness rubrics (deterministic `(readinessType, level)` lookup, or pgvector search under `AI_RAG_RUBRIC_MODE=semantic`), business frameworks, and peer capsule profiles. The corpus is **54 rubric rows + 10 framework rows**, seeded idempotently by `backend/seed-rag-corpus.js`, gated by `AI_RAG_CORPUS_ENABLED` and `AI_RAG_RUBRIC_MODE`.
  - **Provenance:** only the 9 Technology rows are transcribed from a public standard (EU Horizon Europe TRL / ISO 16290:2013). 36 rows (Market/Acceptance/Organizational/Regulatory) are authored against BRLa's published framework; the 9 Investment/IRL rows have no external source.
  - **Measured 2026-08-05, and the answer is positive for level placement:** the corpus arm assigns readiness levels at **0.22 MAE against baseline's 0.69** (36/36 vs 29/36 within one rung, n=3), and is *exactly* right on Organizational, Regulatory and Investment where the corpus-free arms inflate them. The reference-free figure is the one to quote — baseline asserts evidence absent from the source document in **61%** of checked placements, the corpus arm in **0%**. Read against the byte-identical null control, whose spread is 0.25 MAE. **This reverses a negative result these docs carried from 2026-07-30 to 2026-08-04**, which was scored against demo fixtures contradicted by their own documents in ten of twelve cells; the reference now lives in `src/demo-readiness-levels.ts`. **Still unmeasured:** RNA *generation* quality — every figure above is the levels probe, and production's RNA path retrieves 12 rubric rows rather than 54.
- **`OutputValidatorService` is built and wired** (scope-limited to retrieval confidence and declared length limits); `RecommendationStorageService` and its dead entity were deleted. See `TODO_CHECKLIST.md` §0's 1c item for what it deliberately does *not* check, and note the verdict is not backfilled onto pre-existing rows.
- **The scored dimensions now cover the specification, plus one.** All three documents specify TRL, MRL, **RRL**, ARL, ORL. As of 2026-08-04 the code scores all five — Regulatory included — **and** Investment, a sixth dimension the source documents don't list. The remaining gap is the extra dimension, not a missing one; either justify Investment's inclusion or drop it.

### Infrastructure the documents leave open

The SRS and SDD name no storage vendor (SDD p.48 says only *"Object storage (file storage service)"*), no model version, and no container strategy — Docker appears in neither. Recommendations: [TODO_CHECKLIST.md §5](TODO_CHECKLIST.md).

What the documents *do* fix: SvelteKit + NestJS + PostgreSQL + MikroORM as the foundational stack (SRS §2.5), the **Gemini API** as the LLM provider (SRS §2.4 constraint and §2.5 assumption), and Google Cloud Vision **or** Tesseract for OCR (SDD p.48). So the model *family* is committed, but the model *tier* is not.
