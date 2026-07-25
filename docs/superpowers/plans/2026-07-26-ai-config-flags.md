# AI Pipeline Configuration & Run Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI generation pipeline configurable at runtime and record which configuration produced every AI output, so the capstone's baseline-vs-enhanced comparison can be run from a single deployment.

**Architecture:** A new `AiConfigService` reads and validates pipeline settings from environment variables once at construction and resolves optional per-request overrides. A new `AiRunService` opens an `ai_generation_runs` row at the start of each generation call and closes it at the end, returning an immutable `AiRunContext` that carries both the resolved config and the run id. That context is threaded explicitly through the four generation services into `AiService`, where each of the four existing enhancements becomes conditional on a flag. Every AI-produced row gains a nullable foreign key to its run.

**Tech Stack:** NestJS 11, MikroORM 6 (PostgreSQL), zod 4, Jest 29, `@google/genai`.

**Design spec:** `docs/superpowers/specs/2026-07-26-ai-config-flags-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm. All commands run from `backend/`.
- Run a single spec with `pnpm test -- <pattern>` (e.g. `pnpm test -- ai-config.service`).
- Jest config lives in `backend/package.json`: `rootDir` is `src`, `testRegex` is `.*\.spec\.ts$`. Specs sit beside the code they test.
- **Follow the existing test style**: direct constructor instantiation with hand-rolled mocks. Do **not** introduce `Test.createTestingModule`. See `backend/src/ai/ai.service.spec.ts` for the established pattern, including how it replaces the private `ai` property with a mock.
- Every flag defaults to `true`, and `AI_TEMPERATURE` defaults to `0`. With defaults in place the system must behave exactly as it does today, except that temperature is now actually applied.
- Entities live centrally in `backend/src/entities/`, never colocated with feature modules.
- `backend/src/app.module.ts` has a `MikroOrmModule.forFeature()` entity list that is **not** exhaustive. New entities used via repository injection must be added there.
- The per-request override travels in an `X-Ai-Pipeline-Config` header (JSON string), not a body field, because `GET /rna/:id/generate-rna` has no body.
- Do not add authentication guards to the `rna`/`rns`/`initiatives`/`roadblocks` controllers in this work. They are missing and that is a known security issue, but it is tracked separately in `TODO_CHECKLIST.md` §1 and would confuse this diff.

---

### Task 1: Config types and environment parsing

**Files:**
- Create: `backend/src/ai/ai-config.types.ts`
- Create: `backend/src/ai/ai-config.service.ts`
- Test: `backend/src/ai/ai-config.service.spec.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `AiPipelineConfig` interface with fields `model: string`, `temperature: number`, `grounding: boolean`, `rag: boolean`, `biasReview: boolean`, `scoreNormalization: boolean`. `AiConfigService` with `readonly defaults: AiPipelineConfig` and `readonly allowRequestOverride: boolean`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/ai/ai-config.service.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { AiConfigService } from './ai-config.service';

const configFrom = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('AiConfigService', () => {
  it('parses a fully specified environment', () => {
    const service = new AiConfigService(
      configFrom({
        GEMINI_MODEL: 'gemini-2.5-pro',
        AI_TEMPERATURE: '0.4',
        AI_GROUNDING_ENABLED: 'false',
        AI_RAG_ENABLED: 'false',
        AI_BIAS_REVIEW_ENABLED: 'false',
        AI_SCORE_NORMALIZATION_ENABLED: 'false',
        AI_ALLOW_REQUEST_OVERRIDE: 'true',
      }),
    );

    expect(service.defaults).toEqual({
      model: 'gemini-2.5-pro',
      temperature: 0.4,
      grounding: false,
      rag: false,
      biasReview: false,
      scoreNormalization: false,
    });
    expect(service.allowRequestOverride).toBe(true);
  });

  it('applies defaults when variables are unset', () => {
    const service = new AiConfigService(configFrom({}));

    expect(service.defaults).toEqual({
      model: 'gemini-2.5-flash-lite',
      temperature: 0,
      grounding: true,
      rag: true,
      biasReview: true,
      scoreNormalization: true,
    });
    expect(service.allowRequestOverride).toBe(false);
  });

  it('accepts 1 and 0 as booleans', () => {
    const service = new AiConfigService(
      configFrom({ AI_RAG_ENABLED: '0', AI_GROUNDING_ENABLED: '1' }),
    );

    expect(service.defaults.rag).toBe(false);
    expect(service.defaults.grounding).toBe(true);
  });

  it('throws when temperature is not a number', () => {
    expect(() => new AiConfigService(configFrom({ AI_TEMPERATURE: 'warm' }))).toThrow(
      /AI_TEMPERATURE/,
    );
  });

  it('throws when temperature is out of range', () => {
    expect(() => new AiConfigService(configFrom({ AI_TEMPERATURE: '5' }))).toThrow(
      /AI_TEMPERATURE/,
    );
  });

  it('throws when the model is blank', () => {
    expect(() => new AiConfigService(configFrom({ GEMINI_MODEL: '' }))).toThrow(/GEMINI_MODEL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ai-config.service`
Expected: FAIL — `Cannot find module './ai-config.service'`

- [ ] **Step 3: Create the types file**

Create `backend/src/ai/ai-config.types.ts`:

```ts
import { z } from 'zod';

/**
 * Resolved configuration for a single AI generation run.
 *
 * Each boolean gates one enhancement from the capstone objectives, so that the
 * baseline and enhanced pipelines can be run from the same deployment:
 *   grounding          - Objective 1a, AiService.groundPrompt()
 *   rag                - Objective 1b, AiService.getRelevantRagContexts()
 *   biasReview         - Objective 4b, AiService.reviewBiasScore()
 *   scoreNormalization - Objective 4c, AiService.normalizeAiScore()
 */
export interface AiPipelineConfig {
  model: string;
  temperature: number;
  grounding: boolean;
  rag: boolean;
  biasReview: boolean;
  scoreNormalization: boolean;
}

/** Accepts 'true'/'false'/'1'/'0'; anything else fails validation. */
const envBoolean = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === 'true' || value === '1'));

export const aiEnvSchema = z.object({
  GEMINI_MODEL: z.string().min(1, 'GEMINI_MODEL must not be blank').optional(),
  AI_TEMPERATURE: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return 0;
      const parsed = Number(value);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'AI_TEMPERATURE must be a number between 0 and 2',
        });
        return z.NEVER;
      }
      return parsed;
    }),
  AI_GROUNDING_ENABLED: envBoolean(true),
  AI_RAG_ENABLED: envBoolean(true),
  AI_BIAS_REVIEW_ENABLED: envBoolean(true),
  AI_SCORE_NORMALIZATION_ENABLED: envBoolean(true),
  AI_ALLOW_REQUEST_OVERRIDE: envBoolean(false),
});

/** Partial override accepted from the X-Ai-Pipeline-Config header. */
export const aiOverrideSchema = z
  .object({
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    grounding: z.boolean(),
    rag: z.boolean(),
    biasReview: z.boolean(),
    scoreNormalization: z.boolean(),
  })
  .partial()
  .strict();

export type AiPipelineOverride = z.infer<typeof aiOverrideSchema>;
```

- [ ] **Step 4: Create the service**

Create `backend/src/ai/ai-config.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiPipelineConfig, aiEnvSchema } from './ai-config.types';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

@Injectable()
export class AiConfigService {
  readonly defaults: AiPipelineConfig;
  readonly allowRequestOverride: boolean;

  constructor(private readonly config: ConfigService) {
    const parsed = aiEnvSchema.safeParse({
      GEMINI_MODEL: this.config.get<string>('GEMINI_MODEL'),
      AI_TEMPERATURE: this.config.get<string>('AI_TEMPERATURE'),
      AI_GROUNDING_ENABLED: this.config.get<string>('AI_GROUNDING_ENABLED'),
      AI_RAG_ENABLED: this.config.get<string>('AI_RAG_ENABLED'),
      AI_BIAS_REVIEW_ENABLED: this.config.get<string>('AI_BIAS_REVIEW_ENABLED'),
      AI_SCORE_NORMALIZATION_ENABLED: this.config.get<string>('AI_SCORE_NORMALIZATION_ENABLED'),
      AI_ALLOW_REQUEST_OVERRIDE: this.config.get<string>('AI_ALLOW_REQUEST_OVERRIDE'),
    });

    if (!parsed.success) {
      // Fail fast. A silently-wrong pipeline config invalidates every row
      // produced under it, which is unrecoverable for the comparison study.
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid AI pipeline configuration - ${detail}`);
    }

    const env = parsed.data;

    this.defaults = Object.freeze({
      model: env.GEMINI_MODEL ?? DEFAULT_MODEL,
      temperature: env.AI_TEMPERATURE,
      grounding: env.AI_GROUNDING_ENABLED,
      rag: env.AI_RAG_ENABLED,
      biasReview: env.AI_BIAS_REVIEW_ENABLED,
      scoreNormalization: env.AI_SCORE_NORMALIZATION_ENABLED,
    });

    this.allowRequestOverride = env.AI_ALLOW_REQUEST_OVERRIDE;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- ai-config.service`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/ai-config.types.ts backend/src/ai/ai-config.service.ts backend/src/ai/ai-config.service.spec.ts
git commit -m "feat(ai): add validated pipeline config from environment"
```

---

### Task 2: Per-request override resolution

**Files:**
- Modify: `backend/src/ai/ai-config.service.ts`
- Test: `backend/src/ai/ai-config.service.spec.ts`

**Interfaces:**
- Consumes: `AiPipelineConfig`, `aiOverrideSchema`, `AiPipelineOverride`, `AiConfigService.defaults`, `AiConfigService.allowRequestOverride` from Task 1
- Produces: `AiConfigService.resolve(rawHeader?: string, isPrivileged?: boolean): AiPipelineConfig` — returns a frozen config. Throws `ForbiddenException` when an override is supplied without permission and `BadRequestException` when the override is malformed.

> **Decision point — Step 3 below.** Given a partial override such as `{"rag": false}`, `resolve()` can either merge field-by-field over the env defaults, or require the override to specify every field. Merge is more ergonomic; all-or-nothing is more defensible in a methods section because every recorded run states its full configuration explicitly. The test in Step 1 assumes **merge**. If you choose all-or-nothing, change the third test to expect a `BadRequestException` for a partial override and add a passing case supplying all six fields.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/ai/ai-config.service.spec.ts`:

```ts
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('AiConfigService.resolve', () => {
  const permissive = () =>
    new AiConfigService(configFrom({ AI_ALLOW_REQUEST_OVERRIDE: 'true' }));

  it('returns defaults when no override is supplied', () => {
    expect(permissive().resolve(undefined, true)).toEqual({
      model: 'gemini-2.5-flash-lite',
      temperature: 0,
      grounding: true,
      rag: true,
      biasReview: true,
      scoreNormalization: true,
    });
  });

  it('merges a partial override over the defaults', () => {
    const resolved = permissive().resolve('{"rag":false,"model":"gemini-2.5-pro"}', true);

    expect(resolved.rag).toBe(false);
    expect(resolved.model).toBe('gemini-2.5-pro');
    expect(resolved.grounding).toBe(true);
  });

  it('freezes the resolved config', () => {
    const resolved = permissive().resolve('{"rag":false}', true);
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it('rejects an override when the deployment disallows it', () => {
    const strict = new AiConfigService(configFrom({ AI_ALLOW_REQUEST_OVERRIDE: 'false' }));
    expect(() => strict.resolve('{"rag":false}', true)).toThrow(ForbiddenException);
  });

  it('rejects an override from an unprivileged caller', () => {
    expect(() => permissive().resolve('{"rag":false}', false)).toThrow(ForbiddenException);
  });

  it('rejects malformed JSON', () => {
    expect(() => permissive().resolve('not json', true)).toThrow(BadRequestException);
  });

  it('rejects unknown override fields', () => {
    expect(() => permissive().resolve('{"nope":true}', true)).toThrow(BadRequestException);
  });

  it('rejects an out-of-range temperature override', () => {
    expect(() => permissive().resolve('{"temperature":9}', true)).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ai-config.service`
Expected: FAIL — `service.resolve is not a function`

- [ ] **Step 3: Implement `resolve()`**

Add to `backend/src/ai/ai-config.service.ts`. Update the imports at the top of the file to:

```ts
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiPipelineConfig, aiEnvSchema, aiOverrideSchema } from './ai-config.types';
```

Then add this method to the class:

```ts
  /**
   * Resolve the config for one generation run.
   *
   * @param rawHeader   Value of the X-Ai-Pipeline-Config header, if present.
   * @param isPrivileged Whether the caller's role may override (Manager/Admin).
   */
  resolve(rawHeader?: string, isPrivileged = false): AiPipelineConfig {
    if (!rawHeader) {
      return this.defaults;
    }

    if (!this.allowRequestOverride || !isPrivileged) {
      throw new ForbiddenException('AI pipeline override is not permitted for this caller');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawHeader);
    } catch {
      throw new BadRequestException('X-Ai-Pipeline-Config must be valid JSON');
    }

    const override = aiOverrideSchema.safeParse(parsedJson);
    if (!override.success) {
      const detail = override.error.issues
        .map((issue) => `${issue.path.join('.') || 'override'}: ${issue.message}`)
        .join('; ');
      throw new BadRequestException(`Invalid AI pipeline override - ${detail}`);
    }

    return Object.freeze({ ...this.defaults, ...override.data });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- ai-config.service`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai-config.service.ts backend/src/ai/ai-config.service.spec.ts
git commit -m "feat(ai): resolve per-request pipeline overrides with authorization"
```

---

### Task 3: `AiGenerationRun` entity and provenance foreign keys

**Files:**
- Create: `backend/src/entities/ai-generation-run.entity.ts`
- Test: `backend/src/entities/ai-generation-run.entity.spec.ts`
- Modify: `backend/src/entities/rna.entity.ts`
- Modify: `backend/src/entities/rns.entity.ts`
- Modify: `backend/src/entities/initiative.entity.ts`
- Modify: `backend/src/entities/roadblock.entity.ts`
- Modify: `backend/src/entities/ai-recommendation.entity.ts`
- Modify: `backend/src/entities/ai-bias-audit.entity.ts`
- Modify: `backend/src/app.module.ts:46-57`

**Interfaces:**
- Consumes: `AiPipelineConfig` from Task 1
- Produces: `AiGenerationRun` entity (table `ai_generation_runs`) with fields `id`, `startup?`, `operation`, `model`, `config`, `status`, `latencyMs?`, `promptTokens?`, `completionTokens?`, `error?`, `createdAt`, `completedAt?`. Type `AiRunOperation = 'rna' | 'rns' | 'initiatives' | 'roadblocks'`. Type `AiRunStatus = 'running' | 'completed' | 'failed'`. Each of the six modified entities gains `generationRun?: AiGenerationRun`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/entities/ai-generation-run.entity.spec.ts`:

```ts
import { AiGenerationRun } from './ai-generation-run.entity';

describe('AiGenerationRun', () => {
  it('starts in the running state with a creation timestamp', () => {
    const run = new AiGenerationRun();

    expect(run.status).toBe('running');
    expect(run.createdAt).toBeInstanceOf(Date);
    expect(run.completedAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ai-generation-run`
Expected: FAIL — `Cannot find module './ai-generation-run.entity'`

- [ ] **Step 3: Create the entity**

Create `backend/src/entities/ai-generation-run.entity.ts`:

```ts
import {
  DateTimeType,
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { Startup } from './startup.entity';

export type AiRunOperation = 'rna' | 'rns' | 'initiatives' | 'roadblocks';
export type AiRunStatus = 'running' | 'completed' | 'failed';

/**
 * One row per AI generation call. Records the pipeline configuration in effect
 * so that every generated artifact can be attributed to the exact arm of the
 * baseline-vs-enhanced comparison that produced it.
 */
@Entity({ tableName: 'ai_generation_runs' })
export class AiGenerationRun {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup, { nullable: true, deleteRule: 'set null' })
  startup?: Startup;

  @Property({ length: 40 })
  operation!: AiRunOperation;

  @Property({ length: 100 })
  model!: string;

  /** Frozen AiPipelineConfig snapshot as resolved for this run. */
  @Property({ type: 'json' })
  config!: Record<string, unknown>;

  @Property({ length: 20 })
  status: AiRunStatus = 'running';

  @Property({ nullable: true })
  latencyMs?: number;

  @Property({ nullable: true })
  promptTokens?: number;

  @Property({ nullable: true })
  completionTokens?: number;

  @Property({ type: 'text', nullable: true })
  error?: string;

  @Property({ type: DateTimeType })
  createdAt: Date = new Date();

  @Property({ type: DateTimeType, nullable: true })
  completedAt?: Date;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- ai-generation-run`
Expected: PASS, 1 test.

- [ ] **Step 5: Add the foreign key to all six output entities**

In each of the six entity files listed under **Files**, add this import near the other entity imports:

```ts
import { AiGenerationRun } from './ai-generation-run.entity';
```

and add this property to the class body:

```ts
  @ManyToOne(() => AiGenerationRun, { nullable: true, deleteRule: 'set null' })
  generationRun?: AiGenerationRun;
```

`rna.entity.ts`, `ai-recommendation.entity.ts`, and `ai-bias-audit.entity.ts` already import `ManyToOne`. `rns.entity.ts`, `initiative.entity.ts`, and `roadblock.entity.ts` also already import it. No import changes are needed beyond `AiGenerationRun` itself.

Existing rows keep `NULL`, which means "produced before instrumentation". No backfill.

- [ ] **Step 6: Register the entity in the module**

In `backend/src/app.module.ts`, add the import alongside the other entity imports:

```ts
import { AiGenerationRun } from './entities/ai-generation-run.entity';
```

and add `AiGenerationRun,` to the `MikroOrmModule.forFeature({ entities: [...] })` array (around line 47-56).

- [ ] **Step 7: Verify the build compiles**

Run: `pnpm build`
Expected: exit 0, no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/entities/ backend/src/app.module.ts
git commit -m "feat(ai): add ai_generation_runs entity and provenance foreign keys"
```

---

### Task 4: `AiRunService`

**Files:**
- Create: `backend/src/ai/ai-run.service.ts`
- Test: `backend/src/ai/ai-run.service.spec.ts`
- Modify: `backend/src/ai/ai.module.ts`

**Interfaces:**
- Consumes: `AiConfigService.resolve()` from Task 2, `AiGenerationRun`/`AiRunOperation` from Task 3
- Produces: `AiRunContext { readonly config: AiPipelineConfig; readonly runId: number; readonly run: AiGenerationRun }`. `AiRunService.begin(startupId, operation, rawHeader?, isPrivileged?): Promise<AiRunContext>` and `AiRunService.finish(ctx, outcome): Promise<void>` where `outcome` is `{ status: 'completed'; latencyMs: number; promptTokens?: number; completionTokens?: number }` or `{ status: 'failed'; latencyMs: number; error: string }`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/ai/ai-run.service.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { AiConfigService } from './ai-config.service';
import { AiRunService } from './ai-run.service';

const configService = () =>
  new AiConfigService({ get: () => undefined } as unknown as ConfigService);

const emMock = () => {
  const persisted: any[] = [];
  return {
    persisted,
    create: jest.fn((_entity, data) => ({ ...data, id: 42 })),
    persistAndFlush: jest.fn(async (row) => {
      persisted.push(row);
    }),
    flush: jest.fn().mockResolvedValue(undefined),
    getReference: jest.fn((_e, id) => ({ id })),
  };
};

describe('AiRunService', () => {
  it('opens a run recording the resolved config snapshot', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());

    const ctx = await service.begin(7, 'rns');

    expect(ctx.runId).toBe(42);
    expect(ctx.config.model).toBe('gemini-2.5-flash-lite');
    expect(em.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operation: 'rns',
        model: 'gemini-2.5-flash-lite',
        status: 'running',
        config: expect.objectContaining({ rag: true, grounding: true }),
      }),
    );
  });

  it('closes a successful run with latency and token counts', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(7, 'rna');

    await service.finish(ctx, {
      status: 'completed',
      latencyMs: 1234,
      promptTokens: 100,
      completionTokens: 200,
    });

    expect(ctx.run.status).toBe('completed');
    expect(ctx.run.latencyMs).toBe(1234);
    expect(ctx.run.promptTokens).toBe(100);
    expect(ctx.run.completedAt).toBeInstanceOf(Date);
    expect(em.flush).toHaveBeenCalled();
  });

  it('closes a failed run with the error message', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(7, 'roadblocks');

    await service.finish(ctx, { status: 'failed', latencyMs: 50, error: 'boom' });

    expect(ctx.run.status).toBe('failed');
    expect(ctx.run.error).toBe('boom');
  });

  it('exposes a frozen config', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(7, 'initiatives');

    expect(Object.isFrozen(ctx.config)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ai-run.service`
Expected: FAIL — `Cannot find module './ai-run.service'`

- [ ] **Step 3: Implement the service**

Create `backend/src/ai/ai-run.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { AiConfigService } from './ai-config.service';
import { AiPipelineConfig } from './ai-config.types';
import {
  AiGenerationRun,
  AiRunOperation,
} from '../entities/ai-generation-run.entity';
import { Startup } from '../entities/startup.entity';

/** Immutable handle carried through one generation call. */
export interface AiRunContext {
  readonly config: AiPipelineConfig;
  readonly runId: number;
  readonly run: AiGenerationRun;
}

export type AiRunOutcome =
  | {
      status: 'completed';
      latencyMs: number;
      promptTokens?: number;
      completionTokens?: number;
    }
  | { status: 'failed'; latencyMs: number; error: string };

@Injectable()
export class AiRunService {
  constructor(
    private readonly em: EntityManager,
    private readonly aiConfig: AiConfigService,
  ) {}

  async begin(
    startupId: number | null,
    operation: AiRunOperation,
    rawHeader?: string,
    isPrivileged = false,
  ): Promise<AiRunContext> {
    const config = this.aiConfig.resolve(rawHeader, isPrivileged);

    const run = this.em.create(AiGenerationRun, {
      startup: startupId ? this.em.getReference(Startup, startupId) : undefined,
      operation,
      model: config.model,
      config: { ...config },
      status: 'running',
      createdAt: new Date(),
    });

    await this.em.persistAndFlush(run);

    return { config, runId: run.id, run };
  }

  async finish(ctx: AiRunContext, outcome: AiRunOutcome): Promise<void> {
    ctx.run.status = outcome.status;
    ctx.run.latencyMs = outcome.latencyMs;
    ctx.run.completedAt = new Date();

    if (outcome.status === 'completed') {
      ctx.run.promptTokens = outcome.promptTokens;
      ctx.run.completionTokens = outcome.completionTokens;
    } else {
      ctx.run.error = outcome.error;
    }

    await this.em.flush();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- ai-run.service`
Expected: PASS, 4 tests.

- [ ] **Step 5: Register both services in the AI module**

In `backend/src/ai/ai.module.ts`, add to the imports:

```ts
import { AiConfigService } from './ai-config.service';
import { AiRunService } from './ai-run.service';
```

Add `AiConfigService` and `AiRunService` to both the `providers` array and the `exports` array so the four generation modules can inject them.

- [ ] **Step 6: Verify the build compiles**

Run: `pnpm build`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/ai/ai-run.service.ts backend/src/ai/ai-run.service.spec.ts backend/src/ai/ai.module.ts
git commit -m "feat(ai): add AiRunService to open and close generation runs"
```

---

### Task 5: Drive model and sampling from config, fixing the temperature bug

**Files:**
- Modify: `backend/src/ai/ai.service.ts:58` (remove `modelName`), `:285-340` (`callAiExpectJson`), and every `generateContent` call site
- Test: `backend/src/ai/ai.service.spec.ts`

**Interfaces:**
- Consumes: `AiPipelineConfig` from Task 1, `AiRunContext` from Task 4
- Produces: private `AiService.generate(ctx, prompt, maxOutputTokens?)` returning the raw SDK response. All public generation methods gain a leading `ctx: AiRunContext` parameter: `generateRNAsFromPrompt(ctx, prompt)`, `generateTasksFromPrompt(ctx, prompt)`, `generateInitiativesFromPrompt(ctx, prompt)`, `generateRoadblocksFromPrompt(ctx, prompt)`, `refineRna(ctx, prompt)`, `refineRnsDescription(ctx, ...)`, `refineInitiative(ctx, prompt)`, `refineRoadblock(ctx, prompt)`.

**Background:** `ai.service.ts` currently passes sampling parameters at the top level of `generateContent` with an `as any` cast:

```ts
const res = await this.ai.models.generateContent({
  model: this.modelName,
  contents: ...,
  temperature: attempt === 1 ? 0.0 : 0.2,
  maxOutputTokens: 1024,
} as any);
```

`@google/genai` expects these inside a `config` object. The cast hid the type error, so temperature has most likely been ignored on every call. SRS §2.3 requires scoring to be reproducible, so this must be fixed.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/ai/ai.service.spec.ts`. Also add this helper near the top of the file, after the existing imports:

```ts
import { AiRunContext } from './ai-run.service';

const ctxWith = (overrides: Partial<AiRunContext['config']> = {}): AiRunContext =>
  ({
    runId: 1,
    run: {} as any,
    config: Object.freeze({
      model: 'gemini-2.5-flash-lite',
      temperature: 0,
      grounding: true,
      rag: true,
      biasReview: true,
      scoreNormalization: true,
      ...overrides,
    }),
  }) as AiRunContext;
```

Then add this test:

```ts
  it('passes sampling parameters inside config, not at the top level', async () => {
    generateContent.mockResolvedValue({
      text: '[{"readiness_level_type":"Technology","rna":"Ship a prototype"}]',
    });

    await service.generateRNAsFromPrompt(ctxWith({ temperature: 0 }), 'prompt');

    const request = generateContent.mock.calls[0][0];
    expect(request.config).toEqual(
      expect.objectContaining({ temperature: 0, maxOutputTokens: expect.any(Number) }),
    );
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('maxOutputTokens');
  });

  it('uses the model from the run context', async () => {
    generateContent.mockResolvedValue({ text: '[]' });

    await service.generateRNAsFromPrompt(ctxWith({ model: 'gemini-2.5-pro' }), 'prompt');

    expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-pro');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ai.service`
Expected: FAIL — the two new tests fail because `generateRNAsFromPrompt` takes only a prompt and the request has top-level `temperature`.

- [ ] **Step 3: Add a single generate helper and remove the hardcoded model**

In `backend/src/ai/ai.service.ts`, delete the line:

```ts
  private readonly modelName = 'gemini-2.5-flash-lite';
```

Add this private helper to the class:

```ts
  /**
   * Single chokepoint for every Gemini call. Sampling parameters go inside
   * `config` — passing them at the top level silently does nothing.
   */
  private async generate(
    ctx: AiRunContext,
    prompt: string,
    maxOutputTokens = 1024,
    temperatureOverride?: number,
  ) {
    return this.ai.models.generateContent({
      model: ctx.config.model,
      contents: ctx.config.grounding ? this.groundPrompt(prompt) : prompt,
      config: {
        temperature: temperatureOverride ?? ctx.config.temperature,
        maxOutputTokens,
      },
    });
  }
```

Add the import at the top of the file:

```ts
import { AiRunContext } from './ai-run.service';
```

- [ ] **Step 4: Route every call site through the helper**

Replace each `this.ai.models.generateContent({...})` call in `ai.service.ts` with `this.generate(ctx, prompt, maxOutputTokens)`, adding a leading `ctx: AiRunContext` parameter to the enclosing method. The affected methods are `callAiExpectJson`, `getCapsuleProposalInfo`, `generateStartupAnalysisSummary`, `generateRNAsFromPrompt`, `generateTasksFromPrompt`, `generateInitiativesFromPrompt`, `generateRoadblocksFromPrompt`, `refineRnsDescription`, `refineInitiative`, `refineRoadblock`, and `refineRna`.

In `callAiExpectJson`, the retry attempt previously raised temperature to `0.2`. Preserve that behaviour explicitly:

```ts
      const res = await this.generate(
        ctx,
        attempt === 1 ? prompt : `${prompt}\n\n${correctivePrompt}`,
        1024,
        attempt === 1 ? ctx.config.temperature : ctx.config.temperature + 0.2,
      );
```

`callAiExpectJson` gains `ctx` as the first property of its options object: `callAiExpectJson({ ctx, prompt, schema, fallback, correctivePrompt })`.

Delete the unused `test()` method at `ai.service.ts:342` while you are here — it requests song lyrics and is leftover debug code.

- [ ] **Step 5: Update the three existing tests**

The existing tests in `ai.service.spec.ts` call `service.generateRNAsFromPrompt('prompt')` and `service.generateTasksFromPrompt('prompt')`. Change each to pass a context first, e.g. `service.generateRNAsFromPrompt(ctxWith(), 'prompt')`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test -- ai.service`
Expected: PASS, 5 tests (3 existing + 2 new).

- [ ] **Step 7: Verify the build compiles**

Run: `pnpm build`
Expected: TypeScript errors in `rna.service.ts`, `rns.service.ts`, `initiative.service.ts`, and `roadblock.service.ts` because their calls now lack `ctx`. **This is expected** and is fixed in Tasks 8 and 9. Note the failing call sites and continue.

- [ ] **Step 8: Commit**

```bash
git add backend/src/ai/ai.service.ts backend/src/ai/ai.service.spec.ts
git commit -m "fix(ai): pass sampling params inside config and drive model from run context"
```

---

### Task 6: Gate retrieval behind the RAG flag

**Files:**
- Modify: `backend/src/ai/ai.service.ts:573-600` (`createBasePrompt`)
- Test: `backend/src/ai/ai.service.spec.ts`

**Interfaces:**
- Consumes: `AiRunContext` from Task 4, `AiService.getRelevantRagContexts()` (existing, `ai.service.ts:237`)
- Produces: `AiService.createBasePrompt(ctx, startup, em): Promise<string | null>`

**Background:** `createBasePrompt` currently always calls `getRelevantRagContexts()` at `:596` and appends a `Verified context retrieved from similar startup records:` block. This is the interim keyword-overlap retrieval, not semantic RAG, but it is the thing `AI_RAG_ENABLED` gates today.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/ai/ai.service.spec.ts`:

```ts
describe('createBasePrompt RAG gating', () => {
  const startup = {
    id: 1,
    name: 'AgroLink',
    capsuleProposal: { title: 'AgroLink', description: 'd', problemStatement: 'p' },
  } as any;

  const emWithContexts = () =>
    ({
      find: jest.fn(async (entity: any) => {
        if (entity?.name === 'RagContext') {
          return [{ sourceType: 'profile', title: 'AgroLink', content: 'agro', confidence: 1 }];
        }
        return [];
      }),
    }) as any;

  it('includes retrieved context when rag is enabled', async () => {
    const prompt = await service.createBasePrompt(ctxWith({ rag: true }), startup, emWithContexts());
    expect(prompt).toContain('Verified context retrieved');
  });

  it('omits retrieved context when rag is disabled', async () => {
    const prompt = await service.createBasePrompt(ctxWith({ rag: false }), startup, emWithContexts());
    expect(prompt).not.toContain('Verified context retrieved');
  });

  it('does not query for contexts at all when rag is disabled', async () => {
    const spy = jest.spyOn(service, 'getRelevantRagContexts');
    await service.createBasePrompt(ctxWith({ rag: false }), startup, emWithContexts());
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ai.service`
Expected: FAIL — `createBasePrompt` takes `(startup, em)` and always includes the block.

- [ ] **Step 3: Gate the retrieval**

In `backend/src/ai/ai.service.ts`, change the signature to `async createBasePrompt(ctx: AiRunContext, startup: Startup, em: EntityManager)` and replace the retrieval lines at roughly `:596-600` with:

```ts
    const ragContexts = ctx.config.rag
      ? await this.getRelevantRagContexts(startup, em)
      : [];
    const ragBlock = ragContexts.length
      ? `\nVerified context retrieved from similar startup records:\n${ragContexts
          .map((context) => `- [${context.sourceType}] ${context.title}: ${context.content}`)
          .join('\n')}`
      : '';
```

Skipping the call entirely when the flag is off — rather than computing and discarding — keeps the baseline arm free of retrieval side effects such as `rag_retrieval_logs` rows.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- ai.service`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai.service.ts backend/src/ai/ai.service.spec.ts
git commit -m "feat(ai): gate retrieval context behind AI_RAG_ENABLED"
```

---

### Task 7: Decouple and gate score normalization and bias review

**Files:**
- Modify: `backend/src/ai/ai.service.ts:82-133` (`reviewBiasScore`)
- Test: `backend/src/ai/ai.service.spec.ts`

**Interfaces:**
- Consumes: `AiRunContext` from Task 4, `BaselineService.normalizeScore()` (existing)
- Produces: `AiService.reviewBiasScore(ctx, input): Promise<{ correctedScore: number; biasFlagged: boolean; justification: string }>` where `input` keeps its current shape `{ dimensionKey, rawScore, maxScore, context }`

**Background:** `normalizeAiScore()` is called *inside* `reviewBiasScore()` at `:88`, so normalization cannot currently run without bias review. Objectives 4b and 4c are separate specific objectives, and the design requires four independently runnable arms.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/ai/ai.service.spec.ts`:

```ts
describe('reviewBiasScore flag gating', () => {
  const input = { dimensionKey: 'market', rawScore: 8, maxScore: 9, context: 'ctx' };

  it('skips normalization when scoreNormalization is disabled', async () => {
    const normalizeSpy = jest.spyOn(service as any, 'normalizeAiScore');
    generateContent.mockResolvedValue({
      text: '{"corrected_score":6,"bias_flagged":true,"justification":"inflated"}',
    });

    await service.reviewBiasScore(ctxWith({ scoreNormalization: false }), input);

    expect(normalizeSpy).not.toHaveBeenCalled();
  });

  it('skips the model call when biasReview is disabled', async () => {
    const result = await service.reviewBiasScore(
      ctxWith({ biasReview: false, scoreNormalization: false }),
      input,
    );

    expect(generateContent).not.toHaveBeenCalled();
    expect(result.correctedScore).toBe(8);
    expect(result.biasFlagged).toBe(false);
  });

  it('returns the normalized baseline when review is off but normalization is on', async () => {
    const result = await service.reviewBiasScore(
      ctxWith({ biasReview: false, scoreNormalization: true }),
      input,
    );

    expect(generateContent).not.toHaveBeenCalled();
    expect(result.correctedScore).toBe(5); // baselineService mock returns scaled: 5
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ai.service`
Expected: FAIL — `reviewBiasScore` takes one argument and always normalizes and always calls the model.

- [ ] **Step 3: Split the two mechanisms**

In `backend/src/ai/ai.service.ts`, change `reviewBiasScore` to accept `ctx` first and replace its opening lines (currently `:87-89`) with:

```ts
  async reviewBiasScore(
    ctx: AiRunContext,
    input: {
      dimensionKey: string;
      rawScore: number;
      maxScore: number;
      context: string;
    },
  ): Promise<{ correctedScore: number; biasFlagged: boolean; justification: string }> {
    // Objective 4c - score normalization, independently toggleable.
    const baselineScore = ctx.config.scoreNormalization
      ? Math.max(
          1,
          Math.min(input.maxScore, Math.round((await this.normalizeAiScore(input.rawScore)).scaled)),
        )
      : input.rawScore;

    // Objective 4b - model-based bias review, independently toggleable.
    if (!ctx.config.biasReview) {
      return {
        correctedScore: baselineScore,
        biasFlagged: baselineScore !== input.rawScore,
        justification: ctx.config.scoreNormalization
          ? 'Baseline normalization applied; model bias review disabled.'
          : 'Bias review and normalization disabled; raw score used.',
      };
    }
```

Leave the rest of the method as it is, but change its internal `callAiExpectJson` call to pass `ctx` as described in Task 5.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- ai.service`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai.service.ts backend/src/ai/ai.service.spec.ts
git commit -m "feat(ai): make score normalization independent of bias review"
```

---

### Task 8: Wire the RNS generation endpoint end to end

**Files:**
- Modify: `backend/src/rns/rns.controller.ts:29`
- Modify: `backend/src/rns/rns.service.ts` (`generateTasks`, and the `reviewBiasScore` call at `:323`, `recordAiRecommendation` at `:364`, `recordBiasAudit` at `:376`)
- Modify: `backend/src/rns/rns.module.ts`
- Test: `backend/src/rns/rns.service.spec.ts` (create)

**Interfaces:**
- Consumes: `AiRunService.begin()`/`finish()` and `AiRunContext` from Task 4; the `ctx`-first `AiService` methods from Tasks 5-7
- Produces: `RnsService.generateTasks(dto, ctx)`. This is the reference vertical slice — Task 9 repeats it for the other three endpoints.

- [ ] **Step 1: Write the failing test**

Create `backend/src/rns/rns.service.spec.ts`:

```ts
import { RnsService } from './rns.service';

describe('RnsService.generateTasks provenance', () => {
  it('stamps generated RNS rows with the run id', async () => {
    const created: any[] = [];
    const em = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        name: 'AgroLink',
        capsuleProposal: { title: 't' },
      }),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_e, data) => {
        created.push(data);
        return data;
      }),
      persist: jest.fn(),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
      getReference: jest.fn((_e, id) => ({ id })),
    };

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('prompt'),
      generateTasksFromPrompt: jest
        .fn()
        .mockResolvedValue([{ target_level: 3, description: 'Validate demand' }]),
      reviewBiasScore: jest
        .fn()
        .mockResolvedValue({ correctedScore: 3, biasFlagged: false, justification: '' }),
      recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
      recordBiasAudit: jest.fn().mockResolvedValue(undefined),
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

    // RnsService injects four dependencies; the latter two are unused by this path.
    const service = new RnsService(
      em as any,
      aiService as any,
      {} as any, // RagQueryService
      {} as any, // GroundedPromptBuilderService
    );
    await service.generateTasks({ startup_id: 1 } as any, ctx);

    expect(aiService.generateTasksFromPrompt).toHaveBeenCalledWith(ctx, 'prompt');
    expect(created.some((row) => row.generationRun?.id === 99 || row.generationRun === ctx.run)).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- rns.service`
Expected: FAIL — `generateTasks` takes one argument.

- [ ] **Step 3: Thread the context through the service**

In `backend/src/rns/rns.service.ts`:

- Change `async generateTasks(dto: GenerateTasksDto)` to `async generateTasks(dto: GenerateTasksDto, ctx: AiRunContext)`.
- Add the import: `import { AiRunContext } from '../ai/ai-run.service';`
- Pass `ctx` as the first argument to `this.aiService.createBasePrompt(...)`, `this.aiService.generateTasksFromPrompt(...)`, and `this.aiService.reviewBiasScore(...)`.
- When creating each `Rns` row, add `generationRun: ctx.run,`.
- Pass `generationRun: ctx.run` through to `recordAiRecommendation` and `recordBiasAudit` so those rows carry the same attribution. Add the corresponding property to both methods in `ai.service.ts` (`:135` and `:160`) and set it on the entity they create.

- [ ] **Step 4: Open and close the run in the controller**

In `backend/src/rns/rns.controller.ts`, replace the `generate-tasks` handler with:

```ts
  @Post('generate-tasks')
  async generateTasks(
    @Body() dto: GenerateTasksDto,
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    const isPrivileged = req.user?.role === 'Manager' || req.user?.role === 'Admin';
    const ctx = await this.aiRunService.begin(
      dto.startup_id,
      'rns',
      pipelineConfig,
      isPrivileged,
    );
    const startedAt = Date.now();

    try {
      const result = await this.rnsService.generateTasks(dto, ctx);
      await this.aiRunService.finish(ctx, {
        status: 'completed',
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await this.aiRunService.finish(ctx, {
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
```

Add `Headers` and `Req` to the `@nestjs/common` import, inject `private readonly aiRunService: AiRunService` in the constructor, and import `AiRunService` from `../ai/ai-run.service`.

> Note: `req.user` is only populated when a `JwtGuard` is present. The RNS controller currently has no guard, so `isPrivileged` will be `false` and overrides will be rejected until the guard is added under `TODO_CHECKLIST.md` §1. That is the safe default and is intentional here.

- [ ] **Step 5: Confirm the AI module is already imported**

`backend/src/rns/rns.module.ts:8` already reads `imports: [AiModule, RnaModule]`, so `AiRunService` resolves once Task 4 exports it. No change needed — just verify the export was added in Task 4 Step 5.

- [ ] **Step 6: Run tests and build**

Run: `pnpm test -- rns.service`
Expected: PASS, 1 test.

Run: `pnpm build`
Expected: remaining errors only in `rna.service.ts`, `initiative.service.ts`, and `roadblock.service.ts`, fixed in Task 9.

- [ ] **Step 7: Commit**

```bash
git add backend/src/rns/
git commit -m "feat(rns): record generation run provenance for RNS tasks"
```

---

### Task 9: Wire the RNA, initiatives, and roadblocks endpoints

**Files:**
- Modify: `backend/src/rna/rna.controller.ts:39`, `backend/src/rna/rna.service.ts` (`generateRNA`, `recordAiRecommendation` at `:238`), `backend/src/rna/rna.module.ts`
- Modify: `backend/src/initiative/initiative.controller.ts:48`, `backend/src/initiative/initiative.service.ts`, `backend/src/initiative/initiative.module.ts`
- Modify: `backend/src/roadblock/roadblock.controller.ts:51`, `backend/src/roadblock/roadblock.service.ts` (`reviewBiasScore` at `:217`, `recordAiRecommendation` at `:242`, `recordBiasAudit` at `:251`), `backend/src/roadblock/roadblock.module.ts`
- Test: `backend/src/roadblock/roadblock.service.spec.ts` (create)

**Interfaces:**
- Consumes: everything from Tasks 4-8
- Produces: `RnaService.generateRNA(id, ctx)`, `InitiativeService.generateInitiatives(dto, ctx)`, `RoadblockService.generateRoadblocks(dto, ctx)`

- [ ] **Step 1: Write the failing test**

Create `backend/src/roadblock/roadblock.service.spec.ts`:

```ts
import { RoadblockService } from './roadblock.service';

describe('RoadblockService.generateRoadblocks provenance', () => {
  it('passes the run context to bias review and stamps rows', async () => {
    const created: any[] = [];
    const em = {
      findOne: jest.fn().mockResolvedValue({ id: 1, name: 'AgroLink', capsuleProposal: {} }),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_e, data) => {
        created.push(data);
        return data;
      }),
      persist: jest.fn(),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
      getReference: jest.fn((_e, id) => ({ id })),
    };

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('prompt'),
      generateRoadblocksFromPrompt: jest
        .fn()
        .mockResolvedValue([{ description: 'No traction', fix: 'Run pilots', riskNumber: 4 }]),
      reviewBiasScore: jest
        .fn()
        .mockResolvedValue({ correctedScore: 4, biasFlagged: false, justification: '' }),
      recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
      recordBiasAudit: jest.fn().mockResolvedValue(undefined),
    };

    const ctx = {
      runId: 77,
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

    // RoadblockService injects exactly these two dependencies.
    const service = new RoadblockService(em as any, aiService as any);
    await service.generateRoadblocks({ startup_id: 1 } as any, ctx);

    expect(aiService.reviewBiasScore).toHaveBeenCalledWith(ctx, expect.anything());
    expect(created.some((row) => row.generationRun === ctx.run)).toBe(true);
  });
});
```

> `RnaService` injects six dependencies (`EntityManager`, `AiService`, `RagQueryService`, `GroundedPromptBuilderService`, `OutputValidatorService`, `RecommendationStorageService`) and `InitiativeService` injects two (`EntityManager`, `AiService`). Pass `{} as any` for any dependency the tested path does not exercise.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- roadblock.service`
Expected: FAIL — `generateRoadblocks` takes one argument.

- [ ] **Step 3: Apply the Task 8 pattern to all three services**

For each of `RnaService.generateRNA`, `InitiativeService.generateInitiatives`, and `RoadblockService.generateRoadblocks`:

- Add `ctx: AiRunContext` as the final parameter.
- Add `import { AiRunContext } from '../ai/ai-run.service';`
- Pass `ctx` as the first argument to every `this.aiService.*` call inside the method — specifically `createBasePrompt`, the matching `generate*FromPrompt`, and (in `RoadblockService`) `reviewBiasScore`.
- Add `generationRun: ctx.run,` to every entity created from AI output in that method.
- Pass `generationRun: ctx.run` to `recordAiRecommendation` and `recordBiasAudit` calls.

- [ ] **Step 4: Apply the controller pattern to all three endpoints**

For `rna.controller.ts` the operation string is `'rna'` and the handler is a `GET` with the startup id in the path:

```ts
  @Get(':id/generate-rna')
  async generateTasks(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Headers('x-ai-pipeline-config') pipelineConfig?: string,
  ) {
    const isPrivileged = req.user?.role === 'Manager' || req.user?.role === 'Admin';
    const ctx = await this.aiRunService.begin(id, 'rna', pipelineConfig, isPrivileged);
    const startedAt = Date.now();

    try {
      const result = await this.rnaService.generateRNA(id, ctx);
      await this.aiRunService.finish(ctx, {
        status: 'completed',
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await this.aiRunService.finish(ctx, {
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
```

For `initiative.controller.ts` use operation `'initiatives'` and `dto.startup_id`; for `roadblock.controller.ts` use operation `'roadblocks'` and `dto.startup_id`. Both follow the `POST` shape shown in Task 8 Step 4.

Add `Headers` and `Req` to each `@nestjs/common` import and inject `AiRunService` in each constructor. All three modules already import `AiModule` (`rna.module.ts:11`, `initiative.module.ts:7`, `roadblock.module.ts:6`), so no module changes are needed.

- [ ] **Step 5: Run the full suite and build**

Run: `pnpm test`
Expected: PASS, all specs.

Run: `pnpm build`
Expected: exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/rna/ backend/src/initiative/ backend/src/roadblock/
git commit -m "feat(ai): record generation run provenance for RNA, initiatives, roadblocks"
```

---

### Task 10: Configuration documentation and migration

**Files:**
- Modify: `backend/.env.example`
- Create: `backend/src/migrations/` (generated file, name assigned by the CLI)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the env variable names from Task 1
- Produces: documented configuration surface and a reviewable migration

- [ ] **Step 1: Document the variables**

Append to `backend/.env.example`:

```
# --- AI pipeline configuration ---
# Every flag defaults to true, reproducing the pre-instrumentation behaviour.
# Set a flag to false to run that arm of the baseline-vs-enhanced comparison.
GEMINI_MODEL=gemini-2.5-flash-lite
AI_TEMPERATURE=0
AI_GROUNDING_ENABLED=true              # Objective 1a - grounded prompt wrapper
AI_RAG_ENABLED=true                    # Objective 1b - retrieved context block
AI_BIAS_REVIEW_ENABLED=true            # Objective 4b - model bias review
AI_SCORE_NORMALIZATION_ENABLED=true    # Objective 4c - baseline normalization
# Allows Manager/Admin callers to override the above per request via the
# X-Ai-Pipeline-Config header. Keep false outside a research environment.
AI_ALLOW_REQUEST_OVERRIDE=false
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm mikro-orm migration:create --name AiGenerationRuns`
Expected: a new file under `backend/src/migrations/`.

Open it and confirm it creates `ai_generation_runs` and adds six nullable `generation_run_id` columns. If the generated SQL contains unrelated drops — schema drift from `updateSchema()` running against a shared database — delete those statements before committing, keeping only the intended changes.

- [ ] **Step 3: Verify against a real database**

Run: `pnpm dev`
Expected: the app boots, `updateSchema()` applies the new table, and no configuration error is thrown.

Stop the server once it has started cleanly.

- [ ] **Step 4: Verify the flags actually change behaviour**

Set `AI_RAG_ENABLED=false` in `backend/.env`, restart, trigger one RNS generation, then query:

```sql
SELECT id, operation, model, config, status, latency_ms FROM ai_generation_runs ORDER BY id DESC LIMIT 5;
```

Expected: a `completed` row whose `config` shows `"rag": false`. Restore `AI_RAG_ENABLED=true` afterwards.

- [ ] **Step 5: Update the repository guide**

In `CLAUDE.md`, under the backend architecture notes, replace the line stating that `gemini-2.5-flash-lite` is hardcoded with a note that the model and the four pipeline enhancements are configured through `AiConfigService`, that every generation call opens an `ai_generation_runs` row, and that all flags default to `true`.

- [ ] **Step 6: Commit**

```bash
git add backend/.env.example backend/src/migrations/ CLAUDE.md
git commit -m "docs(ai): document pipeline flags and add generation runs migration"
```

---

## Verification

After Task 10, confirm all of the following:

- [ ] `pnpm test` passes with no failures
- [ ] `pnpm build` exits 0
- [ ] `pnpm lint` reports no new errors
- [ ] With every flag at its default, generation output is unchanged from before this work
- [ ] `ai_generation_runs` gains one `completed` row per generation call
- [ ] Setting `AI_RAG_ENABLED=false` produces a run row whose `config` records `"rag": false`
- [ ] An `X-Ai-Pipeline-Config` header is rejected with 403 while `AI_ALLOW_REQUEST_OVERRIDE=false`
