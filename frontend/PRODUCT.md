# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three roles, all treated as primary — no single role is the design center of gravity:

- **Startup (founder)** — applies via a wizard, then works a startup workspace day-to-day: readiness assessments across six dimensions (Technology, Market, Acceptance, Organizational, Regulatory, Investment), the tier badge and radar chart, gap-analysis priorities, RNA/RNS, initiatives, and roadblocks. Sees only their own startup(s).
- **Mentor** — reviews assigned startups' readiness profiles and gap analysis, generates and revises RNA/RNS before a founder sees them (AI drafts, mentor decides), rates readiness rubrics.
- **Manager** — the administrative role (the former separate `Admin` role was removed 2026-09-04; Manager now holds full administrative capability). Reviews applications with AI-generated summaries produced under adversarial prompting, qualifies/rejects/waitlists, must explicitly acknowledge leniency-flagged summaries before approving them, assigns mentors, and runs the admin console (users, startups, assessments, tiers, OCR documents, AI bias audits).

Operating context: a university-affiliated startup incubator/accelerator program (startup records carry `universityName`/`groupName`).

## Product Purpose

LaunchUp evaluates early-stage startups across readiness dimensions and generates AI-assisted Recommended Next Actions (RNA) and Recommended Next Steps (RNS) via Gemini, coaching them from "where you are" through concrete tasks (Readiness Levels → RNA → RNS → Initiatives, with Roadblocks tracking what's blocking progress).

LaunchUp Enhanced is a capstone rebuild of an existing LaunchUp platform, targeting four specific failure modes the original had: AI hallucination (no grounding/validation), leniency bias (inflated scores), undifferentiated scoring (can't prioritize between startups), and typed-PDF-only intake. Success is measured per objective, not just shipped as a feature — e.g. the RAG corpus arm is measured at 0.22 MAE on readiness-level placement vs. baseline's 0.69.

## Positioning

Unlike the platform it extends (and unlike a generic AI-wrapper eval tool), LaunchUp Enhanced grounds every AI generation in a provenance-tagged verified corpus, records the exact pipeline configuration behind every AI run (`ai_generation_runs`) so any output is attributable to a specific baseline-vs-enhanced arm, and forces adversarial "find the weaknesses first" framing before any positive summary — a mechanism a neighboring eval tool without per-run config tracking and provenance-tagged grounding could not truthfully claim to match.

## Operating Context

- Coaching chain is strictly sequential: rate readiness → then RNA unlocks → then RNS/initiatives/roadblocks unlock (pipeline gates on data existing, not on role).
- Every AI-generated artifact (RNA, RNS, initiatives, roadblocks) carries an `isAiGenerated` flag, has its own chat-history table for AI-assisted refinement, and moves through a status workflow with mentor approval — the AI drafts, a human decides.
- Every AI pipeline stage (grounding, RAG, bias review, score normalization, adversarial summary) is an env-configured flag, so a baseline arm is a config change, not a code change — this is a load-bearing product mechanic, not an implementation detail, since the capstone's evaluation depends on being able to toggle arms.
- Leniency-flagged application summaries block approval until a Manager records an explicit acknowledgement in the activity log.

## Capabilities and Constraints

- Multi-type assessments: RNA, RNS, calculator-based, and custom types with configurable fields.
- Six scored readiness dimensions (the capstone proposal named five; Investment/IRL was added during implementation).
- Tiered readiness classification with numerical thresholds; sector- and business-model-aware weighted composite scoring resolved through a profile cascade, not fixed weights; gap analysis producing dimension-specific improvement priorities.
- OCR intake accepts typed PDFs, photographed/scanned handwriting, and capsule proposals; OCR-extracted text is treated identically to typed input downstream. Canvas/sketch recognition (Business Model Canvas, lean canvas fields) is minimal and was descoped.
- Qualification pipeline: Pending / Qualified / Disqualified / Waitlisted.
- Two independent apps (SvelteKit frontend, NestJS backend), no shared workspace tooling, deployed separately (Vercel + Render, free tiers — cold starts on inactivity).
- Constraint: Gemini dependency means network latency, free-tier rate limits, and quota exhaustion directly affect availability; a 503 degrades generation quality rather than failing loudly.
- Constraint: RAG corpus is only partly externally validated — provenance is stored per row and must be checked before treating any of it as authoritative (9 of 54 rubric rows are transcribed from public standards, 36 are authored against a published framework rather than transcribed from it, 9 have no external source).
- Undecided/unmeasured: whether tiered classification's differentiation itself measurably improved (components ship, the comparison doesn't exist yet); OCR accuracy (no handwritten sample set yet); the controlled bias-manifestation study.

## Brand Commitments

- Product name "LaunchUp" (this capstone: "LaunchUp Enhanced") is fixed and binding.
- Existing logo asset (`static/logo.png`) and the Geist typeface family (`static/fonts/Geist-*.ttf`) are binding brand commitments for future visual work, not open for reconsideration.
- Voice/tone in existing product copy (README, landing components) is direct and technically candid about limitations — status tables self-report "Partial" rather than overclaiming.

## Evidence on Hand

- Live demo: https://launchup-enhanced.vercel.app (frontend on Vercel, backend on Render, free tiers — first request after inactivity is slow).
- Measured results (cite exactly, do not round up or generalize beyond scope): RAG corpus arm — 0.22 MAE on readiness-level placement vs. baseline's 0.69 (n=3, levels probe only, not RNA generation quality); 0% unsupported-evidence assertions vs. baseline's 61%.
- Academic/capstone facts: Cebu Institute of Technology – University, BSIT, IT332 capstone, team code `2526-sem2-it332-07`, five named team members, adviser Ms. Leah V. Barbaso. This context is confirmed relevant to a public-facing surface (e.g. landing/about) per user direction — future work may reference the live demo, the four objectives, and measured results there.
- Demo accounts exist and are seeded on every boot (password `password123` for all) — useful as evidence of real, working flows, not as marketing claims to fabricate beyond what they demonstrate.
- Existing landing-page components already exist (`AboutUs`, `Hero`, `HowItWorks`, `Header`, `Footer`) — treat as incumbent evidence per [[document]] workflow if that surface is revisited, not reinvented from scratch here.
- Absence to not fabricate: no external customer testimonials, no pricing/licensing model, no benchmarks beyond the capstone's own measurement harness, no accessibility audit or standard has been established.

## Product Principles

1. Every AI-generated artifact is a draft a human (mentor/manager) approves — the product never lets AI output reach a founder unreviewed.
2. Every enhancement (grounding, RAG, bias review, normalization, adversarial prompting) is togglable per-run and logged, because the product's own evaluation depends on comparing arms, not just shipping features.
3. Honesty about measurement status is a product value, not just a docs habit — features are labeled "Partial"/"unmeasured" rather than implied complete when evidence doesn't yet support that.
4. The coaching chain (readiness → RNA → RNS → initiatives/roadblocks) is sequential by design — later capabilities gate on earlier data existing, not on role.
5. The platform serves three distinct roles with genuinely different jobs (do, coach, administrate) — design work should not default to a single-persona mental model.

## Accessibility & Inclusion

No product-specific accessibility standard or requirement has been established; none should be assumed or invented.
