# LaunchUp Enhanced

**LaunchUp Enhanced: An Improved AI-Powered Startup Readiness Evaluation System with Bias Correction, Hallucination Reduction, and Multimodal Document Support**

An extension of the AI-Powered Startup Readiness Evaluating, Guidance and Progress
Monitoring System.

## Overview

Early-stage startups routinely advance without a clear picture of their own readiness,
and the original LaunchUp platform — which evaluates them across readiness dimensions
and generates Recommended Next Actions (RNA) and Steps (RNS) through the Gemini API —
made that worse in four specific ways: its AI calls had no grounding or validation layer
and could hallucinate, it inflated readiness scores through leniency bias, it produced
scores too undifferentiated to prioritize between startups, and it accepted typed PDFs
only.

LaunchUp Enhanced rebuilds those four paths. It adds a retrieval-augmented generation
pipeline grounded in a provenance-tagged readiness corpus, adversarial prompting and
score normalization to counter leniency bias, a tiered classification and gap-analysis
engine with sector-aware weighted scoring, and an OCR intake path for handwritten and
photographed documents. Every AI call is recorded with the exact pipeline configuration
that produced it, so any result can be attributed to a specific arm of a
baseline-versus-enhanced comparison.

**Live demo** — <https://launchup-enhanced.vercel.app> (frontend on Vercel, backend on
Render). Both run on free tiers, so the first request after a period of inactivity may
take up to a minute while the backend wakes.

---

## Academic context

| | |
|---|---|
| **Institution** | Cebu Institute of Technology – University |
| **College** | College of Computer Studies |
| **Program** | BS Information Technology |
| **Course** | IT332 — Capstone / Software Engineering Project |
| **Team code** | `2526-sem2-it332-07` (Team 07) |
| **Academic year** | 2025–2026, Second Semester |
| **Adviser** | Ms. Leah V. Barbaso |

### Team members

- Lance Lemmor B. Chan
- John Anthony S. Besañez
- Liezel A. Ybañez
- Patrick James A. Cantero
- Mark Lorenz L. Barangan

---

## Objectives

Taken from `Team_07_LaunchUpEnhanced_Software Proposal.pdf` (Part 2). Status reflects
what is actually in the codebase — see [Scope and limitations](#scope-and-limitations).

### General Objective 1 — Reduce AI hallucination

Reduce AI-generated hallucinations by implementing prompt engineering strategies,
retrieval-augmented generation (RAG), and output validation mechanisms that ensure RNA
and RNS recommendations are grounded in the startup's verified data and established
business frameworks.

- **1a** — Design a structured prompt template system that constrains Gemini's RNA and
  RNS generation to only reference data fields explicitly stored in the startup's
  database profile.
- **1b** — Develop a RAG pipeline that supplements each Gemini call with relevant
  retrieved context, grounding recommendations in verified information.
- **1c** — Implement an AI output validation layer that cross-checks generated content
  against the startup's actual readiness scores and flags logically inconsistent
  recommendations.

### General Objective 2 — Better readiness differentiation

Enhance readiness differentiation by developing a multi-tiered classification model that
produces clearly distinguishable readiness profiles, enabling mentors and managers to
make more precise, data-informed decisions on startup support and prioritization.

- **2a** — Define a multi-tiered readiness classification schema derived from
  combinations of dimension score ranges, with clear numerical thresholds and
  descriptors per tier.
- **2b** — Develop a weighted composite scoring algorithm accounting for the relative
  importance of each dimension by industry sector and business model type.
- **2c** — Implement a gap analysis engine that identifies where a startup
  underperforms relative to its tier threshold, generating dimension-specific
  improvement priorities.

### General Objective 3 — Handwritten and sketch recognition

Extend document intake by integrating handwritten text and sketch recognition, allowing
startups to submit physical or hybrid documentation that the system digitizes, parses,
and incorporates into the readiness evaluation pipeline.

- **3a** — Integrate an OCR engine that processes handwritten text from scanned or
  photographed documents and stores the digitized output as structured text.
- **3b** — Develop a sketch and diagram recognition module identifying common startup
  planning structures such as Business Model Canvas and lean canvas fields.
- **3c** — Evaluate accuracy and usability through character-level OCR accuracy
  measurement and structured usability testing with startup users.

### General Objective 4 — Correct AI leniency bias

Detect and correct AI leniency bias by implementing calibrated scoring constraints,
adversarial prompting strategies, and score normalization mechanisms that ensure
assessments reflect actual readiness rather than an artificially inflated
representation.

- **4a** — Conduct a controlled test rating startup profiles spanning weak, average and
  strong readiness to measure whether score distributions skew upward against expert
  human ratings.
- **4b** — Implement adversarial prompt strategies instructing the AI to actively seek
  weaknesses and unmet criteria before generating a readiness summary.
- **4c** — Develop a score normalization module that adjusts AI-generated assessments
  against a predefined distribution baseline to prevent inflation.

### Research questions

1. To what extent can prompt engineering and RAG reduce hallucinated RNA and RNS
   recommendations?
2. Does a multi-tiered classification model produce meaningfully distinguishable startup
   profiles compared to the original scoring system?
3. How accurately can integrated OCR and sketch recognition digitize handwritten startup
   documents, and are the resulting evaluations comparable to typed PDF submissions?
4. To what degree does AI leniency bias manifest in Gemini's readiness assessments, and
   how effectively do adversarial prompting and score normalization correct it?

> The internal objectives document additionally records three engineering objectives not
> carried into the submitted proposal: an AI–human responsibility framework, modular
> architecture refactoring, and deployment reliability. They inform the codebase but are
> not evaluated deliverables.

---

## Features

**Assessment and readiness**

- Multi-type assessments — RNA, RNS, calculator-based, and custom types with
  configurable fields
- Six scored readiness dimensions — Technology (TRL), Market (MRL), Regulatory (RRL),
  Acceptance (ARL), Organizational (ORL), and Investment (IRL)
- Tiered readiness classification with numerical thresholds per tier
- Sector- and business-model-aware weighted composite scoring, resolved through a
  profile cascade rather than fixed weights
- Gap analysis producing dimension-specific improvement priorities per startup

**AI pipeline**

- Gemini-generated recommendations, roadblocks, and initiatives
- RAG grounding against a verified corpus of 54 readiness rubric rows and 10 business
  framework rows, every row provenance-tagged
- Semantic peer retrieval over pgvector embeddings, plus deterministic rubric lookup
- Adversarial pre-analysis forcing unmet criteria and critical risks ahead of any summary
- Score normalization against a distribution baseline
- Leniency flagging that requires a recorded manager acknowledgement before a flagged
  application can be approved
- Per-run provenance — every generation records its resolved pipeline config, timing,
  and status in `ai_generation_runs`

**Intake and workflow**

- Application wizard with eligibility review, group information, and project details
- OCR intake for handwritten, photographed, and PDF capsule proposals
- Qualification pipeline — Pending / Qualified / Disqualified / Waitlisted
- Mentor assignment with per-mentor load indicators
- Roadblocks and initiatives tracked per startup
- Cohorts and analytics dashboards
- Admin console — user management, startup editing, assessment configuration, activity
  log

---

## Tech stack

**Backend**

| Concern | Choice |
|---|---|
| Framework | NestJS 11 (TypeScript 5.9) |
| ORM | MikroORM 6.5 |
| Database | PostgreSQL (Neon), pgvector for embeddings |
| Auth | Passport JWT + Argon2 password hashing |
| AI | Google Gemini via `@google/genai` — `gemini-3.6-flash` for generation, `gemini-embedding-2` for embeddings |
| OCR | Tesseract.js 4, `pdf-parse` for typed PDFs |
| Storage | S3-compatible via AWS SDK v3 (Supabase Storage) |
| Validation | class-validator, Zod |

**Frontend**

| Concern | Choice |
|---|---|
| Framework | SvelteKit 2 (Svelte 5, TypeScript 5.9) |
| Styling | TailwindCSS 3.4 |
| Components | Bits UI, Lucide, shadcn-svelte-style primitives |
| Forms | sveltekit-superforms + Zod |
| Charts | Chart.js 4 |
| Rich text | Tiptap 2 |
| Auth | `jose` for local JWT verification |

**Deployment** — Vercel (frontend, `@sveltejs/adapter-vercel`), Render (backend), Neon
(database), Supabase Storage (files).

---

## System architecture

Two independent applications. There is no monorepo tooling linking them — each has its
own lockfile and is installed and run separately.

```
┌──────────────────────┐        ┌─────────────────────┐
│   SvelteKit (BFF)    │        │      NestJS API      │
│                      │        │                      │
│  hooks.server.ts     │        │  JwtGuard/AdminGuard │
│  verifies JWT via    │──────▶ │  feature modules     │
│  jose, no round-trip │  /api  │  (assessment,        │
│                      │  proxy │   readiness, rna,    │
│  +page.server.ts     │        │   rns, ocr, ai …)    │
│  actions call API    │        │                      │
└──────────────────────┘        └──────────┬───────────┘
                                           │
                        ┌──────────────────┼──────────────────┐
                        ▼                  ▼                  ▼
                 ┌────────────┐    ┌──────────────┐   ┌──────────────┐
                 │  Postgres  │    │  Gemini API  │   │  S3 storage  │
                 │  + pgvector│    │  gen + embed │   │  (Supabase)  │
                 └────────────┘    └──────────────┘   └──────────────┘
```

**Full reference** — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) covers the domain model, authorization, end-to-end flows, the frontend/backend contract, and the complete database schema.

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 22.x |
| pnpm | 10.7.1 |
| PostgreSQL | 15+ |
| Gemini API key | — |

---

## Installation and setup

### 1. Clone and create a database

```bash
git clone https://github.com/johannn07/launchup.git
```

Create a Postgres database and note its host, port, name, user and password. Each
developer should use their own Neon branch — the backend auto-syncs schema and seeds
demo data on every boot against whatever database is configured.

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Fill in the required values in `backend/.env`:

```
DB_HOST=your-branch.aws.neon.tech
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

JWT_SECRET=any_long_random_string
GEMINI_API_KEY=your_gemini_api_key
```


### 3. Configure the frontend

```bash
cd frontend
cp .env.example .env
```

```
JWT_SECRET=must_be_identical_to_the_backend_value
PUBLIC_API_URL=http://localhost:3000
```

### 4. Install and run

```bash
cd backend && pnpm install && pnpm dev
```

```bash
cd frontend && pnpm install && pnpm dev
```

### 5. Seed the RAG corpus

Once, after the first successful boot:

```bash
cd backend && node seed-rag-corpus.js
```

This inserts the 54 readiness rubric rows and 10 business framework rows that ground AI
generation. It is idempotent — safe to re-run.

### Demo accounts

Seeded automatically on every boot. Password for all: `password123`.

| Email | Role |
|---|---|
| `demo@launchup.local` | Startup (founder) |
| `mentor@launchup.local` | Mentor |
| `manager@launchup.local` | Manager |
| `admin@launchup.local` | Admin |

---

## Usage

### As a founder (Startup)

1. Register, or sign in as `demo@launchup.local`.
2. Complete the application wizard at `/apply` — eligibility agreement, group
   information, project details, and capsule proposal upload. Typed PDFs, photographed
   handwriting, and scanned images are all accepted; OCR-extracted text is treated the
   same as typed input downstream.
3. Wait in `/startups/[id]/pending` until a Manager qualifies the application.
4. Once qualified, work the startup workspace — readiness assessments, the tier badge
   and radar chart, gap analysis priorities, roadblocks, and initiatives.

### As a Manager

1. Sign in as `manager@launchup.local`.
2. Review submissions in `/applications`. Each carries an AI-generated readiness summary
   produced under adversarial prompting, showing unmet criteria and critical risks
   before any positive framing.
3. Where a summary is **flagged for leniency**, approving it requires an explicit
   acknowledgement, recorded against your identity in the activity log.
4. Qualify, reject, waitlist, or request resubmission — a reason is mandatory.
5. Assign a mentor from the assignment panel, which shows each mentor's current load.
6. Use `/analytics` and `/cohorts` for cross-startup views.

### As a Mentor

1. Sign in as `mentor@launchup.local`.
2. Open an assigned startup and review its readiness profile and gap analysis.
3. Generate RNA and RNS. Generation is grounded against the verified rubric corpus for
   the relevant dimension and level.
4. Revise and approve before the founder sees anything — the AI drafts, you decide.

### As an Admin

Sign in as `admin@launchup.local` for user management, startup editing, assessment
configuration, and the activity log.

### Running the AI comparison arms

Every enhancement is a flag in `backend/.env`, so a baseline arm is a config change
rather than a code change:

```bash
AI_RAG_CORPUS_ENABLED=false    # drops the verified rubric corpus
AI_ADVERSARIAL_SUMMARY_ENABLED=false   # restores the pre-adversarial prompt
AI_BIAS_REVIEW_ENABLED=false
AI_SCORE_NORMALIZATION_ENABLED=false
```

Each generation records the resolved configuration in `ai_generation_runs`, so runs
stay attributable to the arm that produced them.

---

## Testing

```bash
cd backend && pnpm test
```

```bash
cd backend && pnpm test:measurement
```

```bash
cd frontend && pnpm check
```

`pnpm test` runs the Jest unit suites; `pnpm test:measurement` runs the measurement
harness used for the objective evaluations. Run a single backend spec with
`pnpm test -- readiness.service`.

> Do not run `pnpm build` while `pnpm dev` is watching — they race over `dist/`.

---

## Scope and limitations

### Scope

- Web-based platform for early-stage startup teams, incubator managers, and
  university-affiliated mentors.
- Covers multimodal document digitization, RAG-grounded generation, tiered
  classification with gap analysis, and normalized scoring.
- Built as a rebase of an existing system. New capability is added as injectable NestJS
  services rather than by rewriting working functionality.

### Implementation status

Honest status per objective, current as of this README:

| Objective | Status |
|---|---|
| 1 — Hallucination reduction | **Partial.** RAG is implemented and measured: against the levels probe the corpus arm places readiness levels at 0.22 MAE versus baseline's 0.69, and asserts unsupported evidence in 0% of checked placements against baseline's 61%. The output validator is built but scope-limited — it checks retrieval confidence and declared length, not groundedness. |
| 2 — Readiness differentiation | **Components complete.** Tiers, gap analysis, and sector-aware weighted scoring all ship. Whether differentiation itself measurably improved is not yet established. |
| 3 — Multimodal intake | **Partial.** OCR intake works end to end but its accuracy is unmeasured pending a handwritten sample set. Canvas-section sketch recognition (3b) is minimal and was descoped. |
| 4 — Leniency bias correction | **Partial.** Adversarial prompting is live and measured on the application-summary path; the readiness-*scoring* path still uses post-hoc review. Score normalization and the leniency flag with enforced manager acknowledgement are complete. The controlled bias-manifestation study (4a) remains a research task. |

### Limitations

- **Gemini dependency.** Network latency, free-tier rate limits, and quota exhaustion
  directly affect availability. A 503 from the model degrades generation quality rather
  than failing loudly.
- **OCR accuracy depends on input quality** — handwriting legibility, photograph
  lighting, and how closely a drawn canvas follows a standard layout.
- **The RAG corpus is only partly externally validated.** Of 54 rubric rows, 9
  (Technology/TRL) are transcribed from EU Horizon Europe TRL and ISO 16290:2013; 36 are
  authored against BRLa's published dimension framework rather than transcribed from it;
  9 (Investment/IRL) have no external source. Provenance is stored per row — read it
  before treating any of it as authoritative.
- **Free-tier hosting cold starts.** The Render backend spins down when idle, so the
  first request after inactivity is slow.
- **The proposal names five readiness dimensions; the system scores six.** Investment
  readiness (IRL) was added during implementation.
- **Corpus maintenance is manual.** Keeping the rubric and framework rows current is not
  automated.

---

## Repository layout

```
backend/          NestJS API — feature modules, entities/ (central), measurement/
frontend/         SvelteKit app — (app)/ (auth)/ (auth-admin)/ route groups
docs/             ARCHITECTURE.md — full architecture and schema reference
CLAUDE.md         Working conventions for AI coding assistants
TODO_CHECKLIST.md Prioritized backlog and per-objective status
SESSION_NOTES.md  Development session log
```
