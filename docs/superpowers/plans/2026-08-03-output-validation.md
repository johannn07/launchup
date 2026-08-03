# Output Validation Layer (Objective 1c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ai_recommendations.validationStatus` / `confidenceStatus` reflect a real verdict instead of hardcoded literals, and expose them on the RNA/RNS API payloads.

**Architecture:** A pure `OutputValidatorService.validate()` returns a verdict from two mechanical signals — the retrieval `lowConfidence` flag that both generators already compute and discard, and violations of the length contract the prompt itself declares. Both generation call sites pass the verdict to `recordAiRecommendation` instead of string literals. The dead `RecommendationStorageService` and its unwritten `recommendations` table are deleted.

**Tech Stack:** NestJS, MikroORM (PostgreSQL/Neon), Jest.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-08-03-output-validation-design.md`. Read it before Task 1.
- Branch: `feat/output-validation`, off `master` at `e9d391c`. **Do not push.**
- No `Co-Authored-By` trailer in commit messages.
- Comments: one line where possible, explain *why* not *what*, no filler.
- Jest baseline is **167 passing / 2 failing**. The 2 failures (`ReadinessService › returns a weighted score…`, `AiService › passes valid task responses through unchanged`) are pre-existing on `master`. **A third failure is a regression.**
- Do **not** run `pnpm build` while `pnpm dev` is watching — they race over `dist/`.
- No model-judged validation. No groundedness or stage-appropriateness checks — both probes measured saturated.
- The validator must never enforce a constraint the prompt did not declare.

---

### Task 1: `OutputValidatorService.validate()`

**Files:**
- Create: `backend/src/rna/rna.constants.ts`
- Rewrite: `backend/src/rna/output-validator.service.ts`
- Test: `backend/src/rna/output-validator.service.spec.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `RNA_MAX_LENGTH` (number, 500); `ValidationVerdict { validationStatus: 'validated'|'flagged'; confidenceStatus: 'high-confidence'|'low-confidence'; notes: string|null }`; `OutputValidatorService.validate(input: { content: string; retrievalLowConfidence: boolean; maxLength?: number }): ValidationVerdict`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/rna/output-validator.service.spec.ts`:

```ts
import { OutputValidatorService } from './output-validator.service';

describe('OutputValidatorService.validate', () => {
  const svc = new OutputValidatorService();
  const ok = { content: 'A well-formed recommendation.', retrievalLowConfidence: false };

  it('passes well-formed content from confident retrieval', () => {
    expect(svc.validate(ok)).toEqual({
      validationStatus: 'validated',
      confidenceStatus: 'high-confidence',
      notes: null,
    });
  });

  it('flags empty content', () => {
    const v = svc.validate({ ...ok, content: '' });
    expect(v.validationStatus).toBe('flagged');
    expect(v.notes).toMatch(/empty/i);
  });

  it('flags whitespace-only content', () => {
    expect(svc.validate({ ...ok, content: '   \n\t ' }).validationStatus).toBe('flagged');
  });

  it('flags content longer than a declared maxLength, naming both numbers', () => {
    const v = svc.validate({ ...ok, content: 'x'.repeat(501), maxLength: 500 });
    expect(v.validationStatus).toBe('flagged');
    expect(v.notes).toContain('500');
    expect(v.notes).toContain('501');
  });

  it('accepts content exactly at the declared limit', () => {
    // Boundary: a `>=` here would flag correct output.
    expect(svc.validate({ ...ok, content: 'x'.repeat(500), maxLength: 500 }).validationStatus)
      .toBe('validated');
  });

  it('does NOT flag long content when no maxLength was declared', () => {
    // Load-bearing: RNS declares no limit, so enforcing one would flag
    // output the model was never told to keep short.
    expect(svc.validate({ ...ok, content: 'x'.repeat(5000) }).validationStatus).toBe('validated');
  });

  it('reports low confidence without flagging well-formed content', () => {
    // Confidence and validation are independent axes.
    expect(svc.validate({ ...ok, retrievalLowConfidence: true })).toEqual({
      validationStatus: 'validated',
      confidenceStatus: 'low-confidence',
      notes: null,
    });
  });

  it('reports both when low-confidence retrieval produced malformed content', () => {
    const v = svc.validate({ content: '', retrievalLowConfidence: true });
    expect(v.validationStatus).toBe('flagged');
    expect(v.confidenceStatus).toBe('low-confidence');
  });

  it('treats null/undefined content as empty rather than throwing', () => {
    expect(svc.validate({ ...ok, content: undefined as unknown as string }).validationStatus)
      .toBe('flagged');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd backend && pnpm test -- output-validator`
Expected: FAIL. The current `validate()` does not exist (the stub exposes `validateEach`), so every case errors.

- [ ] **Step 3: Create the shared constant**

Create `backend/src/rna/rna.constants.ts`:

```ts
// Both RNA prompt builders declare this limit to the model; the validator
// enforces the same number so the declared and enforced contracts cannot drift.
export const RNA_MAX_LENGTH = 500;
```

- [ ] **Step 4: Rewrite the service**

Replace the whole of `backend/src/rna/output-validator.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

export type ValidationStatus = 'validated' | 'flagged';
export type ConfidenceStatus = 'high-confidence' | 'low-confidence';

export interface ValidationVerdict {
  validationStatus: ValidationStatus;
  confidenceStatus: ConfidenceStatus;
  notes: string | null;
}

export interface ValidateInput {
  content: string;
  retrievalLowConfidence: boolean;
  /** Omit when the prompt declared no limit — see the design doc. */
  maxLength?: number;
}

@Injectable()
export class OutputValidatorService {
  validate({ content, retrievalLowConfidence, maxLength }: ValidateInput): ValidationVerdict {
    const confidenceStatus: ConfidenceStatus = retrievalLowConfidence
      ? 'low-confidence'
      : 'high-confidence';

    const trimmed = (content ?? '').trim();

    if (!trimmed) {
      return { validationStatus: 'flagged', confidenceStatus, notes: 'Empty recommendation text.' };
    }

    if (maxLength !== undefined && trimmed.length > maxLength) {
      return {
        validationStatus: 'flagged',
        confidenceStatus,
        notes: `Exceeds the ${maxLength}-character limit declared in the prompt (${trimmed.length}).`,
      };
    }

    return { validationStatus: 'validated', confidenceStatus, notes: null };
  }
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `cd backend && pnpm test -- output-validator`
Expected: PASS, 9 tests.

- [ ] **Step 6: Mutation-check the two conditions**

This repo has repeatedly shipped guards a green suite did not catch. Verify each mutation breaks a test, reverting after each:

1. Change `trimmed.length > maxLength` to `>=`. Expected: *"accepts content exactly at the declared limit"* fails.
2. Delete `maxLength !== undefined &&`. Expected: *"does NOT flag long content when no maxLength was declared"* fails with a TypeError or a flag.

If either mutation leaves the suite green, the test is decorative — fix the test before continuing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/rna/rna.constants.ts backend/src/rna/output-validator.service.ts backend/src/rna/output-validator.service.spec.ts
git commit -m "feat(1c): real output validation verdict, replacing the stub"
```

---

### Task 2: Wire the verdict into RNA generation

**Files:**
- Modify: `backend/src/rna/rna.service.ts` (the `recordAiRecommendation` call ~line 198, and the fallback prompt's `max 500 chars` literal)
- Modify: `backend/src/rna/grounded-prompt-builder.service.ts:70` (its `max 500 characters` literal)
- Modify: `backend/src/rna/rna.module.ts` (export `OutputValidatorService`)
- Test: `backend/src/rna/rna.service.spec.ts`

**Interfaces:**
- Consumes: `OutputValidatorService.validate`, `RNA_MAX_LENGTH` from Task 1.
- Produces: `RnaService` constructor keeps `outputValidatorService` (already injected, previously unused).

- [ ] **Step 1: Write the failing test**

Append to `backend/src/rna/rna.service.spec.ts`. This is self-contained — the
existing `RnaService.generateRNA provenance` block already resolves
`lowConfidence: true`, and this fixture mirrors it:

```ts
describe('RnaService.generateRNA output validation (Objective 1c)', () => {
  // Returns the aiService mock so each test can assert on it. `rna` is the
  // text the model is pretended to have produced.
  const runGenerate = async (rna: string) => {
    const startup = {
      id: 1,
      name: 'AgroLink',
      capsuleProposal: { title: 't', description: 'd' },
    };
    const readinessLevel = { id: 100, readinessType: 'Technology', level: 3 };
    const startupReadinessLevel = { id: 200, readinessLevel };
    const persisted: any[] = [];

    const em = {
      findOne: jest.fn((entity: any) =>
        Promise.resolve(entity === Startup ? startup : null),
      ),
      find: jest.fn((entity: any) => {
        if (entity === StartupRNA) return Promise.resolve([]);
        if (entity === StartupReadinessLevel)
          return Promise.resolve([startupReadinessLevel]);
        return Promise.resolve([]);
      }),
      persist: jest.fn((e) => {
        persisted.push(e);
        return e;
      }),
      flush: jest.fn().mockResolvedValue(undefined),
    };

    const aiService = {
      generateRNAsFromPrompt: jest
        .fn()
        .mockResolvedValue([{ readiness_level_type: 'Technology', rna }]),
      recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
    };

    const ragQueryService = {
      // lowConfidence: true is what makes this the low-confidence case, and it
      // also routes generateRNA down its fallback prompt branch.
      queryVectorDatabase: jest.fn().mockResolvedValue({
        lowConfidence: true,
        verifiedFrameworks: [],
        businessModels: [],
        similarProfiles: [],
      }),
    };

    const ctx = {
      runId: 99,
      run: {} as any,
      config: Object.freeze({
        model: 'gemini-2.5-flash-lite',
        temperature: 0,
        grounding: true,
        rag: true,
        biasReview: true,
        scoreNormalization: true,
      }),
    } as any;

    // NOTE: after Task 4 removes RecommendationStorageService this argument
    // list is one shorter. Match whatever the constructor currently takes.
    const service = new RnaService(
      em as any,
      aiService as any,
      ragQueryService as any,
      {} as any, // GroundedPromptBuilderService, unused on the fallback path
      new OutputValidatorService(),
      {} as any, // RecommendationStorageService, deleted in Task 4
      buildAiRunService().aiRunService,
    );

    await service.generateRNA(1, ctx);
    return aiService;
  };

  it('records low-confidence when retrieval was low-confidence, not the literal', async () => {
    const aiService = await runGenerate('Validate demand with 10 interviews.');
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        confidenceStatus: 'low-confidence',
        validationStatus: 'validated',
        notes: null,
      }),
    );
  });

  it('flags an RNA longer than the 500 characters the prompt declares', async () => {
    const aiService = await runGenerate('x'.repeat(600));
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        validationStatus: 'flagged',
        notes: expect.stringContaining('500'),
      }),
    );
  });
});
```

Add `import { OutputValidatorService } from './output-validator.service';` to the
spec file's imports.

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd backend && pnpm test -- rna.service`
Expected: FAIL — the call site currently passes the literals `'validated'` / `'high-confidence'`, so the low-confidence and flagged assertions both fail.

- [ ] **Step 3: Share the length constant with both prompt builders**

In `backend/src/rna/grounded-prompt-builder.service.ts`, import the constant and replace the literal on line 70:

```ts
import { RNA_MAX_LENGTH } from './rna.constants';
// ...
prompt += `- rna must be a string of max ${RNA_MAX_LENGTH} characters\n`;
```

In `backend/src/rna/rna.service.ts`, replace `max 500 chars` in the fallback
prompt template with `max ${RNA_MAX_LENGTH} chars` and import the constant.

- [ ] **Step 4: Pass a real verdict at the call site**

In `backend/src/rna/rna.service.ts`, replace the two hardcoded lines in the
`recordAiRecommendation` call:

```ts
const verdict = this.outputValidatorService.validate({
  content: newRNA.rna,
  retrievalLowConfidence: ragContext.lowConfidence,
  maxLength: RNA_MAX_LENGTH,
});

await this.aiService.recordAiRecommendation({
  startupId: startup.id,
  dimensionKey: matchingReadinessLevel.readinessLevel.readinessType,
  recommendationKind: 'RNA',
  content: newRNA.rna,
  validationStatus: verdict.validationStatus,
  confidenceStatus: verdict.confidenceStatus,
  notes: verdict.notes,
  generationRun: ctx.run,
});
```

- [ ] **Step 5: Export the validator so RNS can use it**

In `backend/src/rna/rna.module.ts`, add `OutputValidatorService` to the `exports`
array. `RnsModule` already imports `RnaModule`, so this is all RNS needs.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cd backend && pnpm test -- rna.service output-validator`
Expected: PASS. Then `cd backend && pnpm test` — expect **167 passing / 2 failing** plus the new tests, and no third failure.

- [ ] **Step 7: Commit**

```bash
git add backend/src/rna/rna.service.ts backend/src/rna/grounded-prompt-builder.service.ts backend/src/rna/rna.module.ts backend/src/rna/rna.service.spec.ts
git commit -m "feat(1c): record a real verdict on RNA recommendations"
```

---

### Task 3: Wire the verdict into RNS generation

**Files:**
- Modify: `backend/src/rns/rns.service.ts` (the `recordAiRecommendation` call at ~line 382, and the constructor)
- Test: `backend/src/rns/rns.service.spec.ts`

**Interfaces:**
- Consumes: `OutputValidatorService.validate` from Task 1, exported by `RnaModule` in Task 2.
- Produces: nothing new.

**Note:** RNS passes **no** `maxLength` — its prompt declares no limit. Enforcing
one here would flag correct output. The live check on this path is the empty
check, which matters because RNS has no upstream `trim()` guard.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/rns/rns.service.spec.ts`. Build the fixture by mirroring
the existing `RnsService.generateTasks provenance` block in that file — it
already mocks `em`, `aiService` and the task-generation call. Parameterise it on
the generated task's `description` exactly as Task 2's `runGenerate` helper does,
and pass `new OutputValidatorService()` into the constructor position added in
Step 3 below.

The three cases, each asserting on the `aiService` mock the helper returns:

```ts
describe('RnsService.generateTasks output validation (Objective 1c)', () => {
  it('records low-confidence when retrieval was low-confidence', async () => {
    const aiService = await runGenerate('Interview 10 clinic administrators.');
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ confidenceStatus: 'low-confidence' }),
    );
  });

  it('flags an empty task description, which RNS does not guard upstream', async () => {
    // Unlike RNA, rns.service.ts assigns task.description with no trim guard,
    // so this genuinely reaches the validator.
    const aiService = await runGenerate('   ');
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ validationStatus: 'flagged' }),
    );
  });

  it('does not flag a long description, because the RNS prompt declares no limit', async () => {
    // The load-bearing case: enforcing RNA's 500 here would flag correct
    // output the model was never told to keep short.
    const aiService = await runGenerate('x'.repeat(5000));
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ validationStatus: 'validated' }),
    );
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd backend && pnpm test -- rns.service`
Expected: FAIL on the low-confidence and flagged assertions.

- [ ] **Step 3: Inject the validator and pass a verdict**

Add `private readonly outputValidatorService: OutputValidatorService` to the
`RnsService` constructor, then at the call site:

```ts
const verdict = this.outputValidatorService.validate({
  content: task.description,
  retrievalLowConfidence: ragContext.lowConfidence,
  // No maxLength: the RNS prompt declares no character limit.
});

await this.aiService.recordAiRecommendation({
  startupId: startup.id,
  dimensionKey: readinessType,
  recommendationKind: 'RNS',
  content: task.description,
  validationStatus: verdict.validationStatus,
  confidenceStatus: verdict.confidenceStatus,
  notes: verdict.notes,
  generationRun: ctx.run,
});
```

Check that `ragContext` is in scope at this point in `generateTasks`; it is used
at `rns.service.ts:287` for the same guard. If the call site sits outside that
scope, hoist the `lowConfidence` boolean into a local at the point where
`ragContext` is built rather than re-querying.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd backend && pnpm test -- rns.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/rns/rns.service.ts backend/src/rns/rns.service.spec.ts
git commit -m "feat(1c): record a real verdict on RNS recommendations"
```

---

### Task 4: Delete the dead storage service and duplicate entity

**Files:**
- Delete: `backend/src/rna/recommendation-storage.service.ts`
- Delete: `backend/src/entities/recommendation.entity.ts`
- Modify: `backend/src/rna/rna.module.ts` (drop the provider and import)
- Modify: `backend/src/rna/rna.service.ts` (drop the constructor param and import)
- Modify: `backend/src/app.module.ts:33,54` (drop the import and the entity registration)
- Modify: `backend/src/rna/rna.service.spec.ts` (drop the `{} as any` placeholder arg)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Pure deletion.

**Why:** the service was injected but never called, and its target table
`recommendations` has no writer anywhere in the codebase. `TODO_CHECKLIST.md` §4
already flags it as duplicating `ai_recommendations`.

- [ ] **Step 1: Confirm nothing else references either symbol**

Run:
```bash
cd backend && grep -rn "RecommendationStorageService\|recommendation.entity" src/
```
Expected: only the files listed above. If anything else appears, stop and report
it rather than deleting.

- [ ] **Step 2: Delete and unwire**

```bash
cd backend && git rm src/rna/recommendation-storage.service.ts src/entities/recommendation.entity.ts
```

Then remove the corresponding import/provider/constructor lines from
`rna.module.ts`, `rna.service.ts`, and `app.module.ts`.

⚠️ **This changes `RnaService`'s constructor arity**, which breaks every spec
that constructs it directly. The parameter list goes from:

```ts
(em, aiService, ragQueryService, groundedPromptBuilder, outputValidator, recommendationStorage, aiRunService)
```

to:

```ts
(em, aiService, ragQueryService, groundedPromptBuilder, outputValidator, aiRunService)
```

Find and fix every construction site — including the fixture added in Task 2,
which passes `{} as any` in the sixth position:

```bash
cd backend && grep -rn "new RnaService(" src/
```

Dropping the wrong positional argument here silently passes the `AiRunService`
into the validator slot, which type-checks loosely against `{} as any` fixtures
and fails at runtime rather than compile time. Delete the line commented
`RecommendationStorageService`, not its neighbour.

- [ ] **Step 3: Verify the app still builds and boots its DI graph**

Run: `cd backend && pnpm build`
Expected: clean. A missing provider surfaces here as a TypeScript error.

Run: `cd backend && pnpm test`
Expected: **167 passing / 2 failing** plus the tests added in Tasks 1-3.

- [ ] **Step 4: Note the orphaned table**

The `recommendations` **table** still exists in the database; deleting the entity
only stops MikroORM managing it. `updateSchema()` does not drop tables. Add one
line to `TODO_CHECKLIST.md` §4 recording that the table is now orphaned and needs
a manual `DROP TABLE` — do not drop it as part of this task.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(1c): delete the dead recommendation storage service and duplicate entity"
```

---

### Task 5: Expose the verdict on the RNA and RNS payloads

**Files:**
- Modify: `backend/src/rna/rna.service.ts` (`getRNAbyId`, ~line 32)
- Modify: `backend/src/rns/rns.service.ts` (`getStartupRns`, ~line 34)
- Test: `backend/src/rna/rna.service.spec.ts`, `backend/src/rns/rns.service.spec.ts`

**Interfaces:**
- Consumes: `AiRecommendation` entity (`dimensionKey`, `recommendationKind`, `validationStatus`, `confidenceStatus`, `notes`, `generationRun`).
- Produces: both list payloads gain `validationStatus: string|null`, `confidenceStatus: string|null`, `validationNotes: string|null`.

**Correlation key:** `(generationRun.id, dimensionKey)`. Both the artifact row and
its `ai_recommendations` row are written in the same block with the same
`ctx.run`. Rows with no `generationRun` — manual entries and pre-provenance
legacy rows — get `null`, which is correct and distinguishable from `'validated'`.

- [ ] **Step 1: Write the failing test**

```ts
it('returns null verdict fields for rows with no generation run', async () => {
  // A manually-created StartupRNA (generationRun undefined).
  const [row] = await service.getRNAbyId(1);
  expect(row.validationStatus).toBeNull();
  expect(row.confidenceStatus).toBeNull();
});

it('joins the recorded verdict onto the matching generated row', async () => {
  // One StartupRNA with generationRun {id: 7} and readinessLevel.readinessType
  // 'Technology'; one AiRecommendation with generationRun {id: 7},
  // dimensionKey 'Technology', recommendationKind 'RNA',
  // validationStatus 'flagged'.
  const [row] = await service.getRNAbyId(1);
  expect(row.validationStatus).toBe('flagged');
});

it('still returns the fields the frontend already consumes', async () => {
  // Pins the payload shape: the frontend reads id, rna, isAiGenerated and
  // readinessLevel, and this method previously returned raw entities.
  const [row] = await service.getRNAbyId(1);
  expect(row).toEqual(expect.objectContaining({
    id: expect.anything(),
    rna: expect.anything(),
    isAiGenerated: expect.anything(),
    readinessLevel: expect.anything(),
  }));
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd backend && pnpm test -- rna.service`
Expected: FAIL — `validationStatus` is `undefined`, not `null`.

- [ ] **Step 3: Implement the join for RNA**

```ts
async getRNAbyId(startupId: number) {
  const rnas = await this.em.find(
    StartupRNA,
    { startup: startupId },
    { populate: ['readinessLevel', 'generationRun'] },
  );

  const runIds = [...new Set(
    rnas.map((r) => r.generationRun?.id).filter((id): id is number => id != null),
  )];

  const recs = runIds.length
    ? await this.em.find(AiRecommendation, {
        generationRun: { $in: runIds },
        recommendationKind: 'RNA',
      })
    : [];

  const byKey = new Map(
    recs.map((rec) => [`${rec.generationRun?.id}|${rec.dimensionKey}`, rec]),
  );

  return rnas.map((r) => {
    const rec = r.generationRun
      ? byKey.get(`${r.generationRun.id}|${r.readinessLevel.readinessType}`)
      : undefined;
    return {
      ...wrap(r).toObject(),
      validationStatus: rec?.validationStatus ?? null,
      confidenceStatus: rec?.confidenceStatus ?? null,
      validationNotes: rec?.notes ?? null,
    };
  });
}
```

Import `wrap` from `@mikro-orm/core` and `AiRecommendation` from
`../entities/ai-recommendation.entity`.

- [ ] **Step 4: Implement the same join for RNS**

`getStartupRns` already maps to a plain object, so add `generationRun` to its
`populate` array and append the same three fields, keyed on
`` `${r.generationRun?.id}|${r.readinessType}` `` with
`recommendationKind: 'RNS'`.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd backend && pnpm test`
Expected: **167 passing / 2 failing** plus every test added in this plan.

- [ ] **Step 6: Verify live against Neon and the running server**

Mocked tests in this repo have repeatedly passed while the real path was broken,
so this step is required, not optional.

```bash
cd backend && pnpm dev      # let the schema sync finish
```

Then, in a second terminal, with a valid `Access` cookie or Bearer token (all
these controllers are guarded):

```bash
curl -s "http://localhost:3000/rna?startupId=2" | head -c 800
```

Confirm the three fields are present, that legacy rows show `null`, and that the
keys the frontend reads (`id`, `rna`, `isAiGenerated`, `readinessLevel`) are all
still there. **`wrap().toObject()` changes how the payload is produced**, so
compare against a pre-change response rather than assuming.

Generation itself costs Gemini quota — do not trigger a new generation just for
this. Reading existing rows is free.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(1c): expose validation and confidence on RNA/RNS payloads"
```

---

## Final verification

- [ ] `cd backend && pnpm test` — 167 passing / 2 failing, plus this plan's tests. No third pre-existing failure.
- [ ] `cd backend && pnpm build` — clean.
- [ ] `grep -rn "validationStatus: 'validated'" backend/src/` returns **nothing** — no hardcoded literal survives.
- [ ] Update `TODO_CHECKLIST.md` §0 to mark 1c implemented, stating precisely what is and is not checked (confidence + declared-schema only; groundedness and stage-appropriateness excluded as measured-saturated).
- [ ] Update `SESSION_NOTES.md` with the outcome, including the orphaned `recommendations` table and the un-backfilled legacy rows.
