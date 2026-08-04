# Sector-Aware Weighted Readiness Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make readiness composite weights resolve from a sector- and business-model-keyed profile, correct the 0–5 clamp against the 1–9 rubric, and score the sixth (Regulatory) dimension.

**Architecture:** A new `WeightProfileService` owns weight resolution through a four-step cascade ending at in-code constants, so an unseeded database still scores. `ReadinessService` keeps its dimension definitions but loses its hardcoded weights, receiving them per request. `TierConfig.weights` is deleted because it is keyed per tier, which would make the composite non-monotonic.

**Tech Stack:** NestJS, MikroORM 6.5.4 (PostgreSQL/Neon), Jest, SvelteKit 2 (two-line touch only).

**Spec:** `docs/superpowers/specs/2026-08-04-readiness-weighted-scoring-design.md`

## Global Constraints

- Every task's requirements implicitly include this section.
- **Never run `pnpm build` while `pnpm dev` is watching** — they race over `dist/` and break the running server.
- **Never run `pnpm lint`** — it is `eslint --fix` and rewrites the whole `src/` tree because of the CRLF/prettier conflict (`TODO_CHECKLIST.md` §4). If you run it by accident, `git restore .` before committing anything.
- **No `Co-Authored-By` trailer** in commit messages.
- Run backend commands from `backend/`. Any throwaway script must be written **inside `backend/`**, never in `C:\TEMP` — pnpm's isolated store cannot resolve `@mikro-orm/postgresql` from outside the package root. Delete the script afterwards.
- Jest baseline is **190 passing / 2 failing**. This plan fixes one of the two (`ReadinessService › returns a weighted score, tier, and prioritized recommendations`). Ending state is **1 failing** (`AiService › passes valid task responses through unchanged`, unrelated). Any other failure is a regression.
- Weights are authored, with no external source. Do not add a citation to any weight value.
- Entity discovery is glob-based (`entitiesTs: ['./src/**/*.entity.ts']` in `mikro-orm.config.ts`), so a new `*.entity.ts` file needs **no** `app.module.ts` registration.

---

### Task 1: Sector and business-model fields on Startup

**Files:**
- Create: `backend/src/entities/enums/sector.enum.ts`
- Create: `backend/src/entities/enums/business-model.enum.ts`
- Modify: `backend/src/entities/startup.entity.ts` (add two properties after `eligibility` at `:51-52`)
- Modify: `backend/src/admin/dto/update-startup.dto.ts` (add two optional fields)
- Modify: `backend/src/startup/startup.service.ts:511-517` (assign them in `update()`)
- Test: `backend/src/admin/dto/update-startup.dto.spec.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: `Sector` and `BusinessModel` string enums; `Startup.sector?: Sector | null` and `Startup.businessModel?: BusinessModel | null`.

**Why the DTO gets its own test:** the global `ValidationPipe` uses `whitelist: true`, so any property absent from the DTO is **silently stripped** from the request body. A missing field here would make `PATCH /startups/:id` accept a sector and quietly discard it — no error, no clue. The test targets exactly that failure mode.

- [ ] **Step 1: Write the failing test**

Create `backend/src/admin/dto/update-startup.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateStartupDto } from './update-startup.dto';
import { Sector } from '../../entities/enums/sector.enum';
import { BusinessModel } from '../../entities/enums/business-model.enum';

describe('UpdateStartupDto', () => {
  // whitelist: true strips unknown properties, so a field missing from the DTO
  // is discarded with no error. These assertions are the only thing standing
  // between that and a PATCH that silently ignores sector.
  it('keeps sector and businessModel after whitelisting', () => {
    const dto = plainToInstance(
      UpdateStartupDto,
      { sector: 'healthtech', businessModel: 'b2b' },
      { excludeExtraneousValues: false },
    );

    expect(dto.sector).toBe(Sector.Healthtech);
    expect(dto.businessModel).toBe(BusinessModel.B2B);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a sector outside the taxonomy', () => {
    const dto = plainToInstance(UpdateStartupDto, { sector: 'agritechh' });
    const errors = validateSync(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('sector');
  });

  it('allows both fields to be omitted', () => {
    const dto = plainToInstance(UpdateStartupDto, { name: 'AgroLink PH' });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.sector).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pnpm test -- update-startup.dto
```

Expected: FAIL — `Cannot find module '../../entities/enums/sector.enum'`.

- [ ] **Step 3: Create the two enums**

`backend/src/entities/enums/sector.enum.ts`:

```ts
export enum Sector {
  Agritech = 'agritech',
  Healthtech = 'healthtech',
  Fintech = 'fintech',
  Edtech = 'edtech',
  Ecommerce = 'ecommerce',
  Logistics = 'logistics',
  Deeptech = 'deeptech',
  Other = 'other',
}
```

`backend/src/entities/enums/business-model.enum.ts`:

```ts
export enum BusinessModel {
  B2B = 'b2b',
  B2C = 'b2c',
  B2B2C = 'b2b2c',
  Marketplace = 'marketplace',
  Saas = 'saas',
  Other = 'other',
}
```

- [ ] **Step 4: Add the DTO fields**

In `backend/src/admin/dto/update-startup.dto.ts`, add to the imports:

```ts
import { Sector } from '../../entities/enums/sector.enum';
import { BusinessModel } from '../../entities/enums/business-model.enum';
```

and append inside the class, after `eligibility`:

```ts
  @IsEnum(Sector)
  @IsOptional()
  sector?: Sector;

  @IsEnum(BusinessModel)
  @IsOptional()
  businessModel?: BusinessModel;
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && pnpm test -- update-startup.dto
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Add the entity properties**

In `backend/src/entities/startup.entity.ts`, add to the imports:

```ts
import { Sector } from './enums/sector.enum';
import { BusinessModel } from './enums/business-model.enum';
```

and insert after the `eligibility` property (currently `:51-52`):

```ts
  // Null resolves through the weight-profile cascade to a less specific
  // profile, ending at the in-code defaults.
  @Enum({ items: () => Sector, nullable: true })
  sector?: Sector | null;

  @Enum({ items: () => BusinessModel, nullable: true })
  businessModel?: BusinessModel | null;
```

`Enum` is already imported in this file if other enums are present; if not, add it to the `@mikro-orm/core` import list alongside `Entity`, `Property`.

- [ ] **Step 7: Assign them in the update path**

In `backend/src/startup/startup.service.ts`, immediately after the `eligibility` assignment in `update()` (around `:517`), add:

```ts
    if (dto.sector !== undefined) startup.sector = dto.sector;
    if (dto.businessModel !== undefined) startup.businessModel = dto.businessModel;
```

- [ ] **Step 8: Verify the whole suite is unchanged**

```bash
cd backend && pnpm test
```

Expected: 193 passing / 2 failing (190 + 3 new; the 2 known failures unchanged).

- [ ] **Step 9: Commit**

```bash
git add backend/src/entities/enums/sector.enum.ts backend/src/entities/enums/business-model.enum.ts backend/src/entities/startup.entity.ts backend/src/admin/dto/update-startup.dto.ts backend/src/admin/dto/update-startup.dto.spec.ts backend/src/startup/startup.service.ts
git commit -m "feat(2b): add sector and business model to Startup

Both nullable; null resolves through the weight-profile cascade. The DTO
spec exists because whitelist: true would otherwise strip these fields
silently."
```

---

### Task 2: Weight constants and the resolution cascade

**Files:**
- Create: `backend/src/readiness/readiness.weights.ts`
- Create: `backend/src/entities/weight-profile.entity.ts`
- Create: `backend/src/readiness/weight-profile.service.ts`
- Test: `backend/src/readiness/weight-profile.service.spec.ts` (new)

**Interfaces:**
- Consumes: `Sector`, `BusinessModel` (Task 1).
- Produces:
  - `type DimensionKey = 'team' | 'market' | 'product' | 'traction' | 'regulatory' | 'funding'`
  - `const DIMENSION_KEYS: DimensionKey[]`
  - `const DEFAULT_WEIGHTS: Record<DimensionKey, number>`
  - `class WeightProfile` (table `weight_profiles`)
  - `WeightProfileService.resolve(sector?, businessModel?): Promise<Record<DimensionKey, number>>`

**Why constants live in their own file:** `WeightProfileService` and `ReadinessService` both need `DimensionKey` and `DEFAULT_WEIGHTS`. Putting them in `readiness.service.ts` would make the service import its own consumer.

- [ ] **Step 1: Write the failing test**

Create `backend/src/readiness/weight-profile.service.spec.ts`:

```ts
import { EntityManager } from '@mikro-orm/core';
import { Sector } from '../entities/enums/sector.enum';
import { BusinessModel } from '../entities/enums/business-model.enum';
import { DEFAULT_WEIGHTS } from './readiness.weights';
import { WeightProfileService } from './weight-profile.service';

// Returns a fake EntityManager whose findOne matches the first stored profile
// whose sector/businessModel equal the query, mimicking MikroORM's null match.
function emWith(profiles: any[]) {
  return {
    findOne: jest.fn(async (_entity: unknown, where: any) =>
      profiles.find(
        (p) =>
          (p.sector ?? null) === (where.sector ?? null) &&
          (p.businessModel ?? null) === (where.businessModel ?? null),
      ) ?? null,
    ),
  } as unknown as EntityManager;
}

const HEALTHTECH = {
  id: 2,
  sector: Sector.Healthtech,
  businessModel: null,
  weights: { team: 0.25, market: 0.18, product: 0.17, traction: 0.12, regulatory: 0.2, funding: 0.08 },
};

const GLOBAL = {
  id: 1,
  sector: null,
  businessModel: null,
  weights: { team: 0.3, market: 0.2, product: 0.2, traction: 0.1, regulatory: 0.1, funding: 0.1 },
};

const HEALTHTECH_B2B = {
  id: 3,
  sector: Sector.Healthtech,
  businessModel: BusinessModel.B2B,
  weights: { team: 0.2, market: 0.2, product: 0.2, traction: 0.1, regulatory: 0.2, funding: 0.1 },
};

describe('WeightProfileService.resolve', () => {
  it('step 1: prefers an exact sector and business-model match', async () => {
    const service = new WeightProfileService(emWith([GLOBAL, HEALTHTECH, HEALTHTECH_B2B]));

    const weights = await service.resolve(Sector.Healthtech, BusinessModel.B2B);

    expect(weights).toEqual(HEALTHTECH_B2B.weights);
  });

  it('step 2: falls back to the sector-only profile', async () => {
    const service = new WeightProfileService(emWith([GLOBAL, HEALTHTECH]));

    const weights = await service.resolve(Sector.Healthtech, BusinessModel.B2B);

    expect(weights).toEqual(HEALTHTECH.weights);
  });

  it('step 3: falls back to the global default row', async () => {
    const service = new WeightProfileService(emWith([GLOBAL, HEALTHTECH]));

    const weights = await service.resolve(Sector.Fintech, null);

    expect(weights).toEqual(GLOBAL.weights);
  });

  it('step 4: falls back to the constants when the table is empty', async () => {
    const service = new WeightProfileService(emWith([]));

    const weights = await service.resolve(Sector.Fintech, BusinessModel.B2C);

    expect(weights).toEqual(DEFAULT_WEIGHTS);
  });

  it('resolves to the global row when the startup has no sector', async () => {
    const service = new WeightProfileService(emWith([GLOBAL]));

    const weights = await service.resolve(null, null);

    expect(weights).toEqual(GLOBAL.weights);
  });

  it('falls through a profile whose weights do not sum to 1.0', async () => {
    const broken = { id: 9, sector: Sector.Healthtech, businessModel: null,
      weights: { team: 0.2, market: 0.2, product: 0.2, traction: 0.1, regulatory: 0.05, funding: 0.05 } };
    const service = new WeightProfileService(emWith([GLOBAL, broken]));

    const weights = await service.resolve(Sector.Healthtech, null);

    expect(weights).toEqual(GLOBAL.weights);
  });

  it('falls through a profile missing a dimension', async () => {
    const broken = { id: 9, sector: Sector.Healthtech, businessModel: null,
      weights: { team: 0.3, market: 0.25, product: 0.2, traction: 0.15, funding: 0.1 } };
    const service = new WeightProfileService(emWith([GLOBAL, broken]));

    const weights = await service.resolve(Sector.Healthtech, null);

    expect(weights).toEqual(GLOBAL.weights);
  });

  it('accepts a sum within floating-point tolerance of 1.0', async () => {
    // 0.28 + 0.22 + 0.18 + 0.14 + 0.10 + 0.08 does not sum to exactly 1 in
    // IEEE 754. An exact === 1 check would reject the default profile itself.
    const service = new WeightProfileService(emWith([{ id: 1, sector: null, businessModel: null, weights: DEFAULT_WEIGHTS }]));

    const weights = await service.resolve(null, null);

    expect(weights).toEqual(DEFAULT_WEIGHTS);
  });
});

describe('DEFAULT_WEIGHTS', () => {
  it('sums to 1.0', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((total, w) => total + w, 0);

    expect(sum).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pnpm test -- weight-profile.service
```

Expected: FAIL — `Cannot find module './readiness.weights'`.

- [ ] **Step 3: Create the constants module**

`backend/src/readiness/readiness.weights.ts`:

```ts
export type DimensionKey =
  | 'team'
  | 'market'
  | 'product'
  | 'traction'
  | 'regulatory'
  | 'funding';

export const DIMENSION_KEYS: DimensionKey[] = [
  'team',
  'market',
  'product',
  'traction',
  'regulatory',
  'funding',
];

// Authored, not derived from any published framework — see the design doc.
// They preserve the relative ordering of the five constants they replace and
// give Regulatory a mid-low share.
export const DEFAULT_WEIGHTS: Record<DimensionKey, number> = {
  team: 0.28,
  market: 0.22,
  product: 0.18,
  traction: 0.14,
  regulatory: 0.1,
  funding: 0.08,
};

// Float summation makes an exact === 1 comparison unreliable.
export const WEIGHT_SUM_TOLERANCE = 0.001;
```

- [ ] **Step 4: Create the entity**

`backend/src/entities/weight-profile.entity.ts`:

```ts
import { Entity, Enum, PrimaryKey, Property } from '@mikro-orm/core';
import { Sector } from './enums/sector.enum';
import { BusinessModel } from './enums/business-model.enum';

@Entity({ tableName: 'weight_profiles' })
export class WeightProfile {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  // Both null on the global default row.
  @Enum({ items: () => Sector, nullable: true })
  sector?: Sector | null;

  @Enum({ items: () => BusinessModel, nullable: true })
  businessModel?: BusinessModel | null;

  @Property({ type: 'json' })
  weights!: Record<string, number>;

  @Property({ nullable: true })
  createdAt: Date = new Date();

  @Property({ nullable: true })
  updatedAt: Date = new Date();
}
```

- [ ] **Step 5: Create the service**

`backend/src/readiness/weight-profile.service.ts`:

```ts
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { Sector } from 'src/entities/enums/sector.enum';
import { BusinessModel } from 'src/entities/enums/business-model.enum';
import { WeightProfile } from 'src/entities/weight-profile.entity';
import {
  DEFAULT_WEIGHTS,
  DIMENSION_KEYS,
  DimensionKey,
  WEIGHT_SUM_TOLERANCE,
} from './readiness.weights';

@Injectable()
export class WeightProfileService {
  private readonly logger = new Logger(WeightProfileService.name);

  constructor(private readonly em: EntityManager) {}

  async resolve(
    sector?: Sector | null,
    businessModel?: BusinessModel | null,
  ): Promise<Record<DimensionKey, number>> {
    const candidates: Array<{
      sector: Sector | null;
      businessModel: BusinessModel | null;
    }> = [];

    if (sector && businessModel) candidates.push({ sector, businessModel });
    if (sector) candidates.push({ sector, businessModel: null });
    candidates.push({ sector: null, businessModel: null });

    for (const where of candidates) {
      const profile = await this.em.findOne(WeightProfile, where);
      if (!profile) continue;

      const weights = this.validate(profile);
      if (weights) return weights;
    }

    // The table is empty on any unseeded database. Returning zeros here would
    // be a silent scoring failure, so the constants are the floor.
    return DEFAULT_WEIGHTS;
  }

  private validate(profile: WeightProfile): Record<DimensionKey, number> | null {
    const stored = profile.weights ?? {};

    const missing = DIMENSION_KEYS.filter((key) => typeof stored[key] !== 'number');
    if (missing.length > 0) {
      this.logger.warn(
        `Weight profile ${profile.id} is missing ${missing.join(', ')}; falling through.`,
      );
      return null;
    }

    const sum = DIMENSION_KEYS.reduce((total, key) => total + stored[key], 0);
    if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
      this.logger.warn(
        `Weight profile ${profile.id} sums to ${sum.toFixed(3)}, not 1.0; falling through.`,
      );
      return null;
    }

    return Object.fromEntries(
      DIMENSION_KEYS.map((key) => [key, stored[key]]),
    ) as Record<DimensionKey, number>;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd backend && pnpm test -- weight-profile.service
```

Expected: PASS, 9 tests.

- [ ] **Step 7: Mutation check — prove the tolerance is not decorative**

Temporarily change `Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE` to `sum !== 1` and re-run.

Expected: the *"accepts a sum within floating-point tolerance"* test FAILS. **Revert the mutation immediately.**

- [ ] **Step 8: Mutation check — prove cascade step 2 is reachable**

Temporarily delete the `if (sector) candidates.push({ sector, businessModel: null });` line and re-run.

Expected: the *"step 2: falls back to the sector-only profile"* test FAILS. **Revert the mutation immediately.**

- [ ] **Step 9: Commit**

```bash
git add backend/src/readiness/readiness.weights.ts backend/src/entities/weight-profile.entity.ts backend/src/readiness/weight-profile.service.ts backend/src/readiness/weight-profile.service.spec.ts
git commit -m "feat(2b): add WeightProfile entity and resolution cascade

resolve() narrows from (sector, businessModel) to (sector, null) to the
global row, ending at in-code constants so an unseeded database still
scores. Malformed profiles fall through with a warning rather than
producing a nonsense composite."
```

---

### Task 3: Score six dimensions out of nine, with injected weights

**Files:**
- Modify: `backend/src/readiness/readiness.service.ts` (weights, clamp, sixth dimension, constructor)
- Modify: `backend/src/readiness/readiness.module.ts`
- Test: `backend/src/readiness/readiness.service.spec.ts` (rewrite — this file currently holds one of the two known failures)

**Interfaces:**
- Consumes: `WeightProfileService.resolve()`, `DEFAULT_WEIGHTS`, `DimensionKey` (Task 2); `Startup.sector` / `.businessModel` (Task 1).
- Produces: `ReadinessScoreResponse.dimensions` with six entries; `getWeightRationale(weights?)` now optionally takes a weight map.

**The existing red test:** `expect(em.find).toHaveBeenCalledTimes(1)` receives 2, because the service calls `em.find` for levels and again for `TierConfig`. The expectation is wrong, not the code. After this task the service also calls `em.findOne` once for the startup's sector, so the corrected assertion is `em.find` twice and `em.findOne` once.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `backend/src/readiness/readiness.service.spec.ts`:

```ts
import { EntityManager } from '@mikro-orm/core';
import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { Sector } from '../entities/enums/sector.enum';
import { DEFAULT_WEIGHTS } from './readiness.weights';
import { ReadinessService } from './readiness.service';
import { WeightProfileService } from './weight-profile.service';

const HEALTHTECH_WEIGHTS = {
  team: 0.25, market: 0.18, product: 0.17, traction: 0.12, regulatory: 0.2, funding: 0.08,
};

// levels is a list of [readinessType, level] pairs, matching the seeder's shape.
function emWith(levels: Array<[ReadinessType, number]>, sector: Sector | null = null) {
  return {
    find: jest.fn(async (entity: any) => {
      // Second call is for TierConfig; an empty result exercises the fallback
      // ladder, which is what runs in production (tier_configs has 0 rows).
      if (entity?.name === 'TierConfig') return [];
      return levels.map(([readinessType, level]) => ({ readinessLevel: { level, readinessType } }));
    }),
    findOne: jest.fn(async () => ({ id: 1, sector, businessModel: null })),
    create: jest.fn(() => ({})),
    persist: jest.fn(),
    flush: jest.fn(async () => undefined),
  } as unknown as EntityManager;
}

function serviceWith(em: EntityManager, weights = DEFAULT_WEIGHTS) {
  const profiles = { resolve: jest.fn(async () => weights) } as unknown as WeightProfileService;
  return new ReadinessService(em, profiles);
}

const AGROLINK: Array<[ReadinessType, number]> = [
  [ReadinessType.A, 1], [ReadinessType.M, 2], [ReadinessType.T, 2],
  [ReadinessType.O, 2], [ReadinessType.R, 1], [ReadinessType.I, 1],
];

const MEDISYNC: Array<[ReadinessType, number]> = [
  [ReadinessType.A, 3], [ReadinessType.M, 4], [ReadinessType.T, 5],
  [ReadinessType.O, 4], [ReadinessType.R, 3], [ReadinessType.I, 3],
];

describe('ReadinessService', () => {
  it('returns a weighted score, tier, and prioritized recommendations', async () => {
    const em = emWith(MEDISYNC);
    const result = await serviceWith(em).getReadinessForStartup(12);

    // Two find() calls: readiness levels, then tier configs.
    expect(em.find).toHaveBeenCalledTimes(2);
    expect(result.compositeScore).toBeGreaterThan(0);
    expect(result.tierLabel).toBeDefined();
    expect(result.dimensions).toHaveLength(6);
    expect(result.recommendations).toHaveLength(3);
    expect(result.weightRationale).toHaveLength(6);
    expect(result.recommendations[0].priority).toBe(1);
  });

  it('exposes weight rationale for the UI', () => {
    const rationale = serviceWith(emWith([])).getWeightRationale();

    expect(rationale.map((item) => item.key)).toEqual([
      'team', 'market', 'product', 'traction', 'regulatory', 'funding',
    ]);
  });

  it('scores the seeded early-stage startup at 17', async () => {
    const result = await serviceWith(emWith(AGROLINK)).getReadinessForStartup(1);

    expect(result.compositeScore).toBe(17);
    expect(result.tierLabel).toBe('Early');
  });

  it('scores the seeded mid-stage startup at 41', async () => {
    const result = await serviceWith(emWith(MEDISYNC)).getReadinessForStartup(2);

    expect(result.compositeScore).toBe(41);
    expect(result.tierLabel).toBe('Developing');
  });

  it('divides by 9, not 5 — a level 9 outscores a level 5', async () => {
    const at5 = await serviceWith(emWith([[ReadinessType.T, 5]])).getReadinessForStartup(1);
    const at9 = await serviceWith(emWith([[ReadinessType.T, 9]])).getReadinessForStartup(1);

    expect(at9.compositeScore).toBeGreaterThan(at5.compositeScore);

    const product9 = at9.dimensions.find((d) => d.key === 'product');
    expect(product9?.percent).toBe(100);
  });

  it('scores the Regulatory dimension', async () => {
    const result = await serviceWith(emWith(MEDISYNC)).getReadinessForStartup(2);
    const regulatory = result.dimensions.find((d) => d.key === 'regulatory');

    expect(regulatory).toBeDefined();
    expect(regulatory?.readinessType).toBe(ReadinessType.R);
    expect(regulatory?.percent).toBe(33);
  });

  // Real startups have narrow level spreads, so sector weighting moves their
  // score by about a point. This fixture has a wide spread on purpose, so the
  // mechanism is provable even though production data cannot show it.
  it('applies the resolved profile — a regulatory-heavy startup scores higher under healthtech', async () => {
    const spread: Array<[ReadinessType, number]> = [
      [ReadinessType.A, 1], [ReadinessType.M, 1], [ReadinessType.T, 1],
      [ReadinessType.O, 1], [ReadinessType.R, 9], [ReadinessType.I, 1],
    ];

    const underDefault = await serviceWith(emWith(spread)).getReadinessForStartup(3);
    const underHealthtech = await serviceWith(
      emWith(spread, Sector.Healthtech), HEALTHTECH_WEIGHTS,
    ).getReadinessForStartup(3);

    expect(underDefault.compositeScore).toBe(20);
    expect(underHealthtech.compositeScore).toBe(29);
  });

  it('passes the startup sector to the weight resolver', async () => {
    const em = emWith(MEDISYNC, Sector.Healthtech);
    const profiles = { resolve: jest.fn(async () => DEFAULT_WEIGHTS) } as unknown as WeightProfileService;

    await new ReadinessService(em, profiles).getReadinessForStartup(2);

    expect(profiles.resolve).toHaveBeenCalledWith(Sector.Healthtech, null);
  });

  it('scores a startup with no sector using the resolver fallback', async () => {
    const result = await serviceWith(emWith(AGROLINK, null)).getReadinessForStartup(1);

    expect(result.compositeScore).toBe(17);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pnpm test -- readiness.service
```

Expected: FAIL — the `ReadinessService` constructor takes one argument, and `dimensions` has 5 entries not 6.

- [ ] **Step 3: Rewrite the dimension table and constants**

In `backend/src/readiness/readiness.service.ts`, delete the five `const *_WEIGHT` declarations and the local `DimensionKey` type (`:9-19`), and replace the imports and the dimension table:

```ts
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { ReadinessType } from 'src/entities/enums/readiness-type.enum';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';
import { ReadinessEvaluation } from 'src/entities/readiness-evaluation.entity';
import { ReadinessGap } from 'src/entities/readiness-gap.entity';
import { TierConfig } from 'src/entities/tier-config.entity';
import { Startup } from 'src/entities/startup.entity';
import { DEFAULT_WEIGHTS, DimensionKey } from './readiness.weights';
import { WeightProfileService } from './weight-profile.service';

// The rubric runs 1-9 for every dimension; scores are a fraction of 9.
const MAX_LEVEL = 9;

type ReadinessDimension = {
  key: DimensionKey;
  label: string;
  readinessType: ReadinessType;
  rationale: string;
};

const READINESS_DIMENSIONS: ReadinessDimension[] = [
  {
    key: 'team',
    label: 'Team',
    readinessType: ReadinessType.A,
    rationale: 'Team readiness is weighted highest because execution quality is the main multiplier for the rest of the startup.',
  },
  {
    key: 'market',
    label: 'Market',
    readinessType: ReadinessType.M,
    rationale: 'Market readiness is critical because clear demand is the strongest proof that the opportunity is worth pursuing.',
  },
  {
    key: 'product',
    label: 'Product',
    readinessType: ReadinessType.T,
    rationale: 'Product readiness is important, but it can move quickly once the team and market are clear.',
  },
  {
    key: 'traction',
    label: 'Traction',
    readinessType: ReadinessType.O,
    rationale: 'Traction differentiates the startup stage and validates momentum, but it should not overshadow fit signals.',
  },
  {
    key: 'regulatory',
    label: 'Regulatory',
    readinessType: ReadinessType.R,
    rationale: 'Regulatory readiness gates market entry in licensed sectors, so it carries more weight for health and finance startups than elsewhere.',
  },
  {
    key: 'funding',
    label: 'Funding',
    readinessType: ReadinessType.I,
    rationale: 'Funding supports execution capacity, but it is treated as a supporting signal rather than the core score.',
  },
];
```

- [ ] **Step 4: Take the weights as a parameter and inject the resolver**

Replace the constructor and `getWeightRationale` (`:99-108`):

```ts
  constructor(
    private readonly em: EntityManager,
    private readonly weightProfiles: WeightProfileService,
  ) {}

  getWeightRationale(weights: Record<DimensionKey, number> = DEFAULT_WEIGHTS) {
    return READINESS_DIMENSIONS.map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      weight: weights[dimension.key],
      rationale: dimension.rationale,
    }));
  }
```

- [ ] **Step 5: Resolve weights and score out of nine**

In `getReadinessForStartup`, after the `levelByType` map is built (`:117-122`) and before `const dimensions = …`, insert:

```ts
    const startup = await this.em.findOne(Startup, { id: startupId });
    const weights = await this.weightProfiles.resolve(
      startup?.sector ?? null,
      startup?.businessModel ?? null,
    );
```

Then replace the `dimensions` mapping (`:124-139`):

```ts
    const dimensions = READINESS_DIMENSIONS.map((dimension) => {
      const score = Math.max(0, Math.min(MAX_LEVEL, levelByType.get(dimension.readinessType) ?? 0));
      const percent = Math.round((score / MAX_LEVEL) * 100);
      const weight = weights[dimension.key];
      const weightedScore = Number(((percent / 100) * weight * 100).toFixed(2));

      return {
        key: dimension.key,
        label: dimension.label,
        readinessType: dimension.readinessType,
        score,
        percent,
        weight,
        weightedScore,
        rationale: dimension.rationale,
      };
    });
```

And in the response object (`:203`), pass the resolved weights through:

```ts
      weightRationale: this.getWeightRationale(weights),
```

- [ ] **Step 6: Register the provider**

Replace `backend/src/readiness/readiness.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { ReadinessController } from './readiness.controller';
import { WeightProfileService } from './weight-profile.service';

@Module({
  providers: [ReadinessService, WeightProfileService],
  controllers: [ReadinessController],
  exports: [ReadinessService, WeightProfileService],
})
export class ReadinessModule {}
```

- [ ] **Step 7: Run test to verify it passes**

```bash
cd backend && pnpm test -- readiness.service
```

Expected: PASS, 9 tests. This clears one of the two known baseline failures.

- [ ] **Step 8: Mutation check — prove the divisor is load-bearing**

Temporarily change `const MAX_LEVEL = 9;` to `5` and re-run.

Expected: the 17, 41, `divides by 9`, and `20 / 29` tests all FAIL. **Revert the mutation immediately.**

- [ ] **Step 9: Verify the whole suite**

```bash
cd backend && pnpm test
```

Expected: 201 passing / **1 failing** (`AiService › passes valid task responses through unchanged` only).

- [ ] **Step 10: Commit**

```bash
git add backend/src/readiness/readiness.service.ts backend/src/readiness/readiness.service.spec.ts backend/src/readiness/readiness.module.ts
git commit -m "feat(2b): score six dimensions out of nine with resolved weights

Scores were divided by a ceiling of 5 against a 1-9 rubric, inflating
every composite by 1.8x and making levels 6-9 indistinguishable from 5.
Adds the Regulatory dimension, which was collected and graded but never
scored, and takes weights from WeightProfileService.

Also corrects this spec's em.find call count, one of the two known
baseline failures - the expectation was wrong, not the code."
```

---

### Task 4: Remove `TierConfig.weights`

**Files:**
- Modify: `backend/src/entities/tier-config.entity.ts:14-16`
- Modify: `backend/src/admin/dto/…` — the `TierConfigItemDto` in `backend/src/admin/admin.controller.ts:25-35`
- Modify: `backend/src/admin/admin.controller.ts:152`
- Modify: `backend/src/admin/admin.service.ts:204-220`
- Modify: `frontend/src/routes/(app)/admin/tiers/+page.svelte` (lines 11-15, 20, 31-41, 73, 117, 146)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `TierConfig` keeps `tierLabel`, `threshold`, `createdAt`, `updatedAt`.

**Why:** the column is keyed per tier, so reading it would change a startup's weighting as it climbs tiers, making the composite non-monotonic. It has never been read and `tier_configs` has 0 rows, so there is no data to migrate. `updateSchema()` drops the column on the next boot.

- [ ] **Step 1: Confirm nothing reads it**

```bash
cd backend && grep -rn "weights" src --include=*.ts | grep -v readiness.weights | grep -v weight-profile
```

Expected: matches only in `tier-config.entity.ts`, `admin.controller.ts`, and `admin.service.ts` — the three files this task edits. If anything else appears, stop and report it.

- [ ] **Step 2: Remove the entity property**

In `backend/src/entities/tier-config.entity.ts`, delete lines 14-16 (the comment, the `@Property`, and the `weights` declaration).

- [ ] **Step 3: Remove the DTO field**

In `backend/src/admin/admin.controller.ts`, delete from `TierConfigItemDto`:

```ts
  @IsObject()
  @IsOptional()
  weights?: Record<string, number>;
```

Remove `IsObject` from the `class-validator` import if it becomes unused.

- [ ] **Step 4: Remove it from the sanitizer**

In `backend/src/admin/admin.controller.ts:152`, change:

```ts
    const sanitized = body.map((b: any) => ({ tierLabel: String(b.tierLabel), threshold: Number(b.threshold) }));
```

- [ ] **Step 5: Remove it from the service**

In `backend/src/admin/admin.service.ts`, change the signature and the `create` call:

```ts
  async upsertTierConfigs(configs: { tierLabel: string; threshold: number }[]) {
```

and delete the `weights: cfg.weights ?? null,` line from the `em.create(TierConfig, { … })` object.

- [ ] **Step 6: Remove the editor input**

In `frontend/src/routes/(app)/admin/tiers/+page.svelte`:

- `:11-15` → `let tiers = (data.tiers ?? []).map(t => ({ ...t }));` (drop the comment and `weightsStr`)
- `:20` → `tiers = [...tiers, { tierLabel: 'New', threshold: 0 }];`
- `:31-41` → `const payload = tiers.map(t => ({ tierLabel: t.tierLabel, threshold: Number(t.threshold) }));`
- `:73` → `Configure thresholds for startup classification tiers.`
- `:117` → delete the `<th>Weights (JSON)</th>` cell
- `:146` → delete the `<td>` containing `bind:value={t.weightsStr}`, including its wrapping cell and the `Code` icon if it is only used there

Remove now-unused imports (`Code`) from `:6`.

- [ ] **Step 7: Verify the backend builds and the suite is green**

```bash
cd backend && pnpm test
```

Expected: 201 passing / 1 failing, unchanged from Task 3.

- [ ] **Step 8: Verify the frontend type-checks no worse than before**

```bash
cd frontend && pnpm check 2>&1 | tail -5
```

Expected: the error count must not increase. The baseline is ~160 pre-existing errors; record the number before and after.

- [ ] **Step 9: Commit**

```bash
git add backend/src/entities/tier-config.entity.ts backend/src/admin/admin.controller.ts backend/src/admin/admin.service.ts "frontend/src/routes/(app)/admin/tiers/+page.svelte"
git commit -m "refactor(2b): drop TierConfig.weights

Keyed per tier, so reading it would change a startup's weighting as it
climbs tiers and make the composite non-monotonic. Never read, and
tier_configs has 0 rows, so there is nothing to migrate. Sector-keyed
weights live in weight_profiles instead."
```

---

### Task 5: Seed the weight profiles, demo sectors, and the dashboard labels

**Files:**
- Modify: `backend/src/main.ts` (add `seedWeightProfiles`, call it in `bootstrap()`, add `sector` to both demo startup specs)
- Modify: `frontend/src/lib/components/dashboard/ReadinessDashboard.svelte:6` and `:83`
- Test: `backend/src/readiness/weight-profile.seed.spec.ts` (new)

**Interfaces:**
- Consumes: `WeightProfile`, `DIMENSION_KEYS` (Task 2), `Sector` (Task 1).
- Produces: `SEED_WEIGHT_PROFILES` exported from `backend/src/readiness/readiness.weights.ts`.

**Note on the seeder guard:** `seedDemoStartup` returns early when a startup already exists, by design (`TODO_CHECKLIST.md` §4). Both demo startups already exist on Neon, so adding `sector` to the spec only affects a **cold** database. Task 6 sets the sector on the existing rows through the API.

- [ ] **Step 1: Write the failing test**

Create `backend/src/readiness/weight-profile.seed.spec.ts`:

```ts
import { DIMENSION_KEYS, SEED_WEIGHT_PROFILES } from './readiness.weights';

describe('SEED_WEIGHT_PROFILES', () => {
  it('seeds exactly three profiles', () => {
    // Three, not eight: authoring a profile per sector with no basis would
    // manufacture false specificity.
    expect(SEED_WEIGHT_PROFILES).toHaveLength(3);
  });

  it('includes a global default with both keys null', () => {
    const global = SEED_WEIGHT_PROFILES.find((p) => p.sector === null);

    expect(global).toBeDefined();
    expect(global?.businessModel).toBeNull();
  });

  it.each(SEED_WEIGHT_PROFILES.map((p) => [p.sector ?? 'global', p] as const))(
    'profile %s covers every dimension and sums to 1.0',
    (_label, profile) => {
      for (const key of DIMENSION_KEYS) {
        expect(typeof profile.weights[key]).toBe('number');
      }

      const sum = DIMENSION_KEYS.reduce((total, key) => total + profile.weights[key], 0);
      expect(sum).toBeCloseTo(1, 5);
    },
  );

  it('weights regulatory higher for healthtech than agritech', () => {
    const health = SEED_WEIGHT_PROFILES.find((p) => p.sector === 'healthtech');
    const agri = SEED_WEIGHT_PROFILES.find((p) => p.sector === 'agritech');

    expect(health!.weights.regulatory).toBeGreaterThan(agri!.weights.regulatory);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pnpm test -- weight-profile.seed
```

Expected: FAIL — `SEED_WEIGHT_PROFILES` is not exported.

- [ ] **Step 3: Add the seed data**

Append to `backend/src/readiness/readiness.weights.ts`:

```ts
import { Sector } from 'src/entities/enums/sector.enum';
import { BusinessModel } from 'src/entities/enums/business-model.enum';

export type SeedWeightProfile = {
  sector: Sector | null;
  businessModel: BusinessModel | null;
  weights: Record<DimensionKey, number>;
};

// Authored, no external source. Agritech shifts weight toward market and
// traction; healthtech toward regulatory, because clinical and data
// regulation gates the business.
export const SEED_WEIGHT_PROFILES: SeedWeightProfile[] = [
  { sector: null, businessModel: null, weights: DEFAULT_WEIGHTS },
  {
    sector: Sector.Agritech,
    businessModel: null,
    weights: { team: 0.24, market: 0.28, product: 0.16, traction: 0.18, regulatory: 0.06, funding: 0.08 },
  },
  {
    sector: Sector.Healthtech,
    businessModel: null,
    weights: { team: 0.25, market: 0.18, product: 0.17, traction: 0.12, regulatory: 0.2, funding: 0.08 },
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && pnpm test -- weight-profile.seed
```

Expected: PASS, 6 tests (3 parameterised).

- [ ] **Step 5: Seed them on boot, idempotently**

In `backend/src/main.ts`, add the imports:

```ts
import { WeightProfile } from './entities/weight-profile.entity';
import { SEED_WEIGHT_PROFILES } from './readiness/readiness.weights';
```

and add this function next to the other seeders:

```ts
// Idempotent: matches on (sector, businessModel) and rewrites the weights, so
// editing SEED_WEIGHT_PROFILES takes effect on the next boot.
async function seedWeightProfiles(orm: MikroORM) {
  const em = orm.em.fork();
  let created = 0;
  let updated = 0;

  for (const spec of SEED_WEIGHT_PROFILES) {
    const existing = await em.findOne(WeightProfile, {
      sector: spec.sector,
      businessModel: spec.businessModel,
    });

    if (existing) {
      existing.weights = spec.weights;
      existing.updatedAt = new Date();
      updated += 1;
      continue;
    }

    em.persist(em.create(WeightProfile, { ...spec, createdAt: new Date(), updatedAt: new Date() }));
    created += 1;
  }

  await em.flush();
  console.log(`Seeded weight profiles: created=${created} updated=${updated}`);
}
```

Call it in `bootstrap()` immediately after the `updateSchema()` call, before the demo-startup seeding.

- [ ] **Step 6: Add sectors to the demo startup specs**

In `backend/src/main.ts`, add the import:

```ts
import { Sector } from './entities/enums/sector.enum';
```

Add `sector` to the `seedDemoStartup` spec type (alongside `name`, `founder`, `mentor`, `links`, `levels`), assign it in the `em.create(Startup, { … })` call as `sector: spec.sector`, and set it on both call sites:

- AgroLink PH → `sector: Sector.Agritech,`
- MediSync Cebu → `sector: Sector.Healthtech,`

- [ ] **Step 7: Update the dashboard's five-dimension assumptions**

In `frontend/src/lib/components/dashboard/ReadinessDashboard.svelte`:

`:6` →

```ts
    key: 'team' | 'market' | 'product' | 'traction' | 'regulatory' | 'funding';
```

`:83` →

```
          A weighted view across team, market, product, traction, regulatory, and funding so the strongest gaps are obvious at a glance.
```

- [ ] **Step 8: Verify the suite and the frontend**

```bash
cd backend && pnpm test
```

Expected: 207 passing / 1 failing.

```bash
cd frontend && pnpm check 2>&1 | tail -5
```

Expected: no increase over the count recorded in Task 4.

- [ ] **Step 9: Commit**

```bash
git add backend/src/readiness/readiness.weights.ts backend/src/readiness/weight-profile.seed.spec.ts backend/src/main.ts frontend/src/lib/components/dashboard/ReadinessDashboard.svelte
git commit -m "feat(2b): seed three weight profiles and the demo sectors

Global default plus agritech and healthtech only - a profile per sector
with no basis would manufacture false specificity. The seeder rewrites
weights on each boot so editing the constants takes effect, but it does
not touch existing startups, so demo sectors apply to cold databases
only."
```

---

### Task 6: Live verification against Neon, then documentation

**Files:**
- Modify: `TODO_CHECKLIST.md` (§0 objective table row 2b, §3 clamp item, §3 Regulatory item, §4 duplicate-enums item)
- Modify: `SESSION_NOTES.md` (append an entry)
- Modify: `PROJECT_OVERVIEW.md` if it describes the five-dimension scorer

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

**Why live:** green tests here have repeatedly hidden real breakage. `updateSchema()` must actually create `weight_profiles` and the two `startups` columns against Postgres, and the resolution cascade must work against MikroORM's real null matching, which the mocked `findOne` only approximates.

- [ ] **Step 1: Boot the backend**

```bash
cd backend && pnpm dev
```

Watch for `Seeded weight profiles: created=3 updated=0` and no schema errors. Leave it running — **do not run `pnpm build` while this is up.**

- [ ] **Step 2: Confirm the schema landed**

Write `backend/_verify.js` (inside `backend/`, deleted in Step 7):

```js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { MikroORM } = require('@mikro-orm/postgresql');

(async () => {
  const orm = await MikroORM.init({
    host: process.env.DB_HOST, port: +(process.env.DB_PORT || 5432),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, dbName: process.env.DB_NAME,
    driverOptions: { connection: { ssl: { rejectUnauthorized: false } } },
    entities: [], discovery: { warnWhenNoEntities: false }, connect: true,
  });
  const c = orm.em.getConnection();
  console.table(await c.execute('select id, sector, business_model, weights from weight_profiles order by id'));
  console.table(await c.execute('select id, name, sector, business_model from startups order by id limit 5'));
  await orm.close(true);
})();
```

```bash
cd backend && node _verify.js
```

Expected: 3 weight-profile rows (one with `sector` null), and a `startups` table with `sector` / `business_model` columns present and null.

- [ ] **Step 3: Set MediSync's sector through the API**

Sign in and PATCH. Replace `<TOKEN>` with the JWT from `POST /auth/signin` as `admin@launchup.local` / `password123`:

```bash
curl -s -X PATCH http://localhost:3000/startups/2 -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" -d "{\"sector\":\"healthtech\"}"
```

Expected: 200, and the response body's `sector` is `healthtech`. This also proves the DTO whitelist fix from Task 1 works end to end.

- [ ] **Step 4: Read both scores**

```bash
curl -s http://localhost:3000/readiness/1 -H "Authorization: Bearer <TOKEN>"
curl -s http://localhost:3000/readiness/2 -H "Authorization: Bearer <TOKEN>"
```

Expected:
- Startup 1 → `compositeScore: 17`, `tierLabel: "Early"`, `dimensions` length 6 including `regulatory`
- Startup 2 → `compositeScore: 40`, `tierLabel: "Developing"` — **40, not 41**, because MediSync now resolves the healthtech profile. If it reads 41, the sector did not persist; go back to Step 3.

- [ ] **Step 5: Prove the profile is what moved it**

```bash
curl -s -X PATCH http://localhost:3000/startups/2 -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" -d "{\"sector\":\"fintech\"}"
curl -s http://localhost:3000/readiness/2 -H "Authorization: Bearer <TOKEN>"
```

Expected: `compositeScore: 41` — fintech has no profile, so the cascade falls to the global default. Then set it back to `healthtech`.

- [ ] **Step 6: Record the numbers**

Copy the two composites, the six dimension keys, and the fintech/healthtech difference into the notes for Step 8.

- [ ] **Step 7: Delete the throwaway script**

```bash
cd backend && rm _verify.js && git status --short
```

Expected: no untracked `_verify.js`.

- [ ] **Step 8: Update the documentation**

In `TODO_CHECKLIST.md`:

- §0 objective table, row **2b** — change 🔴 Not implemented to 🟢 Built, and replace the evidence cell with a description of `WeightProfileService`, the six dimensions, and the ÷9 correction. State plainly that sector weighting moves a real score by about one point and why.
- §0 **"Make composite weights configurable and sector-aware (2b)"** — mark `[x]`, and correct its instruction to read weights from `TierConfig`: that column was keyed per tier and has been deleted.
- §3 **"Readiness scores are clamped to 0–5 but levels run 1–9"** — mark `[x]`. Correct its claim that this undermines differentiation: fixing it *reduced* the AgroLink/MediSync gap from 44 to 24, because dividing by 5 was inflating both scores.
- §3 **"Regulatory readiness is collected but never scored"** — mark `[x]`, six dimensions now scored.
- §4 **"Consolidate duplicate enums and tables"** — the note claiming the orphaned `recommendations` table "drops itself on the next boot" is stale; verified against Neon on 2026-08-04, the table does not exist.

In `SESSION_NOTES.md`, append an entry covering: the four decisions and why, the ÷5-inflation finding, the `TierConfig.weights` keying problem, the measured sector delta of about one point and its arithmetic cause, and the live-verified numbers from Step 4.

- [ ] **Step 9: Final verification**

```bash
cd backend && pnpm test
```

Expected: 207 passing / 1 failing (`AiService › passes valid task responses through unchanged`).

Stop `pnpm dev`, then:

```bash
cd backend && pnpm build
```

Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add TODO_CHECKLIST.md SESSION_NOTES.md PROJECT_OVERVIEW.md
git commit -m "docs(2b): record weighted scoring results and correct three stale notes

Live-verified against Neon: AgroLink 17/Early, MediSync 40/Developing
under healthtech, 41 under the global default.

Corrects the checklist's claim that the clamp fix increases
differentiation (it halves the gap, 44 to 24), its instruction to read
weights from TierConfig (wrong axis, column deleted), and its note that
the orphaned recommendations table still needs dropping (already gone)."
```

---

## Plan self-review

**Spec coverage.** Every spec section maps to a task: the cascade and validation → Task 2; the data model and `TierConfig.weights` deletion → Tasks 1, 2, 4; the scoring changes, default weights, and sixth dimension → Task 3; the seeded profiles table → Task 5; the frontend two-line touch → Task 5; expected outcomes → Task 3 fixtures and Task 6 live checks; every testing bullet → Tasks 2, 3, 5, 6. The spec's out-of-scope list is respected — no apply-form picker, no read-path write fix, no backfill of the 16 existing evaluation rows, no weight-profile admin UI, no `DimensionKey` rename.

**Type consistency.** `DimensionKey`, `DIMENSION_KEYS`, `DEFAULT_WEIGHTS`, `WEIGHT_SUM_TOLERANCE`, `SEED_WEIGHT_PROFILES` are all defined in `readiness.weights.ts` (Tasks 2 and 5) and referenced under those exact names in Tasks 3, 5, and 6. `WeightProfileService.resolve(sector, businessModel)` is defined in Task 2 and called with that argument order in Task 3. `Sector.Healthtech` / `Sector.Agritech` are defined in Task 1 and used in Tasks 3, 5, and 6.

**Known divergence, deliberate.** Task 3's unit fixture asserts MediSync at **41** (mocked resolver returning `DEFAULT_WEIGHTS`), while Task 6's live check expects **40** (real cascade resolving the healthtech profile). Both are correct and the difference is the point of Step 5 — it is called out in both places so an implementer reading one task does not read the other as a contradiction.
