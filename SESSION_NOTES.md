# Session Notes

Chronological, oldest first. Sessions older than the last three are compressed to outcome only — see `TODO_CHECKLIST.md` for the live backlog and `measurement/README.md` for measurement detail.

---

## Standing operational notes

Cross-session gotchas. These cost real time when rediscovered.

- **Never run `pnpm build` while `pnpm dev` is watching.** Both write `dist/`; the race leaves the server unable to resolve its own modules. `pnpm test` is safe (ts-jest doesn't touch `dist/`).
- **Green mocked tests have repeatedly coexisted with broken reality here.** The boot-time embedding backfill failed on every startup; deleting `TierConfig.weights` broke `seed-dummy.ts` so `pnpm dev` wouldn't compile — both with a green suite. Exercise the real path: `preview_start` + `preview_logs`, or `NestFactory.createApplicationContext`. Run SQL against Neon inside `begin`/`rollback`.
- **Gemini free tier: 20 generation calls/day on `gemini-3.6-flash`, window resets 15:00 Philippine time** (midnight US Pacific). A run started before 15:00 draws on the *previous* window. One UI generation fans out into several calls — budget 3–5/day, not 20. 429s surface in the backend terminal, not the browser. Embedding has a separate 100/min quota.
- **Never rewrite a `backend/measurement/*.js` file with LF endings.** The harness
  fingerprints code by hashing `Function.prototype.toString()`, which carries the
  file's *real* line endings; working copies are CRLF and git stores LF. An LF
  rewrite moves every hash with no code change, and `--merge` then refuses every
  historical pool. It presents as "collected data would stop pooling", which sends
  you hunting in the wrong file. Preserve endings when editing, and re-check
  `currentFingerprints()` against a stored run afterwards.
- **`pg` is not resolvable from `backend/`** (pnpm-isolated under `@mikro-orm/postgresql`). Use `MikroORM.init(require('./dist/src/mikro-orm.config').default)` + `orm.em.getConnection().execute(sql)`. Tables are **pluralised**: `startups`, `startups_readiness_level`, `rag_contexts`, `rag_retrieval_logs`.
- **`nest build` emits to `dist/src/`, not `dist/`** (because `seed-dummy.ts` sits at the backend root). `seed-admin.js` and `seed-demo-runner.js` hardcode `./dist/` and are broken.
- **`mikro-orm.config.ts` hardcodes `entities: ['./dist/**/*.entity.js']`.** A build emitted anywhere else still loads **stale** entities from `dist/`, silently. Any probe compiled to a scratch dir must override `entities`, or it is measuring the last build — this produced a convincing false negative once (a new property read as "not in metadata").
- **To browser-test as any role without the login form:** `POST /auth/signin` for a token, then set it as the `Access` cookie via `javascript_tool` (`document.cookie`). `hooks.server.ts` verifies that cookie locally with `jose`, so no backend round-trip and no form automation is needed. The form itself still resists automation.
- **Dark mode is class-based** (`html.dark`, mode-watcher) — `prefers-color-scheme` does not drive it, so a devtools colour-scheme toggle proves nothing. Toggle the class.
- **`pnpm lint` runs `eslint --fix`, and `pnpm format` runs `prettier --write .`** — either rewrites the whole tree over a CRLF/prettier conflict (checklist §4). `pnpm format` cost an hour on 2026-09-04: 106 files reformatted for real, ~300 more churned to LF. **Format named files, never the tree**, and check `git status` before committing after anyone runs either. Prettier also reformats previously-unformatted files it legitimately touches, inflating a 6-line change to 115 — revert that churn and re-apply the small edit by hand.
- **A fired scheduled task is not evidence it ran.** One fired, started its MCP servers, and never ran the command. Check for the artifact.
- **Use Node, not PowerShell, for storage probes.** PS 5.1's `Invoke-WebRequest` reported a *successful* Supabase PUT as failed with no status code.
- **`node inspect-prompt.js <startupId> [--dimension T]`** prints a real assembled prompt and stops before `sendToGemini` — zero quota.
- **`ai_generation_runs` is not a quota ledger for measurement runs.** The harness opens no row and touches no EntityManager, so the table under-reports badly (its newest rows are from 2026-07-31). Budget from `apiRequests` in the results files plus UI-driven generation.
- **`--merge` exists only on `measure-grounding.js`.** `measure-summary-bias.js` records fingerprints but nothing acts on them, so the pooling guard is documentary there, not mechanical.
- **A scripted edit that silently fails to apply looks exactly like success**, because the follow-up test run goes green either way. Assert the anchor matched (`assert s.count(old) == 1`) and, for mutations, that behaviour *changed* — a mutant whose anchor no longer exists reports KILLED for the wrong reason.
- **Backticks inside a double-quoted bash string are command substitution.** `"the \`foo\` thing"` runs `foo` and substitutes its output, silently deleting the word. Use quoted heredocs (`<<'EOF'`) for any text containing backticks.
- **A missing `populate` is invisible to every mocked test.** `em.findOne(Startup, {id})` loads a relation as an **id-only reference** — the SQL selects `c1.id` and nothing else — so `startup.capsuleProposal.aiAnalysisSummary` reads `undefined`. A mock that returns a fully-formed object passes regardless. This shipped a gate that silently never fired, past four green unit tests, and one live request caught it. **Any feature reading a relation off a `findOne` needs a live check, not a test.**
- **`JSON.stringify(obj, replacerArray)` filters keys at EVERY level, including the root.** A guard comparing `{1: {...}, 2: {...}}` this way strips `1` and `2` and compares `{}` to `{}` — it passes for correct and corrupted data alike. Another instance of *a check that cannot fail is not a check*; use a recursive sorted-key canonicaliser, and prove the comparator rejects a deliberately wrong value before trusting it.
- **Neon holds three startups, not two.** 1 AgroLink and 2 MediSync (both rated, both measurement ground truth), plus **5 "Tindahanap", PENDING and unrated** — created through the apply flow during the 2026-08-22 OCR session. Earlier notes saying "exactly two startups and both are rated" are stale. Startup 5's real summary scores `ratio 1.000` (not flagged), which makes it a usable balanced control.
- **`node -e "..."` cannot be given `--flag=value` arguments** — node parses them as its own options and exits. Probing a harness that reads `process.argv` needs a real script file.
- **A doc patch can corrupt line terminators invisibly.** A newline substitution ran twice on the same text — joined with CRLF, then every LF expanded to CRLF again — giving CR+CRLF, invisible in the editor and in `git diff`. Surfaced only by a diffstat far larger than the edit justified, then `file` reporting "CRLF, CR line terminators." Treat an oversized diffstat as a signal, not noise.
- **Playwright MCP refuses `file:` URLs and writes only inside the repo root.** Serve a scratch page over `http://127.0.0.1` instead, and clean `.playwright-mcp/` afterward — it is not gitignored.
- **`allowGlobalContext` is unset (false), so a boot-time `app.get(...)` throws.** Boot seeders must take `orm.em.fork()` — every seeder in `main.ts` already does this.
- **The Browser pane does not composite while hidden**, so CSS animations never advance and `requestAnimationFrame` never fires (`visibilityState: hidden`; a rAF loop ticks exactly once). Any library behaviour gated on `animationend` or rAF looks permanently stuck — bits-ui menus never unmount and leave `body { pointer-events: none }`, which reads exactly like a real freeze and **reproduces on unmodified code**. Install a rAF counter before believing any "the page is frozen" finding.
- **A capsule-proposal vision call took 175 s.** Budget client/HTTP timeouts well beyond a default before blaming the pipeline.

---

## Compressed history — 2026-07-26 → 2026-08-09

**Pipeline config, run provenance, and four generation bugs (2026-07-26, PRs #7–#8).** `AiConfigService` resolves the pipeline from env with a Manager-gated per-request override, and every generation opens an `ai_generation_runs` row, so a run is attributable to an exact arm; score normalization was decoupled from bias review, which had left two of four arms unreachable. Four bugs fixed (`targetLevelScore` always `-1`, `generateRoadblocks` always `[]`, `requestedStatus` asymmetry, AI-generated RNS invisible) — **the RNA half of that last diagnosis was wrong and was reverted**, so `rna.service.ts` deliberately still writes `isAiGenerated: true`. **Citable limit:** `temperature`/`maxOutputTokens` had been passed at the top level of the `@google/genai` call, where the SDK drops them, so every call before this ran at the API default — baseline results gathered earlier are not sampling-comparable with results after.

**Database reset and reseed (2026-07-26).** Shared Neon data was wiped after a full JSON backup to `Projects/Launchup/db-backups/`, dropping tables while **preserving the pgvector extension**. `seed-demo-full.js` adds what the boot seeder never created (the 6×9 readiness grid, capsule proposals, 6 assessments), and role separation was corrected — dedicated `Startup`-role founders own the demo startups with `mentor@launchup.local` attached. Creation-only by design, so a branch seeded before 2026-07-27 needs `node seed-demo-full.js`.

**Object storage — Supabase, presigned, private (2026-07-27, PR #9).** R2 ruled out (card required even on the free tier); `S3_*` with `forcePathStyle`, presigned PUT + presigned GET against a **private** bucket, storing the object *key* not a URL. **Two bugs the tests caught that would have shipped silently:** the SDK signs a CRC32 checksum of the empty signing-time body (fixed with `requestChecksumCalculation: 'WHEN_REQUIRED'`), and `getSignedUrl` signs only `host` unless given `signableHeaders`, which made the returned `Content-Type` requirement decorative. **Dependency trap:** pin `@aws-sdk/s3-request-presigner` to the exact `client-s3` version, or two copies of `@smithy/types` break the build.

**Model tiering (2026-07-27, PR #10).** Measured against the project's own key, which overturned the plan twice — **`gemini-2.5-flash` 404s** and **no Pro-tier model is reachable on the free tier**. Default raised to **`gemini-3.6-flash`** on the strength of thinking tokens (every `*-flash-lite` spends 0; `2.5-flash-lite` answered a *Technology* readiness question in terms of revenue), with `gemini-3.5-flash-lite` as the documented escape hatch. **Citable, and it overturned the section's own premise:** old-vs-new ranked the two startups **backwards** on the lite tier (gap −0.17 vs +2.28), so the defect was **differentiation (Objective 2), not leniency (Objective 4)** — and grounding did not improve (0/9 invented on both models), so **no Objective 1 gain can be attributed to the model change**.

**RAG pipeline (2026-07-27, PR #10).** Before this `vector_embeddings` had never held a row and `RagQueryService` searched a `source_type` nothing writes, so every call returned `lowConfidence: true` and prompts were "grounded" in nothing. `EmbeddingService` (`gemini-embedding-2`, **768 dims** — pgvector refuses to index above 2000) plus a boot-time backfill, ranked with pgvector `<=>` in SQL; a startup can no longer retrieve its own capsule proposal as corroboration. **Citable:** similarity floor **0.78** from `calibrate-similarity.js` (a first guess of 0.70 leaked 78% of cross-domain pairs, and the distributions genuinely overlap, so this is a trade-off rather than a boundary), and semantic **76%** precision against keyword's 56% while returning *fewer* documents.

**Security P0 (2026-07-27, PR #15).** `JWT_SECRET` no longer falls back to a string committed to a public repo — `requireJwtSecret()` throws at boot — and the frontend check had to go at **module scope**, because at the point of verification it sits inside a `try` whose `catch` redirects to `/login`, so a misconfigured deployment would have presented as "your password is wrong". **Eleven controllers were reachable with no credentials, not the four recorded** — including `POST /ai/baseline/update`, which rewrites the distribution score normalization measures against. Guarding them alone would have broken the whole UI: `axiosInstance` sent **no credentials of any kind**, and the three components that *look* authenticated hardcoded a Django SimpleJWT token that expired 2024-09-06.

**Verified-knowledge RAG corpus (2026-07-28, PR #13).** 64 rows seeded idempotently — 54 readiness-rubric (9 levels × 6 dimensions) + 10 business-framework — across three retrieval channels, rubrics keyed deterministically by default. **A real defect found and fixed (`91da49d`): `buildGroundedPrompt` printed retrieved docs as id/similarity/metadata and never emitted their `content`, so retrieved text was never reaching any prompt** — it predates the corpus work and would have silently defeated it. Live-verified: a real assembled prompt carries the rubric section verbatim, and `AI_RAG_CORPUS_ENABLED=false` removes it.

> **Corpus provenance — the honest limit on any Objective 1b claim, and it must be attached every time.** Every row carries a `provenance` field. Of the 54 rubric rows: **9 (Technology/TRL) are transcribed from a public standard** (EU Horizon Europe TRL, consistent with ISO 16290:2013); **36 (Market/Acceptance/Organizational/Regulatory) are authored against BRLa's (2021, *Technological Forecasting and Social Change*) published dimension framework** — not transcribed, because BRLa defines dimensions and criteria, not nine numbered per-level descriptions; **9 (Investment/IRL) are authored outright**, IRL appearing in neither BRLa nor any cited standard. The 10 framework rows split 3 framework-derived (Osterwalder & Pigneur, Maurya, Blank) / 7 authored. **So only 1 of 6 scored dimensions has externally-sourced level text.**

**Corpus close-out (2026-07-28).** `docs/SRS.md` and `docs/SDD.md` were **deleted, not corrected** — 18–19-line in-repo summaries that disagreed with the source PDFs on the first fact a reviewer checks (`docs/SDD.md` listed six dimensions including IRL; the real documents specify five, no IRL). 13.7 MB of capstone PDFs committed by accident were removed with `git filter-branch`. ⚠️ **Open, and it shrinks the headline:** `inspect-prompt.js` surfaced that the **business-framework channel returns 0 rows in practice** — always semantic, top-2 never clears the 0.78 floor — so "64 rows grounding the model" is really 54. Not a regression; it has never worked otherwise.

**Grounding measurement, first runs (2026-07-29 → 2026-07-30).** The harness was restructured so reps are the *outermost* loop — it had iterated arm → startup → rep, consuming a 20-call budget entirely inside the baseline arm and leaving every between-arm metric at n=0 — with `--out`/`--merge` and a refusal path when model, corpus or floor differ. **The most valuable finding was free: `baseline` and `sdd-semantic` send byte-identical prompts** (semantic rubric retrieval returns 0 rows), making the pair an accidental null control — and at `temperature: 0` it still differed on 8 of 12 per-dimension levels. The probes were then redesigned around two confounds in production's `createBasePrompt`, and 49 measurement tests were added where there were none; review caught seven defects, six of them in the spec rather than the implementation and five found by mutation testing rather than reading.

**Reps 2 and 3 (2026-08-03).** Rep 2 showed the corpus arm's per-dimension deltas were **reproducible, not noisy**, which retracted the standing "54 rubric rows destabilise placement" hypothesis — systematic displacement, not instability. Rep 3 lost a call to a transient **503**, exposing that **metric 3 cannot resolve these arms**: the byte-identical control pair spans 1.67–3.33 gap points across three reps, wider than the effect being measured, and an unbalanced pool biases the corpus arm in its own favour. Both harness gaps were closed TDD-first — `--only-arm=`/`--only-startup=` (refilling one cell costs 2 calls, not 12) and a bounded 503 retry that **never retries 429**.

**Three streams (2026-08-04).** Output validation (1c, PR #18) and sector-aware weighted scoring (2b, PR #19) merged; the grounding volume ladder did not. **1c is a length-and-confidence validator, not "full output validation"**, and it does not backfill — a `'validated'` status on a pre-existing row is *not* evidence the validator ran. **2b: `TierConfig.weights` was deleted rather than used**, being keyed per tier, so a startup crossing a boundary could see its composite *fall* as a dimension improved. Two findings that correct earlier framing: the ÷5 → ÷9 fix **narrows** differentiation (AgroLink/MediSync gap 44 → 24) and is a correctness fix, and **the measured sector effect is about one point**, so 2b is correctness and configurability, not a differentiation win.

**The ground-truth audit inverted Objective 1b (2026-08-05).** The session set out to recalibrate rubric rows and instead found the reference was wrong: metric 1 had scored placement against seeded `StartupReadinessLevel` rows — UI demo fixtures **contradicted by their own documents in ten of twelve cells** — and re-scoring the same calls reversed the direction. **Citable, against a reference fixed *before* the generations existed:** corpus **0.22 MAE / 36-36 within one rung against baseline 0.69 / 29-36**, read against a byte-identical null control whose own spread is 0.25 MAE, and the corpus arm is *exactly* right on Organizational/Regulatory/Investment where both corpus-free arms inflate. **The reference-free figure is the one to quote — baseline asserts evidence absent from the source document in 61% of checked placements, the corpus arm in 0%.** `src/demo-readiness-levels.ts` became the single source for the levels, and the O/R/I recalibration is **cancelled, not deferred** — those rows are now exactly right. **Methodological lesson:** a reference can be independent of the prompt and still be wrong — three reps agreeing in direction tested sampling noise, not the reference. **Limit that must travel with every figure: this is the levels probe, a harness construct — production never asks the model to assign levels.**

**Supplied-level fabrication probe (2026-08-06), classifier repaired and re-run (2026-08-09, PR #24).** Closed the gap that every grounding number was the *levels* probe: `--level-condition=truth|inflated` inflates O/R/I while T/M/A stay at truth as a within-call control. **Citable (re-run, 16/16 calls, n=2): only corpus+inflated fabricates — `deviation-deterministic` 3/12 (25%), baseline 0/12 under both conditions** — and all three clauses are one mechanism, IRL 3's funding plan asserted as drafted. **Quote the hand count, 6/12; the reported 3/12 is a floor**, and the known-uncaught classes are why that floor is trustworthy. **Organizational is the level-isolating cell** — identical rubric text with only the supplied level differing flips a recommendation into an assertion — which rules out "the corpus added new text" as the explanation. The repair was almost entirely on the **recommendation** side: 12 of 14 `unclassified` clauses were recommendations mis-binned, and **five specified assertion cues were all cut after review**, each failing because the artifact token is an attributive modifier rather than the head of its phrase (*"Investor interest exists"* and *"A basic funding plan exists"* are structurally identical), so **the assertion branch ships byte-identical**. Both pre-registered predictions were wrong, in opposite directions; AgroLink fabricated this time, closing 2026-08-06's open question.

---

## Compressed — 2026-08-18 → 2026-08-19

**SO 4.2 adversarial summary shipped and measured (2026-08-18, `feat/adversarial-summary`).** `generateStartupAnalysisSummary` runs a field-ordered `responseSchema` (`unmet_criteria` → `critical_risks` → `summary`) behind `AI_ADVERSARIAL_SUMMARY_ENABLED`, with the shipped prompt preserved verbatim as `LEGACY_SUMMARY_PROMPT`. **Citable (partial, 10/12 calls — two adversarial cells lost to 503 overload, not quota, deliberately not re-run):** baseline n=6 meanCritical 1, meanRatio 0.39; adversarial n=4 meanCritical 3, meanRatio 1.00, 4 unmet criteria and 3.75 critical risks against a baseline with **no criteria field at all** (`structural`, not a measurement). 100% schema adherence, so Gemini honouring `propertyOrdering` is now supported rather than assumed. **The scoring path was deliberately untouched, which is why 4b stays 🟡**; `reviewBiasScore` is *mislabelled, not misplaced* — its two call sites review an RNS target level and a roadblock risk number.

**The SO 4.4 flag rule replaced, then validated (2026-08-18, `fix/so-4-4-flag-threshold`).** `flagged = criticalCount === 0` **fired 0/10 in both arms** — the legacy prompt mandates a risk sentence, so every baseline summary scored exactly `criticalCount: 1` and **the rule could not fire against the prompt it exists to police**. Replaced with `flagged = ratio < 0.75`, the midpoint of a gap with no overlap (baseline `0.333 ×4, 0.500 ×2`; adversarial `1.000 ×4`); the old rule is a strict subset, so no detection was traded away. **Validated on held-out generations the same day: baseline 5/5 flagged, adversarial 0/4 — perfect separation**, and the old rule would again have fired 0/9. **Held out is the *generations*, not the documents**, and baseline ratio had zero variance, so this is robustness to resampling of a very stable prompt structure — the informative next test is a different prompt or a third document, not more reps. Exactly 0.75 counts as balanced by judgement, not measurement: flagging 3-of-4-critical would train Managers to ignore the flag.

**The verdict reached the Manager (2026-08-18).** `GET /startups/all` carries a `summaryVerdict`, rendered by one `SummaryToneBadge` in all four Manager dialogs. **The specified row-only design would have shipped an empty badge** — Neon holds zero `analysis_summary` rows, because persistence only runs for proposals created through `createStartupProposal` and both demo proposals were written directly by `seed-demo-full.js` — so it resolves recorded-row-first with a live recompute fallback and shows `source`. **What remained for SO 4.4 was an *action* on the flag, not its visibility** (closed 2026-08-23). Mutation testing changed the tests, not the code: two mutants survived a green suite because the tests covered baseline's **modal** ratio and not its **maximum** — **the value that constrains a threshold is the one nearest the boundary, not the most frequent.**

**Metric 3 rebuilt, parts 1 and 2 (2026-08-19, zero quota).** **The guard was itself the defect:** `separates = (critGap !== 0) || (unmetGap !== 0)` is an exact inequality over a mean of 1–3 small integers, with no noise floor and **no sign check — a PASS could be earned by differentiating backwards**. Both count columns are degenerate for different reasons (`criticalCount` ceilings at 3 in a three-sentence summary; `unmetCriteria` is structurally unbounded yet its means coincide), so the count verdict was **retired, not hardened** — hardening a rule over columns that cannot separate these startups only makes a broken instrument stricter. Replaced by `lib/field-overlap.js`: Jaccard overlap of normalised proposal-field sets, `crossOverlap` read against `withinOverlap` as an intrinsic noise floor. Two decisions carry its validity — **a Jaccard of two empty sets is `null`, never `1`** (else the baseline arm, which cites no fields at all, reports as maximally uniform on the strength of a missing schema field), and **normalisation is load-bearing** because `proposal_field` is a bare `STRING`, not an enum. **The margin was pre-registered before any generation it scores**; issuing no PASS/FAIL until then was John's call. ⚠️ **The harness that produced every published SO 4.2/4.4 number had zero tests before this** — 27 added, leaving `toneTable`, `criteriaTable`, `validity`, `sourceBreakdown` and `callDescriptors` still untested.

*Correction carried into both documents:* the 2026-08-18 claim that `unmetCriteria` came back "exactly 4 on all 8 successful adversarial calls" is **wrong** — six of eight are 4, with a 3 and a 5. The column is unsigned variance whose means coincide. The conclusion survives; the "convergent model behaviour at temp 0" reading does not.

---

## Compressed — 2026-08-20 → 2026-08-22

**Metric 3, part 3: the run (2026-08-20).** 10/10 calls, zero degradations, the first full grid this harness produced. **Verdict `FAIL - uniform`, quotable: `crossOverlap` 0.303, `withinOverlap` 0.612, `separation` +0.309, chance reference 3.2e-13** — with provenance as clean as it gets, the rule committed 2026-08-19 08:04 +0800 and the first call going out ~15:10 Manila the next day, in git. **The prediction was right in outcome and wrong in mechanism** (the third time on this project): FAIL was predicted *because* cross-overlap would be high; it came in **below** the band and separation **above** it. **What failed is the noise floor, not the signal** — complete separation fails on one *within* pair at 0.125, and split by startup **AgroLink reads 0.800 against MediSync's 0.424**, so one document is stable and the other is not, and **pooling the within-startup floor across both hid that**. A per-startup rule would have passed, which is exactly why re-scoring this run under one is the forbidden move; it stays an observation. **The positive result: the instrument is not degenerate** — the pre-registered "field identity is too coarse" failure mode needed `crossOverlap > 0.5` *and* `separation < 0.1`, and neither holds. Free n from identical fingerprints: SO 4.2 gains 10 calls (**3.9** mean unmet criteria, **3.2** critical risks) and `tone|adversarial` reads **0/10 flagged, ratio 1.00 on every call**. ⚠️ **Documentation hazard:** two different metrics are called "metric 3" — the grounding harness's differentiation *gap* and this harness's overcorrection *guard* — with opposite-looking sign conventions.

**A recorded bug that did not exist (2026-08-20).** The checklist's 🐞 *"a literal JSON `null` degrades with no `recordFailure`"* was **refuted by probe, no production change made**: it is 3 calls not 2, the corrective retry does run, and failures are recorded. The null branch is **unreachable at runtime** — `.nullable()` is a compile-time accommodation that was read as a runtime permission. Pinned by two characterization tests. **The mutation lesson sharpened here:** the first mutation landed and reported SURVIVED because it was *semantically inert*, so "assert the mutation landed" is necessary but **not sufficient — assert it changed behaviour.**

**The 🎯 demo-critical sweep, all eight cleared (2026-08-22, `fix/demo-critical-sweep`).** **21 files, 4 insertions, 7,188 deletions, and four of the eight were dead code rather than live breakage** — three separate features stranded mid-build, each with plumbing wired and no trigger (a form action with no `<form>`, a query with no panel, a dialog with no trigger). That produced the rule this project now applies first: **the recorded symptom is real, and nobody checked whether the code carrying it can execute — reachability first, then correctness.** **The `GEMINI_API_KEY` is fine** — `AQ.` is a valid AI Studio format, proven by a live `embedContent` probe returning 768 dims at zero generation cost; **keep that probe, it is the cheapest live auth test in the project.** Side effect: `svelte-check` fell **160/16 → 119/14**. **Verification lesson:** `grep -o "Error:.*"` matched nothing (the real output is `Error<ANSI>:`), so two commits were "verified" by a comparison that could not have failed — **a check that cannot fail is not a check.**

---

## Compressed — 2026-08-22 (cleanup sweep, mentor baseline, OCR)

**`chore/deferred-cleanup-sweep` (PR #30).** The one ⚠️ left by the demo-critical sweep — "re-save baseline scores, expect a toast" — had **no button to click**: the mentor form is gated `{:else if isRated()}` and both demo startups already have all six rows. **The "zero-risk" procedure was the opposite of zero-risk** — `baselineScores` initialises to all-`1` and is never seeded from stored rows, so had the form rendered, a Save without touching all six selects would have overwritten the 2026-08-05 measurement ground truth with `T1 M1 A1 O1 R1 I1`. The red suite also went green for the first time (266/266); the recorded conclusion held but its **mechanism was wrong** — `generateTasksFromPrompt` normalized unconditionally regardless of `scoreNormalization`, so a run stamped `false` still carried normalized values (fixed 2026-08-23). `chumcheck` purged — `reset_db.sh`/`.ps1` were a valid `DROP DATABASE ... WITH (FORCE)` against a local superuser — and the branch list swept 23 → 3.

**The save verified live, and found a bug the probe alone could catch.** A throwaway startup took six *distinct* values (`T7 A2 M5 O8 R3 I6` — uniform values cannot detect dimension mis-mapping) through six real `201`s. 🐞 **The first save flips `isRated()` permanently**, so the upsert's **update** branch was unreachable from the app and a mistyped baseline score could only be fixed by SQL; the naive re-expose fix was unsafe on its own because of the all-`1` default (fixed 2026-08-23). ⚠️ **`GET /readiness/:startupId` writing on every read reproduced incidentally** — two page views left two `readiness_evaluations` rows and 12 dependent `readiness_gaps`, so the §2 item is confirmed real, not theoretical.

**`fix/ocr-transcription-preference`.** Two defects: `parseCapsuleProposal` stored **Tesseract's** transcription rather than Gemini's — the guard was the inverse of its own comment, so Gemini's `raw_transcription` reached **no consumer anywhere in either app** — and `fieldConfidence` was `text.length < 40`, which graded compliance with the extraction prompt's own 40-character instruction rather than accuracy. `detectSketch` deliberately still reads Tesseract's output, its weights being tuned to it. **Live-verified** with synthetic handwriting: 4/4 present fields scored `verified`, 4/4 inferred fields `low` — **n=1, one document, and a font is not handwriting**, so this proves the wiring, not accuracy. `SUPPORT_THRESHOLD = 0.5` remains a guess until 3c runs, and **3c is blocked on both the ten handwritten samples and a SUS instrument the team owns** — not the samples alone. Two same-day claims corrected in place: the entropy gate is **not** inert (same page, PNG scores 3.33 and is rejected, JPEG 5.89 and passes — it bites digitally-clean images, camera photos survive on sensor noise), and `@google-cloud/vision`'s absence was verified by runtime `import()`, not by reading `package.json`.

**URAT and calculator steps rendered blank.** Both question tables held 0 rows — the 18 URAT + 35 calculator questions lived only inside two `AppService` generators whose only callers were commented out, so the data died in the 2026-07-26 wipe and was never restored. **Silent because both endpoints answered `200` with `[]`.** Banks extracted to `src/assessment-questions.ts` and seeded on boot guarded on emptiness (the original loop had no guard — a second run would have shown every applicant each question twice); verified at three layers. **Found and logged, not fixed:** `@Controller('readinesslevel')` has no class-level guard and its only caller sends no credentials, so guarding one without the other repeats the PR #15 trap (`TODO_CHECKLIST.md` §2, still open).

**A live 503 became confident garbage, exposing a circular confidence rule.** Vision returned **503 UNAVAILABLE** (not 429/quota — the two must never share a code path) → swallowed by `catch` → Tesseract mangled the handwriting → a second Gemini call extracted fields from the mangling → `solution_description` scored a support ratio of **1.00** against the garbage it came from and rendered green. On the vision path field and transcription derive independently from the image; on the Tesseract-fallback and PDF paths the model is scored against the very text it extracted from, so overlap is guaranteed. **Three TDD fixes:** a *required* `EvidenceSource` (`derived` caps at `low`, required rather than defaulted so a forgotten argument cannot silently restore the bug); `src/ai/retry-transient.ts` (3 attempts, never retries 429, ported from `measure-grounding.js`, which has had it since 2026-08-03 — the harness was more robust than the app it measures); and a `ServiceUnavailableException` that writes no `ocr_documents` row and reaches the user with the real message. **Not verified live** — a real 503 cannot be forced without editing `.env`, so the retry and fail-loud path are test-proven only.

**Open from this date, tracked nowhere else:** `readiness_evaluations` holds mixed-scale rows (pre- and post- the ÷5→÷9 composite correction sit in the same table, uncorrected); Neon TLS certificate verification is disabled; VS Code's `git.postCommitCommand` setting is unresolved.

---

## Compressed — 2026-08-23

**The three linked controls (PR #33, zero Gemini calls).** Three signals computed correctly and then ignored, each hiding a second defect only a live check could find. (1) The 4c flag now gates the paths it names — `generateRoadblocksFromPrompt` carried the identical defect and was on no list — but **both normalization outputs have zero live consumers, so this is provenance-correctness only; do not present it as a user-facing fix.** (2) A mentor-only "Revise baseline scores" button, live-verified with six distinct values: Technology 7 → 4 updated row 20 in place, count still 6. (3) SO 4.4 gained an action — approving a flagged application requires an acknowledgement recorded in `activity_logs`, **enforced in `approveApplicant`, not the dialog**, because the route takes a client-controlled body and a disabled button is not a control. Live: flagged and unacknowledged returned **409** with status still PENDING and 0 log rows; acknowledged qualified with exactly 1; a balanced summary (ratio 0.800) approved unblocked. **Two defects promoted to standing notes**, both of which passed green tests: a missing `populate` meant the gate silently never fired and the first live request approved a flagged application, and a guard using `JSON.stringify(obj, keysArray)` compared `{}` to `{}`. **Still open:** the failure toast was never observed; the acknowledgement is per-approval, not per-session, and untested across a reload; and the audit trail's `action: 'Manager'` is an assumption, not an enforced fact — `approve-applicant` is `JwtGuard`-only, so any authenticated user can call it.

**Metric 6 built, then run (`feat/rna-redundancy-probe` — 20 commits, local, unmerged, no production code touched).** Metric 6 measures the gap every 1b figure names: production consumes mentor-set levels and generates recommendations rather than assigning levels, so this scores generated text directly — does the RNA recommend acquiring an artifact class the source document already evidences. **The pilot caught the metric firing almost entirely on false positives:** run free against 96 stored observations it fired 10 times and a hand-read found essentially all 10 false, and **the uncorrected headline would have read baseline 21% vs corpus 0% — large, quotable, wrong, and favouring the corpus specifically.** Fixed with an acquisition-verb requirement anchored directly against the token; re-run **0/96**, which is **pilot confirmation, not precision — the metric has never produced a true positive on real generated text.** Code review closed eight further defects before any quota was spent, including a missing honesty column and a `--merge` refusal that printed but never enforced.

**The run is void as a model result (2026-08-23 evening, 12/12 calls, clean).** `redundantRate` is **0 in all six arm × condition cells**, and **the pre-registered positive control never fired**, which by the rule written beforehand voids the run; prediction 2 became untestable as a consequence. **The pre-registration's own inference from a failed control was itself wrong and was corrected in `measurement/README.md` rather than quietly revised** — it said a failed control "reports a detector problem", but the generated text shows every arm producing forward-looking recommendations correctly anchored to the source, so the manipulation never induced the target behaviour and the detector had nothing to catch. That is a different failure from a blind detector, and the two must not be conflated. **The narrow claim this supports: the model did not make this error in these 36 observations** — not that the detector works. `mentioned` equals `unclassified` in every cell, so no clause ever reached a `recommended` verdict for the gate to act on. The two named uncaught classes (passive/postposed acquisition; acquisition verbs outside the frozen list) remain untested. **Next: a stronger manipulation, or a document/level pair whose rubric criterion is unambiguously already met — pre-registered before it runs.**

---

## Compressed — 2026-08-25 (deployment, RNA dimension picker)

**First deployment of this codebase** (PRs #35–#37, `b93e213`): backend on Render
free, frontend on Vercel; the live `launchup.vercel.app`/`launchup.onrender.com`
pair is the *previous team's*. Four failures, each with a lasting lesson:
`NODE_ENV=production` makes pnpm skip devDependencies (`pnpm install --prod=false`);
`pnpm start` points at `dist/main` while `nest build` emits `dist/src/` — worked
around in Render's dashboard, **`package.json` is still wrong** (TODO §4); no shell
on Render free, so corpus seeding moved into the build command (safe only because
the seeder is idempotent); deleting `frontend/vercel.json` dropped a load-bearing
`NODE_VERSION=20` pin, resolved by moving to `adapter-vercel@6`.

**The cross-domain cookie could never have worked, and `sameSite` was never the
obstacle.** A browser picks cookies by destination host, so nothing held for
`vercel.app` can reach `onrender.com`; locally both apps are `localhost` and
cookies ignore ports, so the mismatch cannot appear in development. Fixed with a
same-origin proxy route swapping the cookie for a Bearer header (19 axios callers,
49 fetch sites); `sameSite` reverted to `'strict'`.

⚠️ **Unresolved:** `getData(url, access)` serialises the raw JWT into the page
payload, so any XSS reads it out of hydration data — the httpOnly cookie is partly
defeated. Tracked in TODO §1. Also still open: `debug: true` logs SQL parameter
values to Render, and `main.ts` re-seeds demo data on every redeploy.

**Midterm framework decided:** TAM primary, SUS and task success/time-on-task
supporting, with the measurement harness presented as a separate output-quality
layer. System type is business/organisational workflow tooling. **The SPMP and the
traceability matrix are both at zero** and compete for the same weeks as the
30-user study.

**Mentor-selectable RNA dimensions** (`feat/rna-dimension-picker`): 
`GET /rna/:id/generate-rna?readinessTypes=` regenerates named dimensions whether or
not they already have an RNA; omitting it keeps gap-fill. All selected dimensions
go out in **one** Gemini call. Unknown types 400 before `aiRunService.track()`, so
no orphan run rows. **Deploy backend before frontend** — the reverse silently
gap-fills instead of regenerating. Live-verified: RNA rows 9 → 11, one
`ai_generation_runs` row, three 400s created zero rows.

Two lessons worth more than the feature. **The vite dev proxy could never have
confirmed anything** — it forwarded `/api` to port 3001 while Nest serves 3000, and
vite's `server.proxy` runs ahead of the SvelteKit handler; repointing it to 3000
would have been the *wrong* fix, since it skips the route's cookie-to-Bearer swap.
The block was deleted. And **a bug I reported did not exist**: a `CheckboxItem`
dropdown appearing to leave the page unclickable was the Browser pane's tab not
compositing, so bits-ui's `animationend` never fired. It reproduced on untouched
master, which felt like proof — but both were observed through the same instrument.
*Reproducing on unmodified code rules out your change, not your instrument.* All of
it was reverted.

⚠️ **`pnpm lint` rewrote 107 backend files** over the CRLF conflict, including
untouched lines inside edited files. Use `npx eslint --no-fix src/<path>`, judged
against a baseline of ~291 errors on an untouched file, not zero.

---
## 2026-09-04 — LaunchUp has three roles

**Merged as PRs #47–#50.** Role branch tested by John before merge. Started as "can we remove the Admin role", ended with the role model matching the spec and the startup module's access rules made real.

### The finding that drove it

The capstone documents already said Admin should not exist. **SRS §2.3 defines three user classes** — Startups, Mentors, Managers — and calls Managers *"Administrators overseeing the platform and the incubation program"*. **SDD §1.4 requires *"Manager role requirement for all administrative functions"***. The fourth role was drift inherited from the prior team, so removing it **closed** a spec deviation rather than creating one. It also contradicted a stored memory claiming four roles were intended, since corrected. Manager already had most of it: ten `isPrivileged` sites read `Manager || Admin`, and the genuinely Admin-only surface was three controllers plus three assessment writes.

### What shipped

**Admin removed.** `AdminGuard` gates on `Role.Manager` and keeps its name — it is named for the `/admin` surface, and the checklist wants it generalized into a `RolesGuard` later. `/manager-login` replaces `/admin-login`, `/login` turns Managers away, and both verify the JWT signature with `jose` through a shared `lib/server/auth.ts` — **closing the unverified-`atob()` item in checklist §1**. Added the two missing `deleteUser` guards (no self-delete, last Manager protected) because every Manager can now reach that endpoint.

**`Manager as Mentor` removed.** ARCHITECTURE.md called it "presentation-only", which was true of the JWT — but it was **the only route by which a Manager reached rubric rating and member management**, because those gates named the pseudo-role rather than the role, so deleting it naively would have stripped both from every Manager. The gates now name `Manager` directly. `isMentor` became **`canRateReadiness`**, and `ReadinessAssessmentForm`'s `isMentor` prop became **`isRater`**.

**Managers hold full capabilities** — John's product decision. Where the SRS and SDD describe a Manager surface as read-only, as SDD's "Startup Capsule Proposal Viewer" does, the documents get revised rather than the code. Recorded in ARCHITECTURE.md §2 so the deviation reads as deliberate.

**The startup module's IDOR, closed.** Every detail endpoint was `JwtGuard`-only: any authenticated account could read or rewrite any startup by changing the id in the URL. `canAccessStartup` (`startup/startup-access.ts`) now guards twelve routes; `/all` and both rankings moved to `AdminGuard`. Read and write share one rule deliberately — there is no startup a user may read but not act on. This matters past access control: **the capsule proposal is the source document the grounding and RNA measurement runs read, and `measurement/` keeps no document versions**, so a foreign write moves ground truth under every past result.

**Tier seeding.** `tier_configs` had no seeder at all — every database held zero rows while `/admin/tiers` showed "No tiers configured" and scoring silently applied a hardcoded fallback ladder. Ladder and seed list are now one constant, `SEED_TIER_CONFIGS`; the seeder is **create-only**, so a Manager's edited thresholds survive a reboot.

### Verified live against Neon

`admin@launchup.local` converted to Manager on boot — `main.ts` runs the `UPDATE` before `updateSchema()`, because auto-sync rather than the migration is what shapes these databases, and tightening `users_role_check` fails while an Admin row survives. Manager refused at `/login`; Startup refused at `/manager-login`; Startup gets 403 from the admin API. A plain Manager with no cookie reaches rubric rating and member management. Tier rows seeded and rendered.

**The mentor id sweep is the session's cleanest evidence:** 200 on exactly the four startups they are assigned to, **403 on two that exist but are not theirs**, 404 where nothing exists — the boundary falls precisely on the assignment set.

Backend **336/336**; frontend `pnpm check` **117 errors / 43 files**, below the previous 119/44 baseline on master.

### Three process failures worth not repeating

**`pnpm format` reformatted the entire repo** — 106 files changed for real, ~300 more churned to LF. This is checklist §4, and it fires on `pnpm format` as well as `pnpm lint`. A lint failure then broke a command chain before its `git stash pop`, leaving the real work stashed and tangled with the noise; recovered by resetting and re-applying ~18 edits by hand. **Format named files, never the tree.**

**Predicted a trap and walked into it anyway.** `header.svelte`'s submodule branch builds startup-scoped hrefs (`/module/:startup/:link`); that was flagged before starting, then the `subModule` key was used regardless, producing `/admin/undefined/users`. `admin` is now excluded from that branch the way `account` already was.

**The branch drifted out of scope by consent.** `feat/remove-admin-role` accumulated tier seeding and IDOR remediation — every step approved, none of it about the Admin role. John caught it, not Claude. Split into four branches afterwards, and `docs/branch-scope-rule` adds the rule to CLAUDE.md: permission to do a thing is not permission to do it *here*.

### Known limits, recorded rather than fixed

- An unauthorized startup returns **403** and a nonexistent one **404**, so the pair still discloses which startup ids exist. Existence is checked before authorization because the rule needs the row.
- The empty-state copy fix — Managers saw "Something went wrong..." on four AI-artifact pages — is **code-reviewed only**. The branch was not reachable in this data.
- `b73caef` stayed mixed through the split: its capsule-proposal write guard is security work sitting inside a role-branch commit.

### Still open

- The per-startup reads in `rna`, `rns`, `initiative` and `roadblock` are **unguarded** — deliberately scoped out; they are the pages most likely to break subtly and need their own verification pass.
- The generalized **`RolesGuard` + `@Roles(...)`** the checklist asks for was not built. What exists is a service-level assertion called from controllers, because the rule needs the startup row before it can decide.
- **A Manager can edit a founder's capsule proposal** — now deliberate, but the SRS and SDD still say read-only and need revising to match.
- Both production-hygiene items from 2026-08-25 remain: `debug: true` logging SQL parameter values to Render, and the boot seeder re-seeding demo data on every redeploy. The tier seeder is a third boot-time writer, though it self-skips.

### Next step

**Deploy.** Render and Vercel still run the four-role build. The boot conversion handles existing `Admin` rows, but **any JWT already issued with `role: 'Admin'` is refused after deploy** — those sessions must re-authenticate at `/manager-login`. Deploy **backend first**. Then revise the SRS and SDD wording that the capsule-proposal decision now contradicts. The midterm critical path is unchanged: the SPMP and the traceability matrix.

---

## 2026-09-04 (later) — metric 6's void run re-read, and a second design

Branch `docs/metric-6-manipulation-design`. **Zero Gemini calls.** Deployment
of the three-role build to Render and Vercel was done by John before this
session.

### The finding: the record was wrong about its own run

The 2026-08-23 metric 6 run was declared void because its `deflated` positive
control never fired. The README's reading of that was that no clause ever
reached `recommended`, so the run could not separate "the model never made this
error" from "the classifier cannot read these constructions."

Re-scoring the stored text through the same `lib/redundancy.js` reproduces all
four recorded columns exactly — which pins the code — and shows **4 clauses
binned `recommended` and then downgraded to `scoped` by the acquisition gate**:
1 in `baseline`/truth and 1 in each arm's `deflated` cell, every one the
*"needs to move **from paper prototype** to…"* shape, every one a correct
rejection. The same run's metric-5 output holds 14 `recommended` clauses.

So the classifier reads the model's register and the gate acts on real verdicts.
**The ambiguity resolves in favour of the model never making the error.** Only
the true-positive path is still unproven.

**Why nobody saw it:** `scoreRedundantNeeds` computes `scoped` and nothing
aggregates, prints or persists it. A gate whose rejections cannot be counted
cannot be audited — reporting `scopedCount` is now a prerequisite of the next
run.

### The methodological error, named

The void rule collapsed two separable questions: *can the detector see the
behaviour* (code and register — testable at zero quota) and *does the condition
induce it* (model — only testable by spending calls). Collapsing them let a
well-behaved model void a run, and made the pre-registration's own stated
inference ("reports a detector problem") wrong.

### The second design, pre-registered

`docs/superpowers/specs/2026-09-04-metric-6-salience-manipulation-design.md`.
Unimplemented, unrun.

- **Split control.** A blocking zero-quota detector control built from the
  model's *own* clauses minimally mutated into redundancy — paired, so the
  mutant must fire and its original must not. Then a manipulation check whose
  failure reports a narrow model result rather than voiding anything.
- **`unlabelled` documents, not another level manipulation.** `deflated` failed
  because the level never overrode the document: both source documents label
  every fact (`Target Market:`, `Revenue:`), and `Target Market:` names the very
  artifact the rubric asks for. Redundancy needs the artifact **evidenced but
  not salient**, which is a document property. The variant keeps each evidence
  phrase byte-identical, deletes its label, and machine-asserts fact
  preservation (numerals, dates and proper nouns as a multiset) so the variant
  cannot be authored into producing the effect.
- **A stopping rule.** If the detector control passes and `unlabelled` still
  yields 0 on every arm, metric 6 is **retired** — the end metric 3 was given —
  rather than re-manipulated indefinitely.
- **Cost:** 12 calls, one quota day. Nothing runs until the zero-quota gates are
  green.

### Also this session

`measurement/README.md` compressed (own branch, `docs/trim-measurement-readme`).
No measurement result, command, caveat or number removed.

### Open

Unchanged from the last session: the per-startup reads in `rna`, `rns`,
`initiative` and `roadblock` are unguarded; the generalized `RolesGuard` was not
built; `debug: true` still logs SQL parameter values to Render and the boot
seeder still re-seeds demo data on every redeploy.

### Next step

Implement the metric 6 design, or take the midterm critical path — the SPMP and
the traceability matrix — which competes for the same weeks as the 30-user
study.

---

## 2026-09-05 — metric 6 built, run, and retired on its own rule

Branch `measure/metric-6-salience`, local and unpushed. **12 Gemini calls.**
Everything the 2026-09-04 design pre-registered was implemented at zero quota,
every gate came up green, the run was spent — and it retired the metric.

### What shipped

- **`scopedCount` + persisted `scopedClauses`.** The acquisition gate's rejections
  were computed and dropped, which is exactly why the 2026-08-23 finding sat unseen
  for eleven days. Derived in the harness rather than added to `lib/redundancy.js`,
  whose source is hashed — a field there would have refused every historical pool
  for a reporting change that alters no verdict.
- **G1**, a blocking zero-quota detector control (`lib/g1-cases.js`): every clause
  the scorer bins `recommended`/`scoped` across three stored runs, each paired with
  a mutant swapping the progression frame for an acquisition frame. Provenance is
  machine-checked against the result files; mutants must name the same token.
- **`unlabelled` variants** with both machine checks, **`--doc-variant`** hard-
  failing before any network call, and **variant-only fingerprint keys**.

### G1 passes, with two bounds that must be quoted with it

11/11 pairs mutant-fires / original-silent; both expected-silent cases silent.
Mutation-tested: 4 mutants, **3 killed**. The survivor is recorded, not patched —
removing the `PROGRESSION_VERB` veto changes no G1 verdict because it is the sole
silencer on zero cases, the model having written the origin frame with a
preposition every time. G1 establishes nothing about that regex.

**Amendment 1**, recorded in the design file before any call: the "at least 2
startups" clause is struck. All 11 harvestable clauses are AgroLink PH — MediSync's
six are descriptive (*"acceptance is demonstrated by…"*), never the recommendation
register. ⚠️ **G1 therefore validates the detector against AgroLink's register only,
while half the run's observations will be MediSync — whose descriptive register is
precisely what `unlabelled` aims to move.** G1's blind spot sits where the
manipulation acts.

### The database has 12 startups; the harness uses 2, and that is right

John asked why. Ten of the twelve are thin intake records — `historical_timeline:
[]`, `intellectual_property_status: "Pending AI Generation"`, `members: []`. They
evidence a target market and nothing else, so they cannot supply the Technology or
Acceptance evidence all 11 G1 clauses live in. And G1's cases are the model's *own
generated text*: a new document yields zero cases until quota is spent generating
for it. Adding one also moves all 45 fingerprints, since `common.startups` is
hashed into every key. Two quota days and forfeited pooling — declined, recorded.

### Five of six cells

⚠️ AgroLink/Market cannot be manipulated: its evidence phrase *includes* its own
field label, so "byte-identical" and "label deleted" are mutually exclusive. It
stays labelled as an accidental within-document control and must not be read as a
manipulated observation. One confound: MediSync's Acceptance evidence shares a
sentence with an Organizational fact, so that fact is unlabelled as a side effect —
it cannot reach metric 6, but metric 5's `unlabelled` numbers carry it.

### Verified without quota

All 45 stored fingerprints byte-identical (30 variant keys added). Re-scoring
2026-08-23 reproduces its six original rows exactly. The historical merge refusal
list is byte-identical to before. `--dry-run` prints `G1: pass` and the two RNA
prompts differ in exactly the document lines. A typo'd `--doc-variant` exits 1
before any network call. **358/358** measurement tests.

### Also worth knowing

A doc de-duplication fell out of this: both documents now live once, in
`ORIGINAL_DOCS`. `audit-ground-truth.js` used to regex-scrape the template literal
out of the harness source — which also returned *raw* source, so on a CRLF checkout
the audit read documents with `
` while the harness parsed the same literal to
`
`.

### The run, and the retirement

**12/12 calls, 72/72 dimensions, no 429s, no 503s, no retries**
(`results/2026-09-05-rna-salience.json`). **`redundantRate` is 0 on every arm under
both `original` and `unlabelled`.** Prediction 1 (G2 fires) failed; prediction 2 is
untestable as a consequence. **The stopping rule fired: metric 6 is retired.**

**The manipulation was delivered, and that is what makes the null worth having.**
Of 36 (startup, dimension) pairs, **0 are byte-identical** across variants, mean
word overlap **0.44**. The model wrote materially different text under the
manipulated document and still never asked for an artifact the document already
evidenced — every clause naming a satisfied artifact describes it as achieved
(*"having tested a paper prototype…"*, *"gained user acceptance across 6
facilities…"*). Both `scoped` clauses are `original`; under `unlabelled` the model
did not even write the progression construction the gate exists to reject.

⚠️ **The only sentence this run licenses** is *"the model did not make this error
under this manipulation, in these 36 observations per variant."* Not "the detector
works" — G1 is a bound, AgroLink-only, with `PROGRESSION_VERB` untested. Not "the
model is robust" — n=1 rep, two documents, one model, one quota window, two
uncaught classes still untested. **Metric 6 produced no true positive on any real
generated text across its whole life** (96 + 36 + 72 observations). What it did
establish: the acquisition gate rejects the progression frame correctly, 6 for 6.

### Next step

Metric 6 is closed, so the measurement track has no open item. The critical path
is the SPMP and the traceability matrix, which compete for the same weeks as the
30-user study.

### Open

Unchanged: the per-startup reads in `rna`, `rns`, `initiative` and `roadblock` are
unguarded; no generalized `RolesGuard`; `debug: true` still logs SQL parameter
values to Render; the boot seeder still re-seeds on every redeploy.
