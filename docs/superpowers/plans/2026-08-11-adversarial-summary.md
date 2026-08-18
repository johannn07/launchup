# Adversarial Readiness Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the readiness summary hunt unmet criteria before it writes (SO 4.2), flag summaries that are predominantly positive (SO 4.4), and measure both against the shipped prompt in 12 calls.

**Architecture:** `generateStartupAnalysisSummary` moves from a free-text call to a field-ordered `responseSchema` — the model cannot emit `summary` before `unmet_criteria`, so "before" is a property of generation rather than an instruction it may reorder. A pure `summary-tone.ts` module implements SO 4.4 and doubles as the measurement instrument, imported by both consumers rather than transcribed. Nothing changes in `reviewBiasScore`; only its label was wrong.

**Tech Stack:** NestJS + TypeScript, Jest (`pnpm test` from `backend/`), `@google/genai`, zod for response validation. The measurement harness is separate: Node's `node:test`, run via `pnpm test:measurement`.

**Spec:** `docs/superpowers/specs/2026-08-11-adversarial-summary-design.md`

## Global Constraints

- **Suite baselines, both run from `backend/`.** Jest: `pnpm test` → **233 passing / 1 failing** at Task 4's tip (`81553b8`); the one failure (`AiService › passes valid task responses through unchanged`) is pre-existing and documented — *a second Jest failure is a real regression*. Measurement: `pnpm test:measurement` → **207 passing / 0 failing**. (The counts written against individual tasks below were drafted from a 216 baseline and are stale; the per-task expected totals have been corrected in place.)
- **`npx tsc --noEmit -p tsconfig.json` is a required gate on Tasks 5 and 6, and it is currently clean (exit 0).** Jest cannot substitute for it here: ts-jest only type-checks files it transforms, **no spec imports `startup/startup.service.ts`**, and `src/startup/` has no spec file at all. So a type error in the summary's only production call site does not turn `pnpm test` red. `tsc --noEmit` writes nothing, so unlike `pnpm build` it is safe while `pnpm dev` is watching.
- **`node --test measurement/tests/` (directory form) does not work** — use `pnpm test:measurement`, or `node --test measurement/tests/<file>.test.js`.
- **Never run `pnpm build` while `pnpm dev` is watching** — both write `dist/` and the race breaks module resolution.
- **Never import a runtime *value* from `@google/genai` into `ai.service.ts`.** `rag-retrieval.spec.ts:12` factory-mocks that module down to `GoogleGenAI` alone, so any other runtime import is `undefined` at module load and that suite throws before collecting: `Test Suites: 1 failed, 1 total` / `Tests: 0 total`, with its **11** tests unrun. Found the hard way in Task 5 when importing the `Type` enum. Use `import type` and, where a value is needed, a small literal map. Verified wire values: `Type.OBJECT === 'OBJECT'`, `ARRAY === 'ARRAY'`, `STRING === 'STRING'` (`node_modules/@google/genai/dist/genai.d.ts:3687`), and `propertyOrdering?: string[]` is real on `Schema` (`:3292`).
  - **This one is red, not silent** — an earlier note here claimed it dropped 4 tests without failing. It fails loudly. The genuinely silent variant is a *mutation* that breaks compilation: the suite still reports `Tests: 0 total` but the run's exit code can read as clean, which is how two mutants were falsely scored as survivors on 2026-08-09. Read the `Tests:` line either way.
- **Do not change `reviewBiasScore`'s behaviour.** Its two call sites (`rns.service.ts:373`, `roadblock.service.ts:224`) stay exactly as they are.
- **The baseline arm must be the prompt that shipped**, extracted verbatim and never edited in the same commit that adds the adversarial one.
- **`summary-tone.ts` has exactly one copy**, imported by the service and the measurement script. Do not transcribe it into the harness.
- **Ambiguity in `summary-tone.ts` resolves TOWARD flagging** — the opposite of `measurement/lib/assertions.js`. A missed flag lets an inflated summary reach the Manager; a false flag costs a Manager a second look.
- **No calibrated threshold.** Flag only when `criticalCount === 0`. Report the ratio as data.
- Commit after every task. **Do not push.** Branch `feat/adversarial-summary` (already created, holds the spec at `ea1e7e5`).
- Gemini free tier: **20 generation calls/day, window resets 15:00 Philippine time.** Only Task 7 spends quota.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `backend/src/demo-capsule-proposals.ts` | The two demo startups' capsule proposals — one copy, read by the seeder and the measurement script | **Create** (Task 1) |
| `backend/seed-demo-full.js` | Seeds demo data; stops holding its own copy of `PROPOSALS` | Modify (Task 1) |
| `backend/src/ai/summary-tone.ts` | Pure SO 4.4 tone analysis: positive/critical cue counting and the flag rule | **Create** (Task 2) |
| `backend/src/ai/ai-config.service.ts`, `ai-config.types.ts` | Resolve `AI_ADVERSARIAL_SUMMARY_ENABLED` alongside the existing four flags | Modify (Task 3) |
| `backend/src/ai/ai.service.ts` | `LEGACY_SUMMARY_PROMPT` extraction (Task 4), then the adversarial schema call and fallback chain (Task 5) | Modify (Tasks 4, 5) |
| `backend/src/startup/startup.service.ts` | Consume the new return shape; persist criteria and tone verdict | Modify (Task 6) |
| `backend/measurement/measure-summary-bias.js` | The 12-call arm comparison | **Create** (Task 7) |

`summary-tone.ts` is a separate file rather than a method on `AiService` because it must be callable from a measurement script with no Nest container, and because it is the one piece that gets a mutation pass.

---

### Task 1: Extract the demo capsule proposals into one shared copy

**Files:**
- Create: `backend/src/demo-capsule-proposals.ts`
- Modify: `backend/seed-demo-full.js:55` (the `const PROPOSALS = {…}` block)
- Test: `backend/measurement/tests/demo-proposals.test.js`

**Interfaces:**
- Produces: `DEMO_CAPSULE_PROPOSALS: Record<string, DemoCapsuleProposal>`, keyed `'AgroLink PH'` and `'MediSync Cebu'`. Fields, exactly as they exist today: `title, description, problemStatement, targetMarket, solutionDescription, objectives, historicalTimeline, competitiveAdvantageAnalysis, members, intellectualPropertyStatus, curriculumVitae, scope, methodology, aiAnalysisSummary`.
- Produces: `toApplicationDto(name)` → the subset `generateStartupAnalysisSummary` reads, with `scope` renamed to `proposalScope`.

**Why this is Task 1.** The measurement in Task 7 needs these proposals. `PROPOSALS` is currently inline in `seed-demo-full.js` with **no `module.exports`**, so a measurement script would have to transcribe it — and two copies of a shared fixture drifting apart is precisely what inverted the grounding study for a week (`src/demo-readiness-levels.ts` exists for that reason).

**Two traps this task must not fall into:**
1. The DTO field is `proposalScope`; the seed field is `scope`. The adapter renames it. Getting this wrong silently sends `undefined` into the prompt.
2. `aiAnalysisSummary` in the seed is **hand-written prose, not model output.** It must never be read as a measurement result. The adapter deliberately omits it.

- [ ] **Step 1: Write the failing test**

Create `backend/measurement/tests/demo-proposals.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src/demo-capsule-proposals.ts');
const SEED = path.resolve(__dirname, '../../seed-demo-full.js');

// The seeder and this module must not hold separate copies. seed-demo-full.js
// held the only copy and did not export it, so a measurement script would have
// had to transcribe it. Two copies of a shared fixture drifting apart is what
// inverted the grounding study in July.
test('seed-demo-full.js imports the proposals rather than declaring its own', () => {
  const seed = fs.readFileSync(SEED, 'utf8');
  assert.ok(
    !/^const PROPOSALS = \{/m.test(seed),
    'seed-demo-full.js still declares its own PROPOSALS literal',
  );
  assert.match(seed, /demo-capsule-proposals/, 'seed-demo-full.js should import the shared copy');
});

test('both demo startups are present with the fields the summary prompt reads', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  for (const name of ['AgroLink PH', 'MediSync Cebu']) {
    assert.ok(src.includes(name), `${name} missing from the shared proposals`);
  }
  for (const field of [
    'title', 'description', 'problemStatement', 'targetMarket', 'solutionDescription',
    'objectives', 'historicalTimeline', 'competitiveAdvantageAnalysis',
    'intellectualPropertyStatus', 'scope', 'methodology',
  ]) {
    assert.ok(new RegExp(`\\b${field}:`).test(src), `field ${field} missing`);
  }
});

test('the DTO adapter renames scope and omits the hand-written summary', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.match(src, /proposalScope:\s*p\.scope/, 'scope must be renamed to proposalScope for the DTO');
  assert.ok(
    !/aiAnalysisSummary/.test(src.split('toApplicationDto')[1] || ''),
    'aiAnalysisSummary is hand-written prose, not model output — it must not reach the DTO',
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```bash
node --test measurement/tests/demo-proposals.test.js
```
Expected: FAIL — `ENOENT` on `src/demo-capsule-proposals.ts`.

- [ ] **Step 3: Create the shared module**

Create `backend/src/demo-capsule-proposals.ts`. Copy the **entire** `PROPOSALS` object literal from `seed-demo-full.js` verbatim — every string, unchanged — as the value of `DEMO_CAPSULE_PROPOSALS`, then add:

```ts
/**
 * The two demo startups' capsule proposals.
 *
 * Shared because both the seeder and measurement/measure-summary-bias.js read
 * them. seed-demo-full.js previously held the only copy and did not export it;
 * duplicating a shared fixture is how the app and the grounding study drifted
 * apart in July. Same rule as src/demo-readiness-levels.ts.
 */
export type DemoCapsuleProposal = (typeof DEMO_CAPSULE_PROPOSALS)[keyof typeof DEMO_CAPSULE_PROPOSALS];

/**
 * The subset generateStartupAnalysisSummary reads.
 *
 * `scope` is renamed: the DTO calls it `proposalScope`. `aiAnalysisSummary` is
 * deliberately omitted — it is hand-written seed prose, and feeding it back in
 * would make a measurement read its own fixture as a result.
 */
export function toApplicationDto(name: keyof typeof DEMO_CAPSULE_PROPOSALS) {
  const p = DEMO_CAPSULE_PROPOSALS[name];
  return {
    title: p.title,
    description: p.description,
    problemStatement: p.problemStatement,
    targetMarket: p.targetMarket,
    solutionDescription: p.solutionDescription,
    objectives: p.objectives,
    proposalScope: p.scope,
    methodology: p.methodology,
    historicalTimeline: p.historicalTimeline,
    competitiveAdvantageAnalysis: p.competitiveAdvantageAnalysis,
    intellectualPropertyStatus: p.intellectualPropertyStatus,
  };
}
```

- [ ] **Step 4: Repoint the seeder**

In `backend/seed-demo-full.js`, delete the `const PROPOSALS = {…}` literal and replace it with a require of the compiled module, matching how the file already reaches into `dist`:

```js
const { DEMO_CAPSULE_PROPOSALS: PROPOSALS } = require('./dist/src/demo-capsule-proposals');
```

Every existing `PROPOSALS[...]` reference keeps working unchanged.

- [ ] **Step 5: Build, then run both suites**

Run from `backend/` (confirm `pnpm dev` is **not** watching first):
```bash
pnpm build
```
Then:
```bash
pnpm test:measurement
```
Expected: PASS, 210 tests, 0 failing.
```bash
pnpm test
```
Expected: 216 passing / 1 failing — the documented pre-existing failure only.

- [ ] **Step 6: Commit**

```bash
git add backend/src/demo-capsule-proposals.ts backend/seed-demo-full.js backend/measurement/tests/demo-proposals.test.js
git commit -m "refactor: extract demo capsule proposals into one shared copy

seed-demo-full.js held the only copy and did not export it, so the
measurement script would have had to transcribe it. Two copies of a
shared fixture drifting apart is what inverted the grounding study in
July; src/demo-readiness-levels.ts exists for the same reason.

The DTO adapter renames scope to proposalScope and omits
aiAnalysisSummary, which is hand-written seed prose rather than model
output."
```

---

### Task 2: `summary-tone.ts` — the SO 4.4 instrument

**Files:**
- Create: `backend/src/ai/summary-tone.ts`
- Test: `backend/src/ai/summary-tone.spec.ts`

**Interfaces:**
- Produces: `analyzeTone(text: string) -> { positiveCount: number; criticalCount: number; ratio: number; flagged: boolean; clauses: {text: string; valence: 'positive'|'critical'|null}[] }`
- Produces: `TONE_CUES` — `{ POSITIVE: RegExp; CRITICAL: RegExp }`, exported so `CLASSIFIER`-style source hashing can reach it in Task 7.

**The safety direction is REVERSED from `measurement/lib/assertions.js`. Read this before writing a cue:**

| | `assertions.js` | `summary-tone.ts` |
|---|---|---|
| costly error | false positive — inflates a reported fabrication rate | **false negative** — an inflated summary reaches the Manager unflagged |
| ambiguity resolves | away from flagging | **toward** flagging |
| trustworthy signal | a non-zero rate | an **un**flagged summary |

`ratio` is `criticalCount / (positiveCount + criticalCount)`, or `0` when both are zero. **`flagged` is `criticalCount === 0` and nothing else** — a boundary needing no calibration. Do not invent a ratio threshold; Task 7 produces the distribution from which one could later be set, the same order `RAG_MIN_SIMILARITY = 0.78` was established in.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/ai/summary-tone.spec.ts`:

```ts
import { analyzeTone } from './summary-tone';

describe('analyzeTone', () => {
  it('flags a summary with no critical observation at all', () => {
    const r = analyzeTone(
      'The venture shows strong market potential. The team demonstrates excellent domain expertise. Growth prospects are promising.',
    );
    expect(r.criticalCount).toBe(0);
    expect(r.flagged).toBe(true);
  });

  it('does not flag a summary carrying a critical observation', () => {
    const r = analyzeTone(
      'The venture shows strong market potential, but buyer-side demand is unvalidated and there is no revenue to date.',
    );
    expect(r.criticalCount).toBeGreaterThan(0);
    expect(r.flagged).toBe(false);
  });

  // The flag rule is exactly `criticalCount === 0`. A ratio threshold would need
  // calibration this study has not done, and the repo's uncalibrated tier
  // thresholds are the cautionary case.
  it('does not flag on a low ratio alone', () => {
    const r = analyzeTone(
      'Strong team. Excellent traction. Promising market. Compelling advantage. One risk: no revenue.',
    );
    expect(r.ratio).toBeLessThan(0.5);
    expect(r.flagged).toBe(false);
  });

  it('reports a zero ratio rather than NaN for text with no valence at all', () => {
    const r = analyzeTone('The proposal was submitted in February.');
    expect(r.ratio).toBe(0);
    expect(r.flagged).toBe(true);
  });

  // Ambiguity resolves TOWARD flagging: a negated positive is not a critical
  // observation, so it must not suppress the flag.
  it('a negated positive does not count as a critical observation', () => {
    const r = analyzeTone('The venture is not particularly strong in distribution.');
    expect(r.flagged).toBe(true);
  });

  it('empty text is flagged rather than treated as balanced', () => {
    expect(analyzeTone('').flagged).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run from `backend/`:
```bash
pnpm test -- summary-tone
```
Expected: FAIL — cannot resolve `./summary-tone`.

- [ ] **Step 3: Implement**

Create `backend/src/ai/summary-tone.ts`:

```ts
/**
 * SO 4.4 — flags readiness summaries that are predominantly positive with
 * insufficient critical observations, so the reviewing Manager knows to look
 * harder before approving a status change.
 *
 * Pure: no I/O, no model call, no Nest container — so measurement/ can import it
 * directly and it tests standalone.
 *
 * SAFETY DIRECTION IS THE OPPOSITE of measurement/lib/assertions.js, and the
 * distinction matters because the two modules look alike. There, a false
 * positive inflates a reported fabrication rate, so ambiguity resolves AWAY from
 * flagging and the rate is a lower bound. Here, a false NEGATIVE lets an
 * inflated summary reach a human decision unflagged, so ambiguity resolves
 * TOWARD flagging and an unflagged summary is the trustworthy signal.
 */

const POSITIVE =
  /\b(?:strong|excellent|promising|compelling|robust|significant|impressive|solid|clear\s+advantage|well[- ]positioned|potential|opportunity|advantage|viable|feasible|scalable|innovative)\b/i;

/**
 * Words naming a gap, an absence, or an unmet requirement. `no`/`not` are
 * absent on purpose: they negate whatever follows, and "not strong" is a hedged
 * positive rather than a critical observation. Admitting them would let a
 * negated positive suppress the flag, which is the one direction this module
 * must not err in.
 */
const CRITICAL =
  /\b(?:unvalidated|unproven|untested|lacks?|lacking|absent|missing|gap|risk|weakness|concern|insufficient|limited|unclear|premature|no\s+revenue|has\s+yet\s+to|fails?\s+to|shortfall|barrier|constraint|dependency|vulnerable|overstate[sd]?)\b/i;

export const TONE_CUES = { POSITIVE, CRITICAL };

/** Sentence-ish split. Coarse on purpose — the flag rule is a zero-check, not a ratio threshold. */
const splitSentences = (text: string): string[] =>
  String(text)
    .split(/(?<=[.!?])\s+|;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

export interface ToneResult {
  positiveCount: number;
  criticalCount: number;
  ratio: number;
  flagged: boolean;
  clauses: { text: string; valence: 'positive' | 'critical' | null }[];
}

export function analyzeTone(text: string): ToneResult {
  const clauses = splitSentences(text).map((s) => ({
    text: s,
    // Critical is tested FIRST: a sentence carrying both ("strong team, but no
    // revenue") is a critical observation, and counting it as positive would
    // push toward not flagging.
    valence: CRITICAL.test(s) ? ('critical' as const) : POSITIVE.test(s) ? ('positive' as const) : null,
  }));

  const criticalCount = clauses.filter((c) => c.valence === 'critical').length;
  const positiveCount = clauses.filter((c) => c.valence === 'positive').length;
  const total = criticalCount + positiveCount;

  return {
    positiveCount,
    criticalCount,
    ratio: total === 0 ? 0 : criticalCount / total,
    // Exactly `criticalCount === 0`. No ratio threshold — that needs calibration
    // this study has not done. Task 7 produces the distribution.
    flagged: criticalCount === 0,
    clauses,
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run from `backend/`:
```bash
pnpm test -- summary-tone
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Mutation pass**

Mutation testing has caught three decorative guards on this project. For each row: apply, run `pnpm test -- summary-tone`, record which test fails, then revert.

| mutation | must kill |
|---|---|
| test `POSITIVE` before `CRITICAL` in the `valence` ternary | `does not flag a summary carrying a critical observation` |
| change `flagged` to `ratio < 0.3` | `does not flag on a low ratio alone` |
| change `flagged` to `criticalCount === 0 && positiveCount > 0` | `empty text is flagged rather than treated as balanced` |
| add `\|no\|not` to `CRITICAL` | `a negated positive does not count as a critical observation` |
| return `criticalCount / total` without the `total === 0` guard | `reports a zero ratio rather than NaN` |

**Assert each mutation actually landed before trusting a green suite.** On 2026-08-09 two mutants reported as survivors had silently failed to apply — one edited a doc comment that quoted the regex, one used `\n` against a CRLF file. A mutation that does not apply reports green, which is indistinguishable from a decorative guard. If a mutant survives, write the test that kills it; do not weaken the mutation.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/summary-tone.ts backend/src/ai/summary-tone.spec.ts
git commit -m "feat(ai): add the SO 4.4 summary tone check

Flags readiness summaries with no critical observation, so the Manager
knows to look harder before approving a status change. SO 4.4 was tracked
by nothing in TODO_CHECKLIST.md.

Safety direction is the OPPOSITE of measurement/lib/assertions.js and the
comment says so: there a false positive inflates a fabrication rate, here
a false negative lets an inflated summary reach a human unflagged.

Flag rule is exactly criticalCount === 0 - a boundary needing no
calibration. No ratio threshold; the measurement produces the
distribution first, the way RAG_MIN_SIMILARITY was set.

Mutation pass: 5 mutants, all killed."
```

---

### Task 3: The `AI_ADVERSARIAL_SUMMARY_ENABLED` flag

**Files:**
- Modify: `backend/src/ai/ai-config.types.ts`, `backend/src/ai/ai-config.service.ts`
- Modify: `backend/.env.example`
- Test: `backend/src/ai/ai-config.service.spec.ts`

**Interfaces:**
- Produces: `ResolvedAiConfig.adversarialSummary: boolean`, default `true`, env `AI_ADVERSARIAL_SUMMARY_ENABLED`, overridable through the existing `X-Ai-Pipeline-Config` header under the same Manager/Admin gate as the other four flags.

- [ ] **Step 1: Write the failing tests**

`backend/src/ai/ai-config.service.spec.ts` already has the helpers you need, defined at the top of the file:

```ts
const configFrom = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;
// and, inside the resolve describe block:
const permissive = () => new AiConfigService(configFrom({ AI_ALLOW_REQUEST_OVERRIDE: 'true' }));
```

**Before writing anything new, note this or the task fails in a confusing way.** Three existing assertions compare the *whole* resolved object with `toEqual` — at roughly `:26`, `:40` and `:110`. Adding a fifth flag makes all three fail with an unexpected extra key. **Add `adversarialSummary` to each of those three object literals** with the value that block expects: `false` where the fully-specified environment sets every flag off, `true` in the two defaults blocks. That is part of this task, not a regression.

Then append:

```ts
describe('adversarialSummary flag (SO 4.2)', () => {
  it('defaults to true when the env var is unset', () => {
    expect(new AiConfigService(configFrom({})).defaults.adversarialSummary).toBe(true);
  });

  it('reads AI_ADVERSARIAL_SUMMARY_ENABLED', () => {
    const service = new AiConfigService(
      configFrom({ AI_ADVERSARIAL_SUMMARY_ENABLED: 'false' }),
    );
    expect(service.defaults.adversarialSummary).toBe(false);
  });

  it('accepts 0 and 1 like the other flags', () => {
    expect(
      new AiConfigService(configFrom({ AI_ADVERSARIAL_SUMMARY_ENABLED: '0' })).defaults
        .adversarialSummary,
    ).toBe(false);
  });

  it('honours a privileged per-request override', () => {
    const resolved = permissive().resolve('{"adversarialSummary":false}', true);
    expect(resolved.adversarialSummary).toBe(false);
  });

  // The override gate is the whole reason this flag is safe to expose.
  it('ignores the override for an unprivileged caller', () => {
    const resolved = permissive().resolve('{"adversarialSummary":false}', false);
    expect(resolved.adversarialSummary).toBe(true);
  });
});
```

The `permissive` helper is scoped to the `AiConfigService.resolve` describe block at `:105`, so put the two override tests inside that block and the three default tests in the outer one — or define a local `permissive` in your new block. Do not move the existing helper.

- [ ] **Step 2: Run to verify they fail**

Run from `backend/`:
```bash
pnpm test -- ai-config.service
```
Expected: FAIL — the five new tests report `adversarialSummary` is `undefined`, and the three `toEqual` blocks you edited fail until the implementation adds the field.

- [ ] **Step 3: Implement**

Add `adversarialSummary` to the config type in `ai-config.types.ts` beside the existing four, with a doc line:

```ts
 *   adversarialSummary - Objective SO 4.2, AiService.generateStartupAnalysisSummary()
```

In `ai-config.service.ts`, resolve it from `AI_ADVERSARIAL_SUMMARY_ENABLED` with default `true`, using the same boolean-parsing helper the other four flags use. Add it to the per-request override allowlist alongside them.

Add to `backend/.env.example`, next to the other AI flags:

```
# SO 4.2 - adversarial pre-analysis before the readiness summary.
# false restores the pre-2026-08-11 free-text prompt exactly.
AI_ADVERSARIAL_SUMMARY_ENABLED=true
```

- [ ] **Step 4: Run**

```bash
pnpm test -- ai-config.service
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai-config.types.ts backend/src/ai/ai-config.service.ts backend/src/ai/ai-config.service.spec.ts backend/.env.example
git commit -m "feat(ai): add AI_ADVERSARIAL_SUMMARY_ENABLED

Fifth pipeline flag, resolved and overridable exactly like the other
four, so the summary comparison has two addressable arms."
```

---

### Task 4: Extract the shipped prompt verbatim — its own commit, before anything adversarial exists

**Files:**
- Modify: `backend/src/ai/ai.service.ts:669-702` (the prompt body inside `generateStartupAnalysisSummary`)
- Test: `backend/src/ai/ai.service.spec.ts`

**Interfaces:**
- Produces: `LEGACY_SUMMARY_PROMPT(dto): string` — module-level in `ai.service.ts`, returning the prompt string exactly as it is today.

**This task changes no behaviour and that is the point.** The baseline arm has to be what actually shipped. Extracting and editing in one commit is how a "baseline" quietly becomes a third arm nobody labelled — the confound that invalidated the first grounding run, where production emitted readiness levels for every arm and the harness emitted them for none.

- [ ] **Step 1: Write the characterisation test**

Append to `backend/src/ai/ai.service.spec.ts`.

**The single-character fixture below is a defect — corrected after review, kept visible because the failure mode is instructive.** Values like `'T'`, `'D'`, `'P'`, `'M'`, `'S'` collide with the prompt's own static labels (`Title:`, `Description:`, `Problem Statement:`, and `'P'` matches inside `Please provide` at index 0). Five of the nine needles therefore pass with **nothing interpolated at all**. Measured: a mutant deleting five `${dto.…}` interpolations left the whole spec file green, and the timeline and competitor fields had no needle whatsoever — the three tests together survive gutting **7 of the 11 fields** they claim to cover.

So these three assertions do not enforce "do not edit". **A golden assertion over the full rendered output is required** — `toMatchInlineSnapshot()` against a fixture with distinctive values (`'TITLE_X1'`, `'DESC_X2'`, …), or a checked-in golden file. Keep the three tests below as intent documentation; two of them are genuinely non-vacuous (mutants that reordered the numbered items and deleted the three-sentence line were both killed). The snapshot is what makes the baseline tamper-evident.

```ts
// Characterisation test, not a behaviour test. It pins the shipped prompt so
// Task 5 cannot alter the baseline arm while adding the adversarial one.
describe('LEGACY_SUMMARY_PROMPT', () => {
  // Distinctive values: single characters collide with the prompt's own labels.
  const dto: any = {
    title: 'TITLE_X1', description: 'DESC_X2', problemStatement: 'PROBLEM_X3',
    targetMarket: 'MARKET_X4', solutionDescription: 'SOLUTION_X5',
    objectives: ['OBJ_X6', 'OBJ_X7'], proposalScope: 'SCOPE_X8',
    methodology: 'METHOD_X9',
    historicalTimeline: [{ monthYear: '2026-01', description: 'HIST_X10' }],
    competitiveAdvantageAnalysis: [{ competitorName: 'COMP_X11', offer: 'OFFER_X12', pricingStrategy: 'PRICE_X13' }],
    intellectualPropertyStatus: 'IP_X14',
  };

  it('still asks for the three original numbered items in order', () => {
    const p = LEGACY_SUMMARY_PROMPT(dto);
    const viability = p.indexOf('Overall viability assessment');
    const advantages = p.indexOf('Key competitive advantages');
    const risks = p.indexOf('Critical risks');
    expect(viability).toBeGreaterThan(-1);
    expect(advantages).toBeGreaterThan(viability);
    expect(risks).toBeGreaterThan(advantages);
  });

  it('still requests exactly three sentences', () => {
    expect(LEGACY_SUMMARY_PROMPT(dto)).toContain('Provide exactly three sentences');
  });

  it('interpolates every field the shipped prompt read', () => {
    const p = LEGACY_SUMMARY_PROMPT(dto);
    for (const v of ['TITLE_X1', 'DESC_X2', 'PROBLEM_X3', 'MARKET_X4', 'SOLUTION_X5',
                     'OBJ_X6', 'SCOPE_X8', 'METHOD_X9', 'HIST_X10', 'COMP_X11',
                     'OFFER_X12', 'PRICE_X13', 'IP_X14']) {
      expect(p).toContain(v);
    }
  });

  // The assertion that actually enforces "do not edit". The three above pass on
  // a prompt with seven interpolations removed and every sentence reworded.
  it('renders byte-for-byte what shipped', () => {
    expect(LEGACY_SUMMARY_PROMPT(dto)).toMatchInlineSnapshot();
  });
});
```

**Verify the golden test is not itself vacuous** before trusting it: mutate the constant (reorder the numbered items; delete an interpolation) and confirm it goes red. Assert each mutation landed — unique anchor, CRLF preserved, re-read from disk, original-absent and replacement-present — because on 2026-08-09 two mutants on this project reported as survivors when they had silently failed to apply.

Export `LEGACY_SUMMARY_PROMPT` from `ai.service.ts` and import it in the spec.

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test -- ai.service
```
Expected: FAIL — `LEGACY_SUMMARY_PROMPT` is not exported.

- [ ] **Step 3: Extract, changing not one character of the string**

Move the template literal currently at `ai.service.ts:669-702` out to module scope:

```ts
/**
 * The summary prompt exactly as it shipped before 2026-08-11.
 *
 * Preserved verbatim so the measurement's baseline arm is what production
 * actually did, not a reconstruction. Note it already asks for "Critical risks"
 * as item 3 of 3 — the argument for implementing SO 4.2 with schema field
 * ordering rather than instruction wording (spec §1, not yet measured).
 *
 * Do not edit. If it needs to change, that is a new arm.
 */
export const LEGACY_SUMMARY_PROMPT = (dto: StartupApplicationDto): string => `Please provide a comprehensive analysis of the following startup proposal:
...`;
```

Then `generateStartupAnalysisSummary` calls `LEGACY_SUMMARY_PROMPT(dto)` where the inline literal was. **Nothing else changes.**

- [ ] **Step 4: Run both suites**

```bash
pnpm test -- ai.service
```
Expected: PASS, including the three new tests.
```bash
pnpm test
```
Expected: 216+3 passing / 1 failing (the documented pre-existing one).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai.service.ts backend/src/ai/ai.service.spec.ts
git commit -m "refactor(ai): extract the shipped summary prompt verbatim

No behaviour change, deliberately. The measurement's baseline arm must be
the prompt that shipped, and extracting it in the same commit that adds
the adversarial one is how a baseline quietly becomes a third arm nobody
labelled.

Characterisation tests pin the three numbered items in their original
order - viability, advantages, then critical risks third of three."
```

---

### Task 5: The adversarial structured summary

**Files:**
- Modify: `backend/src/ai/ai.service.ts` (`generateStartupAnalysisSummary`)
- Modify: `backend/src/startup/startup.service.ts` — **minimal call-site adaptation only** (see Step 3b)
- Test: `backend/src/ai/ai.service.spec.ts`

**The return-type change breaks the only production caller, and the test suite cannot see it.** `startup.service.ts:425` assigns the result into a `string` column at `:454` and `:485`. Widening the return type to an object makes that a type error — but **no spec imports `startup.service.ts`**, so ts-jest never type-checks it and `pnpm test` stays green. Combined with the standing "no `pnpm build` while dev watches" rule, the break could survive to the end of the branch and surface only on next server start. Worse, if MikroORM's loosely-typed `em.create()` accepted the object at `:485`, Postgres would receive `[object Object]` in the column the Manager reads.

So Task 5 adapts the call site in the same commit that changes the signature — three lines, no behaviour change — and Task 6 does the real persistence work on top. A commit that leaves the tree non-compiling is not a completed task.

**Interfaces:**
- Consumes: `LEGACY_SUMMARY_PROMPT` (Task 4); `ctx.config.adversarialSummary` (Task 3).
- Produces: `generateStartupAnalysisSummary(ctx, dto)` now returns `Promise<{ summary: string; unmetCriteria: UnmetCriterion[]; criticalRisks: CriticalRisk[] }>` where `UnmetCriterion = { criterion: string; proposalField: string; whyUnmet: string }` and `CriticalRisk = { risk: string; severity: string }`. **Task 6 depends on these exact names.**

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/ai/ai.service.spec.ts`. Follow the mocking arrangement the existing `AiService` tests use for `callAiExpectJson` and `this.ai.models.generateContent`:

```ts
describe('generateStartupAnalysisSummary — adversarial arm (SO 4.2)', () => {
  it('emits the legacy prompt unchanged when the flag is off', async () => {
    const ctx = ctxWith({ adversarialSummary: false });
    await service.generateStartupAnalysisSummary(ctx, dto);
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ contents: expect.stringContaining('Overall viability assessment') }),
    );
  });

  it('sends a schema-constrained request when the flag is on', async () => {
    const ctx = ctxWith({ adversarialSummary: true });
    await service.generateStartupAnalysisSummary(ctx, dto);
    const call = generateContentMock.mock.calls.at(-1)[0];
    expect(call.config.responseMimeType).toBe('application/json');
    expect(call.config.responseSchema).toBeDefined();
  });

  // Field order IS the mechanism. If summary can precede unmet_criteria in the
  // schema, the model may write its conclusion first and the objective is unmet.
  it('orders unmet_criteria before summary in the schema', async () => {
    const ctx = ctxWith({ adversarialSummary: true });
    await service.generateStartupAnalysisSummary(ctx, dto);
    const props = Object.keys(
      generateContentMock.mock.calls.at(-1)[0].config.responseSchema.properties,
    );
    expect(props.indexOf('unmet_criteria')).toBeLessThan(props.indexOf('summary'));
  });

  it('returns parsed criteria alongside the summary', async () => {
    const ctx = ctxWith({ adversarialSummary: true });
    mockJsonResponse({
      unmet_criteria: [{ criterion: 'No revenue evidence', proposal_field: 'historicalTimeline', why_unmet: 'no figure given' }],
      critical_risks: [{ risk: 'Buyer demand unvalidated', severity: 'high' }],
      summary: 'Three sentence summary.',
    });
    const r = await service.generateStartupAnalysisSummary(ctx, dto);
    expect(r.summary).toBe('Three sentence summary.');
    expect(r.unmetCriteria[0].proposalField).toBe('historicalTimeline');
    expect(r.criticalRisks[0].severity).toBe('high');
  });

  // §5 of the spec: getCapsuleProposalInfo's parse failure gives the founder a
  // blank screen with only a console.error. That must not repeat here.
  it('falls back to the legacy free-text call when the schema call cannot be parsed', async () => {
    const ctx = ctxWith({ adversarialSummary: true });
    mockJsonParseFailure();
    mockFreeTextResponse('Legacy summary text.');
    const r = await service.generateStartupAnalysisSummary(ctx, dto);
    expect(r.summary).toBe('Legacy summary text.');
    expect(r.unmetCriteria).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm test -- ai.service
```
Expected: FAIL — the method still returns a bare string.

- [ ] **Step 3: Implement**

Add above the method:

```ts
const analysisSummarySchema = z.object({
  unmet_criteria: z.array(z.object({
    criterion: z.string(),
    proposal_field: z.string(),
    why_unmet: z.string(),
  })).default([]),
  critical_risks: z.array(z.object({
    risk: z.string(),
    severity: z.string(),
  })).default([]),
  summary: z.string(),
});

/**
 * SO 4.2 — adversarial pre-analysis.
 *
 * Field ORDER is the mechanism, not the wording. The legacy prompt already asks
 * for critical risks as item 3 of 3, so an instruction the model can reorder is
 * not a constraint on where it leads. Generation is autoregressive and the
 * schema fixes order, so `summary` cannot be emitted before `unmet_criteria`.
 *
 * Whether the legacy prompt's ordering actually biases output is the question
 * the 12-call comparison exists to answer - do not restate it here as settled.
 */
const ADVERSARIAL_SUMMARY_PROMPT = (dto: StartupApplicationDto): string => `You are a critical startup readiness evaluator. Treat this proposal as overstating its readiness until its own text proves otherwise.

${proposalFieldsBlock(dto)}

First, list every unmet criterion. For each, name the proposal field it comes from and why it is unmet. A field that is empty or absent IS a finding — record it as unmet, not as neutral. Do not invent evidence the proposal does not contain.

Second, list the critical risks that follow from those gaps.

Only then write the summary: exactly three sentences, which must be consistent with the criteria and risks you just listed. Do not lead with strengths.`;
```

Extract the shared field interpolation into `proposalFieldsBlock(dto)` for the adversarial prompt, and have `LEGACY_SUMMARY_PROMPT` **keep its own copy**. Do not refactor the legacy prompt to use the shared block — that would edit the preserved baseline.

**This duplication is deliberate and was ruled on before execution.** A reviewer will flag it, correctly, as a duplicated logic block. Put the reason at the site so it is not silently DRY-ed later:

```ts
// DO NOT DRY this with proposalFieldsBlock(). This prompt is a frozen
// measurement baseline: the arm it defines has to be what production
// actually did, byte for byte. Sharing the interpolation would mean a
// later edit to the shared block silently changes the control - which is
// the confound that invalidated the first grounding run, where production
// emitted readiness levels for every arm and the harness for none.
```

The method becomes: if `!ctx.config.adversarialSummary`, run the legacy free-text path and return `{summary, unmetCriteria: [], criticalRisks: []}`. Otherwise call with `responseMimeType: 'application/json'` and a `responseSchema` whose `properties` are declared in the order `unmet_criteria, critical_risks, summary`, validate with `analysisSummarySchema`, and map snake_case to the camelCase interface. On parse failure after `callAiExpectJson`'s existing corrective retry, fall through to the legacy path.

**Unsettled when this plan was written, resolved here: neither helper can carry a schema today.** `generate()` hardcodes `config: { temperature }` and `callAiExpectJson` routes through it, so there is no passthrough for `responseMimeType`/`responseSchema` — and `responseSchema` appears nowhere in `src/`, making this its first use in the codebase.

Thread an **optional** generation-config parameter through `generate()` and `callAiExpectJson` rather than bypassing them. Bypassing would mean reimplementing the corrective-retry loop, which is the one piece of hard-won behaviour here. The parameter must be spread only when provided, so the request object emitted for the five existing `callAiExpectJson` sites (`:228`, `:740`, `:754`, `:787`, `:823`) is **unchanged** — assert that in a test rather than assuming it. A shared helper touched for one caller's benefit is exactly where a silent regression lands.

- [ ] **Step 3b: Adapt the call site — the minimum that compiles, nothing more**

In `startup.service.ts`, `createStartupProposal`:

```ts
const analysis = await this.aiService.generateStartupAnalysisSummary(ctx, dto);
```
then `proposal.aiAnalysisSummary = analysis.summary;` at `:454` and `aiAnalysisSummary: analysis.summary,` at `:485`.

**Stop there.** No `analyzeTone`, no `recordAiRecommendation`, no new persistence — that is Task 6's work and doing it here makes two tasks one unreviewable commit. Behaviour is byte-identical to today: the same text lands in the same column.

- [ ] **Step 4: Run — type-check FIRST, because Jest cannot see the call site**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: exit 0, no output. This is the only check that covers `startup.service.ts`. It writes nothing, so it is safe while `pnpm dev` runs.

```bash
pnpm test -- ai.service
```
Expected: PASS.
```bash
pnpm test
```
Expected: **238 passing / 1 failing** (233 + the 5 new tests). The single failure must still be the documented `AiService › passes valid task responses through unchanged`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai.service.ts backend/src/ai/ai.service.spec.ts backend/src/startup/startup.service.ts
git commit -m "feat(ai): adversarial pre-analysis before the readiness summary

SO 4.2 asks the evaluator to seek weaknesses, gaps and unmet criteria
BEFORE generating a readiness summary. Field-ordered responseSchema makes
that a property of generation rather than an instruction: the model
cannot emit summary before unmet_criteria.

An absent proposal field is recorded as a finding, not a neutral.

Falls back to the legacy free-text call if the schema response cannot be
parsed, so a schema failure degrades to today's behaviour rather than to
the blank screen getCapsuleProposalInfo produces."
```

---

### Task 6: Wire the tone check and persist the criteria

**Files:**
- Modify: `backend/src/startup/startup.service.ts` — the tone check and the `recordAiRecommendation` call (Task 5 already moved the call site to `analysis.summary`)
- **Create:** `backend/src/startup/startup.service.spec.ts`

**This spec does not exist yet — this task writes the first test for a 1393-line service.** `src/startup/` currently has no spec at all, which is why Task 5's type break was invisible. Budget for it: `StartupService`'s constructor takes four dependencies (`EntityManager`, `AiService`, `AiRunService`, `OcrService`), all of which need doubles before a single assertion runs.

Two consequences:
- **Do not trust this plan's test-call signatures.** The snippets below write `service.create(dto, 1, ctx)`; that was drafted without opening the file. Find the real public entry point that reaches `createStartupProposal` (which is `private`) and adapt. If the reachable entry point drags in OCR or upload paths that make the test unreasonable, say so and propose narrowing rather than mocking half the service into existence.
- **Scope the spec to the summary path only.** Do not attempt coverage of the other ~1300 lines. A first spec that tests one path well is the deliverable; a broad one is a different task.

**Interfaces:**
- Consumes: `generateStartupAnalysisSummary`'s new return shape (Task 5); `analyzeTone` (Task 2); the existing `recordAiRecommendation`.
- Produces: nothing later tasks read.

- [ ] **Step 1: Write the failing tests**

```ts
describe('analysis summary persistence', () => {
  it('stores only the summary text on the proposal', async () => {
    aiService.generateStartupAnalysisSummary.mockResolvedValue({
      summary: 'S.', unmetCriteria: [{ criterion: 'c', proposalField: 'f', whyUnmet: 'w' }], criticalRisks: [],
    });
    await service.create(dto, 1, ctx);
    expect(savedProposal.aiAnalysisSummary).toBe('S.');
  });

  it('records the criteria and the tone verdict as an ai_recommendation', async () => {
    aiService.generateStartupAnalysisSummary.mockResolvedValue({
      summary: 'The venture shows strong potential.', unmetCriteria: [], criticalRisks: [],
    });
    await service.create(dto, 1, ctx);
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        recommendationKind: 'analysis_summary',
        dimensionKey: 'overall',
        confidenceStatus: 'positive-language-flagged',
      }),
    );
  });

  it('does not flag a summary carrying a critical observation', async () => {
    aiService.generateStartupAnalysisSummary.mockResolvedValue({
      summary: 'Strong team, but buyer demand is unvalidated and there is no revenue.', unmetCriteria: [], criticalRisks: [],
    });
    await service.create(dto, 1, ctx);
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ confidenceStatus: 'balanced' }),
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm test -- startup.service
```
Expected: FAIL — the call site records nothing. Note that before the spec file exists this command reports *"No tests found"* rather than a useful failure, so confirm the new spec is actually being collected before reading its result as evidence.

- [ ] **Step 3: Implement**

At `startup.service.ts:424`:

```ts
const analysis = await this.aiService.generateStartupAnalysisSummary(ctx, dto);
const tone = analyzeTone(analysis.summary);
```

Assign `proposal.aiAnalysisSummary = analysis.summary;` at `:454` and use `analysis.summary` at `:485`. After the proposal is persisted, record:

```ts
await this.aiService.recordAiRecommendation({
  startupId: startup.id,
  dimensionKey: 'overall',
  recommendationKind: 'analysis_summary',
  content: analysis.summary,
  // SO 4.4 - tells the Manager to look harder before a status change.
  confidenceStatus: tone.flagged ? 'positive-language-flagged' : 'balanced',
  notes: JSON.stringify({
    unmetCriteria: analysis.unmetCriteria,
    criticalRisks: analysis.criticalRisks,
    tone: { positiveCount: tone.positiveCount, criticalCount: tone.criticalCount, ratio: tone.ratio },
    // Which prompt actually produced this. A schema parse failure degrades to
    // the baseline arm's prompt, and without this the row is indistinguishable
    // from a genuine adversarial result.
    source: analysis.source,
  }),
  generationRun: ctx.run,
});
```

- [ ] **Step 4: Run**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: exit 0. Still the only gate covering `startup.service.ts`.

```bash
pnpm test
```
Expected: **241 passing / 1 failing** (238 + the 3 new tests), with the documented pre-existing failure as the only red.

- [ ] **Step 5: Commit**

```bash
git add backend/src/startup/startup.service.ts backend/src/startup/startup.service.spec.ts
git commit -m "feat(startup): persist unmet criteria and the SO 4.4 tone verdict

Reuses ai_recommendations rather than adding a column. One summary per
generation run, so the (generationRun, dimensionKey) collision recorded
as an open 1c design question cannot occur on this path."
```

---

### Task 7: Measure — 12 calls

**Files:**
- Create: `backend/measurement/measure-summary-bias.js`
- Modify: `backend/measurement/README.md`, `TODO_CHECKLIST.md`, `SESSION_NOTES.md`

**Interfaces:**
- Consumes: `toApplicationDto` (Task 1), `analyzeTone` (Task 2), `AiService.generateStartupAnalysisSummary` (Task 5).

**Timing gate: do not start before 15:00 Philippine time**, and only if the window is unspent. 12 calls of a 20-call day.

- [ ] **Step 1: Build the script**

`measure-summary-bias.js` boots a Nest application context (`NestFactory.createApplicationContext`) — the technique the standing notes prescribe for exercising the real path — and resolves `AiService`.

**Loop rep OUTERMOST**, as `measure-grounding.js` does: `for rep → for arm → for startup`. The original harness iterated arm → startup → rep, so a 20-call budget was consumed entirely inside the first arm and every between-arm metric read n=0. A quota exhaustion must leave a balanced partial pool, not one complete arm.

Arms: `baseline` (`adversarialSummary: false`) and `adversarial` (`true`). Startups: both keys of `DEMO_CAPSULE_PROPOSALS`. Reps: 3.

Per call record: arm, startup, rep, summary text, `unmetCriteria.length`, `criticalRisks.length`, the full `analyzeTone` result, and **`source`** (`'schema' | 'legacy'`).

**`source` is a validity gate on the whole run, not a nice-to-have field.** A schema parse failure degrades to `LEGACY_SUMMARY_PROMPT` — the control arm's prompt — while the run is still labelled `adversarialSummary: true`. Any `source: 'legacy'` row in the adversarial arm is a baseline output wearing the adversarial label, and averaging it in reproduces exactly the confound that invalidated the first grounding run. So:

- **Report the `source` breakdown per arm before any other table.** If the adversarial arm has *any* `'legacy'` rows, say how many, exclude them from the tone and criteria means, and report the reduced n.
- If more than one of the six adversarial calls degraded, treat the run as **inconclusive** rather than reporting it — a 5/6 or worse schema-adherence rate is itself the finding, and the fix is the prompt or the schema, not the statistics. Write to `measurement/results/<date>-summary-bias.json` with a comparability block — `genModel`, `temperature`, a hash of `LEGACY_SUMMARY_PROMPT.toString()`, `ADVERSARIAL_SUMMARY_PROMPT.toString()` and `summary-tone.ts`'s source — so a later run refuses to pool across a prompt or cue edit.

- [ ] **Step 2: Report three things, not one**

```
1. tone:            criticalCount, positiveCount, flag rate, per arm
2. criteria:        mean unmetCriteria per call, adversarial arm
3. DIFFERENTIATION: does the arm still separate AgroLink from MediSync?
```

**Metric 3 is a pass/fail guard, not a nice-to-have.** An arm that criticises both startups equally has overcorrected into uniform harshness, which is bias with the sign flipped. `gemini-2.5-flash-lite` is the cautionary case: it read as lenient but was floor-bound and blind, collapsing both startups to 1–3, and the real defect was differentiation. Compute the AgroLink/MediSync gap in `criticalCount` per arm and report it beside the tone table.

- [ ] **Step 3: Run**

Run from `backend/`, after confirming `date` shows 15:00 or later:
```bash
node measurement/measure-summary-bias.js --reps=3 --out=measurement/results/<date>-summary-bias.json
```
Confirm 12/12 calls before reading any table. 429s appear in the terminal, not as a thrown error.

- [ ] **Step 4: Read the summaries by hand**

Print all 12 summaries and read them. On both prior probes the by-hand read changed the finding — it is the only reason the 2026-08-06 run's two missed fabrications were found, and on 2026-08-09 it turned a reported 3/12 into a by-hand 6/12. Aggregate tone counts cannot tell you whether a "critical observation" is substantive or a hedge.

- [ ] **Step 5: Write up**

1. **`measurement/README.md`** — a new section: the arm table, the differentiation guard result, the by-hand read, and the tone-ratio distribution (which is what a future calibrated threshold would be set from).
2. **`TODO_CHECKLIST.md` §0** — mark 4b built and measured. **Correct the 4b row itself**: it currently says the objective is `reviewBiasScore` and mislabelled. Record that SO 4.2 targets the *readiness summary*, that `reviewBiasScore`'s two call sites review an RNS target level and a roadblock risk number, and that **SO 4.4 was tracked by nothing and is now built**. Add SO 4.4 as a row.
3. **`SESSION_NOTES.md`** — a dated section recording the finding that reading the proposal moved the target, and **that SO 5.3's premise is false in the code** (the summary is built from the capsule-proposal DTO; `UratQuestionAnswer` is CRUD-only and no AI call reads it).
4. Apply the `CLAUDE.md` documentation-maintenance rules: sync the Objective|Status table, compress sessions older than the three most recent.

- [ ] **Step 6: Commit**

```bash
git add backend/measurement/measure-summary-bias.js backend/measurement/results/ backend/measurement/README.md TODO_CHECKLIST.md SESSION_NOTES.md
git commit -m "measure: adversarial vs shipped readiness summary, 12 calls

<headline>. Differentiation guard: <gap per arm> - an arm that criticises
both startups equally has overcorrected, which is bias with the sign
flipped.

Also corrects the 4b row: SO 4.2 targets the readiness summary, not a
score, and reviewBiasScore's two call sites review an RNS target level
and a roadblock risk number. SO 4.4 was tracked by nothing and is built."
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 field-ordered schema, return shape, prompt direction | 5 |
| §2 overcorrection guard | 7 step 2 |
| §3 tone module, one copy, reversed direction, flag-at-zero | 2 |
| §4 persistence via `ai_recommendations` | 6 |
| §5 config flag, baseline verbatim | 3, 4 |
| §6 fallback chain | 5 |
| §7 measurement, comparability key | 7 |
| §7 the unresolved DTO question | **1 — resolved: `PROPOSALS` exists in `seed-demo-full.js` but is not exported** |
| Testing: TDD, mutation pass, vacuity guard, baseline byte-identical | 2 step 5, 4 |
| Out of scope: `reviewBiasScore` behaviour, SO 5.3, calibrated threshold, no re-scoring | Global Constraints; 7 step 5 records SO 5.3 |

No gaps.

**Placeholder scan:** the unfilled values are runtime outputs only — the headline figure and gap in Task 7's commit message, and the mutation survivors in Task 2. Each has a step that produces it. Task 3's test helper names are explicitly flagged as placeholders to be replaced by the file's existing helpers, with an instruction to read the file first.

**Type consistency:** `generateStartupAnalysisSummary` returns `{summary, unmetCriteria, criticalRisks}` in Task 5 and is consumed under those exact names in Task 6. `analyzeTone` returns `{positiveCount, criticalCount, ratio, flagged, clauses}` in Task 2 and is destructured under those names in Tasks 6 and 7. `toApplicationDto` is produced in Task 1 and consumed in Task 7. Snake_case (`unmet_criteria`, `proposal_field`) appears only in the wire schema and is mapped to camelCase inside Task 5.

**Ordering:** Task 4 must precede Task 5 (baseline preserved before the adversarial prompt exists). Task 1 must precede Task 7. Tasks 2 and 3 are independent of each other but both precede Tasks 5–6.
