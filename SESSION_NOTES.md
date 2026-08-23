# Session Notes

Chronological, oldest first. Sessions older than the last three are compressed to outcome only — see `TODO_CHECKLIST.md` for the live backlog and `measurement/README.md` for measurement detail.

---

## Standing operational notes

Cross-session gotchas. These cost real time when rediscovered.

- **Never run `pnpm build` while `pnpm dev` is watching.** Both write `dist/`; the race leaves the server unable to resolve its own modules. `pnpm test` is safe (ts-jest doesn't touch `dist/`).
- **Green mocked tests have repeatedly coexisted with broken reality here.** The boot-time embedding backfill failed on every startup; deleting `TierConfig.weights` broke `seed-dummy.ts` so `pnpm dev` wouldn't compile — both with a green suite. Exercise the real path: `preview_start` + `preview_logs`, or `NestFactory.createApplicationContext`. Run SQL against Neon inside `begin`/`rollback`.
- **Gemini free tier: 20 generation calls/day on `gemini-3.6-flash`, window resets 15:00 Philippine time** (midnight US Pacific). A run started before 15:00 draws on the *previous* window. One UI generation fans out into several calls — budget 3–5/day, not 20. 429s surface in the backend terminal, not the browser. Embedding has a separate 100/min quota.
- **`pg` is not resolvable from `backend/`** (pnpm-isolated under `@mikro-orm/postgresql`). Use `MikroORM.init(require('./dist/src/mikro-orm.config').default)` + `orm.em.getConnection().execute(sql)`. Tables are **pluralised**: `startups`, `startups_readiness_level`, `rag_contexts`, `rag_retrieval_logs`.
- **`nest build` emits to `dist/src/`, not `dist/`** (because `seed-dummy.ts` sits at the backend root). `seed-admin.js` and `seed-demo-runner.js` hardcode `./dist/` and are broken.
- **`mikro-orm.config.ts` hardcodes `entities: ['./dist/**/*.entity.js']`.** A build emitted anywhere else still loads **stale** entities from `dist/`, silently. Any probe compiled to a scratch dir must override `entities`, or it is measuring the last build — this produced a convincing false negative once (a new property read as "not in metadata").
- **To browser-test as any role without the login form:** `POST /auth/signin` for a token, then set it as the `Access` cookie via `javascript_tool` (`document.cookie`). `hooks.server.ts` verifies that cookie locally with `jose`, so no backend round-trip and no form automation is needed. The form itself still resists automation.
- **Dark mode is class-based** (`html.dark`, mode-watcher) — `prefers-color-scheme` does not drive it, so a devtools colour-scheme toggle proves nothing. Toggle the class.
- **`pnpm lint` runs `eslint --fix`** and rewrites the whole tree over a CRLF/prettier conflict (checklist §4). Check `git status` before committing after anyone runs it.
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

---

## Compressed history — 2026-07-26 → 2026-08-09

**AI pipeline config and run provenance (2026-07-26, PR #7).** `AiConfigService` resolves `{model, temperature, grounding, rag, biasReview, scoreNormalization}` from env, with a Manager/Admin-gated `X-Ai-Pipeline-Config` override; every generation opens an `ai_generation_runs` row and every artifact carries a `generation_run_id`, so runs are attributable to an exact arm. Score normalization was decoupled from bias review (two of four arms were previously unreachable). **Real bug fixed:** `temperature`/`maxOutputTokens` were passed at the top level of the `@google/genai` call, where the SDK silently drops them — every call had run at the API default, never at the configured `0`, so baseline results gathered before this are not sampling-comparable with results after.

**Four generation bugs (2026-07-26, PR #8).** `targetLevelScore` always `-1` (stale id→level map deleted); `generateRoadblocks` always returned `[]` (missing `push`); `requestedStatus` asymmetry in single-vs-bulk initiative generation; and AI-generated RNS invisible because both display surfaces filter `isAiGenerated === false`. **The RNA half of that last diagnosis was wrong and was reverted** — the RNA page has no display filter at all, and flipping the flag there erased the dialog's provenance label and made `addToRNA()` self-match and delete the row being accepted. `rna.service.ts` deliberately still writes `true`. All five display surfaces browser-verified.

**Database reset and reseed (2026-07-26).** Shared Neon data was throwaway; wiped after a full JSON backup to `Projects/Launchup/db-backups/` (with `restore-neon.js`). Dropped tables while **preserving the pgvector extension** — `DROP SCHEMA public CASCADE` would have taken it. New `seed-demo-full.js` adds what the boot seeder never created: the full 6×9 readiness grid, capsule proposals, 6 assessments (2 File-type). **Role separation corrected** — the boot seeder had staff accounts owning startups with no mentor attached; `main.ts` now seeds dedicated `Startup`-role founders and attaches `mentor@launchup.local`. Creation-only by design (`if (existing)` guard), so branches seeded before 2026-07-27 need `node seed-demo-full.js`. Verified on a genuinely cold throwaway Neon DB.

**Object storage — Supabase, presigned, private (2026-07-27, PR #9).** R2 ruled out (requires a card even on free tier). `DO_SPACES_*` → `S3_*` with `forcePathStyle`; presigned PUT + presigned GET against a **private** bucket, storing the object *key* not a URL — the DB wipe meant the secure option cost no migration. **Two bugs the tests caught that would have shipped silently:** the SDK signs a CRC32 checksum of the empty signing-time body (fixed with `requestChecksumCalculation: 'WHEN_REQUIRED'`), and `getSignedUrl` signs only `host` unless given `signableHeaders`, making the returned `Content-Type` requirement decorative. Verified end to end: presign → PUT → signed GET returns a byte-identical file, unsigned GET returns 403. **Dependency trap:** pin `@aws-sdk/s3-request-presigner` to the exact `client-s3` version or two copies of `@smithy/types` break the build.

**Model tiering (2026-07-27, PR #10).** Measured against the project's own key rather than trusting docs, and it overturned the plan twice: **`gemini-2.5-flash` 404s** ("no longer available to new users") and **no Pro-tier model is reachable on the free tier** (429 at 20s spacing = tier exclusion). Default raised to **`gemini-3.6-flash`** — the deciding measurement was thinking tokens (every `*-flash-lite` spends 0; 2.5-flash-lite answered a *Technology* question in terms of revenue). `gemini-3.5-flash-lite` is the documented escape hatch. Three previously untracked calls (`capsule_extract`, `analysis_summary`) now open runs, which is what made Objective 3's handwriting path visible to the study at all. **Old-vs-new measurement overturned this section's premise:** 2.5-flash-lite ranked the two startups *backwards* (gap −0.17 vs +2.28), so the defect was **differentiation (Objective 2), not leniency (Objective 4)** — and grounding did not improve (0/9 invented on both models), so no Objective 1 gain can be attributed to the model change. **Gotcha:** the capsule route has a legibility gate (≥1200×900, tail entropy ≥4.2) — a small test image silently proves nothing.

**RAG pipeline (2026-07-27, PR #10).** Before this, `vector_embeddings` had never held a row and `RagQueryService` searched `source_type = 'startup'`, which nothing writes — so it returned `lowConfidence: true` on every call and prompts were "grounded" in nothing. Built `EmbeddingService` (`gemini-embedding-2`, 768 dims) + `EmbeddingIndexService` with a boot-time backfill; both retrieval paths rank with pgvector `<=>` in SQL. Four things measured rather than assumed: `gemini-embedding-2` over `-001` (stays unit-normalised when truncated); **768 dims not 3072** (pgvector refuses to index above 2000, and the column was dimensionless); **similarity floor 0.78** from `calibrate-similarity.js` (a first guess of 0.70 leaked 78% of cross-domain pairs; the distributions genuinely overlap, so this is a trade-off, not a boundary); semantic 76% precision vs keyword 56% with *fewer* documents returned. A startup can no longer retrieve its own capsule proposal as corroboration.

**Security P0 (2026-07-27, PR #15).** `JWT_SECRET` no longer falls back to a string committed to a public repo — `requireJwtSecret()` throws at boot and trims (the old `||` accepted whitespace). The frontend check had to go at **module scope**: at the point of verification it sits inside a `try` whose `catch` redirects to `/login`, so a misconfigured deployment would have presented as "your password is wrong". **Eleven controllers were reachable with no credentials, not the four recorded** — including both `ai/*` surfaces, where `POST /ai/baseline/update` rewrites the distribution score normalization measures against. Guarding them alone would have broken the whole UI: the `Access` cookie is `httpOnly` and `axiosInstance` sent **no credentials of any kind**; the three components that *look* authenticated hardcode a **Django SimpleJWT token that expired 2024-09-06**. Fixed by extracting the token from the cookie server-side plus `withCredentials`. A second pass caught two dialogs using bare `fetch` (cross-origin, so `credentials: 'same-origin'` silently failed). **Still owed: one manual login + click-through** — browser automation could not drive the SvelteKit login form.

**Verified-knowledge RAG corpus (2026-07-28, PR #13).** 64 rows seeded idempotently by `RagCorpusSeederService`/`seed-rag-corpus.js`: 54 readiness-rubric (9 levels × 6 dimensions) + 10 business-framework. Three retrieval channels — rubrics (`deterministic` exact `(readinessType, level)` lookup by default), business frameworks (always semantic), peers. `AI_RAG_CORPUS_ENABLED` gates the first two independently. **A real defect found and fixed (`91da49d`):** `buildGroundedPrompt` printed retrieved docs as id/similarity/metadata and never emitted their `content` — **retrieved text was never reaching any prompt**, regardless of what retrieval returned. That predates the corpus work and would have silently defeated it.

> **Corpus provenance — the honest limit on any Objective 1b claim, and it must be attached every time.** Every row carries a `provenance` field. Of the 54 rubric rows: **9 (Technology/TRL) are transcribed from a public standard** (EU Horizon Europe TRL, consistent with ISO 16290:2013); **36 (Market/Acceptance/Organizational/Regulatory) are authored against BRLa's (2021, *Technological Forecasting and Social Change*) published dimension framework** — not transcribed, because BRLa defines dimensions and criteria, not nine numbered per-level descriptions; **9 (Investment/IRL) are authored outright**, IRL appearing in neither BRLa nor any cited standard. The 10 framework rows split 3 framework-derived (Osterwalder & Pigneur, Maurya, Blank, each citing a named work) / 7 authored — market sizing and unit economics were retagged to `authored` after review found their citations named no framework at all. **So only 1 of 6 scored dimensions has externally-sourced level text.**

**Corpus live verification and close-out (2026-07-28).** Booted clean; a real assembled prompt contained `--- Verified Readiness Rubrics (authoritative) ---` with TRL 2 and TRL 3 verbatim, and `AI_RAG_CORPUS_ENABLED=false` removed the section entirely. Re-seeding reported all-unchanged. **`docs/SRS.md` and `docs/SDD.md` were deleted, not corrected** — 18–19-line in-repo summaries that disagreed with the source PDFs on the one fact a reviewer checks first (`docs/SDD.md` listed six dimensions including IRL; the real documents specify five, no IRL). 13.7 MB of capstone PDFs were committed by accident and removed with `git filter-branch`; **`backup/rag-corpus-preflight` still holds those blobs locally** and is safe to delete. **`inspect-prompt.js` added** — and it surfaced that **the business-framework channel returns 0 rows in practice**: always semantic, top-2 never clears the 0.78 floor. The 10 framework rows are seeded and embedded but reach no prompt, so "64 rows grounding the model" is really 54. Not a regression; it has never worked otherwise. Also: `Co-Authored-By` trailers dropped, enforced via tracked `.claude/settings.json` plus a `CLAUDE.md` section for paths the setting doesn't reach.

**Grounding measurement, first runs (2026-07-29 → 2026-07-30).** Step B finally ran after the harness was restructured — reps became the *outermost* loop (it had iterated arm → startup → rep, so a 20-call budget was consumed entirely inside the baseline arm and every between-arm metric read n=0), with `--out`/`--merge` to accumulate across days and a refusal path when model/corpus/floor differ. **The most valuable finding was free:** `baseline` and `sdd-semantic` send **byte-identical prompts** (semantic rubric retrieval returns 0 rows), so the pair is an accidental null control — and at `temperature: 0` it still differed on 8 of 12 per-dimension levels. Then the probes were redesigned, because reading production's `createBasePrompt` showed two confounds that invalidated the comparison at *any* N: production emits the startup's readiness levels for **every** arm (the harness emitted them for none), and deterministic retrieval keys on the startup's actual level, so the arm was shown the answer. 49 measurement tests were added where there were none. **Review caught seven defects, six of them in the spec/plan rather than any implementer's work, and five found by mutation testing rather than reading** — notably `ipo` matching `IPOPHL` (which appears in both seeded documents, so correct trademark advice would have scored as the worst hallucination the metric records), and `mergeRuns` keying comparability on `days[0]` so the documented `--merge results/*.json` pooled nothing.

**Reps 2 and 3 (2026-08-03).** Rep 2 (n=2 pooled) showed the corpus arm's per-dimension deltas were **reproducible, not noisy** — MediSync `+2 +2 +2 −3 −2 −2` then `+2 +2 +2 −2 −2 −2`, while baseline wobbled more. That retracted the standing "54 rubric rows destabilise placement" hypothesis: systematic displacement, not instability. Rep 3 lost its twelfth call to a transient **503** (not a 429) in the single cell carrying the finding, which exposed that **metric 3 cannot resolve these arms** — the byte-identical control pair spans 1.67–3.33 gap points across three reps, wider than the effect being measured. Do not quote a pooled MAE from an unbalanced pool; the missing cell biased the corpus arm in its own favour. Both harness gaps were then closed TDD-first: `--only-arm=`/`--only-startup=` (refilling one cell costs 2 calls, not 12; a filter matching nothing hard-errors before any network call) and a bounded 503 retry that **never retries 429**. Mutation testing again earned its keep — the `is429` guard passed with the guard *removed*, because a real 429 body contains neither `503` nor `UNAVAILABLE`; it was decorative.

**Three streams (2026-08-04).** Output validation (1c, PR #18) and sector-aware weighted scoring (2b, PR #19) merged; the grounding n=3 volume ladder did not. **1c is a length-and-confidence validator, not "full output validation"** — groundedness and stage-appropriateness were excluded because both probes measured saturated, a rationale partly refuted on 2026-08-06. No backfill by design, so a `'validated'` status on a pre-existing row is *not* evidence the validator ran. **2b: `TierConfig.weights` was deleted rather than used** — keyed per tier, so a startup crossing a boundary could see its composite *fall* as a dimension improved. Two findings that correct earlier framing: the ÷5 → ÷9 fix **narrows** differentiation (AgroLink/MediSync gap 44 → 24) and is a correctness fix, and **the measured sector effect is about one point**, so 2b is correctness and configurability, not a differentiation win. `tier_configs` is empty on Neon, so the hardcoded 85/70/55/40/25 ladder is what runs and is now harsher against ÷9 scores. The volume-ladder result stands in direction (an 87% cut in rubric text left aggregate placement flat, and stripping bodies made Technology/Acceptance *worse*) but its magnitudes were scored against the reference broken below. **Branch-hygiene lesson:** a long-lived measurement branch that edits shared docs should merge `master` **before** writing to them.

**The ground-truth audit inverted Objective 1b (2026-08-05).** The session set out to recalibrate the O/R/I rubric rows and instead found the reference was wrong. Metric 1 had scored placement against seeded `StartupReadinessLevel` rows — UI demo fixtures, **contradicted by their own documents in ten of twelve cells** (seeded Market 4 requires "no prospect has yet indicated a specific willingness to pay" beside a document stating PHP 5,000 MRR). Re-scoring the same calls reversed the direction. Against a reference fixed *before* the generations existed (`2026-08-05-corrected-reference.json`, 18/18): **corpus 0.22 MAE / 36-36 within one rung vs baseline 0.69 / 29-36**, read against a byte-identical null control whose own spread is 0.25 MAE and 1 rung. The corpus arm is *exactly* right on O/R/I where both corpus-free arms inflate. **The reference-free figure is the one to quote:** three rungs require an artifact class neither document mentions, so any placement above them asserts absent evidence — baseline **61%**, corpus **0%**. `src/demo-readiness-levels.ts` became the single source for the levels (`main.ts`, the harness and `seed-demo-full.js` had held three states between them, which is how the app and the study drifted). The O/R/I recalibration is **cancelled, not deferred** — those rows are now exactly right. **Methodological lesson:** a reference can be independent of the prompt and still be wrong; three reps agreeing in direction tested sampling noise, not the reference. **Limit that must travel with every figure:** this is the levels probe, a harness construct — production never asks the model to assign levels.

---

**Supplied-level fabrication probe (2026-08-06).** Closed the gap that every grounding number to date was the *levels* probe, where the model infers the level; production does the opposite — mentors set levels and the RNA path consumes them. Needed a manipulation, because the 2026-08-05 ground-truth correction had removed the trigger without touching the vulnerability: `--level-condition=truth|inflated` inflates O/R/I to 3 while T/M/A stay at truth as a within-call control. **Result (n=2, 16/16 calls): only corpus+inflated fabricates — `deviation-deterministic` 2/12 (17%), baseline 0/12 under *both* conditions.** The wrong supplied level alone produces nothing. Both flagged clauses weld a fabricated artifact to a true document fact (*"Currently at RRL 3, with legal counsel engaged and a trademark application pending with IPOPHL"*). **Organizational is the level-isolating cell** — ORL 3 reaches the model under both conditions, so identical rubric text with only the supplied level differing flips *"Needs: advance to ORL 3 by engaging the first non-founder contributor"* into an assertion that one exists; that rules out "the corpus added new text" as the explanation, and it was recorded in the spec before the run. Reading `flaggedClauses` by hand found two more genuine fabrications sitting in `unclassified`, so **17% was a floor**. **Three design defects, all in the spec rather than the implementation** (the tests were written from the same mistaken model): the classifier admitted bare copulas, `absentTokens` had `contractor` but not `contributor` — the word ORL 3's own rubric uses, so Organizational would have read 0 for the wrong reason — and inflating to 4 would have skipped the very row the probe was about. The classifier was deliberately **not** patched and the data not re-scored; the fingerprint guard enforces that mechanically. Superseded by the 2026-08-09 re-run.

**The assertion classifier repaired, and five cues cut (2026-08-09, PR #24).** The recorded diagnosis was a third of the picture: of 14 `unclassified` clauses, **12 were recommendations mis-binned** (the model's `Needs:` label form, and coordination splits stranding fragments from their governing modal) — recommendation detection, not assertion detection, was the dominant defect. A counterexample to the module's lower-bound guarantee was already in the collected data (a fragment stranded from its `must` and scored `asserted`), fixed by **scope inheritance**: a continuation inherits its governing clause's negation/recommendation cues and **never** its assertion. **Five assertion cues (`require`, `existed`, `existing`, `exists`, an accompaniment predicate) were specified and all five cut after review** — each failed the same way, the artifact token being an attributive modifier rather than the head of its phrase. The killer: *"Investor interest exists"* and *"A basic funding plan exists"* are structurally identical, so the genuine detection worked only because `plan` happens to be a head noun. **The assertion branch therefore ships byte-identical**; all recovery came from the recommendation side, and both genuinely missed assertions are known uncaught classes with tests — a lower-bound statement, so it costs the headline nothing. **Re-run** (`results/2026-08-09-supplied-level.json`, 16/16, n=2): only corpus+inflated fabricates — `deviation-deterministic` inflated **3/12 (25%)**, baseline **0/12 under both conditions**; all three clauses are one mechanism (IRL 3's funding plan asserted as drafted). `--merge` refused to pool into any `assertion|*` group while pooling the untouched metrics. **Quote the hand count: 6/12; the reported 3/12 is a floor**, and the known-uncaught classes are why the floor is trustworthy. **Both pre-registered predictions were wrong, in opposite directions.** AgroLink fabricated this time, closing 2026-08-06's open question — its earlier zero was chance, not a property of the document. Metric 2 returned non-zero for the first time (baseline 2/24, corpus 1/24) — a hint at n=2, confirm against earlier files before quoting. **Mutation lesson that has since recurred twice:** nine mutants, nine killed, but **two first read as survivors and had silently failed to apply** (`String.replace(string, string)` takes only the first occurrence; a `\n` anchor against a CRLF file) — **a mutation that fails to apply reports a green suite, indistinguishable from a decorative guard.** Assert the mutation landed. Suite 178 → 207.

---

## Compressed — 2026-08-18 → 2026-08-19

Compressed 2026-08-22 under the three-most-recent rule. Full detail lives in
`TODO_CHECKLIST.md` §0 and `measurement/README.md`; the durable gotchas were
promoted to **Standing operational notes** above.

**2026-08-18 — SO 4.2 adversarial summary shipped and measured**
(`feat/adversarial-summary`). `generateStartupAnalysisSummary` runs a
field-ordered `responseSchema` (`unmet_criteria` → `critical_risks` → `summary`)
behind `AI_ADVERSARIAL_SUMMARY_ENABLED`, with the shipped prompt preserved
verbatim as `LEGACY_SUMMARY_PROMPT`. Run `results/2026-08-18-summary-bias.json`,
**partial 10/12** (two adversarial cells lost to 503 overload, not quota,
deliberately not re-run): baseline n=6 meanCritical 1, meanRatio 0.39;
adversarial n=4 meanCritical 3, meanRatio 1.00, 4 unmet criteria, 3.75 critical
risks against a baseline with **no criteria field at all** (`structural`, not a
measurement). 100% schema adherence, so Gemini honouring `propertyOrdering` is
now supported rather than assumed. **The scoring path was deliberately untouched**
— `createBasePrompt`, `reviewBiasScore` and `normalizeAiScore` unchanged — which
is why 4b stays 🟡. `reviewBiasScore` is *mislabelled, not misplaced*: its two
call sites review an RNS target level and a roadblock risk number.

**2026-08-18 (later) — the SO 4.4 flag rule replaced, then validated**
(`fix/so-4-4-flag-threshold`, no quota for the rule itself; `analyzeTone` is
pure). `flagged = criticalCount === 0` **fired 0/10 in both arms** — the legacy
prompt mandates a risk sentence, so every baseline summary scored exactly
`criticalCount: 1` and **the rule could not fire against the prompt it exists to
police**. Replaced with `flagged = ratio < 0.75`, the midpoint of a gap with no
overlap (baseline `0.333 ×4, 0.500 ×2`; adversarial `1.000 ×4`). The old rule is
a strict subset, so no detection was traded away. **Validated on held-out
generations the same day** (`results/2026-08-18-threshold-validation.json`, 9/12,
3 lost to 503): **baseline 5/5 flagged, adversarial 0/4 — perfect separation**,
and the old rule would again have fired 0/9. **Held out is the generations, not
the documents** (same two startups, same prompts), and baseline ratio was 0.333
with **zero variance**, so this is robustness to resampling of a very stable
prompt structure — the informative next test is a different prompt or a third
document, not more reps. Exactly 0.75 counts as balanced (strict `<`) by
judgement, not measurement: flagging 3-of-4-critical would train Managers to
ignore the flag.

*Then the verdict reached the Manager.* `GET /startups/all` carries a
`summaryVerdict`; one `SummaryToneBadge` renders it in all four Manager dialogs.
**The specified row-only design would have shipped an empty badge** — Neon holds
zero `analysis_summary` rows, because persistence only runs for proposals created
through `createStartupProposal` and both demo proposals were written directly by
`seed-demo-full.js`. So it resolves recorded-row-first with a live recompute
fallback and shows `source`; a recorded row always beats a disagreeing fresh
reading, being attributable to a generation run. `persist: false` produces 0 DDL
statements, which matters because `main.ts` runs `updateSchema()` every boot.
**What remains for SO 4.4 is an *action* on the flag, not its visibility.**

*Mutation testing changed the tests, not the code* — 5/5 after the fix. Two
mutants survived a green suite because the tests covered baseline's **modal**
ratio (0.333) and not its **maximum** (0.500), so a threshold mutated to 0.5
silently unflagged two of the six summaries the change exists to catch.
**The value that constrains a threshold is the one nearest the boundary, not the
most frequent** — a lesson that recurred verbatim on 2026-08-19.

**2026-08-19 — metric 3 rebuilt, parts 1 and 2**
(`measure/non-saturating-differentiation`, zero quota; everything re-scored from
stored runs or pure functions). **The guard was itself the defect**, not merely
saturating: `separates = (critGap !== 0) || (unmetGap !== 0)` is an exact
inequality over a mean of 1–3 small integers, with no noise floor (one call
produced a PASS) and **no sign check — a PASS could be earned by differentiating
backwards**. Both count columns are degenerate for different reasons:
`criticalCount` ceilings at 3 in a three-sentence summary, and `unmetCriteria` is
structurally unbounded yet its means coincide (AgroLink `4,4` vs MediSync `3,5`;
then `4` vs `4,4,4`). So the count verdict was **retired, not hardened** —
hardening a rule over columns that cannot separate these startups only makes a
broken instrument stricter. Replaced by `lib/field-overlap.js`: Jaccard overlap
of normalised proposal-field sets, `crossOverlap` read against `withinOverlap` as
an intrinsic noise floor. Two decisions carry its validity — **a Jaccard of two
empty sets is `null`, never `1`** (else the baseline arm, which cites no fields
at all, reports as maximally uniform on the strength of a missing schema field),
and **normalisation is load-bearing** because `proposal_field` is a bare `STRING`
in the schema, not an enum. The margin was **pre-registered before any generation
it scores** (`docs/superpowers/specs/2026-08-19-differentiation-margin-design.md`):
complete separation, `min(within) > max(cross)`, no constant, tie FAILS. **Issuing
no PASS/FAIL until then was John's call**, over shipping `0.15` as a pinned
judgement. Two zero-quota prerequisites shipped with it — `overlapStats`
persisting per-pair values (without which the pre-registered rule could not have
been evaluated from a stored run) and `--only-arm`. **The harness that produced
every published SO 4.2/4.4 number had zero tests** before this; 27 were added,
leaving `toneTable`, `criteriaTable`, `validity`, `sourceBreakdown` and
`callDescriptors` still untested. Mutation 16/16, the survivor again being a
boundary case no test covered (`gap > 0` → `gap >= 0`, relabelling the exactly-0
uniform case the metric exists to detect).

*Correction made here and carried into both documents:* the 2026-08-18 diagnosis
claimed `unmetCriteria` came back "exactly 4 on all 8 successful adversarial
calls". **Wrong** — six of eight are 4, with a 3 and a 5. The column is unsigned
variance whose means coincide, not a constant. The conclusion survives; the
"convergent model behaviour at temp 0" reading does not.

---

## Compressed — 2026-08-20 → 2026-08-22 (demo-critical sweep)

Compressed 2026-08-23 under the three-most-recent rule. Detail lives in
`TODO_CHECKLIST.md` and `measurement/README.md`; durable gotchas are in
**Standing operational notes** above.

**2026-08-20 — metric 3, part 3: the run** (`results/2026-08-20-differentiation-overlap.json`,
10/10 calls, zero degradations, the first full grid this harness produced).
Verdict **`FAIL - uniform`, quotable**: `crossOverlap` 0.303, `withinOverlap`
0.612, `separation` +0.309, chance reference 3.2e-13. **Provenance is as clean
as it gets** — the rule was committed 2026-08-19 08:04 +0800, the first call
went out ~15:10 Manila the next day, in git. **The prediction was right in
outcome and wrong in mechanism** (the third time on this project): FAIL was
predicted *because* cross-overlap would be high; it came in **below** the band
and separation **above** it. **What failed is the noise floor, not the signal**
— cross-overlap never exceeds 0.5, and complete separation fails on one
*within* pair at 0.125. Split by startup: **AgroLink 0.800, MediSync 0.424** —
one document is stable, the other is not, and **pooling the within-startup
floor across both hid that**. A per-startup rule would have passed, which is
exactly why re-scoring this run under one is the forbidden move; it stays an
observation. **The positive result: the instrument is not degenerate** — the
pre-registered "field identity is too coarse" failure mode needed
`crossOverlap > 0.5` *and* `separation < 0.1`, and neither holds. Free n from
identical fingerprints: SO 4.2 gains 10 calls (**3.9** mean unmet criteria,
**3.2** critical risks) and `tone|adversarial` reads **0/10 flagged, ratio 1.00
on every call** — a third independent confirmation that `ratio < 0.75` does not
fire on the arm that is behaving. **Documentation hazard found and noted:** two
different metrics are called "metric 3" (the grounding harness's
differentiation *gap*, and this harness's overcorrection *guard*), with
opposite-looking sign conventions.

**Same session — a recorded bug that did not exist.** The checklist's 🐞 *"a
literal JSON `null` degrades with no `recordFailure`"* was **refuted by probe,
no production change made**: it is 3 calls not 2, the corrective retry does
run, and failures are recorded. The null branch of `analysisSummarySchema.nullable()`
is **unreachable at runtime** — `.nullable()` is a compile-time accommodation
that was read as a runtime permission. Pinned by two characterization tests.
**The mutation lesson sharpened here:** the first mutation landed and reported
SURVIVED because it was *semantically inert* (`'null'.substring(-1, 0)` is `''`,
still falsy). So "assert the mutation landed" is necessary but **not
sufficient — assert it changed behaviour.**

**2026-08-22 — the 🎯 demo-critical sweep, all eight cleared**
(`fix/demo-critical-sweep`, merged). **21 files, 4 insertions, 7,188
deletions**, and **four of the eight were dead code rather than live
breakage** — three separate features stranded mid-build, each with plumbing
wired and no trigger (a form action with no `<form>`, a query with no panel, a
dialog with no trigger). That produced the rule this project now applies first:
**the recorded symptom is real, and nobody checked whether the code carrying it
can execute — reachability first, then correctness.** Two items were
under-recorded: Elevate's *parameter name* was also wrong, and
`/assessments/:id/fields` **could not exist as written** (an `Assessment` row
*is* a single question). **The `GEMINI_API_KEY` is fine** — `AQ.` is a valid AI
Studio format, proven by a live `embedContent` probe returning 768 dims (zero
generation quota) plus the 2026-08-20 run's `apiRequests: 10`; **keep that
probe, it is the cheapest live auth test in the project.** Side effect:
`svelte-check` fell **160/16 → 119/14**, so deleting dead code cleared 26% of
the frontend's type errors. **Verification lesson:** `grep -o "Error:.*"`
matched nothing (the real output is `Error<ANSI>:`), so two commits were
"verified" by a comparison that could not have failed — **a check that cannot
fail is not a check.**

---

## 2026-08-22 (later) — the deferred-cleanup sweep, and a red suite finally green

`chore/deferred-cleanup-sweep`, **local, nothing pushed**, on `master` at `b0d5fc8`.
Four tasks, all confirmed in advance. **Zero API calls of any kind.**

### The headline: the recorded verification procedure could not have been run

The one ⚠️ left by the demo-critical sweep was *saving baseline scores*, with a
"zero-risk way to close it" written down: re-save the identical stored values and
expect the toast. **Tracing it first showed there is no button to click.**

The live path is real end to end — a genuine `<Button onclick={submitBaselineScores}>`
(`+page.svelte:421`), a real `POST /readinesslevel/startup/:startupId/rate` under
`JwtGuard`, a `RateReadinessDto` matching the payload field for field, and a
find-or-create upsert on `(startup, readinessType)`. So **the deletion reasoning that
this item existed to check holds.**

But the mentor form is gated `{:else if isRated()}`, and `isRated()` is true whenever
the startup has *any* `startups_readiness_level` rows. Both demo startups have all
six. **The Save button does not render for a rated startup**, so the procedure has no
trigger.

**This is the fifth instance of the pattern named in the sweep** — *the recorded
symptom or procedure is real in description, and nobody checked whether the code
carrying it can execute.* The new part is that it now applies to a **verification
step**, not a bug.

⚠️ **The "zero-risk" procedure was the opposite of zero-risk, and only the gate
hid it.** `baselineScores` initialises to all-`1` (`+page.svelte:58`) and is **never
seeded from the loaded rows**. Had the form rendered for a rated startup, a Save
without touching all six selects would have written `T1 M1 A1 O1 R1 I1` over the
measurement ground truth. `isRated()` is the only thing between a stray click and the
2026-08-05 grounding result. **Verifying the save needs an *unrated* startup** — a
different exercise, and not one to run against AgroLink or MediSync.

### The suite is green for the first time: 266 / 266, 25 suites

The failure reproduced exactly as recorded, and **the recorded conclusion was right:
the expectation was wrong, not the code.** `target_level_normalized: 5` and
`target_level_z: 0` are what the mocked `normalizeScore` returns; the old assertion
wrote `3` — the *raw* level — under a comment claiming it matched the normalized
output.

**The recorded *mechanism* was wrong, and that correction is the real find.** It
blamed the test context setting `scoreNormalization: true`. **That flag never reaches
this path:** `generateTasksFromPrompt` (`ai.service.ts:984-992`) normalizes
unconditionally, and `ctx.config.scoreNormalization` is read *only* inside
`reviewBiasScore`.

**The cost is provenance, which is why it is not cosmetic.** `ai_generation_runs`
exists so a run is attributable to an exact arm; a row stamped
`scoreNormalization: false` still carries normalized `target_level` values here. A
baseline-vs-enhanced comparison over task target levels would be comparing two
identical arms while believing otherwise. **Same class as the `temperature`
top-level bug** — a config flag that silently never applied.

Pinned with a test rather than a doc line. **The mutation making the path honour the
flag killed only that test**, confirming nothing else covered it. Fixing the flag is a
production behaviour change on an arm under measurement, so it is logged in
`TODO_CHECKLIST.md` §4 rather than smuggled into a test repair.

**"A second failure is a real regression" is retired.** Any failure is now the signal
— which is the whole point of fixing a one-test-red suite.

### `chumcheck` purged — and one of the three had never worked

All three `scripts/` files deleted, and the directory with them; no code referenced
them, only docs. `delete_db.sh` was **never executable as written** — lines 4-5 were
raw SQL sitting unquoted in a `#!/bin/bash` file, so the shell would have tried to run
`drop` as a command. Only line 6 did anything, and it pointed at a dump deleted
earlier the same day. **`reset_db.sh`/`.ps1` were the live hazard** — both valid, both
a real `DROP DATABASE ... WITH (FORCE)` against a local `postgres` superuser.

**Deleted rather than repointed, because there is no correct target:** Neon branches
instead of drop-and-recreate, and `docker-compose.yml`'s `launchup_db` is unused.

### Branch sweep: 23 → 4

All 20 `[gone]` branches deleted after **verifying each is an ancestor of `master`**
rather than trusting the earlier listing — 0 unmerged. Used `git branch -d`, not
`-D`: with the merge already proven, the safe form does the same job and keeps its own
guard. (The force-delete loop the skill prescribes was blocked by the permission
classifier; the safe form was accepted, which is the better command anyway.)

### Then: the backup branch, deleted on evidence rather than on its label

`backup/rag-corpus-preflight` was carried for weeks as "disposable, 13.7 MB of
PDF blobs". Both halves of that description were misleading. It is a
**2026-07-28 snapshot far *behind* `master`**, not a branch holding extra work:
its unique content is almost entirely files deliberately deleted since — the
`chumcheck` dump, the scratch files, the three orphaned Tab components,
`recommendation.entity.ts`. The only irreplaceable-looking material was three
capstone PDFs, and those were **verified byte-identical by SHA-256 to the copies
in `Downloads\capstone`** before deleting — matching filenames and sizes were not
treated as sufficient. Branches: 23 → 3.

### Then: the save verified, and a bug only the probe could find

**The save works end to end.** Six POSTs to `/readinesslevel/startup/4/rate`, all
**201**, all six rows stored with the exact values set in the UI, and the page
flipped to the rated view on its own showing *"regulatory … currently at 33%"*
= 3/9. **The last ⚠️ from the demo-critical sweep is closed:** deleting the
unreachable form action was correct, and the live path it deferred to works.

**Six *distinct* values were used (T7 A2 M5 O8 R3 I6), and that was the point.**
The form's display order is Technology, **Acceptance, Market**, … while the enum
order is T, M, A. Uniform values would have passed even if every select mapped to
the wrong dimension. They didn't — but the test could not have told the
difference.

**It required creating a startup, which is itself a finding.** Neon holds exactly
two startups and both are rated, so **the mentor form was unreachable anywhere on
this database.** `ZZ Save-Path Probe` was created, used and removed in a
transaction that **refused to commit unless startups 1 and 2 still held 12 rows**;
AgroLink `T2 M3 A3 O2 R1 I1` and MediSync `T6 M5 A5 O2 R1 I1` confirmed unchanged
before and after.

🐞 **New bug, found only because the probe existed.** The first save flips
`isRated()` and the form never renders again — confirmed by reloading: 0 selects,
no Save button. So `rateStartupReadinessLevel` is a find-or-create upsert whose
**update branch is unreachable from the app**; a mistyped baseline score can only
be fixed by SQL. The obvious fix is unsafe on its own: `baselineScores`
initialises to all-`1` and never reads stored rows, so re-exposing the form
without pre-seeding turns a stray click into six overwritten levels.

⚠️ **`GET /readiness/:startupId` writing on every read reproduced incidentally**
— two page views left **two** `readiness_evaluations` rows and 12 dependent
`readiness_gaps`. The §2 item is real, and cleanup must follow the FK chain.

### Small things worth not rediscovering

- **Backticks inside a double-quoted bash string are command substitution.** A doc
  patch written as `"...the \`chumcheck\` purge..."` silently lost the word — bash ran
  `chumcheck` as a command and substituted its empty output. Quoted heredocs
  (`<<'EOF'`) are immune; that is why the other patches survived.
- **A doc patch corrupted five line terminators, and nothing rendered differently.**
  The newline substitution ran twice — text joined with CRLF, then every LF
  expanded to CRLF again — giving CR+CRLF. Invisible in the editor and in
  `git diff`; what surfaced it was a **diffstat far larger than the edit
  justified**, then `file` reporting "CRLF, CR line terminators". It reached a
  commit first. Treat an oversized diffstat as a signal, not noise.
- `git worktree list` still shows `.claude/worktrees/xenodochial-colden-25e582` at a
  detached HEAD. It is harness state, merged into `master`, and was left alone.

## Close-out — 2026-08-22 (deferred-cleanup sweep) — SUPERSEDED, see the end of this file

### What this session did

Six tasks, all housekeeping picked up as a **new decision** after the 2026-08-07
triage boundary was reached — none of it §0 work. In order: traced the
baseline-score save (the recorded procedure turned out to be unrunnable), purged
the `chumcheck` scripts, fixed the test that had kept `master` red, swept 20
`[gone]` branches, deleted `backup/rag-corpus-preflight`, and verified the save
live on a purpose-made startup. Full detail in the session section above.

**Three results worth carrying forward:**
- **The backend suite is green for the first time — 266/266 across 25 suites.**
  "A second failure is a real regression" is retired; *any* failure is now the
  signal.
- **The baseline-score save works end to end**, closing the last ⚠️ from the
  demo-critical sweep.
- **Three new defects were found, none of which was on any list** — see below.

### Branch state then — merged as PR #30

`chore/deferred-cleanup-sweep`, **local, nothing pushed**, on top of `master` at
`b0d5fc8`. `master` is an ancestor, so it **fast-forwards**.

Gates at the tip: jest **266/266 across 25 suites**, measurement **257/257**,
`tsc --noEmit` exit 0. `svelte-check` was not re-run and does not need to be —
**no file under `frontend/src` is touched.**

**Merge risk is low and the reason is specific:** the only change under
`backend/src` is a **spec file**. No production code, no entity, no enum member —
which matters because `main.ts` runs `updateSchema()` on every boot. The rest is
three deleted shell scripts and four markdown files.

### In progress at that point — nothing

No work is half-done. The three defects below are **logged and unstarted**, by
choice: each needs a decision before code, and none was smuggled into a cleanup
branch.

### Next step proposed then — one branch, three linked problems (✅ ALL THREE DONE 2026-08-23, `fix/silent-controls`)

Agreed 2026-08-22: merge this branch first, then do all three on a **dedicated
branch**, not on top of cleanup work.

1. **SO 4.4's missing *action* on the flag** — the one substantive §0 gap left.
   The badge is visible in all four Manager dialogs; **nothing happens when it
   fires.** An alert nobody acts on is barely better than one nobody sees. Design
   question — brainstorm before code.
2. **`AI_SCORE_NORMALIZATION_ENABLED` does not gate task normalization**
   (`TODO_CHECKLIST` §4). `generateTasksFromPrompt` normalizes unconditionally,
   so an `ai_generation_runs` row stamped `scoreNormalization: false` still
   carries normalized values — **the 4c arm mislabelled inside the table built to
   make arms attributable.** Small fix, but it changes output on the disabled arm,
   so stored comparisons need a deliberate call first, and the test currently
   pinning the behaviour must be inverted in the same commit.
3. **A mentor cannot correct a baseline score** (`TODO_CHECKLIST` §4). The first
   save hides the form permanently, so the upsert's update branch is unreachable
   from the app. **Pre-seeding the form from stored levels is a prerequisite, not
   a nicety** — `baselineScores` starts at all-`1`, so re-exposing the form
   without it turns a stray click into six overwritten levels, and those levels
   are the measurement ground truth.

**Why one branch:** 2 and 3 are both "a control that silently does not do what
its name says", and 1 is the same shape one level up — a signal computed,
surfaced, and then ignored. They share no files, so they can land as independent
commits.

**Known-good starting facts for that branch:** the demo mentor is
`mentor@launchup.local` (real `Mentor` role, not `Manager as Mentor`); Neon holds
only two startups and **both are rated**, so any UI work on the readiness-level
mentor path needs a throwaway startup; and `readiness_gaps` →
`readiness_evaluations` → `startups_readiness_level` → `startups` is the delete
order for cleaning one up.

**Not next, but not forgotten.** (SO 4.4's missing action has been promoted to
the Next step list above; the rest is unchanged from 2026-08-20.)
- **Metric 3 beyond the FAIL** — a *separately* pre-registered rule with a
  **per-startup** noise floor, scored on new data. Calibrating on the 2026-08-20
  run and reporting the fit is the forbidden move.
- **A cheaper validation than more reps:** a *different* summary prompt or a
  third document beats a fourth rep of the same two.
- **RNA *generation* quality is still unmeasured.** Every grounding figure is the
  levels probe; production's RNA path retrieves 12 rubric rows rather than 54.
  Needs a **harder probe, not more reps**.

**Open decisions, not blocking:** unchanged from 2026-08-20 — production cookie
policy; RNS correlation-key uniqueness and stale verdicts on artifact edit; tier
thresholds uncalibrated; `readiness_evaluations` mixed-scale rows; Neon TLS
verification disabled; the owed manual auth click-through; VS Code's
`git.postCommitCommand`; and §1's "guard the remaining unauthenticated modules"
claim still needing confirmation rather than trust.

---

## 2026-08-22 (3a / 3b) — the better transcription was being thrown away

Branch `fix/ocr-transcription-preference`, 4 commits, local. Gates at the tip:
jest **278/278 across 26 suites**, `tsc --noEmit` 0, `svelte-check` **119/14 —
unchanged from baseline**.

### Two defects, both "a signal computed and then ignored"

1. **`parseCapsuleProposal` stored Tesseract's transcription, not Gemini's.** The
   guard read `raw_transcription && !parsedText` — the inverse of its own
   comment. Tesseract is installed, so `parsedText` was always truthy and
   Gemini's `raw_transcription` reached **no consumer anywhere in either app**.
   The `OCR_PLACEHOLDER` sentinel is also truthy and beat it too.
   `detectSketch` deliberately still reads Tesseract's output — its weights are
   tuned to that, and clean prose would stop sketches ever being detected.
   Pinned by a test that was green before the fix.
2. **`fieldConfidence` was `text.length < 40`.** The extraction prompt orders a
   40-character minimum on every field, so the rule graded compliance with that
   instruction. Replaced by content-word overlap with the transcription
   (`src/ocr/field-confidence.ts`). The frontend also defaulted a missing field
   to `'verified'`, rendering green for something never scored.

### Live verification — one Gemini call, and it separated cleanly

Synthetic handwriting (Caveat font, 1600×1200 JPEG) through the **running**
server against Neon. `extractedText` came back as Gemini's verbatim
transcription, no placeholder. The document deliberately carried only title /
startup / problem / target-market content.

**Every field present on the page scored `verified` (4/4); every field the model
inferred scored `low` (4/4)** — `scope`, `objectives`, `methodology`,
`solution_description`. The `scope` prediction recorded before the run held.

**Do not overclaim this: n=1, one document, and a font is not handwriting** —
uniformly formed glyphs are far easier than a real hand. It shows the rule and
the wiring work end to end; it does **not** calibrate `SUPPORT_THRESHOLD = 0.5`,
which remains a guess until 3c runs on real samples.

Also confirmed live: `visionLabels: []` and `sketchDetected: false` — 3b's Vision
path is inert, as the corrected wording now says.

### Corrections to claims made earlier the same day

- **The entropy gate is NOT inert.** Measured: the same page as PNG scores
  **3.33** and is rejected; as JPEG **5.89** and passes. It reads the tail of the
  *compressed file*, so a blank-bottomed PNG fails. Camera photos survive on
  sensor noise. The sample-prep protocol was corrected.
- `@google-cloud/vision` absence verified by `import()` at runtime
  (`ERR_MODULE_NOT_FOUND`), not by reading `package.json`.

### Gotchas worth keeping

- **A capsule-proposal vision call took 175 s.** Well beyond a default HTTP
  client timeout; budget for it before blaming the pipeline.
- Playwright MCP refuses `file:` URLs and only writes inside the repo root —
  serve the scratchpad over `http://127.0.0.1` and clean `.playwright-mcp/` after
  (it is **not** gitignored).
- A probe script must sit **inside `backend/`** or `@mikro-orm/postgresql` will
  not resolve.
- The probe's `ocr_documents` row was **deleted after the run** (id 2,
  `ocr-sample.jpg`); only the pre-existing `capsule-page.png` from 2026-07-27
  remains. Nothing references that table — no inbound foreign keys.

### Still open

- **3c is unblocked only by the samples.** Ten handwritten proposals plus
  verbatim transcripts; the protocol is written and shared.
- `SUPPORT_THRESHOLD` uncalibrated.

### Same session — URAT and calculator steps were blank

Reported while testing the OCR upload, unrelated to the branch's other work.

**Root cause:** `urat_questions` and `calculator_questions` held **0 rows**. The
18 URAT and 35 calculator questions lived only inside
`AppService.generateUratQuestions` / `generateCalculatorQuestions`, and their
only callers were three `@Post` endpoints in `app.controller.ts` that were **all
commented out**. Nothing ran them at boot, so the data died in the 2026-07-26
wipe and was never restored. `readiness_levels` still had its 54 rows, which is
why only these two steps were affected.

**Why nobody caught it:** both endpoints answer **200 with `[]`**, not an error.
`getData()` in `Application.svelte` does silently return `undefined` when a fetch
is not `ok`, but that path never fired — the components simply rendered an empty
list. Nothing to log, nothing to catch.

**Fix:** banks extracted to `src/assessment-questions.ts`; `seedAssessmentQuestions`
runs on boot, guarded on emptiness. The original loop had **no guard at all**, so
a second run would have produced 36 URAT questions and every applicant would have
seen each question twice — the guard is the point, and it has a test. The
superseded generators and the dead endpoints were deleted rather than left as a
second copy of the data to drift out of sync.

**Verified live, at three layers:** endpoints return 18 and 35 (the calculator one
returns 7 because the service groups by category — 5 × 7, not a shortfall); the DB
holds 18 / 35; and the flow renders **18 textareas** in the browser. Idempotency
proved itself incidentally — the dev watcher restarted three times during the edits
and the counts stayed put.

**Found in passing, logged not fixed:** `@Controller('readinesslevel')` has **no
class-level guard**, so its endpoints answer unauthenticated (curl, no token).
`Application.svelte` calls them with a bare `fetch` carrying no credentials, so
guarding it without fixing the caller repeats the PR #15 trap exactly.

**Gotcha:** `allowGlobalContext` is unset (false), so a boot-time
`app.get(AppService)` would throw. Boot seeders must take `orm.em.fork()` — which
is what every other seeder in `main.ts` already does.

### Same session — a 503 turned into confident garbage, and the confidence rule was circular

A live upload hit **503 UNAVAILABLE** (model busy — *not* 429/quota; the two are
different codes and must never share a code path). What followed exposed a flaw
in the confidence rule shipped hours earlier.

**The chain:** vision 503s → `catch` swallows it → Tesseract mangles the
handwriting → `if (!aiPayload && parsedText)` fires a **second** Gemini call on
the mangling → the model extracts fields from it → **two fields render as green
"Verified" badges**. Measured on the stored row: `solution_description` scored a
support ratio of **1.00**, `startup_description` **0.83**.

**Why:** the rule compares a field against the transcription. On the vision path
both derive independently from the image, so an unsupported field genuinely
fails to match — that is why `scope` was caught on the clean run. On the fallback
path the model is *handed* the text and asked to extract from it, so the
comparison is output-versus-its-own-input and overlap is guaranteed. **The same
circularity applies to the PDF path**, which was never on the vision path at all.

**Fixes (three, all TDD):**
1. `classifyField`/`scoreFields` take a **required** `EvidenceSource`
   (`vision` | `derived`); `derived` caps everything at `low`. Required rather
   than defaulted — a default of `vision` would let a forgotten argument restore
   the bug silently. The compiler immediately caught the one existing call site,
   which is the argument for making it required.
2. `src/ai/retry-transient.ts` — 3 attempts, 2s/4s backoff, **never** retries a
   429. Ported from `measure-grounding.js`, which has had this since 2026-08-03:
   **the measurement harness was more robust than the application it measures.**
   Delays are deliberately shorter than the harness's 15s/30s because a capsule
   extraction already runs to ~200s.
3. A service failure now raises `ServiceUnavailableException` and writes **no**
   `ocr_documents` row; the controller passes `HttpException` through instead of
   rewrapping as a 500. Non-service errors keep the Tesseract fallback, now
   scored as `derived`.

**Verified:** 300/300 across 28 suites, `tsc --noEmit` 0. The classifier is pinned
by a regression test carrying the SDK's **verbatim** error string — a regex that
matches a paraphrase but not the real message would be worthless.

**Not verified live:** forcing a 503 on demand isn't possible without editing
`.env`, so the retry and the fail-loud path are proven by tests only. The
circular-evidence fix was *diagnosed* from live data (the stored row) even though
its fix is test-proven.

**Gotcha worth keeping:** the frontend's failure copy says "The image quality
check failed… Re-upload a clearer image or switch to a PDF." For a 503 that is
advice to re-photograph a perfectly good page. Failing loudly with a service
message is what makes that copy correct again.

---

## Open at end of 2026-08-22 (3a / 3b session) — superseded by the 2026-08-23 section below

### What this session did

Objectives **3a and 3b closed**, plus two bugs found by using the app rather than
by reading it. Detail in the three sections above; outcomes only here.

- **3a — two defects fixed.** Production stored *Tesseract's* transcription, not
  Gemini's, and `fieldConfidence` was `text.length < 40`. Both live-verified.
- **3b — descope wording corrected.** `visionLabels` is always `[]` because
  `@google-cloud/vision` is not installed (verified by `import()` at runtime, not
  by reading `package.json`). The descope decision itself stands.
- **URAT and calculator steps rendered blank** — both question tables held 0 rows
  and nothing had ever seeded them. Now seeded on boot, guarded, tested.
- **A Gemini 503 became confident garbage** — and exposed that the confidence
  rule shipped hours earlier was *circular* on the fallback path. Three fixes.
- **`CLAUDE.md` gained a response-style section** after the session's own
  communication failures.
- **3c's sample-prep protocol written and shared** (artifact), including a
  ready-to-copy proposal and its predicted per-field result.

**Two claims made this session were wrong and were corrected in place:** the
entropy gate is *not* inert (PNG 3.33 fails, JPEG 5.89 passes — it bites
digitally-clean images), and "3c is blocked only on the samples" was true of the
CER half only, not SUS.

### Branch state — ready, NOT merged

`fix/ocr-transcription-preference`, **8 commits, local, nothing pushed.**
`master` is an ancestor, so it fast-forwards.

Gates, run fresh at the tip: jest **301/301 across 28 suites**, measurement
**257/257**, `tsc --noEmit` 0, `svelte-check` **119/14 — unchanged from
baseline**. **No entity or migration is touched**, which matters because
`main.ts` runs `updateSchema()` on every boot: merging cannot alter the schema.

Two commits are broader than the branch name suggests (`10a1365` seeding,
`237cbcc` resilience) — accurate history, misleading label.

### In progress — nothing half-done

### What is NOT verified, and must not be claimed

- **The 503 retry and the fail-loud path are test-proven only.** A real 503
  cannot be forced without editing `.env`. The circular-evidence bug was
  *diagnosed* from live data; its fix is not re-observed in the app.
- **`SUPPORT_THRESHOLD = 0.5` is a guess.** 3c replaces it.
- **3a's accuracy is unmeasured** — hence 🟡, not 🟢.
- The healthy-path re-check after the fixes is the **user's observation**, not a
  measurement taken here.

### Next step

1. **Merge this branch** (fast-forward, no schema impact).
2. **The substantive work available now is the three linked problems** proposed
   on 2026-08-22 and still untouched — see the superseded close-out above: SO
   4.4's missing *action* on the flag, `AI_SCORE_NORMALIZATION_ENABLED` not
   gating task normalization, and a mentor being unable to correct a baseline
   score. **3c cannot start without the ten handwritten samples**, so this is the
   §0 work that is not externally blocked.
3. **3c when the samples exist.** CER harness design is agreed but unwritten; the
   protocol is shared. SUS is being built by the team, not here — and the
   instrument must exist *before* the sample-writing session, because that
   sitting is the only natural chance to catch respondents straight after use.

**New this session, logged not fixed:** `@Controller('readinesslevel')` has no
guard, so its endpoints answer unauthenticated, and `Application.svelte` calls
them with a bare `fetch` carrying no credentials — guarding it without fixing the
caller repeats the PR #15 trap. See `TODO_CHECKLIST.md` §2.

---

## 2026-08-23 — the three linked controls, all silent, all now doing what their names say

Branch `fix/silent-controls`, **3 commits, local, nothing pushed.** `master` is
an ancestor, so it fast-forwards. Zero Gemini generation calls.

The three problems proposed 2026-08-22 and untouched since. They share one
shape — **a signal computed correctly and then ignored** — and each turned out
to hide a second defect that only a live check could find.

### 1. `AI_SCORE_NORMALIZATION_ENABLED` now gates the paths it names

The scope check the item demanded changed the item. `generateInitiativesFromPrompt`
and the RNA path do **not** normalize — but **`generateRoadblocksFromPrompt`
carries the identical defect and was on no list.** Both now return the model's
output untouched when the flag is off.

**Absence of the fields, not raw-valued ones:** `rns.service.ts:433` reads
`target_level_normalized ?? rawTarget`, so omitting them yields deviation 0.

**The "do not do this silently" caveat resolved clean:** `backend/measurement/`
references neither function, so no stored measurement result was produced
through these paths. The test pinning the old behaviour was inverted in the
same commit, and `generateRoadblocksFromPrompt` **had no unit test at all**.

**Found and logged, not fixed:** `riskNumber_normalized` has **zero consumers
anywhere in either app** — computed, appended, discarded. See `TODO_CHECKLIST` §4.

### 2. A mentor can correct a baseline score

The rated view carries a mentor-only **"Revise baseline scores"** button opening
the same form seeded from stored levels, with Cancel. Chosen over an
always-visible form so a normal visit has no stray-click surface.

**`readiness()` (`+page.svelte:141`) was dead code** — defined, never consumed —
and carried a real latent bug: its empty branch returned **lowercase** keys while
its success branch returned **capitalised** ones. Deleted and replaced by
`frontend/src/lib/readiness-baseline.ts`, which always returns all six keys
because a partial record posts `undefined` into an upsert.

**Live-verified on a throwaway startup**, guarded before and after on AgroLink's
and MediSync's exact levels: six *distinct* values `T7 A2 M5 O8 R3 I6` (uniform
values cannot detect dimension mis-mapping), button survives a reload, Revise
seeds all six, and **Technology 7 → 4 updated row id 20 in place with the count
still 6** — the upsert's update branch running from the app for the first time.
Cancel discards.

**The frontend has no test runner at all** — zero test deps, zero test files.
Agreed approach: extract the pure rule, verify live, and log adding a runner
rather than smuggle a dependency into a bugfix branch.

### 3. SO 4.4 — the flag now has an action

**Approving an application whose summary is flagged requires the Manager to
confirm they reviewed it against its unmet criteria**, and the approval writes
an `activity_logs` row with their identity, the verdict and its source.
Unflagged approvals are unchanged and log nothing, so the log means "approved
against a warning" rather than being an access log. No new entity, **no schema
change** — which matters because `main.ts` runs `updateSchema()` every boot.

**Why approval specifically, and why not a hard block.** The Manager's role in
this system is the **admissions decision** — Applications module, unscoped
`findAllForUser`, approve/waitlist with mentor and assessment assignment at the
moment of approval. The summary is decision support for that one call. Blocking
the decision authority on a heuristic calibrated at n=10 inverts the hierarchy
and leaves no legitimate override, so the action attaches to the decision
without removing it. Waitlisting is deliberately ungated.

**Enforced in `approveApplicant`, not in the dialog.** The route is
`JwtGuard`-only and takes a client-controlled body, so a disabled button is not
a control. It reuses `attachSummaryVerdicts` so the gate cannot refuse an
approval for a summary the badge showed as balanced.

#### The defect that matters most this session

**`findOne` had no `populate`, so the gate silently never fired — past four
green unit tests.** The relation loaded as an id-only reference
(`select "s0".*, "c1"."id"`), `aiAnalysisSummary` read `undefined`,
`attachSummaryVerdicts` early-returned, and the very first live request
**approved a flagged application**. No mock-level test could have caught it: the
mock hands back a fully-formed `capsuleProposal`. Promoted to a standing note.

**Second defect, pre-existing:** `approveStartup` swallowed non-ok responses
while the dialog reported success regardless — a 409 would have rendered as
*"Startup has been approved successfully"*. It now throws with the server's
message and the dialog surfaces it. **Without this fix the gate would have been
invisible even while working.**

**Live-verified** on a throwaway pending application with a verifiably flagged
summary (ratio 0.000), plus a balanced control (ratio 0.800):

| step | result |
|---|---|
| flagged, no acknowledgement | **409**, status stays PENDING, **0** log rows |
| flagged, acknowledged | approved, status QUALIFIED, **1** row naming `manager@launchup.local` |
| balanced, no acknowledgement | approved unblocked, log count **unchanged** |
| browser, mentor assigned, unticked | Approve **disabled** — mentor assigned first, so the checkbox is the only blocker |
| browser, ticked | Approve enabled; full approval reaches the database |

The 409 body is readable cross-origin, which is the path the new error handling
reads.

### A guard of mine was vacuous, and it passed twice

The ground-truth guard used `JSON.stringify(obj, Object.keys(...).sort())`. A
replacer **array** filters keys at every level, so the root's `1`/`2` were
stripped and it compared `{}` to `{}` — **it would have passed while the
measurement levels were being overwritten.** Caught before any write, fixed with
a recursive canonicaliser, and then *proved* to reject a deliberately wrong
value. Same family as 2026-08-22's `grep -o "Error:.*"`. Promoted to a standing
note.

### Gates at the tip

Backend jest **308/308 across 28 suites** (301 at the previous tip), `tsc
--noEmit` 0, `svelte-check` **119/14 — unchanged from baseline**, with neither
new frontend file appearing in the output and the extractor proven non-vacuous
(119 `Error:` matches). **No entity or migration is touched.**

Mutations, all killed, each asserted to have landed *and* changed behaviour:
disabling the tasks guard; inverting the roadblock guard; disabling the
approval gate; logging every approval; removing the `populate`.

### Open

- **3c is still blocked only on the ten handwritten samples.** CER harness
  design agreed, unwritten; SUS owned by the team and must exist *before* the
  sample-writing sitting.
- **RNA generation quality remains unmeasured** — every grounding figure is the
  levels probe. Needs a harder probe, not more reps.
- **Metric 3 beyond the FAIL** — a separately pre-registered per-startup floor,
  scored on new data. Calibrating on the 2026-08-20 run is the forbidden move.
- **The frontend has no test runner** (`TODO_CHECKLIST` §4).
- Unchanged open decisions: production cookie policy; `readinesslevel`
  unguarded (and its caller sends no credentials, so guarding it alone repeats
  the PR #15 trap); admissions endpoints not restricted to Manager/Admin; RNS
  correlation-key uniqueness; stale verdicts on artifact edit.

### Not verified, and must not be claimed

- **The failure toast itself was not observed.** The 409 and the readability of
  its message were verified; the `toast.error` render was not.
- The acknowledgement is **per-approval, not per-session** — a Manager who
  reopens the dialog must tick again. Deliberate, but untested across a reload.

### Manual verification by John — both features confirmed from the database side

John tested items 1 and 3 in the browser after the branch was built. The state
left in Neon is independent confirmation, not a report:

- **Startup 10** (flagged, pending fixture) went **Pending → Qualified** with
  exactly **one** `activity_logs` row naming `manager@launchup.local`. The
  acknowledged-approval path works end to end through the UI.
- **Startup 11** (rated fixture) reads `Technology=4` with `A2 M5 O8 R3 I6`
  untouched. The revise flow updated **one dimension in place** — the upsert's
  update branch, reached from the app.
- **AgroLink and MediSync unchanged** throughout, asserted before and after
  every fixture command.

`backend/probe-manual-test.js` provides `setup` / `status` / `teardown` for this,
each guarded on the 2026-08-05 ground truth and refusing to run if it has moved.
**Untracked at time of writing** — decide whether to keep it as a dev utility or
delete it.

### Item 2 has no user-visible effect, and that was discovered late

While writing the manual test steps it turned out **`target_level_normalized`
has no live consumer either**. Its only reader (`rns.service.ts:433`) feeds a
`deviation` const on the next line that is **never used** — `recordBiasAudit`
is passed a different expression on `:440`. So both normalization outputs are
unconsumed, and the 4c flag fix is **provenance-correctness only**: it stops an
`ai_generation_runs` row stamped `scoreNormalization: false` from carrying
normalized values, and it saves a `normalizeScore` call per task and roadblock.
Nothing in the UI changes. The checklist claim that it "has exactly one
consumer" was corrected in `ea3d9f0`.

**Do not present item 2 as a user-facing fix.** It is an attribution fix inside
the table built to make measurement arms attributable.

### A caveat on what the audit trail proves

The `activity_logs` row is written with `action: 'Manager'`, but
`approve-applicant` is `@UseGuards(JwtGuard)` only — the deferred §1 P1 item.
**Any authenticated user, including a `Startup`-role account, can still call
it.** The gate makes them acknowledge and records whoever they are in `actor`,
so the row is honest about identity; the `'Manager'` string is an assumption,
not an enforced fact. This bounds what the audit trail proves and is worth
saying plainly rather than being asked.

### Merge readiness — gates re-run at the tip after testing

| gate | result |
|---|---|
| backend jest | **308/308**, 28 suites |
| measurement | **257/257** |
| `tsc --noEmit` | exit 0 |
| `svelte-check` | **119 / 14** — unchanged from baseline, extractor proven non-vacuous (119 `Error:` matches) |
| merge shape | `master` is an ancestor → **fast-forward** |
| entity / migration files touched | **0** |

Five commits: three fixes, two docs. The zero on the last row is the one that
matters operationally — `main.ts` runs `updateSchema()` on every boot, so a
branch touching no entity cannot move the schema.

### State at session end

**Not merged, not pushed.** Outstanding before or alongside the merge:

1. **Fixtures 10 and 11 are still in Neon**, plus one `activity_logs` row.
   Harmless, but they appear in the Applications list during a demo.
   `node probe-manual-test.js teardown` removes them, guard-checked.
2. **`backend/probe-manual-test.js` is untracked** — keep as a dev utility or delete.
3. **The failure toast was never observed.** The 409 and the cross-origin
   readability of its message are verified; the `toast.error` render is not.

### Next step

**Merge `fix/silent-controls` to `master` locally** (fast-forward), after the
fixture teardown. Nothing is pushed without asking.

Then the §0 work that is not externally blocked is **thin**, and that is the
real headline for planning:

- **3c is blocked only on the ten handwritten samples** — the single largest
  remaining objective, and it cannot start here. The CER harness design is
  agreed but unwritten; SUS is the team's and must exist *before* the
  sample-writing sitting, because that is the only natural chance to catch
  respondents straight after use.
- **RNA generation quality is still unmeasured.** Every grounding figure is the
  levels probe, a harness construct; production's RNA path retrieves 12 rubric
  rows rather than 54. Needs a harder probe, not more reps. This is the most
  valuable *unblocked* measurement left.
- **Metric 3 beyond the FAIL** — a separately pre-registered per-startup noise
  floor, scored on new data. Re-scoring the 2026-08-20 run under one is the
  forbidden move.
- **4b's remaining half** (the readiness-*scoring* path) is a larger job than a
  prompt change and was deliberately deferred on 2026-08-18.

Recommendation: **merge, then take the RNA generation probe**, because it is
the only item on that list that is both unblocked and load-bearing for an
Objective 1 claim. Everything else is either waiting on the samples or is a
second measurement of something already measured.
