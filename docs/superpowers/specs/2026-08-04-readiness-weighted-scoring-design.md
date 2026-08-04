# Sector-aware weighted readiness scoring (Objective 2b) — design

**Date:** 2026-08-04
**Branch:** `feat/weighted-scoring` (off `master` at `f3a2c24`)
**Objective:** SRS 2b — composite weights that vary "depending on the startup's industry sector and business model type"

Also closes two §3 scope items that cannot be separated from it: the 0–5 clamp
against a 1–9 rubric, and Regulatory readiness being collected but never scored.

## Current behaviour, verified against live Neon

`ReadinessService.getReadinessForStartup` maps five dimensions, each with a
hardcoded `const` weight, clamps every level to 0–5, and divides by 5.

Live data (2026-08-04):

```
tier_configs              0 rows          — the admin editor has never been used
readiness_levels          1..9, all 6 dimensions
startups_readiness_level  startup 1: A1 M2 T2 O2 R1 I1
                          startup 2: A3 M4 T5 O4 R3 I3
readiness_evaluations     16 rows, composite 32..76
```

Recomputing the formula by hand from those levels yields exactly 32 and 76,
matching the recorded min and max. The model below is therefore verified against
production behaviour, not inferred from reading the code.

## Three defects, and an honest correction

### 1. The divisor, not the clamp, is what's wrong today

Neither startup exceeds level 5, so `Math.min(5, …)` truncates nothing right
now. What it does is **divide by a ceiling of 5 when the rubric's ceiling is 9**,
inflating every score by 1.8×.

`TODO_CHECKLIST.md` §3 frames this as undermining differentiation. That framing
is wrong, and the arithmetic says the opposite:

Isolating the divisor change alone, holding the existing five dimensions and
their current weights fixed:

| | AgroLink | MediSync | gap |
|---|---|---|---|
| today (`min(5,·)`, ÷5) | 32 | 76 | **44** |
| divisor corrected (÷9) | 18 | 42 | **24** |

(These differ slightly from the final numbers under "Expected outcomes" — 17 and
41 — because those also include the sixth dimension and the rebalanced weights.
The table above changes one variable at a time, on purpose.)

Fixing it **halves the headline spread**. The truncation is still a real defect —
a level-9 and a level-5 startup score identically, and the rubric UI offers all
nine levels — but this is a correctness fix that costs apparent differentiation
and buys headroom. It should not be sold as a differentiation win.

### 2. `TierConfig.weights` is keyed on the wrong axis

`TODO_CHECKLIST.md` §0 says to "read weights from `TierConfig`". That column sits
on `tier_configs`, one row per tier label, so it expresses **weights per tier** —
meaning a startup's weighting would change as it climbs tiers, making the
composite non-monotonic. Objective 2b asks for weights per **sector and business
model**. The column being written but never read is most economically explained
by whoever added it hitting this same problem at the read site.

Wiring it up as the checklist describes would close the item and make the scorer
worse. It is dropped instead.

### 3. Regulatory is collected and discarded

Both startups have Regulatory levels stored, mentors grade the rubric, and
`READINESS_DIMENSIONS` has no entry for it. Investment is scored in its place,
which is the reverse of what the source PDFs specify (TRL/MRL/RRL/ARL/ORL).

## Scope decisions

| Decision | Choice | Why |
|---|---|---|
| Level → score | Linear `level/9` | Simplest; treats level 1 as real but minimal progress |
| Tier ladder | Unchanged (85/70/55/40/25) | Its level-equivalents (7.7/6.3/5.0/3.6/2.3 of 9) already match TRL/BRL band semantics; `tier_configs` is empty so there is nothing to migrate |
| Weight storage | New `WeightProfile` entity | Keyed on sector and business model, the axes 2b names |
| Sector source | Backend fields + seeder | No frontend apply-form work; the frontend carries 160 pre-existing `svelte-check` errors |
| Dimensions | Score all six | Everything collected gets scored; removes the "six dimensions, five weights" question |

### Why not align to the spec's exact five

Dropping Investment to match TRL/MRL/RRL/ARL/ORL would leave Investment levels
collected, graded, and fed to AI recommendation generation while contributing
nothing to the score — recreating the current Regulatory defect under a
different name. Investment's absence from the SDD is a documentation mismatch,
already tracked separately in `TODO_CHECKLIST.md` §0.

## Architecture

### `WeightProfileService` — new

Owns exactly one question: given a startup, which weights apply?

```
resolve(sector?, businessModel?) →
  1. WeightProfile matching (sector, businessModel) exactly
  2. WeightProfile matching (sector, null)
  3. WeightProfile matching (null, null)          — the global default row
  4. DEFAULT_WEIGHTS constant                     — table empty or all rows invalid
```

Step 4 is not defensive padding. `weight_profiles` is empty on any database that
has not been seeded, and a scorer that silently returns zeros because a table is
empty is the exact failure class this repo has shipped before. The constants stay
in code as the floor.

**Validation.** A profile is usable only if it covers all six dimension keys and
its weights sum to 1.0 within ±0.001. A malformed row falls through to the next
cascade step with a logged warning rather than producing a nonsense score. Float
summation makes an exact `=== 1` comparison unreliable, hence the tolerance.

### Data model

```ts
@Entity({ tableName: 'weight_profiles' })
class WeightProfile {
  id!: number;
  sector?: Sector | null;
  businessModel?: BusinessModel | null;
  weights!: Record<DimensionKey, number>;   // json
}
```

Nullable `sector` and `businessModel` enums are added to `Startup`, settable
through the existing `PATCH /startups/:id`. Null on either resolves through the
cascade to a less specific profile.

`TierConfig.weights` is deleted — the column, the field in `admin.controller.ts`'s
DTO, the pass-through in `admin.service.ts:217`, and the input in the tier editor.

**Taxonomy, kept deliberately small:**

- `Sector`: `agritech | healthtech | fintech | edtech | ecommerce | logistics | deeptech | other`
- `BusinessModel`: `b2b | b2c | b2b2c | marketplace | saas | other`

### Scoring changes

In `readiness.service.ts`:

- `Math.min(5, …)` → `Math.min(9, …)`; `percent = round(score / 9 × 100)`
- Add the `regulatory` dimension (`ReadinessType.R`)
- `READINESS_DIMENSIONS` loses its hardcoded `weight` field; weights are injected
  per request from the resolved profile
- Tier ladder and the `ReadinessGap` shortfall calculation are unchanged

**Default weights**, summing to 1.0:

| key | readiness type | weight |
|---|---|---|
| team | Acceptance | 0.28 |
| market | Market | 0.22 |
| product | Technology | 0.18 |
| traction | Organizational | 0.14 |
| regulatory | Regulatory | 0.10 |
| funding | Investment | 0.08 |

**Provenance: these weights are authored, with no external source.** They preserve
the relative ordering of the five existing constants and give Regulatory a
mid-low share. This is the same honesty standard the RAG corpus carries in its
per-row `provenance` field, and it applies equally to the three seeded sector
profiles below — none is derived from a published framework.

**Seeded profiles: three rows only** — the global default, `agritech`, and
`healthtech`. Authoring eight sector profiles with no basis would manufacture
false specificity. Each is seeded with `businessModel: null`, so it matches
cascade step 2.

| key | default | agritech | healthtech |
|---|---|---|---|
| team | 0.28 | 0.24 | 0.25 |
| market | 0.22 | **0.28** | 0.18 |
| product | 0.18 | 0.16 | 0.17 |
| traction | 0.14 | 0.18 | 0.12 |
| regulatory | 0.10 | 0.06 | **0.20** |
| funding | 0.08 | 0.08 | 0.08 |
| **sum** | 1.00 | 1.00 | 1.00 |

Rationale, such as it is: agritech shifts weight toward market and traction and
away from regulatory; healthtech does the reverse, because clinical and data
regulation gates the business. Neither is externally sourced.

### Not changed

The `DimensionKey` names (`team`, `market`, `product`, `traction`, `funding`) do
not match their readiness types — `team` maps to Acceptance, `traction` to
Organizational. Renaming them would invalidate existing `readiness_gaps.dimension_key`
rows and the frontend's union type, for cosmetic gain. The new key is `regulatory`,
matching its type by coincidence rather than by a new convention.

### Frontend

Two lines in `ReadinessDashboard.svelte`, which already renders dimensions
generically via `{#each data.dimensions}`:

- `:6` — add `'regulatory'` to the `key` union type
- `:83` — the prose naming the five dimensions

No other frontend work. The apply-form sector picker is explicitly out of scope.

## Expected outcomes

Default profile, against the real seeded levels:

| | composite | tier |
|---|---|---|
| AgroLink (A1 M2 T2 O2 R1 I1) | 17 | Early |
| MediSync (A3 M4 T5 O4 R3 I3) | 41 | Developing |

Applying a sector profile to those same startups:

| | default | sector | Δ |
|---|---|---|---|
| MediSync → healthtech (regulatory .10→.20) | 41 | 40 | −1 |
| AgroLink → agritech (market .22→.28) | 17 | 18 | +1 |

**Sector weighting will barely move a real score, and that is arithmetic, not a
defect.** A weighted mean diverges from an unweighted one only in proportion to
the spread of its inputs. AgroLink's dimensions span 11–22%; MediSync's span
33–56%. Narrow spread, negligible weight effect.

This independently reproduces the finding already recorded in `TODO_CHECKLIST.md`
§5 from a different direction — *"fixing weighted scoring alone would not have
produced differentiation: the per-dimension inputs being weighted were nearly
identical for both startups."*

**So 2b is a correctness and configurability deliverable, not a differentiation
win.** The measured differentiation win came from the model tier (−0.17 → +2.28
on the same startups). Both numbers exist and should be quoted together.

## Testing

- **Cascade unit tests** — all four resolution steps, including the empty-table
  fall-through to constants.
- **Malformed-profile tests** — weights summing to 0.8, and a profile missing
  `regulatory`; each must fall through with a warning, not score.
- **Fixture tests** — exact composites 17 and 41 from the two real level sets, so
  the numbers in this document are enforced by the suite.
- **A spread fixture that actually exercises weighting.** Because real data barely
  moves, one synthetic startup at `R9` with every other dimension at `1`:
  default → **20**, healthtech → **29**. A 9-point swing proves the mechanism
  works even where production data cannot show it.
- **Mutation pass** — reverting `min(9,·)` to `min(5,·)`, and deleting cascade
  step 2, must each turn the suite red.
- **Fix the pre-existing red test** `ReadinessService › returns a weighted score,
  tier, and prioritized recommendations`. It is one of the two known baseline
  failures and it lives in the file this work rewrites.
- **Live verification** against Neon: `GET /readiness/1` and `/2` return 17 and 41
  with six dimensions; setting MediSync's sector to `healthtech` moves the score.

Jest baseline is 190 passing / 2 failing. This work should end at **1 failing**
(the unrelated `AiService › passes valid task responses through unchanged`), plus
its own new tests. Any other failure is a regression.

## Explicitly out of scope

- The apply-form sector/business-model picker.
- `GET /readiness/:startupId` persisting an evaluation row on every read
  (`TODO_CHECKLIST.md` §2). Each live-verification call will add 7 rows to the 16
  already present. Pre-existing, unrelated, and left alone.
- Backfilling the 16 existing `readiness_evaluations` rows, which were computed
  under the ÷5 formula. They stay as they are; they are already noise from the
  read-path write bug above.
- Admin UI for editing weight profiles. The entity and seeder are enough to
  satisfy 2b; an editor is a separate pass.
- Renaming `DimensionKey` values to match their readiness types.
