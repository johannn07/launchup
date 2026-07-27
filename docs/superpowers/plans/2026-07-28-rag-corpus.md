# Verified-Knowledge RAG Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give LaunchUp's RAG pipeline a corpus of verified readiness rubrics and business frameworks, and wire it into the RNA and RNS generation paths that currently receive no retrieved text at all.

**Architecture:** Three retrieval channels mapped onto `RAGContext`'s three long-declared fields, as specified by SDD §3.2. Readiness rubrics fill `verifiedFrameworks` (54 rows, retrieved by exact `(dimension, level)` key by default, or semantically under the SDD's own mechanism, selected by `AI_RAG_RUBRIC_MODE`). Business frameworks fill `businessModels` (10 rows, semantic). Peer capsule proposals fill `similarProfiles` (unchanged). Corpus rows are ordinary `rag_contexts` rows with distinct `sourceType` values, so the existing embedding and backfill paths cover them.

**Tech Stack:** NestJS 10, MikroORM 6 + PostgreSQL (Neon) with pgvector, Zod for env validation, Jest + ts-jest, `@google/genai` for embeddings (`gemini-embedding-2`, 768 dims).

**Spec:** [`docs/superpowers/specs/2026-07-28-rag-corpus-design.md`](../specs/2026-07-28-rag-corpus-design.md)

**Branch:** `feat/rag-corpus` (already created, two doc commits on it).

## Global Constraints

- **Working directory is `backend/`** for every command in this plan. The repo is two independent apps; there is no root-level tooling.
- **Package manager is `pnpm`.** Never `npm` or `yarn`.
- **Never run `pnpm build` while `pnpm dev` is watching.** Both write `dist/`, and the race leaves the running server unable to resolve its own modules until restarted. `pnpm test` is safe (ts-jest does not touch `dist/`).
- **Two unit tests already fail on `master`** — `ai.service.spec.ts › passes valid task responses through unchanged` and `readiness.service.spec.ts › returns a weighted score…`. That is the pre-existing baseline. Do not fix them here, and do not treat them as a regression. Backend baseline: **111 passing, 2 failing.**
- **Embeddings are 768 dimensions**, a code constant (`EMBEDDING_DIMENSIONS`), not a setting. pgvector cannot ANN-index above 2000.
- **`RAG_MIN_SIMILARITY = 0.78`** and **`RAG_TOP_K = 3`**, both exported from `src/ai/ai.service.ts`. Import them; never re-declare.
- **Readiness dimensions are six in code** (`ReadinessType`: Technology, Market, Acceptance, Organizational, Regulatory, Investment) but **five in the specification** (TRL, MRL, RRL, ARL, ORL — no IRL). The corpus seeds six as a deliberate hedge; IRL rows are tagged `provenance: 'authored'` with no citation.
- **Provenance vocabulary is exactly three values:** `'standard'`, `'framework-derived'`, `'authored'`.
- **Unrecognised enum-valued env vars are rejected at boot**, never defaulted. A typo must not silently mislabel which arm produced a batch of generations.
- **Every commit ends with** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Do not push.** All work stays as local commits on `feat/rag-corpus`.

## File Structure

**Create:**
- `src/ai/rag-corpus.types.ts` — source-type constants, provenance union, rubric key helper. Shared by the seeder and the query service so the key format has exactly one definition.
- `src/ai/rag-corpus-seeder.service.ts` — upsert + change-aware embedding logic, as an injectable service so it is unit-testable.
- `src/ai/rag-corpus-seeder.service.spec.ts`
- `data/rag-corpus/readiness-rubrics.json` — 54 rows
- `data/rag-corpus/business-frameworks.json` — 10 rows
- `src/ai/rag-corpus-data.spec.ts` — structural validation of both data files
- `seed-rag-corpus.js` — thin runner around the service
- `measurement/measure-grounding.js`

**Modify:**
- `src/ai/ai-config.types.ts` — `ragCorpus`, `rubricMode` on the config, env and override schemas
- `src/ai/ai-config.service.ts` — read the two new vars
- `src/ai/ai-config.service.spec.ts` — cover them
- `src/rna/rag-query.service.ts` — three channels, dual-mode rubrics, redefined `lowConfidence`
- `src/rna/rag-query.service.spec.ts` — **new file** (none exists today)
- `src/rna/grounded-prompt-builder.service.ts` — emit content, prose rendering, authority ordering
- `src/rna/grounded-prompt-builder.service.spec.ts` — **new file**
- `src/rna/rna.module.ts` — `RagQueryService` gains `AiConfigService` (already available: `RnaModule` imports `AiModule`, which exports it)
- `src/rna/rna.service.ts` — pass dimensions, fix the always-true guard, delete dead fallback
- `src/rns/rns.service.ts` — pass dimensions, fix the peer-requiring guard
- `src/ai/ai.service.ts` — rubric block in `createBasePrompt`, scope `getRelevantRagContexts`
- `.env.example`, `measurement/README.md`, `TODO_CHECKLIST.md`, `SESSION_NOTES.md`, `CLAUDE.md`
- `docs/SRS.md`, `docs/SDD.md` — delete (they contradict the source PDFs)

---

## Task 1: Configuration flags

**Files:**
- Modify: `src/ai/ai-config.types.ts`
- Modify: `src/ai/ai-config.service.ts:33-67`
- Modify: `src/ai/ai-config.service.spec.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RUBRIC_MODES: readonly ['deterministic', 'semantic']`
  - `type RubricMode = 'deterministic' | 'semantic'`
  - `AiPipelineConfig` gains `ragCorpus: boolean` and `rubricMode: RubricMode`
  - Env vars `AI_RAG_CORPUS_ENABLED` (boolean, default `true`) and `AI_RAG_RUBRIC_MODE` (enum, default `'deterministic'`)

- [ ] **Step 1: Write the failing tests**

Append to `src/ai/ai-config.service.spec.ts`. Match the existing file's construction style — it builds a real `AiConfigService` over a fake `ConfigService`:

```typescript
describe('corpus configuration', () => {
  const svc = (env: Record<string, string | undefined>) =>
    new AiConfigService({
      get: (key: string) => env[key],
    } as unknown as ConfigService);

  it('enables the corpus by default', () => {
    expect(svc({}).defaults.ragCorpus).toBe(true);
  });

  it('defaults the rubric mode to deterministic', () => {
    expect(svc({}).defaults.rubricMode).toBe('deterministic');
  });

  it('reads both from the environment', () => {
    const config = svc({
      AI_RAG_CORPUS_ENABLED: 'false',
      AI_RAG_RUBRIC_MODE: 'semantic',
    }).defaults;
    expect(config.ragCorpus).toBe(false);
    expect(config.rubricMode).toBe('semantic');
  });

  it('rejects an unrecognised rubric mode at boot rather than defaulting', () => {
    // A typo must not silently mislabel which mechanism produced a batch of
    // generations — that would make the arm comparison unattributable.
    expect(() => svc({ AI_RAG_RUBRIC_MODE: 'determinstic' })).toThrow(
      /Invalid AI pipeline configuration/,
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- ai-config.service`
Expected: FAIL — `ragCorpus` and `rubricMode` are `undefined`, and the bad-mode case does not throw.

- [ ] **Step 3: Add the types and schema entries**

In `src/ai/ai-config.types.ts`, below the `RAG_STRATEGIES` block:

```typescript
/**
 * How the readiness-rubric channel finds its rows.
 *
 * Two modes rather than one because SDD §3.2 specifies that the RAG Query
 * Service "queries the vector database using the startup's profile data as the
 * search embedding" for all three channels, while measurement favours an exact
 * lookup. Keeping both means the SDD's mechanism genuinely exists in the running
 * code and the deviation is defended with a number rather than an opinion.
 *
 *   deterministic - exact (readinessType, level) key lookup. Default.
 *   semantic      - the SDD's mechanism: pgvector nearest neighbours over
 *                   rubric rows, gated by RAG_MIN_SIMILARITY.
 */
export const RUBRIC_MODES = ['deterministic', 'semantic'] as const;
export type RubricMode = (typeof RUBRIC_MODES)[number];
```

Add to the `AiPipelineConfig` interface, after `ragStrategy`:

```typescript
  ragCorpus: boolean;
  rubricMode: RubricMode;
```

Add to `aiEnvSchema`, after `AI_RAG_STRATEGY`:

```typescript
  AI_RAG_CORPUS_ENABLED: envBoolean(true),
  AI_RAG_RUBRIC_MODE: z.enum(RUBRIC_MODES).optional().default('deterministic'),
```

Add to `aiOverrideSchema`'s object, after `ragStrategy`:

```typescript
    ragCorpus: z.boolean(),
    rubricMode: z.enum(RUBRIC_MODES),
```

- [ ] **Step 4: Read the new vars in the service**

In `src/ai/ai-config.service.ts`, add to the `safeParse` argument object after `AI_RAG_STRATEGY`:

```typescript
      AI_RAG_CORPUS_ENABLED: this.config.get<string>('AI_RAG_CORPUS_ENABLED'),
      AI_RAG_RUBRIC_MODE: this.config.get<string>('AI_RAG_RUBRIC_MODE'),
```

And to the frozen `this.defaults` object after `ragStrategy`:

```typescript
      ragCorpus: env.AI_RAG_CORPUS_ENABLED,
      rubricMode: env.AI_RAG_RUBRIC_MODE,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- ai-config.service`
Expected: PASS, all cases.

- [ ] **Step 6: Run the whole suite**

Run: `pnpm test`
Expected: 2 pre-existing failures only (see Global Constraints). `AiPipelineConfig` gained required properties, so any test constructing one literally will fail to compile — fix those by adding `ragCorpus: true, rubricMode: 'deterministic'`.

- [ ] **Step 7: Document the vars in `.env.example`**

Insert after the `AI_RAG_STRATEGY=semantic` line:

```bash
# Objective 1b corpus. AI_RAG_STRATEGY above selects how *peer startups* are
# found; these two govern the verified-knowledge corpus (readiness rubrics and
# business frameworks) seeded by `node seed-rag-corpus.js`.
#
# AI_RAG_CORPUS_ENABLED=false disables the rubric and framework channels without
# deleting rows, which is how the corpus-on/corpus-off measurement arms are run.
AI_RAG_CORPUS_ENABLED=true
# How the rubric channel retrieves. SDD §3.2 specifies the semantic mechanism;
# deterministic is the default because an exact (dimension, level) lookup cannot
# return the wrong dimension and cannot silently fall below the similarity floor.
# Both exist so the deviation from the SDD is measured rather than asserted.
#   deterministic - exact key lookup (default)
#   semantic      - pgvector nearest neighbours, gated by RAG_MIN_SIMILARITY
AI_RAG_RUBRIC_MODE=deterministic
```

- [ ] **Step 8: Commit**

```bash
git add src/ai/ai-config.types.ts src/ai/ai-config.service.ts src/ai/ai-config.service.spec.ts .env.example
git commit -m "$(cat <<'EOF'
feat(rag): add AI_RAG_CORPUS_ENABLED and AI_RAG_RUBRIC_MODE

Both land in the ai_generation_runs config snapshot, so a generated row
stays attributable to the exact arm that produced it. An unrecognised
rubric mode is rejected at boot rather than defaulted, following the
AI_RAG_STRATEGY precedent.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Shared corpus types

**Files:**
- Create: `src/ai/rag-corpus.types.ts`
- Create: `src/ai/rag-corpus.types.spec.ts`

**Interfaces:**
- Consumes: `ReadinessType` from `src/entities/enums/readiness-type.enum`.
- Produces:
  - `RUBRIC_SOURCE_TYPE = 'readiness_rubric'`, `FRAMEWORK_SOURCE_TYPE = 'business_framework'`, `CAPSULE_SOURCE_TYPE = 'capsule_proposal'`
  - `type Provenance = 'standard' | 'framework-derived' | 'authored'`
  - `interface CorpusRowMetadata { key: string; provenance: Provenance; citation: string | null; sourceUrl?: string; readinessType?: ReadinessType; level?: number; keyTerms: string[] }`
  - `rubricKey(type: ReadinessType, level: number): string`
  - `MAX_READINESS_LEVEL = 9`

- [ ] **Step 1: Write the failing test**

Create `src/ai/rag-corpus.types.spec.ts`:

```typescript
import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { rubricKey, MAX_READINESS_LEVEL } from './rag-corpus.types';

describe('rubricKey', () => {
  it('uses the specification abbreviation, not the enum value', () => {
    // The documents say TRL/MRL/RRL/ARL/ORL. Keys read back in review, so they
    // should match the vocabulary a reader already has.
    expect(rubricKey(ReadinessType.T, 3)).toBe('trl-3');
    expect(rubricKey(ReadinessType.M, 1)).toBe('mrl-1');
    expect(rubricKey(ReadinessType.R, 9)).toBe('rrl-9');
    expect(rubricKey(ReadinessType.A, 5)).toBe('arl-5');
    expect(rubricKey(ReadinessType.O, 2)).toBe('orl-2');
    expect(rubricKey(ReadinessType.I, 7)).toBe('irl-7');
  });

  it('covers every ReadinessType, so a new dimension cannot be silently unkeyed', () => {
    for (const type of Object.values(ReadinessType)) {
      expect(rubricKey(type, 1)).toMatch(/^[a-z]{3}-1$/);
    }
  });

  it('caps levels at 9', () => {
    expect(MAX_READINESS_LEVEL).toBe(9);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- rag-corpus.types`
Expected: FAIL — `Cannot find module './rag-corpus.types'`.

- [ ] **Step 3: Write the implementation**

Create `src/ai/rag-corpus.types.ts`:

```typescript
import { ReadinessType } from '../entities/enums/readiness-type.enum';

/**
 * `rag_contexts.sourceType` values. One table, three populations.
 *
 * CAPSULE_SOURCE_TYPE is what startup.service.ts has always written; the other
 * two are the verified-knowledge corpus. Keeping them in one table means the
 * existing embedding path and boot-time backfill cover the corpus with no new
 * indexing code.
 */
export const RUBRIC_SOURCE_TYPE = 'readiness_rubric';
export const FRAMEWORK_SOURCE_TYPE = 'business_framework';
export const CAPSULE_SOURCE_TYPE = 'capsule_proposal';

/**
 * How much external authority a corpus row actually carries.
 *
 * Recorded per row rather than claimed for the corpus as a whole, because it is
 * not uniform: TRL is transcribed from a published standard, the other BRLa
 * dimensions are authored against a paywalled framework's stated criteria, and
 * IRL has no external source at all. SRS §2.2 requires a confidence/validity
 * indicator in API responses — this is what it is derived from.
 */
export type Provenance = 'standard' | 'framework-derived' | 'authored';

export const PROVENANCES: readonly Provenance[] = [
  'standard',
  'framework-derived',
  'authored',
];

export interface CorpusRowMetadata {
  /** Stable slug; the idempotency handle for the seeder. */
  key: string;
  provenance: Provenance;
  /** Null only when provenance is 'authored'. */
  citation: string | null;
  sourceUrl?: string;
  /** Rubric rows only. */
  readinessType?: ReadinessType;
  /** Rubric rows only, 1..MAX_READINESS_LEVEL. */
  level?: number;
  /**
   * Criteria vocabulary this row introduces. Authored with the content so the
   * grounding metric has a term list that was not reverse-engineered from the
   * output it scores.
   */
  keyTerms: string[];
}

export const MAX_READINESS_LEVEL = 9;

/**
 * Abbreviation used in the proposal, SRS and SDD. Note ARL is "Adoption
 * Readiness Level" in those documents while the enum value is 'Acceptance'.
 */
const RUBRIC_KEY_PREFIX: Record<ReadinessType, string> = {
  [ReadinessType.T]: 'trl',
  [ReadinessType.M]: 'mrl',
  [ReadinessType.A]: 'arl',
  [ReadinessType.O]: 'orl',
  [ReadinessType.R]: 'rrl',
  [ReadinessType.I]: 'irl',
};

export const rubricKey = (type: ReadinessType, level: number): string =>
  `${RUBRIC_KEY_PREFIX[type]}-${level}`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- rag-corpus.types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/rag-corpus.types.ts src/ai/rag-corpus.types.spec.ts
git commit -m "$(cat <<'EOF'
feat(rag): add shared corpus source types, provenance and key helper

One definition of the rubric key format, shared by the seeder and the
query service, so the two cannot disagree about what a row is called.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Readiness rubric corpus data (54 rows)

**Files:**
- Create: `data/rag-corpus/readiness-rubrics.json`
- Create: `src/ai/rag-corpus-data.spec.ts`

**Interfaces:**
- Consumes: `rubricKey`, `PROVENANCES`, `MAX_READINESS_LEVEL` from Task 2.
- Produces: a JSON array of 54 objects shaped
  `{ key, readinessType, level, title, content, keyTerms, provenance, citation, sourceUrl? }`.

**This task's substance is authoring, and the test is the gate.** Write the validation test first so structural mistakes across 54 rows surface immediately rather than at seed time.

- [ ] **Step 1: Write the failing validation test**

Create `src/ai/rag-corpus-data.spec.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { rubricKey, PROVENANCES, MAX_READINESS_LEVEL } from './rag-corpus.types';

const load = (file: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../data/rag-corpus', file), 'utf8'));

describe('readiness-rubrics.json', () => {
  const rows = load('readiness-rubrics.json');

  it('covers every dimension at every level exactly once', () => {
    const expected = Object.values(ReadinessType).flatMap((type) =>
      Array.from({ length: MAX_READINESS_LEVEL }, (_, i) => rubricKey(type, i + 1)),
    );
    expect(rows).toHaveLength(expected.length);
    expect(rows.map((r) => r.key).sort()).toEqual(expected.sort());
  });

  it('gives every row a key matching its own readinessType and level', () => {
    // A mismatched key is the one error deterministic retrieval cannot survive:
    // it would silently return another dimension's rubric.
    for (const row of rows) {
      expect(row.key).toBe(rubricKey(row.readinessType, row.level));
    }
  });

  it('uses only the three provenance values, and cites anything not authored', () => {
    for (const row of rows) {
      expect(PROVENANCES).toContain(row.provenance);
      if (row.provenance === 'authored') {
        expect(row.citation).toBeNull();
      } else {
        expect(typeof row.citation).toBe('string');
        expect(row.citation.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every row substantive content and key terms', () => {
    for (const row of rows) {
      expect(row.title.length).toBeGreaterThan(0);
      // Short enough to be a placeholder is short enough to be a bug.
      expect(row.content.length).toBeGreaterThan(120);
      expect(Array.isArray(row.keyTerms)).toBe(true);
      expect(row.keyTerms.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('marks Technology as standard and Investment as authored', () => {
    const byType = (t: ReadinessType) => rows.filter((r) => r.readinessType === t);
    for (const row of byType(ReadinessType.T)) {
      expect(row.provenance).toBe('standard');
    }
    // IRL is not in the specification's five dimensions and has no external
    // source; it is seeded only because the code still requests it.
    for (const row of byType(ReadinessType.I)) {
      expect(row.provenance).toBe('authored');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- rag-corpus-data`
Expected: FAIL — `ENOENT: no such file or directory ... readiness-rubrics.json`.

- [ ] **Step 3: Author the Technology rows (provenance `standard`)**

Create `data/rag-corpus/readiness-rubrics.json`. Technology uses the public Horizon Europe / NASA TRL scale. Citation for all nine Technology rows:

`"European Commission, Horizon Europe Work Programme, General Annex B — Technology Readiness Levels (TRL); consistent with ISO 16290:2013"`
`sourceUrl`: `"https://ec.europa.eu/research/participants/data/ref/h2020/wp/2014_2015/annexes/h2020-wp1415-annex-g-trl_en.pdf"`

Write all nine following this shape. The first and last are given in full; author 2–8 the same way, keeping `content` to 2–4 sentences that state the standard level definition and then what evidence a startup would show for it.

```json
[
  {
    "_comment": "trl-1 and trl-9 are given in full below. Author trl-2 through trl-8 to the same shape, with the same citation and sourceUrl, using the standard level names listed after this block. Delete this _comment entry — the validation test rejects a row without a key.",
    "key": "trl-1",
    "readinessType": "Technology",
    "level": 1,
    "title": "TRL 1 — Basic principles observed",
    "content": "Scientific research has begun to be translated into applied research and development. Activity is limited to paper studies of a technology's basic properties, with no experimental proof. For a startup, this looks like a documented technical idea or literature review with no code, no prototype, and no laboratory result — the concept is described but nothing has been built or tested.",
    "keyTerms": ["basic principles", "paper study", "literature review", "no prototype", "applied research"],
    "provenance": "standard",
    "citation": "European Commission, Horizon Europe Work Programme, General Annex B — Technology Readiness Levels (TRL); consistent with ISO 16290:2013",
    "sourceUrl": "https://ec.europa.eu/research/participants/data/ref/h2020/wp/2014_2015/annexes/h2020-wp1415-annex-g-trl_en.pdf"
  },

  {
    "key": "trl-9",
    "readinessType": "Technology",
    "level": 9,
    "title": "TRL 9 — Actual system proven in operational environment",
    "content": "The technology is in its final form and has been proven through successful operation under real mission conditions. For a startup, this means the product runs in production for real customers at expected load, with monitoring, incident response, and a track record of sustained operation rather than a pilot window. Remaining work is maintenance and iteration, not proving the system works.",
    "keyTerms": ["operational environment", "production", "sustained operation", "real customers", "final form"],
    "provenance": "standard",
    "citation": "European Commission, Horizon Europe Work Programme, General Annex B — Technology Readiness Levels (TRL); consistent with ISO 16290:2013",
    "sourceUrl": "https://ec.europa.eu/research/participants/data/ref/h2020/wp/2014_2015/annexes/h2020-wp1415-annex-g-trl_en.pdf"
  }
]
```

The nine standard TRL level names, to be used verbatim as `title` suffixes: 1 basic principles observed; 2 technology concept formulated; 3 experimental proof of concept; 4 technology validated in laboratory; 5 technology validated in relevant environment; 6 technology demonstrated in relevant environment; 7 system prototype demonstration in operational environment; 8 system complete and qualified; 9 actual system proven in operational environment.

- [ ] **Step 4: Author Market, Regulatory, Adoption and Organizational rows (provenance `framework-derived`)**

Thirty-six rows, nine per dimension. Citation for all of them:

`"Balanced Readiness Level assessment (BRLa), Technological Forecasting and Social Change (2021) — dimension framework; level descriptors authored against its stated criteria"`
`sourceUrl`: `"https://www.sciencedirect.com/science/article/pii/S0040162521002869"`

The BRLa paper is paywalled, so these descriptors are authored against the framework's published criteria, not transcribed — which is exactly what `framework-derived` records. Each dimension runs 1–3 early exploration, 4–6 validation, 7–9 proven maturity. Criteria basis per dimension:

- **Market (MRL)** — evidence of demand, customer validation, revenue pathway. Level 1: market assumed, no contact with buyers. Level 5: repeated paid pilots with named customers. Level 9: repeatable sales motion with predictable conversion and retention.
- **Regulatory (RRL)** — from identifying applicable rules to full compliance. Level 1: no analysis of which rules apply. Level 5: applicable permits identified and applications lodged. Level 9: fully compliant and audited, with ongoing obligations resourced.
- **Acceptance / Adoption (ARL)** — stakeholder and user willingness to adopt, measured through trials and behavioural evidence. Level 1: adoption assumed. Level 5: measured usage by non-founder users in trials. Level 9: sustained voluntary adoption with measured retention and advocacy.
- **Organizational (ORL)** — team structure, governance, and operational capability to deliver. Level 1: founders only, no defined roles. Level 5: defined roles, basic governance, key hires identified. Level 9: staffed functions, documented processes, and governance able to sustain scale.

Write each `content` as 2–4 concrete sentences naming the evidence an assessor would look for, in the same register as the TRL rows. Vague descriptors here become vague grounding — this text is the deliverable's substance.

- [ ] **Step 5: Author Investment rows (provenance `authored`, `citation: null`)**

Nine rows. IRL is **not** one of the specification's five dimensions; it is seeded only because `ReadinessType` has six values and `createBasePrompt` emits an IRL line, so generation will request it and a missing row would silently return nothing.

Criteria basis: funding path from unfunded to institutionally backed. Level 1: no funding plan, founder time only. Level 5: grant or angel funding secured with a documented use of funds. Level 9: institutional round closed with reporting and governance in place.

Set `"provenance": "authored"` and `"citation": null` on all nine.

- [ ] **Step 6: Run the validation test to verify it passes**

Run: `pnpm test -- rag-corpus-data`
Expected: PASS — 54 rows, every key matching its own type and level, every non-authored row cited.

- [ ] **Step 7: Commit**

```bash
git add data/rag-corpus/readiness-rubrics.json src/ai/rag-corpus-data.spec.ts
git commit -m "$(cat <<'EOF'
feat(rag): author the 54-row readiness rubric corpus

Technology transcribed from the public Horizon Europe TRL scale
(provenance: standard). Market, Regulatory, Adoption and Organizational
authored against BRLa's published criteria, citing it (framework-derived)
— the paper is paywalled, so the descriptors are derived, not
transcribed, and the metadata says so. Investment is authored with no
citation: it is not one of the specification's five dimensions and is
seeded only because the code still requests an IRL rubric.

The validation spec is the gate. It fails on a key that disagrees with
its own readinessType and level, which is the one error deterministic
retrieval cannot survive.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Business framework corpus data (10 rows)

**Files:**
- Create: `data/rag-corpus/business-frameworks.json`
- Modify: `src/ai/rag-corpus-data.spec.ts`

**Interfaces:**
- Consumes: `PROVENANCES` from Task 2.
- Produces: a JSON array of 10 objects shaped `{ key, title, content, keyTerms, provenance, citation, sourceUrl? }`. No `readinessType` or `level` — these are not dimension-keyed.

- [ ] **Step 1: Write the failing test**

Append to `src/ai/rag-corpus-data.spec.ts`:

```typescript
describe('business-frameworks.json', () => {
  const rows = load('business-frameworks.json');

  it('holds ten rows with unique keys', () => {
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((r) => r.key)).size).toBe(10);
  });

  it('carries no dimension key — these are not retrieved by dimension', () => {
    for (const row of rows) {
      expect(row.readinessType).toBeUndefined();
      expect(row.level).toBeUndefined();
    }
  });

  it('uses only the three provenance values, and cites anything not authored', () => {
    for (const row of rows) {
      expect(PROVENANCES).toContain(row.provenance);
      if (row.provenance === 'authored') {
        expect(row.citation).toBeNull();
      } else {
        expect(typeof row.citation).toBe('string');
      }
    }
  });

  it('gives every row substantive content and key terms', () => {
    for (const row of rows) {
      expect(row.content.length).toBeGreaterThan(200);
      expect(row.keyTerms.length).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- rag-corpus-data`
Expected: FAIL — `ENOENT ... business-frameworks.json`. The rubric describes still pass.

- [ ] **Step 3: Author the ten rows**

Create `data/rag-corpus/business-frameworks.json`. The ten, fixed by the spec:

| key | title | provenance | citation |
|---|---|---|---|
| `bmc` | Business Model Canvas | `framework-derived` | Osterwalder & Pigneur, *Business Model Generation* (2010) |
| `lean-canvas` | Lean Canvas | `framework-derived` | Maurya, *Running Lean* (2012) |
| `market-sizing` | TAM / SAM / SOM market sizing | `framework-derived` | Standard venture market-sizing practice |
| `unit-economics` | Unit economics: CAC, LTV and payback | `framework-derived` | Standard venture finance practice |
| `customer-discovery` | Customer discovery and problem interviews | `framework-derived` | Blank, *The Four Steps to the Epiphany* (2005) |
| `go-to-market` | Go-to-market motions | `authored` | `null` |
| `ph-regulatory` | Philippine startup regulatory pathway | `authored` | `null` |
| `ip-basics` | Intellectual property basics (IPOPHL) | `authored` | `null` |
| `evidence-standards` | Pilot and letter-of-intent evidence standards | `authored` | `null` |
| `org-design` | Founding team and organisational design | `authored` | `null` |

Worked example — write the other nine to match:

```json
[
  {
    "key": "bmc",
    "title": "Business Model Canvas",
    "content": "The Business Model Canvas describes a venture across nine blocks: customer segments, value propositions, channels, customer relationships, revenue streams, key resources, key activities, key partnerships, and cost structure. It is a description tool, not a validation tool — a fully populated canvas asserts hypotheses and does not evidence them. When assessing a startup against it, look for which blocks are supported by observed evidence (signed agreements, measured usage, actual invoices) versus which are still assumptions, because a confident canvas with no evidence behind its revenue streams is a common source of overstated readiness.",
    "keyTerms": ["customer segments", "value proposition", "revenue streams", "cost structure", "key partnerships", "channels"],
    "provenance": "framework-derived",
    "citation": "Osterwalder & Pigneur, Business Model Generation (2010)",
    "sourceUrl": "https://www.strategyzer.com/library/the-business-model-canvas"
  }
]
```

Author the remaining nine into the same array, following the table above for `key`, `title`, `provenance` and `citation`.

Note the closing sentence of that example: each framework row should say what *evidence* distinguishes a claim from a validated fact. That framing is what makes the corpus useful for a hallucination objective rather than a glossary.

For `ph-regulatory`, cover SEC or DTI registration, BIR registration, local business permits, sector-specific regulators (FDA for health products, DOH for facilities), and the Data Privacy Act's registration and consent obligations. This is the row the Regulatory dimension will lean on most, and none of the two seeded startups' capsule proposals contain it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- rag-corpus-data`
Expected: PASS, both describes.

- [ ] **Step 5: Commit**

```bash
git add data/rag-corpus/business-frameworks.json src/ai/rag-corpus-data.spec.ts
git commit -m "$(cat <<'EOF'
feat(rag): author the ten-row business framework corpus

Each row states what evidence separates a claim from a validated fact,
rather than defining the framework as a glossary would — that framing is
what makes the corpus useful to a hallucination objective.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Corpus seeder service and runner

**Files:**
- Create: `src/ai/rag-corpus-seeder.service.ts`
- Create: `src/ai/rag-corpus-seeder.service.spec.ts`
- Create: `seed-rag-corpus.js`
- Modify: `src/ai/ai.module.ts`

**Interfaces:**
- Consumes: `RagContext` entity, `EmbeddingIndexService.indexRagContext(context): Promise<boolean>`, the Task 2 types, the Task 3–4 data files.
- Produces: `RagCorpusSeederService.seed(): Promise<{ created: number; updated: number; unchanged: number; embedded: number }>`.

The upsert logic lives in an injectable service rather than in the `.js` script so it is unit-testable; the script is a thin runner. `seed-demo-full.js` is the convention to follow for the runner.

- [ ] **Step 1: Write the failing tests**

Create `src/ai/rag-corpus-seeder.service.spec.ts`:

```typescript
import { EntityManager } from '@mikro-orm/core';
import { RagCorpusSeederService } from './rag-corpus-seeder.service';
import { EmbeddingIndexService } from './embedding-index.service';
import { RUBRIC_SOURCE_TYPE } from './rag-corpus.types';

const row = (over = {}) => ({
  key: 'trl-1',
  readinessType: 'Technology',
  level: 1,
  title: 'TRL 1',
  content: 'original content',
  keyTerms: ['a', 'b', 'c'],
  provenance: 'standard',
  citation: 'somewhere',
  ...over,
});

/** EntityManager double: find returns whatever existing rows the test sets up. */
const emDouble = (existing: unknown[] = []) => {
  const persist = jest.fn();
  const flush = jest.fn().mockResolvedValue(undefined);
  const create = jest.fn((_entity, data) => ({ ...data, id: 1 }));
  const find = jest.fn().mockResolvedValue(existing);
  return {
    em: { find, create, persist, flush } as unknown as EntityManager,
    persist,
    flush,
    create,
  };
};

const build = (em: EntityManager, index: jest.Mock) =>
  new RagCorpusSeederService(em, { indexRagContext: index } as unknown as EmbeddingIndexService);

describe('RagCorpusSeederService', () => {
  it('creates and embeds a row that does not exist yet', async () => {
    const { em, create } = emDouble([]);
    const index = jest.fn().mockResolvedValue(true);

    const result = await build(em, index).seedRows(RUBRIC_SOURCE_TYPE, [row()]);

    expect(create).toHaveBeenCalled();
    expect(index).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ created: 1, updated: 0, unchanged: 0, embedded: 1 });
  });

  it('leaves an unchanged row alone and does not spend an embedding call', async () => {
    // Embedding costs quota. A no-op re-run must cost nothing, or nobody will
    // re-run the seeder and the corpus will drift from the data files.
    const existing = {
      id: 4,
      sourceType: RUBRIC_SOURCE_TYPE,
      title: 'TRL 1',
      content: 'original content',
      metadata: { key: 'trl-1' },
    };
    const { em, create } = emDouble([existing]);
    const index = jest.fn();

    const result = await build(em, index).seedRows(RUBRIC_SOURCE_TYPE, [row()]);

    expect(create).not.toHaveBeenCalled();
    expect(index).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 1, embedded: 0 });
  });

  it('re-embeds when the content changed', async () => {
    const existing = {
      id: 4,
      sourceType: RUBRIC_SOURCE_TYPE,
      title: 'TRL 1',
      content: 'stale content',
      metadata: { key: 'trl-1' },
    };
    const { em } = emDouble([existing]);
    const index = jest.fn().mockResolvedValue(true);

    const result = await build(em, index).seedRows(RUBRIC_SOURCE_TYPE, [row()]);

    expect(existing.content).toBe('original content');
    expect(index).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ created: 0, updated: 1, unchanged: 0, embedded: 1 });
  });

  it('matches existing rows by metadata key, not by title', async () => {
    // Titles are editable prose; the key is the identity. Matching on title
    // would create a duplicate row every time a title is reworded.
    const existing = {
      id: 4,
      sourceType: RUBRIC_SOURCE_TYPE,
      title: 'an old title',
      content: 'original content',
      metadata: { key: 'trl-1' },
    };
    const { em, create } = emDouble([existing]);

    const result = await build(em, jest.fn().mockResolvedValue(true)).seedRows(
      RUBRIC_SOURCE_TYPE,
      [row()],
    );

    expect(create).not.toHaveBeenCalled();
    expect(existing.title).toBe('TRL 1');
    expect(result.updated).toBe(1);
  });

  it('reports a row whose embedding failed as not embedded', async () => {
    const { em } = emDouble([]);
    const index = jest.fn().mockResolvedValue(false);

    const result = await build(em, index).seedRows(RUBRIC_SOURCE_TYPE, [row()]);

    expect(result).toMatchObject({ created: 1, embedded: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- rag-corpus-seeder`
Expected: FAIL — `Cannot find module './rag-corpus-seeder.service'`.

- [ ] **Step 3: Write the service**

Create `src/ai/rag-corpus-seeder.service.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { RagContext } from '../entities/rag-context.entity';
import { EmbeddingIndexService } from './embedding-index.service';
import {
  CorpusRowMetadata,
  FRAMEWORK_SOURCE_TYPE,
  RUBRIC_SOURCE_TYPE,
} from './rag-corpus.types';

export interface SeedResult {
  created: number;
  updated: number;
  unchanged: number;
  embedded: number;
}

interface CorpusFileRow extends CorpusRowMetadata {
  title: string;
  content: string;
}

const DATA_DIR = join(__dirname, '../../data/rag-corpus');

/**
 * Loads the checked-in corpus into `rag_contexts` and indexes it.
 *
 * A service rather than logic inside seed-rag-corpus.js so the upsert rules are
 * unit-testable — particularly "unchanged means no embedding call", which is
 * the property that makes re-running safe. Embedding costs quota, and a seeder
 * nobody dares re-run is a corpus that drifts from its data files.
 */
@Injectable()
export class RagCorpusSeederService {
  private readonly logger = new Logger(RagCorpusSeederService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly embeddingIndex: EmbeddingIndexService,
  ) {}

  async seed(): Promise<SeedResult> {
    const rubrics = this.load('readiness-rubrics.json');
    const frameworks = this.load('business-frameworks.json');

    const a = await this.seedRows(RUBRIC_SOURCE_TYPE, rubrics);
    const b = await this.seedRows(FRAMEWORK_SOURCE_TYPE, frameworks);

    const total: SeedResult = {
      created: a.created + b.created,
      updated: a.updated + b.updated,
      unchanged: a.unchanged + b.unchanged,
      embedded: a.embedded + b.embedded,
    };
    this.logger.log(
      `Corpus seeded: ${total.created} created, ${total.updated} updated, ` +
        `${total.unchanged} unchanged, ${total.embedded} embedded`,
    );
    return total;
  }

  private load(file: string): CorpusFileRow[] {
    return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
  }

  async seedRows(sourceType: string, rows: CorpusFileRow[]): Promise<SeedResult> {
    const existing = await this.em.find(RagContext, { sourceType });
    const byKey = new Map<string, RagContext>();
    for (const context of existing) {
      const key = (context.metadata as CorpusRowMetadata | undefined)?.key;
      if (key) {
        byKey.set(key, context);
      }
    }

    const result: SeedResult = { created: 0, updated: 0, unchanged: 0, embedded: 0 };
    const toIndex: RagContext[] = [];

    for (const row of rows) {
      const { title, content, ...metadata } = row;
      const current = byKey.get(row.key);

      if (!current) {
        const created = this.em.create(RagContext, {
          sourceType,
          title,
          content,
          metadata: metadata as unknown as Record<string, unknown>,
          confidence: null,
          createdAt: new Date(),
        });
        this.em.persist(created);
        toIndex.push(created);
        result.created += 1;
        continue;
      }

      // Only `content` decides whether re-embedding is needed — the vector is
      // derived from title + content, so a title change counts too.
      const changed = current.content !== content || current.title !== title;
      current.title = title;
      current.content = content;
      current.metadata = metadata as unknown as Record<string, unknown>;

      if (changed) {
        this.em.persist(current);
        toIndex.push(current);
        result.updated += 1;
      } else {
        result.unchanged += 1;
      }
    }

    await this.em.flush();

    for (const context of toIndex) {
      if (await this.embeddingIndex.indexRagContext(context)) {
        result.embedded += 1;
      }
    }

    return result;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- rag-corpus-seeder`
Expected: PASS, all five.

- [ ] **Step 5: Register the service**

In `src/ai/ai.module.ts`, add `RagCorpusSeederService` to both `providers` and `exports`, and import it at the top.

- [ ] **Step 6: Write the runner script**

Create `seed-rag-corpus.js`, following `seed-demo-full.js`'s dist-resolution convention:

```javascript
/**
 * Seeds the verified-knowledge RAG corpus (Objective 1b).
 *
 *   pnpm build && node seed-rag-corpus.js
 *
 * Additive and idempotent. A re-run with no data-file changes performs no
 * writes and spends no embedding quota — check the "unchanged" count.
 *
 * Uses NestFactory.createApplicationContext rather than a bare MikroORM
 * connection because the seeding path depends on EmbeddingIndexService, which
 * depends on EmbeddingService and ConfigService. Building the real DI graph is
 * also what makes this exercise the same code the running server uses.
 */
process.chdir(__dirname);

const fs = require('fs');
const DIST = fs.existsSync(`${__dirname}/dist/src/mikro-orm.config.js`) ? './dist/src' : './dist';
const req = (p) => require(`${DIST}/${p}`);

const { NestFactory } = require('@nestjs/core');
const { AppModule } = req('app.module');
const { RagCorpusSeederService } = req('ai/rag-corpus-seeder.service');

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(RagCorpusSeederService).seed();
    console.log(result);
    if (result.embedded === 0 && result.created + result.updated > 0) {
      // Rows landed but nothing indexed means GEMINI_API_KEY is missing or the
      // embedding call failed. Retrieval will not see this corpus at all, so
      // say so loudly rather than reporting success.
      console.error('WARNING: rows were written but none were embedded — semantic retrieval will not see them');
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 7: Verify the runner against the real database**

Stop `pnpm dev` first if it is running (see Global Constraints).

```bash
pnpm build && node seed-rag-corpus.js
```

Expected: `{ created: 64, updated: 0, unchanged: 0, embedded: 64 }`.

Then run it a second time. Expected: `{ created: 0, updated: 0, unchanged: 64, embedded: 0 }` — this is the idempotency property, and it must hold before moving on.

Confirm the vectors landed:

```bash
node -e "const{MikroORM}=require('@mikro-orm/core');const c=require('./dist/src/mikro-orm.config');(async()=>{const o=await MikroORM.init(c.default||c);const r=await o.em.getConnection().execute(\"select rc.source_type, count(*) n, count(ve.id) vectors from rag_contexts rc left join vector_embeddings ve on ve.source_id = rc.id::text and ve.source_type='rag_context' group by 1 order by 1\");console.log(r);await o.close();})()"
```

Expected: `readiness_rubric` 54/54, `business_framework` 10/10.

- [ ] **Step 8: Commit**

```bash
git add src/ai/rag-corpus-seeder.service.ts src/ai/rag-corpus-seeder.service.spec.ts src/ai/ai.module.ts seed-rag-corpus.js
git commit -m "$(cat <<'EOF'
feat(rag): seed the corpus idempotently, re-embedding only on change

Upsert keyed on metadata.key rather than title, so rewording a title does
not fork a duplicate row. A re-run with no data-file changes spends no
embedding quota, which is what makes re-running safe enough to actually
do.

The runner builds the real DI graph via createApplicationContext rather
than a bare ORM connection — the seeding path depends on
EmbeddingIndexService, and mocked coverage of that path has hidden real
breakage here before.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Three-channel retrieval in RagQueryService

**Files:**
- Modify: `src/rna/rag-query.service.ts`
- Create: `src/rna/rag-query.service.spec.ts`
- Modify: `src/entities/rag-retrieval-log.entity.ts` — add a nullable `channel_counts` jsonb column
- Modify: `src/rna/rna.module.ts`

**Interfaces:**
- Consumes: Task 1's `AiPipelineConfig` (`ragCorpus`, `rubricMode`), Task 2's source-type constants and `rubricKey`, `RAG_MIN_SIMILARITY` / `RAG_TOP_K` / `RAG_CONTEXT_SOURCE` as today, `EmbeddingService.embed`.
- Produces:
  - `interface RetrievedDoc { sourceType: string; title: string; content: string; provenance?: string; citation?: string; similarity?: number; startupId?: number }`
  - `interface RAGContext { verifiedFrameworks: RetrievedDoc[]; businessModels: RetrievedDoc[]; similarProfiles: RetrievedDoc[]; lowConfidence: boolean }`
  - `interface RagQueryOptions { config: AiPipelineConfig; dimensions?: { readinessType: ReadinessType; level: number }[] }`
  - `queryVectorDatabase(startupId: string, opts?: RagQueryOptions): Promise<RAGContext>`

**Note on `lowConfidence`:** it now means *all three channels empty*, matching SRS §2.2's "if the vector database returns no relevant results". Task 7's prompt guards are its exact negation, so the two cannot drift.

- [ ] **Step 1: Write the failing tests**

Create `src/rna/rag-query.service.spec.ts`:

```typescript
import { EntityManager } from '@mikro-orm/core';
import { RagQueryService } from './rag-query.service';
import { EmbeddingService } from '../ai/embedding.service';
import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { AiPipelineConfig } from '../ai/ai-config.types';
import { RUBRIC_SOURCE_TYPE, FRAMEWORK_SOURCE_TYPE } from '../ai/rag-corpus.types';

const config = (over: Partial<AiPipelineConfig> = {}): AiPipelineConfig => ({
  model: 'test-model',
  temperature: 0,
  grounding: true,
  rag: true,
  ragStrategy: 'semantic',
  ragCorpus: true,
  rubricMode: 'deterministic',
  biasReview: true,
  scoreNormalization: true,
  ...over,
});

const rubricRow = (key: string, type: ReadinessType, level: number) => ({
  sourceType: RUBRIC_SOURCE_TYPE,
  title: `${key} title`,
  content: `${key} content`,
  metadata: { key, readinessType: type, level, provenance: 'standard', citation: 'a source' },
});

const emDouble = (opts: { ormRows?: unknown[]; sqlRows?: unknown[] } = {}) => {
  const execute = jest.fn().mockResolvedValue(opts.sqlRows ?? []);
  const find = jest.fn().mockResolvedValue(opts.ormRows ?? []);
  const persistAndFlush = jest.fn().mockResolvedValue(undefined);
  return {
    em: {
      find,
      create: jest.fn((_e, d) => d),
      persistAndFlush,
      getReference: jest.fn((_e, id) => ({ id })),
      getConnection: () => ({ execute }),
    } as unknown as EntityManager,
    execute,
    find,
  };
};

const build = (em: EntityManager, embed = jest.fn()) =>
  new RagQueryService(em, { embed } as unknown as EmbeddingService);

const dims = [{ readinessType: ReadinessType.T, level: 3 }];

describe('RagQueryService — rubric channel', () => {
  it('retrieves the current level and the next one by exact key', async () => {
    const { em, find } = emDouble({
      ormRows: [
        rubricRow('trl-3', ReadinessType.T, 3),
        rubricRow('trl-4', ReadinessType.T, 4),
        rubricRow('trl-9', ReadinessType.T, 9),
        rubricRow('mrl-3', ReadinessType.M, 3),
      ],
    });

    const result = await build(em).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(find).toHaveBeenCalledWith(expect.anything(), { sourceType: RUBRIC_SOURCE_TYPE });
    expect(result.verifiedFrameworks.map((f) => f.title)).toEqual(['trl-3 title', 'trl-4 title']);
  });

  it('clamps the next level at 9 rather than asking for a level 10 that cannot exist', async () => {
    const { em } = emDouble({ ormRows: [rubricRow('trl-9', ReadinessType.T, 9)] });

    const result = await build(em).queryVectorDatabase('1', {
      config: config(),
      dimensions: [{ readinessType: ReadinessType.T, level: 9 }],
    });

    expect(result.verifiedFrameworks).toHaveLength(1);
    expect(result.verifiedFrameworks[0].title).toBe('trl-9 title');
  });

  it('carries provenance and citation through to the caller', async () => {
    // SRS 2.2 requires a confidence/validity indicator; it is derived from these.
    const { em } = emDouble({ ormRows: [rubricRow('trl-3', ReadinessType.T, 3)] });

    const result = await build(em).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(result.verifiedFrameworks[0]).toMatchObject({
      provenance: 'standard',
      citation: 'a source',
      content: 'trl-3 content',
    });
  });

  it('does not embed anything in deterministic mode', async () => {
    const embed = jest.fn();
    const { em } = emDouble({ ormRows: [rubricRow('trl-3', ReadinessType.T, 3)] });

    await build(em, embed).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(embed).not.toHaveBeenCalled();
  });

  it('uses the vector path in semantic mode, scoped to rubric rows', async () => {
    const embed = jest.fn().mockResolvedValue([0.1, 0.2]);
    const { em, execute } = emDouble({
      sqlRows: [
        {
          source_type: RUBRIC_SOURCE_TYPE,
          title: 'trl-3 title',
          content: 'trl-3 content',
          metadata: { provenance: 'standard', citation: 'a source' },
          similarity: 0.9,
        },
      ],
    });

    const result = await build(em, embed).queryVectorDatabase('1', {
      config: config({ rubricMode: 'semantic' }),
      dimensions: dims,
    });

    expect(embed).toHaveBeenCalled();
    expect(execute.mock.calls.some((c) => c[1]?.includes(RUBRIC_SOURCE_TYPE))).toBe(true);
    expect(result.verifiedFrameworks[0].title).toBe('trl-3 title');
  });

  it('drops semantic rubric hits below the similarity floor', async () => {
    const embed = jest.fn().mockResolvedValue([0.1, 0.2]);
    const { em } = emDouble({
      sqlRows: [
        { source_type: RUBRIC_SOURCE_TYPE, title: 'far', content: 'far', metadata: {}, similarity: 0.4 },
      ],
    });

    const result = await build(em, embed).queryVectorDatabase('1', {
      config: config({ rubricMode: 'semantic' }),
      dimensions: dims,
    });

    expect(result.verifiedFrameworks).toEqual([]);
  });

  it('returns no rubrics when the corpus is disabled', async () => {
    const { em, find } = emDouble({ ormRows: [rubricRow('trl-3', ReadinessType.T, 3)] });

    const result = await build(em).queryVectorDatabase('1', {
      config: config({ ragCorpus: false }),
      dimensions: dims,
    });

    expect(result.verifiedFrameworks).toEqual([]);
    expect(find).not.toHaveBeenCalledWith(expect.anything(), { sourceType: RUBRIC_SOURCE_TYPE });
  });
});

describe('RagQueryService — lowConfidence', () => {
  it('is false when rubrics were found even with no peers', async () => {
    // The old rule flagged low confidence whenever no peer cleared the floor,
    // which would mark a generation grounded in verified rubrics as unreliable
    // and train users to ignore the indicator.
    const { em } = emDouble({ ormRows: [rubricRow('trl-3', ReadinessType.T, 3)] });

    const result = await build(em).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(result.similarProfiles).toEqual([]);
    expect(result.lowConfidence).toBe(false);
  });

  it('is true only when all three channels are empty', async () => {
    const { em } = emDouble({ ormRows: [], sqlRows: [] });

    const result = await build(em).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(result.lowConfidence).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- rag-query.service`
Expected: FAIL — the constructor takes one argument today, and `verifiedFrameworks` is hardcoded `[]`.

- [ ] **Step 3: Add the per-channel column to the retrieval log**

`RagRetrievalLog` records a single `result_count`, which cannot distinguish "the rubric was missing" from "no peer cleared the floor" — and those two call for opposite fixes. Add to `src/entities/rag-retrieval-log.entity.ts`, after `retrieved_profile_ids`:

```typescript
  /**
   * Per-channel result counts: { rubrics, frameworks, peers }.
   *
   * Nullable because rows written before the corpus existed have no breakdown,
   * and backfilling a guess would be worse than an honest null.
   */
  @Property({ type: 'jsonb', nullable: true })
  channel_counts?: { rubrics: number; frameworks: number; peers: number } | null;
```

The dev schema is shaped by `updateSchema()` on boot, so this column appears on the next `pnpm dev` with no migration step.

- [ ] **Step 4: Rewrite the service**

Replace `src/rna/rag-query.service.ts`. Keep the peer SQL exactly as it is — only its result mapping changes.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { RagRetrievalLog } from '../entities/rag-retrieval-log.entity';
import { RagContext } from '../entities/rag-context.entity';
import { Startup } from '../entities/startup.entity';
import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { RAG_CONTEXT_SOURCE } from '../ai/embedding-index.service';
import { RAG_MIN_SIMILARITY, RAG_TOP_K } from '../ai/ai.service';
import { EmbeddingService } from '../ai/embedding.service';
import { AiPipelineConfig } from '../ai/ai-config.types';
import {
  CorpusRowMetadata,
  FRAMEWORK_SOURCE_TYPE,
  MAX_READINESS_LEVEL,
  RUBRIC_SOURCE_TYPE,
  rubricKey,
} from '../ai/rag-corpus.types';

export interface RetrievedDoc {
  sourceType: string;
  title: string;
  content: string;
  provenance?: string;
  citation?: string;
  similarity?: number;
  startupId?: number;
}

/**
 * The three retrieval channels SDD §3.2 specifies for the RAG Query Service:
 * "verified startup frameworks, business model references, and contextually
 * similar prior validated profiles". Only the third was ever implemented.
 */
export interface RAGContext {
  verifiedFrameworks: RetrievedDoc[];
  businessModels: RetrievedDoc[];
  similarProfiles: RetrievedDoc[];
  lowConfidence: boolean;
}

export interface RagQueryOptions {
  config: AiPipelineConfig;
  /** Dimensions being generated for. Drives the rubric channel's key lookup. */
  dimensions?: { readinessType: ReadinessType; level: number }[];
}

export interface ChannelCounts {
  rubrics: number;
  frameworks: number;
  peers: number;
}

const EMPTY_CONTEXT: RAGContext = {
  verifiedFrameworks: [],
  businessModels: [],
  similarProfiles: [],
  lowConfidence: true,
};

@Injectable()
export class RagQueryService {
  private readonly logger = new Logger(RagQueryService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly embeddings: EmbeddingService,
  ) {}

  async queryVectorDatabase(
    startupId: string,
    opts?: RagQueryOptions,
  ): Promise<RAGContext> {
    const id = Number(startupId);
    if (!Number.isInteger(id)) {
      this.logger.warn(`Ignoring non-numeric startup id "${startupId}"`);
      return EMPTY_CONTEXT;
    }

    const corpusOn = opts?.config?.ragCorpus ?? false;

    const verifiedFrameworks = corpusOn ? await this.retrieveRubrics(opts!) : [];
    const businessModels = corpusOn ? await this.retrieveFrameworks(id) : [];
    const similarProfiles = await this.retrievePeers(id);

    // "If the vector database returns no relevant results, the system falls back
    // to profile-only prompting and logs a low-confidence flag" (SRS §2.2). All
    // three channels, not just peers — the previous rule flagged a generation
    // grounded in verified rubrics as low-confidence whenever no peer cleared
    // the floor, which teaches users to ignore the indicator.
    const lowConfidence =
      verifiedFrameworks.length === 0 &&
      businessModels.length === 0 &&
      similarProfiles.length === 0;

    await this.logRetrieval(
      startupId,
      verifiedFrameworks.length + businessModels.length + similarProfiles.length,
      lowConfidence ? 'low' : 'high',
      lowConfidence,
      similarProfiles.map((p) => p.startupId!).filter(Number.isInteger),
      {
        rubrics: verifiedFrameworks.length,
        frameworks: businessModels.length,
        peers: similarProfiles.length,
      },
    );

    return { verifiedFrameworks, businessModels, similarProfiles, lowConfidence };
  }

  /**
   * Channel 1 — readiness rubrics.
   *
   * Deterministic by default: the correct context for a Technology assessment at
   * level 3 is the TRL 3 and TRL 4 rubric, regardless of that text's cosine
   * distance to the capsule proposal. Semantic mode exists because SDD §3.2
   * specifies it, so the comparison is measurable rather than asserted.
   */
  private async retrieveRubrics(opts: RagQueryOptions): Promise<RetrievedDoc[]> {
    const dimensions = opts.dimensions ?? [];
    if (dimensions.length === 0) {
      return [];
    }

    if (opts.config.rubricMode === 'semantic') {
      return this.searchCorpus(RUBRIC_SOURCE_TYPE, dimensions.map((d) => d.readinessType).join(' '));
    }

    const wanted = new Set<string>();
    for (const { readinessType, level } of dimensions) {
      wanted.add(rubricKey(readinessType, level));
      wanted.add(rubricKey(readinessType, Math.min(level + 1, MAX_READINESS_LEVEL)));
    }

    // 54 short rows; filtering in memory avoids a Postgres-specific JSON query
    // for no measurable gain.
    const rows = await this.em.find(RagContext, { sourceType: RUBRIC_SOURCE_TYPE });
    return rows
      .filter((row) => wanted.has((row.metadata as CorpusRowMetadata | undefined)?.key ?? ''))
      .map((row) => this.toDoc(row));
  }

  /** Channel 2 — business frameworks, always semantic. */
  private async retrieveFrameworks(startupId: number): Promise<RetrievedDoc[]> {
    const startup = await this.em.findOne(Startup, { id: startupId }, { populate: ['capsuleProposal'] });
    const query = [
      startup?.name ?? '',
      startup?.capsuleProposal?.description ?? '',
      startup?.capsuleProposal?.targetMarket ?? '',
    ].join(' ').trim();
    if (!query) {
      return [];
    }
    return this.searchCorpus(FRAMEWORK_SOURCE_TYPE, query, 2);
  }

  /** Vector search restricted to one corpus population. */
  private async searchCorpus(
    sourceType: string,
    query: string,
    limit = 2,
  ): Promise<RetrievedDoc[]> {
    const vector = await this.embeddings.embed(query);
    if (!vector) {
      return [];
    }

    const literal = `[${vector.join(',')}]`;
    const rows = await this.em.getConnection().execute<
      {
        source_type: string;
        title: string;
        content: string;
        metadata: CorpusRowMetadata | null;
        similarity: number;
      }[]
    >(
      `select rc.source_type, rc.title, rc.content, rc.metadata,
              1 - (ve.embedding <=> ?::vector) as similarity
         from vector_embeddings ve
         join rag_contexts rc on rc.id = ve.source_id::int
        where ve.source_type = ? and rc.source_type = ?
        order by ve.embedding <=> ?::vector
        limit ?`,
      [literal, RAG_CONTEXT_SOURCE, sourceType, literal, limit],
    );

    return rows
      .filter((row) => row.similarity >= RAG_MIN_SIMILARITY)
      .map((row) => ({
        sourceType: row.source_type,
        title: row.title,
        content: row.content,
        provenance: row.metadata?.provenance,
        citation: row.metadata?.citation ?? undefined,
        similarity: row.similarity,
      }));
  }

  /** Channel 3 — peer startups. SQL unchanged; only the mapping carries content now. */
  private async retrievePeers(id: number): Promise<RetrievedDoc[]> {
    const rows = await this.em.getConnection().execute<
      {
        startup_id: number;
        title: string;
        content: string;
        source_type: string;
        similarity: number;
      }[]
    >(
      `with source as (
         select ve.embedding
           from vector_embeddings ve
           join rag_contexts rc on rc.id = ve.source_id::int
          where ve.source_type = ? and rc.startup_id = ?
          order by ve.id desc
          limit 1
       )
       select rc.startup_id, rc.title, rc.content, rc.source_type,
              1 - (ve.embedding <=> (select embedding from source)) as similarity
         from vector_embeddings ve
         join rag_contexts rc on rc.id = ve.source_id::int
        where ve.source_type = ?
          and rc.startup_id is not null
          and rc.startup_id <> ?
          and exists (select 1 from source)
        order by ve.embedding <=> (select embedding from source)
        limit ?`,
      [RAG_CONTEXT_SOURCE, id, RAG_CONTEXT_SOURCE, id, RAG_TOP_K],
    );

    return rows
      .filter((row) => row.similarity >= RAG_MIN_SIMILARITY)
      .map((row) => ({
        sourceType: row.source_type,
        title: row.title,
        content: row.content,
        similarity: row.similarity,
        startupId: row.startup_id,
      }));
  }

  private toDoc(row: RagContext): RetrievedDoc {
    const metadata = row.metadata as CorpusRowMetadata | undefined;
    return {
      sourceType: row.sourceType,
      title: row.title,
      content: row.content,
      provenance: metadata?.provenance,
      citation: metadata?.citation ?? undefined,
    };
  }

  async logRetrieval(
    startupId: string,
    resultCount: number,
    confidenceLevel: string,
    lowConfidenceFlagged: boolean,
    retrievedProfileIds: number[],
    channelCounts?: ChannelCounts,
  ): Promise<void> {
    const log = this.em.create(RagRetrievalLog, {
      startup: this.em.getReference(Startup, Number(startupId)),
      result_count: resultCount,
      confidence_level: confidenceLevel,
      low_confidence_flagged: lowConfidenceFlagged,
      retrieved_profile_ids: retrievedProfileIds,
      // A single total cannot distinguish "the rubric was missing" from "no
      // peer cleared the floor", and those call for opposite fixes.
      channel_counts: channelCounts ?? null,
      retrieved_at: new Date(),
    });
    await this.em.persistAndFlush(log);
  }
}
```

Add `findOne` to the test double's `em` object in `rag-query.service.spec.ts` (returning `null` by default) so the framework channel does not blow up in the rubric tests.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- rag-query.service`
Expected: PASS, all nine.

- [ ] **Step 6: Run the whole suite**

Run: `pnpm test`
Expected: 2 pre-existing failures only. `rna.service.spec.ts` and `rns.service.spec.ts` mock `queryVectorDatabase`, so they keep compiling; if either asserts on the old `similarProfiles` shape, update the mock's return value to the new `RetrievedDoc` shape.

- [ ] **Step 7: Commit**

```bash
git add src/rna/rag-query.service.ts src/rna/rag-query.service.spec.ts src/entities/rag-retrieval-log.entity.ts
git commit -m "$(cat <<'EOF'
feat(rag): implement all three retrieval channels

verifiedFrameworks and businessModels have returned hardcoded [] since
the file was written; SDD §3.2 names all three channels explicitly and
only similarProfiles was ever built.

Rubrics retrieve by exact (dimension, level) key by default and by vector
search under AI_RAG_RUBRIC_MODE=semantic, which is the SDD's stated
mechanism. Peer SQL is unchanged — only its mapping changes, to carry
content rather than metadata alone.

lowConfidence now means all three channels empty, matching SRS §2.2.
The old rule flagged a generation grounded in verified rubrics as
low-confidence whenever no peer cleared the 0.78 floor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Prompt assembly and generation-path wiring

**Files:**
- Modify: `src/rna/grounded-prompt-builder.service.ts`
- Create: `src/rna/grounded-prompt-builder.service.spec.ts`
- Modify: `src/rna/rna.service.ts:136-194`
- Modify: `src/rns/rns.service.ts:211,282-288`

**Interfaces:**
- Consumes: Task 6's `RAGContext` and `RetrievedDoc`.
- Produces: `buildGroundedPrompt(context, profile, missingReadinessTypes, customTaskBlock?): string` — same signature, different output.

**This is the highest-impact task in the plan.** `buildGroundedPrompt` currently prints similar profiles as ID, similarity and metadata and never emits `content`, so RNA and RNS generation receive no retrieved text at all today.

- [ ] **Step 1: Write the failing tests**

Create `src/rna/grounded-prompt-builder.service.spec.ts`:

```typescript
import { GroundedPromptBuilderService } from './grounded-prompt-builder.service';
import { RAGContext } from './rag-query.service';

const ctx = (over: Partial<RAGContext> = {}): RAGContext => ({
  verifiedFrameworks: [],
  businessModels: [],
  similarProfiles: [],
  lowConfidence: false,
  ...over,
});

const service = new GroundedPromptBuilderService();
const profile = { title: 'AgroLink PH', description: 'Cooperative market access' };

describe('buildGroundedPrompt', () => {
  it('emits the retrieved text of a similar profile, not just its id and score', () => {
    // The whole point of retrieval. This previously printed ID + similarity +
    // metadata and dropped content entirely, so generation was ungrounded.
    const prompt = service.buildGroundedPrompt(
      ctx({
        similarProfiles: [
          { sourceType: 'capsule_proposal', title: 'MediSync', content: 'referral coordination for rural health units', similarity: 0.82, startupId: 2 },
        ],
      }),
      profile,
      ['Technology'],
    );

    expect(prompt).toContain('referral coordination for rural health units');
  });

  it('emits rubric content with its provenance and citation', () => {
    const prompt = service.buildGroundedPrompt(
      ctx({
        verifiedFrameworks: [
          { sourceType: 'readiness_rubric', title: 'TRL 3', content: 'experimental proof of concept', provenance: 'standard', citation: 'Horizon Europe Annex B' },
        ],
      }),
      profile,
      ['Technology'],
    );

    expect(prompt).toContain('experimental proof of concept');
    expect(prompt).toContain('Horizon Europe Annex B');
  });

  it('does not JSON.stringify framework objects', () => {
    const prompt = service.buildGroundedPrompt(
      ctx({
        businessModels: [
          { sourceType: 'business_framework', title: 'Lean Canvas', content: 'problem, solution, key metrics', provenance: 'framework-derived', citation: 'Maurya (2012)' },
        ],
      }),
      profile,
      ['Market'],
    );

    expect(prompt).toContain('problem, solution, key metrics');
    expect(prompt).not.toContain('{"sourceType"');
  });

  it('orders sections rubrics, then frameworks, then peers', () => {
    const prompt = service.buildGroundedPrompt(
      ctx({
        verifiedFrameworks: [{ sourceType: 'readiness_rubric', title: 'R', content: 'rubric text' }],
        businessModels: [{ sourceType: 'business_framework', title: 'F', content: 'framework text' }],
        similarProfiles: [{ sourceType: 'capsule_proposal', title: 'P', content: 'peer text' }],
      }),
      profile,
      ['Technology'],
    );

    expect(prompt.indexOf('rubric text')).toBeLessThan(prompt.indexOf('framework text'));
    expect(prompt.indexOf('framework text')).toBeLessThan(prompt.indexOf('peer text'));
  });

  it('labels peer material as unverified so it is not read as authoritative', () => {
    // Peer text is another startup's AI-parsed application. Presenting it
    // alongside a transcribed standard without distinction is how extraction
    // errors get laundered into grounding.
    const prompt = service.buildGroundedPrompt(
      ctx({ similarProfiles: [{ sourceType: 'capsule_proposal', title: 'P', content: 'peer text' }] }),
      profile,
      ['Technology'],
    );

    expect(prompt).toMatch(/unverified/i);
  });

  it('keeps the custom task block for RNS', () => {
    const prompt = service.buildGroundedPrompt(ctx(), profile, ['Market'], '\n--- Task ---\nmake tasks\n');
    expect(prompt).toContain('make tasks');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- grounded-prompt-builder`
Expected: FAIL — content is absent from the output.

- [ ] **Step 3: Rewrite the three rendering blocks**

In `src/rna/grounded-prompt-builder.service.ts`, replace the three `if (context.…)` blocks (currently lines 28–50) with:

```typescript
    const renderDocs = (docs: RetrievedDoc[]) =>
      docs
        .map((doc, i) => {
          const source = doc.citation
            ? ` [${doc.provenance ?? 'unattributed'} — ${doc.citation}]`
            : doc.provenance
              ? ` [${doc.provenance}]`
              : '';
          return `${i + 1}. ${doc.title}${source}\n   ${doc.content}`;
        })
        .join('\n');

    // Ordered most authoritative first. A model reading top-down should meet the
    // transcribed standard before it meets another startup's application form.
    if (context.verifiedFrameworks?.length) {
      prompt += '\n--- Verified Readiness Rubrics (authoritative) ---\n';
      prompt += renderDocs(context.verifiedFrameworks) + '\n';
    }

    if (context.businessModels?.length) {
      prompt += '\n--- Business Framework References ---\n';
      prompt += renderDocs(context.businessModels) + '\n';
    }

    if (context.similarProfiles?.length) {
      prompt += '\n--- Similar Prior Startup Profiles (UNVERIFIED peer material) ---\n';
      prompt += 'These are other startups\' own application text, machine-extracted and not independently verified. Use them for comparison only; never treat a claim here as evidence about the startup being assessed.\n';
      prompt += renderDocs(context.similarProfiles) + '\n';
    }
```

Import `RetrievedDoc` alongside `RAGContext` at the top of the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- grounded-prompt-builder`
Expected: PASS, all six.

- [ ] **Step 5: Fix the RNA generation guard and pass dimensions**

In `src/rna/rna.service.ts`, replace the `queryVectorDatabase` call at `:138`:

```typescript
    const ragContext = await this.ragQueryService.queryVectorDatabase(id.toString(), {
      config: ctx.config,
      dimensions: readinessLevelsWithoutRNA.map((srl) => ({
        readinessType: srl.readinessLevel.readinessType,
        level: srl.readinessLevel.level,
      })),
    });
```

Replace the guard at `:151` — `if (ragContext)` is always true, because `queryVectorDatabase` returns an object on every path, so the legacy fallback at `:160-194` is unreachable:

```typescript
    // Expressed as the negation of the flag rather than as its own condition:
    // RNS's equivalent guard drifted out of step precisely because it restated
    // "do we have context?" independently.
    let prompt: string;
    if (!ragContext.lowConfidence) {
```

Delete the entire dead `else` branch (`:160-194`) and replace it with:

```typescript
    } else {
      const basePrompt = await this.aiService.createBasePrompt(ctx, startup, this.em);
      if (!basePrompt) {
        throw new BadRequestException('No capsule proposal found for this startup');
      }
      prompt = `${basePrompt}\n\nTASK: Generate a Readiness and Needs Assessment (RNA) for: ${readinessLevelsWithoutRNA
        .map((srl) => srl.readinessLevel.readinessType)
        .join(', ')}.\nRespond with a JSON array: [{"readiness_level_type": (string), "rna": (string, max 500 chars)}]`;
    }
```

This replaces ~35 lines of duplicated prompt text with the shared builder, which is the same text `createBasePrompt` already produces.

- [ ] **Step 6: Fix the RNS generation guard and pass dimensions**

In `src/rns/rns.service.ts`, replace the call at `:211`:

```typescript
  const ragContext = await this.ragQueryService.queryVectorDatabase(dto.startup_id.toString(), {
    config: ctx.config,
    dimensions: rnasToGenerateFrom.map((rna) => ({
      readinessType: rna.readinessLevel.readinessType,
      level: rna.readinessLevel.level,
    })),
  });
```

And the guard at `:282`:

```typescript
    // Was `!lowConfidence && similarProfiles?.length > 0`, which required a peer
    // before it would use the grounded builder — so retrieved rubrics would be
    // discarded whenever no peer cleared the 0.78 floor. With two seeded
    // startups that is the common case.
    if (!ragContext.lowConfidence) {
```

- [ ] **Step 7: Run the whole suite**

Run: `pnpm test`
Expected: 2 pre-existing failures only. `rna.service.spec.ts:84` mocks `queryVectorDatabase` to resolve `null`, which now takes the fallback branch — update it to `{ lowConfidence: true, verifiedFrameworks: [], businessModels: [], similarProfiles: [] }` so the intent stays "fallback path" rather than "null crash".

- [ ] **Step 8: Commit**

```bash
git add src/rna/grounded-prompt-builder.service.ts src/rna/grounded-prompt-builder.service.spec.ts src/rna/rna.service.ts src/rns/rns.service.ts
git commit -m "$(cat <<'EOF'
fix(rag): put retrieved text into the RNA and RNS prompts

buildGroundedPrompt printed similar profiles as id, similarity score and
metadata and never emitted content, so both generation paths were
ungrounded regardless of what retrieval returned. Frameworks were
JSON.stringify'd objects.

Sections are now ordered most-authoritative-first and peer material is
explicitly labelled unverified — it is another startup's machine-extracted
application text, and presenting it beside a transcribed standard is how
extraction errors get laundered into grounding.

Both generation guards were wrong in different directions: RNA's was
always true (leaving 35 lines of unreachable fallback), RNS's required a
peer before it would use retrieved rubrics. Both are now the negation of
lowConfidence, so they cannot drift apart again.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Path-1 grounding in createBasePrompt

**Files:**
- Modify: `src/ai/ai.service.ts:354-368` (`getRelevantRagContexts`), `:874-882` (`createBasePrompt`)
- Modify: `src/ai/ai.service.spec.ts`, `src/ai/rag-retrieval.spec.ts`

**Interfaces:**
- Consumes: Task 2's source-type constants, Task 1's `rubricMode`.
- Produces: no new public API. `getRelevantRagContexts` keeps its signature and gains a `sourceType` restriction.

`createBasePrompt` feeds initiatives, roadblocks and all four refine routes. Without this they stay grounded only in peer text while RNA and RNS get rubrics.

- [ ] **Step 1: Write the failing tests**

Append to `src/ai/rag-retrieval.spec.ts`:

```typescript
describe('corpus scoping', () => {
  it('excludes rubric rows from the peer arm pool under both strategies', async () => {
    // Rubrics share generic readiness vocabulary with every query, so leaving
    // them in the keyword arm's token-overlap pool would let them dominate it
    // and silently invalidate the measured keyword-vs-semantic comparison.
    const { em, find } = emDouble([], []);

    await build(jest.fn()).getRelevantRagContexts(startup(), em, 'keyword');

    expect(find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceType: { $ne: RUBRIC_SOURCE_TYPE } }),
      expect.anything(),
    );
  });

  it('excludes rubric rows from the semantic peer query too', async () => {
    const embed = jest.fn().mockResolvedValue([0.1]);
    const { em, execute } = emDouble([], []);

    await build(embed).getRelevantRagContexts(startup(), em, 'semantic');

    expect(execute.mock.calls[0][1]).toContain(RUBRIC_SOURCE_TYPE);
  });
});
```

Import `RUBRIC_SOURCE_TYPE` from `./rag-corpus.types` at the top of that spec.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- rag-retrieval`
Expected: FAIL — the find call has no `sourceType` filter today.

- [ ] **Step 3: Scope the peer retrieval away from rubrics**

In `src/ai/ai.service.ts`, in `retrieveByKeyword`, change the find:

```typescript
    const contexts = await em.find(
      RagContext,
      { sourceType: { $ne: RUBRIC_SOURCE_TYPE } },
      { orderBy: { createdAt: 'DESC' } },
    );
```

In `retrieveSemantic`, add the same exclusion to the SQL `where` clause and its parameter list:

```sql
          and rc.source_type <> ?
```

placed after `and rc.startup_id is distinct from ?`, with `RUBRIC_SOURCE_TYPE` appended to the parameters in matching position.

- [ ] **Step 4: Add the rubric block to createBasePrompt**

In `createBasePrompt`, after the existing `ragBlock` assignment, add:

```typescript
    // Rubrics come from the dimension keys, not from similarity, and are
    // deliberately independent of ctx.config.ragStrategy: that setting selects
    // how *peers* are found and its measured comparison must not be perturbed
    // by a rubric change.
    const rubricBlock = ctx.config.ragCorpus
      ? await this.buildRubricBlock(em, startupReadinessLevels)
      : '';
```

and include `${rubricBlock}` in the returned template literal immediately before the `Initial Readiness Level:` line.

Add the helper method to `AiService`:

```typescript
  /**
   * Readiness rubrics for the levels this startup actually sits at, plus the
   * next rung up — the model needs to know what "better" looks like to produce
   * a next action rather than a restatement.
   */
  private async buildRubricBlock(
    em: EntityManager,
    levels: StartupReadinessLevel[],
  ): Promise<string> {
    // Deliberately does not read ctx.config.rubricMode. That setting exists to
    // compare two mechanisms on the RNA/RNS channel SDD §3.2 describes; letting
    // it also swing the initiative and roadblock paths would change two things
    // at once during a measurement run, which is a confound rather than a
    // control. Path 1 always uses the exact lookup.
    const wanted = new Set<string>();
    for (const srl of levels) {
      const type = srl.readinessLevel.readinessType;
      const level = srl.readinessLevel.level;
      wanted.add(rubricKey(type, level));
      wanted.add(rubricKey(type, Math.min(level + 1, MAX_READINESS_LEVEL)));
    }
    if (!wanted.size) return '';

    const rows = await em.find(RagContext, { sourceType: RUBRIC_SOURCE_TYPE });
    const matched = rows.filter((row) =>
      wanted.has((row.metadata as CorpusRowMetadata | undefined)?.key ?? ''),
    );
    if (!matched.length) return '';

    return `\nVerified readiness rubrics (authoritative):\n${matched
      .map((row) => `- ${row.title}: ${row.content}`)
      .join('\n')}\n`;
  }
```

Import the corpus helpers from `./rag-corpus.types`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- rag-retrieval ai.service`
Expected: the two new cases PASS; `ai.service.spec.ts › passes valid task responses through unchanged` still fails (pre-existing).

- [ ] **Step 6: Run the whole suite**

Run: `pnpm test`
Expected: 2 pre-existing failures only.

- [ ] **Step 7: Commit**

```bash
git add src/ai/ai.service.ts src/ai/rag-retrieval.spec.ts
git commit -m "$(cat <<'EOF'
feat(rag): ground initiatives, roadblocks and refine in the rubrics too

createBasePrompt gains the rubric block, so path 1 is grounded the same
way RNA and RNS are. It is independent of ragStrategy on purpose: that
setting selects how peers are found and its measured comparison must not
move because rubrics changed.

Peer retrieval is now scoped away from rubric rows under both arms.
Rubrics share generic readiness vocabulary with every query, so leaving
them in the keyword arm's token-overlap pool would let them dominate it
and invalidate the existing keyword-vs-semantic numbers.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Measurement harness

**Files:**
- Create: `measurement/measure-grounding.js`
- Modify: `measurement/README.md`

**Interfaces:**
- Consumes: the seeded corpus, `GEMINI_API_KEY` from `backend/.env`, the same conventions as `measure-retrieval.js`.
- Produces: a console report of four metrics across three arms.

Follow `measure-retrieval.js`'s existing structure: standalone Node, reads `.env` directly, no server required, stops cleanly on quota exhaustion and reports partial results with `n=` counts.

- [ ] **Step 1: Implement the quota-free mechanism comparison first**

This half needs no Gemini generation call, so it runs at full N and reproduces exactly.

For each of the two seeded startups × six dimensions × both rubric modes, retrieve and record:
- whether the returned rubric's `readinessType` matches the requested dimension (**rubric-retrieval accuracy**)
- whether the mode returned nothing at all (semantic mode only — the floor rejecting every rubric)

Report as a table: `mode | queries | correct dimension | wrong dimension | empty`.

- [ ] **Step 2: Run it and record the result**

Run: `node measurement/measure-grounding.js --retrieval-only`
Expected: `deterministic` at 12/12 correct by construction. The number that matters is what `semantic` scores — if it returns the wrong dimension or empties out, the SDD deviation is settled before any generation quota is spent.

- [ ] **Step 3: Implement the three generation arms**

Arms: `{ ragCorpus: false }`, `{ ragCorpus: true, rubricMode: 'semantic' }`, `{ ragCorpus: true, rubricMode: 'deterministic' }`. Both startups, six dimensions, 3 repetitions, `temperature: 0`, the production grounding instruction.

Metrics:
1. **Rubric-term grounding rate** — proportion of generated RNAs containing `keyTerms` from the rubric level actually retrieved. Read `keyTerms` from the data files; do not derive them from output.
2. **Unsupported-claim rate** — reuse `measure-models.js`'s absent-field probe: ask for fields deliberately not present in the document; a value invented for an absent field is a grounding failure.
3. **Differentiation gap** — reuse `measure-differentiation.js`'s early-vs-mid mean-level gap. Baseline to beat or hold: **+2.28** on `gemini-3.6-flash`.

- [ ] **Step 4: Run the full harness**

Run: `node measurement/measure-grounding.js`
Expected: a table per metric per arm, with `n=` counts. Free-tier quota is the binding constraint; a 429 must stop cleanly and report partial results rather than crash.

- [ ] **Step 5: Write up the results in `measurement/README.md`**

Add a `measure-grounding.js` section matching the existing style. Include the caveats honestly, following the conventions already there: N is small, there is no expert ground truth so the trustworthy signal is the gap and its direction, the corpus is authored rather than sampled, and metric 1 measures whether retrieval reached the output rather than whether the output is correct.

**A null or negative result is a valid outcome and gets written up as one.** Every prior measurement in this project overturned an assumption. If the corpus does not improve the unsupported-claim rate, say so and record it in `TODO_CHECKLIST.md`.

- [ ] **Step 6: Commit**

```bash
git add measurement/measure-grounding.js measurement/README.md
git commit -m "$(cat <<'EOF'
feat(rag): measure grounding across three arms

The mechanism comparison runs first and costs no quota — whether a rubric
mode returns the correct dimension is pure retrieval, checkable against a
known key. If semantic mode retrieves the wrong dimension or falls below
the floor, that settles the SDD deviation before any generation budget is
spent.

Metrics are mechanical rather than LLM-judged, because model leniency is
one of the things under investigation here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Live verification and documentation

**Files:**
- Modify: `TODO_CHECKLIST.md`, `SESSION_NOTES.md`, `CLAUDE.md`
- Delete: `docs/SRS.md`, `docs/SDD.md`

Mocked unit tests in this repo have repeatedly passed while the real path was broken — most recently the boot-time embedding backfill, which failed on **every** startup with a MikroORM global-EntityManager error that no mock could see. Unit tests do not close this task.

- [ ] **Step 1: Boot the server and confirm a clean start**

```bash
pnpm dev
```

Expected: no `Invalid AI pipeline configuration` error, backfill logs a count, no global-EntityManager error.

- [ ] **Step 2: Generate an RNA and confirm rubric text reached the prompt**

Log the assembled prompt at debug level, then trigger generation for AgroLink (the startup seeded without RNAs) through the API with a valid `Access` cookie or Bearer token — every coaching controller is behind `JwtGuard` since the security work merged.

Confirm in the logged prompt:
- the `--- Verified Readiness Rubrics (authoritative) ---` section is present
- it contains the TRL text for AgroLink's actual Technology level and the level above
- the peer section, if present, carries the word `unverified`

- [ ] **Step 3: Confirm the run is attributable**

Query `ai_generation_runs` for the row just created and confirm its `config` snapshot records `ragCorpus: true` and `rubricMode: "deterministic"`, and that the generated RNA rows carry that `generation_run_id`.

- [ ] **Step 4: Confirm the corpus-off arm actually changes the prompt**

Restart with `AI_RAG_CORPUS_ENABLED=false`, regenerate, and confirm the rubric section is absent and the run's config snapshot records `ragCorpus: false`. An arm that does not change the prompt is not an arm.

- [ ] **Step 5: Re-run the seeder to confirm idempotency after real use**

```bash
node seed-rag-corpus.js
```

Expected: `{ created: 0, updated: 0, unchanged: 64, embedded: 0 }`.

- [ ] **Step 6: Update the checklist**

In `TODO_CHECKLIST.md` §0:
- Mark the corpus item done, with the measured results from Task 9.
- Update the Objective 1b row from "Pipeline built, corpus inadequate" to reflect the corpus, and state plainly what the corpus is and is not: 54 rubric rows and 10 framework rows with per-row provenance, of which only the nine Technology rows are transcribed from a public standard.
- **Correct the §0 dimension item's status:** it is right that the code omits Regulatory and scores Investment. Note that `docs/SDD.md` in the repo said otherwise and was wrong.
- Record the RNA/RNS prompt-builder defect as fixed, since it was never in the checklist.

- [ ] **Step 7: Delete the inaccurate repo docs**

```bash
git rm docs/SRS.md docs/SDD.md
```

They are 19- and 18-line summaries that contradict the source PDFs on the dimension set, and they read as authoritative. The real documents live in the team's capstone folder outside the repo.

- [ ] **Step 8: Update CLAUDE.md**

The "Things that look implemented but are not" section still says **"There is no RAG pipeline"** and that `verifiedFrameworks`/`businessModels` are hardcoded `[]`. Both are now false. Replace with an accurate description including the corpus's provenance split and the two new env vars.

- [ ] **Step 9: Append a session note**

Add a `SESSION_NOTES.md` section covering what was built, what the measurement showed (including any null result), and what remains — the corpus is authored rather than externally sourced for five of six dimensions, which is the honest limit on any Objective 1b claim.

- [ ] **Step 10: Final verification and commit**

```bash
pnpm test
pnpm build
```

Expected: 2 pre-existing failures, clean build. Do not run `pnpm build` while `pnpm dev` is watching.

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs(rag): record the corpus work and remove the misleading doc stubs

docs/SRS.md and docs/SDD.md were short summaries that contradicted the
source PDFs on the readiness dimensions — the real documents specify five
(TRL, MRL, RRL, ARL, ORL) and never mention IRL. They read as
authoritative and produced a wrong claim in a design spec, so they are
deleted rather than corrected.

CLAUDE.md's "there is no RAG pipeline" note is now false and replaced.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verification Checklist

Before calling this complete, every line must be true:

- [ ] `pnpm test` shows exactly the 2 pre-existing failures, no more
- [ ] `pnpm build` is clean
- [ ] `node seed-rag-corpus.js` on an already-seeded database reports `unchanged: 64, embedded: 0`
- [ ] `rag_contexts` holds 54 `readiness_rubric` and 10 `business_framework` rows, each with a matching 768-dim vector
- [ ] A live RNA generation's logged prompt contains the correct dimension's rubric text
- [ ] `ai_generation_runs.config` records `ragCorpus` and `rubricMode` for that run
- [ ] `AI_RAG_CORPUS_ENABLED=false` demonstrably removes the rubric section from the prompt
- [ ] Measurement results are recorded in `measurement/README.md` and `TODO_CHECKLIST.md`, including any null result
- [ ] Nothing has been pushed
