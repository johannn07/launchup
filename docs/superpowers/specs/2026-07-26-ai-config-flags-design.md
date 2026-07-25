# AI Pipeline Configuration & Run Provenance — Design

**Date:** 2026-07-26
**Status:** Approved, ready for implementation planning
**Scope:** `backend/src/ai/`, `backend/src/entities/`, four generation services

---

## 1. Motivation

LaunchUp Enhanced's validation approach requires comparing the **original** generation pipeline against the **enhanced** one — claim-level accuracy for Research Question 1, and score distributions against expert ratings (Pearson correlation, mean absolute error) for Research Question 4.

That comparison is the capstone deliverable. Producing it requires running both arms against otherwise identical code.

Today that is not possible without editing source:

- The model ID is hardcoded at `backend/src/ai/ai.service.ts:58` (`private readonly modelName = 'gemini-2.5-flash-lite'`).
- Grounding, retrieval, bias review, and score normalization are unconditionally inline in the generation path.
- Nothing recorded in the database identifies which configuration produced a given row. `StartupRNA` carries only a boolean `isAiGenerated`; `AiRecommendation` and `AiBiasAudit` record content and scores but not the model or flags in effect.

Consequently, generating baseline and enhanced outputs means editing code between runs, and the resulting rows are indistinguishable apart from their timestamps.

This design adds a configuration surface and a provenance record so that both arms can be run from one deployment and every output is attributable to the exact configuration that produced it.

### Why this is sequenced first

The enhancements are inline in the generation path. Adding the branch point now costs roughly an hour. Adding it after RAG, adversarial prompting, and output validation are woven in means surgery across four code paths that each then need re-testing.

---

## 2. Decisions

Four decisions were settled during design and are treated as fixed inputs below.

| Decision | Choice | Rationale |
|---|---|---|
| Flag scope | **Env defaults + optional per-request override** | Allows baseline and enhanced output for the *same* startup back-to-back in one deployment, enabling paired statistical comparison |
| Provenance | **New `ai_generation_runs` table** | One queryable place for the results chapter; doubles as an audit log; avoids duplicating config on every output row |
| Implementation scope | **Config surface + wire the four existing enhancements + fix the temperature bug** | Yields a working baseline arm immediately and proves the flags actually change behaviour |
| Code structure | **Approach A — explicit `AiRunContext` threaded through call sites** | For a system whose output is research data, config must be visible at the call site rather than ambient state |

Approaches considered and rejected:

- **AsyncLocalStorage / request-scoped providers.** Avoids signature churn, but makes configuration invisible at the call site. Debugging a mis-attributed row becomes an async-context problem rather than reading a parameter. Nest request-scoped providers additionally force the whole injection chain request-scoped.
- **Config on the DTO, provenance written separately.** Smallest diff, free class-validator validation, but config and provenance can drift — nothing guarantees the recorded row describes the configuration that actually ran. That guarantee is the entire point.

---

## 3. Architecture

### 3.1 New files

```
backend/src/ai/
  ai-config.types.ts          AiPipelineConfig interface + zod schema
  ai-config.service.ts        reads and validates env once; resolves overrides
  ai-run.service.ts           begin() / finish(); owns ai_generation_runs rows
backend/src/entities/
  ai-generation-run.entity.ts
```

### 3.2 Configuration surface

Added to `backend/.env.example` and `backend/.env`. The frontend is unaffected — it holds no AI configuration.

```
GEMINI_MODEL=gemini-2.5-flash-lite
AI_TEMPERATURE=0
AI_GROUNDING_ENABLED=true              # Objective 1a — groundPrompt()
AI_RAG_ENABLED=true                    # Objective 1b — getRelevantRagContexts()
AI_BIAS_REVIEW_ENABLED=true            # Objective 4b — reviewBiasScore()
AI_SCORE_NORMALIZATION_ENABLED=true    # Objective 4c — normalizeAiScore()
AI_ALLOW_REQUEST_OVERRIDE=false        # experiment escape hatch
```

`GEMINI_MODEL` is a single value at this stage. Per-task model selection (Pro for scoring, Flash for generation, separate vision and embedding models) is deferred to the model-tiering work; converting this field to a resolver is an additive change.

### 3.3 Resolved config type

```ts
export interface AiPipelineConfig {
  model: string;
  temperature: number;
  grounding: boolean;
  rag: boolean;
  biasReview: boolean;
  scoreNormalization: boolean;
}
```

Validated with zod at service construction. Boolean env values accept `true`/`false`/`1`/`0`.

### 3.4 Run context

```ts
export interface AiRunContext {
  readonly config: AiPipelineConfig;  // frozen
  readonly runId: number;             // ai_generation_runs.id
}
```

Frozen after construction so nothing can mutate config mid-run and desync it from the recorded snapshot.

### 3.5 Data flow

```
Controller (e.g. POST /rns/generate-tasks)
  │  optional pipelineConfig in request body, honoured only when
  │  AI_ALLOW_REQUEST_OVERRIDE=true AND role ∈ {Manager, Admin}
  ▼
AiRunService.begin(startupId, operation, override?) → AiRunContext
  ├─ AiConfigService.resolve(override) → frozen AiPipelineConfig
  └─ INSERT ai_generation_runs (model, config snapshot, status='running')
  ▼
RnsService.generateTasks(dto, ctx) ─→ AiService methods(…, ctx)
  ├─ ctx.config.grounding          ? groundPrompt(p)            : p
  ├─ ctx.config.rag                ? getRelevantRagContexts()   : omit block
  ├─ ctx.config.scoreNormalization ? normalizeAiScore()         : use raw score
  └─ ctx.config.biasReview         ? reviewBiasScore()          : use baseline
  ▼
outputs written with generation_run_id = ctx.runId
  ▼
AiRunService.finish(ctx, { latencyMs, tokens, status })   [in a finally block]
```

### 3.6 Decoupling normalization from bias review

`normalizeAiScore()` is presently called *inside* `reviewBiasScore()` at `ai.service.ts:88`, so normalization cannot run without bias review.

Objectives 4b and 4c are separate specific objectives. This design separates them:

- Normalization off ⇒ `reviewBiasScore` receives the raw score as its baseline.
- Bias review off ⇒ no Gemini review call; the score used is the normalized value if normalization is on, otherwise the raw value.

This yields four independently runnable arms — neither, normalization only, review only, both — supporting a proper ablation study rather than only an all-or-nothing comparison. The same reasoning applies to grounding versus RAG for Objective 1.

---

## 4. Schema changes

### 4.1 New entity

```
ai_generation_runs
  id              PK
  startup_id      FK → startups, nullable, ON DELETE SET NULL
  operation       varchar   'rna' | 'rns' | 'initiatives' | 'roadblocks'
  model           varchar
  config          jsonb     snapshot of the resolved AiPipelineConfig
  status          varchar   'running' | 'completed' | 'failed'
  latency_ms      int       nullable
  prompt_tokens   int       nullable
  completion_tokens int     nullable
  error           text      nullable
  created_at      timestamp
  completed_at    timestamp nullable
```

### 4.2 Foreign keys added

One nullable `generation_run_id` column on each table that holds AI-produced output:

`rna`, `rns`, `initiatives`, `roadblocks`, `ai_recommendations`, `ai_bias_audits`

All nullable, so no data migration is required. `NULL` means "produced before instrumentation."

---

## 5. Error handling

| Failure | Behaviour | Rationale |
|---|---|---|
| Invalid env at boot | Throw; application fails to start | A silently-wrong configuration invalidates every row produced under it. Mirrors the `JWT_SECRET \|\| 'launchup-dev-secret'` problem — the fallback is what makes it dangerous |
| Invalid override payload | HTTP 400, request rejected | Ignoring a malformed override means running the wrong arm without knowing |
| Override present but not permitted | HTTP 403 | Explicit over silent. No client sends this field today, so there is no breakage risk |
| Gemini call throws mid-run | `finish()` called in a `finally`; `status='failed'`, error recorded; exception rethrown | Run rows never dangle in `running` |
| `begin()` fails | Generation aborts | An output with no provenance is unusable as research data; runs and outputs share a database, so the call would fail downstream regardless |
| Pre-existing rows | `generation_run_id` remains `NULL` | No backfill |

---

## 6. Temperature bug fix

`ai.service.ts:299-305` currently passes sampling parameters at the top level of the request object:

```ts
const res = await this.ai.models.generateContent({
  model: this.modelName,
  contents: ...,
  temperature: attempt === 1 ? 0.0 : 0.2,
  maxOutputTokens: 1024,
} as any);
```

In `@google/genai`, `temperature` and `maxOutputTokens` belong inside a `config` object. The `as any` cast suppresses the type error that would otherwise have caught this, so the temperature setting is likely ignored and every scoring call runs at the model default.

This directly undermines SRS §2.3, which requires the readiness scoring algorithm to be reproducible. Since this design already touches these call sites, the fix is included: move the parameters into `config`, remove the `as any`, and drive `temperature` from `AiPipelineConfig`.

---

## 7. Testing

Existing specs (`ai/ai.service.spec.ts`, `readiness/readiness.service.spec.ts`) use direct constructor instantiation with hand-rolled mocks rather than `Test.createTestingModule`, and swap the private `ai` property for a mocked `generateContent`. This design follows that pattern rather than introducing a second one.

Tests in priority order:

1. **Flag behaviour** — the tests that prove the experiment arms are real:
   - `grounding: false` ⇒ prompt omits `AI_GROUNDING_INSTRUCTION`
   - `rag: false` ⇒ prompt omits the retrieved-context block
   - `biasReview: false` ⇒ no review call reaches `generateContent`
   - `scoreNormalization: false` ⇒ `baselineService.normalizeScore` never called
2. **Temperature regression** — assert `generateContent` receives `config: { temperature: 0 }` and no top-level `temperature`, preventing the `as any` from creeping back.
3. **`AiConfigService`** — valid env parses; invalid env throws; boolean coercion across `true`/`false`/`1`/`0`; defaults applied when unset.
4. **`AiRunService`** — `begin()` persists the config snapshot; `finish()` sets status and latency; failure path sets `status='failed'`.

The three existing tests in `ai.service.spec.ts` call `generateRNAsFromPrompt('prompt')` and will require the new context parameter. This is expected churn.

---

## 8. Migration and rollback

`backend/src/main.ts:292` calls `updateSchema()` on every boot, so the new table and columns will be created automatically. A MikroORM migration will also be generated so the change is reviewable and reproducible rather than appearing implicitly.

Because the team currently shares one Neon database, whichever developer boots first creates the schema for everyone. Per-developer Neon branches are recommended but tracked separately.

**Rollback is trivial.** Every flag defaults to `true`, which reproduces current behaviour exactly. Merging this changes nothing observable until a flag is deliberately flipped.

---

## 9. Open decision — override merge policy

One decision is deliberately left to the implementer, in `AiConfigService.resolve()`.

Given a partial override such as `{ rag: false }`, either:

- **Field-by-field merge** — unspecified fields fall back to env defaults. Convenient, reads naturally.
- **All-or-nothing** — any override must specify the complete configuration. More defensible in a methods section, because every recorded run states its full configuration explicitly and there is no ambiguity about what unspecified fields were at that moment.

This is a research-reproducibility argument against an ergonomics one. The implementation will provide the signature, surrounding validation, and a marked gap; the policy itself is roughly eight lines.

---

## 10. Out of scope

Deferred deliberately, each tracked in `TODO_CHECKLIST.md`:

- **Per-task model tiering** (Pro for scoring, Flash for generation, vision, embeddings) — next work item; this design makes it additive
- **The RAG pipeline itself** — `AI_RAG_ENABLED` gates the existing keyword-overlap retrieval at `ai.service.ts:596`, not semantic retrieval, which does not yet exist
- **Adversarial prompting** — `AI_BIAS_REVIEW_ENABLED` gates the existing post-hoc `reviewBiasScore()`. True pre-scoring adversarial prompting (Objective 4b) is separate work and will add its own flag
- **Output validation layer** — `OutputValidatorService` is a stub; wiring it will add `AI_OUTPUT_VALIDATION_ENABLED`
- **Gating `updateSchema()` on `NODE_ENV`** — recommended companion work, tracked separately
- **Missing authentication guards** on the `rna`, `rns`, `initiatives`, and `roadblocks` controllers — a security issue that overlaps these files but is independent of this design

---

## 11. Traceability

| Proposal objective | How this design serves it |
|---|---|
| 1a — structured prompt template | `AI_GROUNDING_ENABLED` isolates `groundPrompt()` as a measurable variable |
| 1b — RAG pipeline | `AI_RAG_ENABLED` provides the on/off axis for RQ1 comparison once real retrieval exists |
| 4b — adversarial prompting | `AI_BIAS_REVIEW_ENABLED` isolates the current review mechanism; true adversarial prompting adds its own flag later |
| 4c — score normalization | `AI_SCORE_NORMALIZATION_ENABLED`, now independently toggleable |
| Validation approach (all RQs) | `ai_generation_runs` supplies the per-run configuration, latency, and token records the results chapter needs |
| SRS §2.3 reproducibility | Temperature fix plus recorded config snapshot make scoring runs reproducible |
| SRS §2.4 cost constraint | Latency and token columns make Gemini spend measurable |
