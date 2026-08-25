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
- **A doc patch can corrupt line terminators invisibly.** A newline substitution ran twice on the same text — joined with CRLF, then every LF expanded to CRLF again — giving CR+CRLF, invisible in the editor and in `git diff`. Surfaced only by a diffstat far larger than the edit justified, then `file` reporting "CRLF, CR line terminators." Treat an oversized diffstat as a signal, not noise.
- **Playwright MCP refuses `file:` URLs and writes only inside the repo root.** Serve a scratch page over `http://127.0.0.1` instead, and clean `.playwright-mcp/` afterward — it is not gitignored.
- **`allowGlobalContext` is unset (false), so a boot-time `app.get(...)` throws.** Boot seeders must take `orm.em.fork()` — every seeder in `main.ts` already does this.
- **A capsule-proposal vision call took 175 s.** Budget client/HTTP timeouts well beyond a default before blaming the pipeline.

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

## Compressed — 2026-08-22

Compressed 2026-08-23 under the three-most-recent rule, from four sections
(the deferred-cleanup sweep, its SUPERSEDED close-out, the OCR transcription
fix, and its superseded open-items summary). Full detail lived in those
sections and in `TODO_CHECKLIST.md`; durable gotchas are in **Standing
operational notes** above. Both SUPERSEDED sections were superseded because
the *plan* they proposed was later completed (`fix/silent-controls`,
2026-08-23, covered above), not because their content was wrong — their
findings are folded in below.

**`chore/deferred-cleanup-sweep`** (merged as PR #30, `b0d5fc8`). Traced the
one ⚠️ left by the demo-critical sweep — "re-save baseline scores, expect a
toast" — and found **there was no button to click**: the live save path
(`submitBaselineScores` → `POST /readinesslevel/startup/:id/rate`, a real
find-or-create upsert) is real, but the mentor form is gated
`{:else if isRated()}` and both demo startups already have all six rows, so
it never renders. **The "zero-risk" procedure was the opposite of
zero-risk** — `baselineScores` initialises to all-`1` and is never seeded
from stored rows, so had the form rendered, a Save without touching all six
selects would have overwritten the 2026-08-05 measurement ground truth with
`T1 M1 A1 O1 R1 I1`; `isRated()` was the only thing standing between a stray
click and that. Fifth instance of "the recorded symptom/procedure is real in
description, nobody checked whether the code carrying it can execute" — the
first time it applied to a verification step rather than a bug.

**The red suite went green: 266/266 across 25 suites** (first time). The
recorded conclusion held — the old test's expectation was wrong (`3`, the
raw level, not `5`/`0`, what mocked `normalizeScore` actually returns) — but
the recorded **mechanism** was wrong: it blamed `scoreNormalization: true` in
the test context, but that flag never reached `generateTasksFromPrompt`
(`ai.service.ts:984-992`), which normalized unconditionally regardless of the
flag (`ctx.config.scoreNormalization` is read only inside `reviewBiasScore`).
Cost: an `ai_generation_runs` row stamped `scoreNormalization: false` still
carried normalized `target_level` values — same class of bug as the
`temperature` top-level config bug. Logged rather than fixed inline (a
production behaviour change belongs in its own commit); **fixed 2026-08-23**
as item 1 of `fix/silent-controls`, above. "A second failure is a real
regression" retired — any failure is now the signal.

**`chumcheck` purged** — all three `scripts/` files and the directory
deleted; nothing in code referenced them. `delete_db.sh` had never been
executable as written (unquoted raw SQL on lines 4–5 inside a `#!/bin/bash`
file); `reset_db.sh`/`.ps1` were the real hazard, both a valid
`DROP DATABASE ... WITH (FORCE)` against a local Postgres superuser. Deleted
rather than repointed — Neon uses branches, not drop-and-recreate, and
`docker-compose.yml`'s `launchup_db` is unused. **Branch sweep: 23 → 3** — 20
`[gone]` branches deleted after verifying each was an ancestor of `master`
(`git branch -d`, not `-D`), then `backup/rag-corpus-preflight` deleted after
its three capstone PDFs were verified byte-identical by SHA-256 to
`Downloads\capstone` — the branch's unique content was almost entirely files
already deleted elsewhere, not extra work.

**The save verified live, and found a bug the probe alone could catch.** A
throwaway startup (`ZZ Save-Path Probe`, created/used/removed inside a
transaction that refused to commit unless AgroLink/MediSync still held their
12 rows) took six *distinct* values (`T7 A2 M5 O8 R3 I6` — uniform values
can't detect dimension mis-mapping between the form's display order and the
enum order) through six real `201`s. 🐞 **New bug:** the first save flips
`isRated()` permanently, so `rateStartupReadinessLevel`'s upsert **update**
branch was unreachable from the app — a mistyped baseline score could only be
fixed by SQL, and the naive fix (re-expose the form) was unsafe on its own
because of the all-`1` default above. **Fixed 2026-08-23** as item 2 of
`fix/silent-controls` (a mentor-only "Revise baseline scores" button, seeded
from stored levels). ⚠️ **`GET /readiness/:startupId` writing on every read
reproduced incidentally** — two page views left two `readiness_evaluations`
rows and 12 dependent `readiness_gaps`; the existing `TODO_CHECKLIST.md` §2
item is confirmed real, not theoretical.

**`fix/ocr-transcription-preference`** (8 commits, later merged; gates at tip
jest 301/301 across 28 suites, measurement 257/257, `tsc --noEmit` 0,
`svelte-check` 119/14 unchanged, no entity/migration touched). Two defects:
(1) `parseCapsuleProposal` stored **Tesseract's** transcription, not
Gemini's — the guard (`raw_transcription && !parsedText`) was the inverse of
its own comment, and since Tesseract is installed `parsedText` was always
truthy, so Gemini's `raw_transcription` reached **no consumer anywhere in
either app** (the `OCR_PLACEHOLDER` sentinel beat it too). `detectSketch`
deliberately still reads Tesseract's output — its weights are tuned to that.
(2) `fieldConfidence` was `text.length < 40`, which graded compliance with
the extraction prompt's own 40-character minimum instruction rather than
accuracy; replaced with content-word overlap against the transcription
(`src/ocr/field-confidence.ts`). The frontend also defaulted a missing field
to `'verified'`, rendering green for something never scored.

**Live-verified** with synthetic handwriting (Caveat font, 1600×1200 JPEG)
against the running server/Neon: every field present on the page scored
`verified` (4/4), every field the model had to infer scored `low` (4/4).
**n=1, one document, a font is not handwriting** — this proves the wiring,
not accuracy; `SUPPORT_THRESHOLD = 0.5` remains a guess until 3c runs on real
samples, and **3c is blocked on both the ten handwritten samples (CER) and a
SUS instrument the team owns and must exist before the sample-writing
sitting** — not the samples alone, a correction made here. Two claims made
earlier the same day were also wrong and corrected in place: the entropy
gate is **not** inert (measured: same page PNG scores 3.33/rejected, JPEG
5.89/passes — it bites digitally-clean images, camera photos survive on
sensor noise); `@google-cloud/vision` absence was verified by runtime
`import()` (`ERR_MODULE_NOT_FOUND`), not by reading `package.json`.

**Same session, unrelated to the branch: URAT and calculator steps rendered
blank.** `urat_questions`/`calculator_questions` held 0 rows — the 18 URAT +
35 calculator questions lived only inside two `AppService` generator methods
whose only callers (three `@Post` endpoints) were all commented out, so the
data died in the 2026-07-26 wipe and was never restored (`readiness_levels`
kept its 54 rows, unaffected). Silent because both endpoints answered `200`
with `[]`. Fixed: banks extracted to `src/assessment-questions.ts`, seeded on
boot guarded on emptiness (the original loop had no guard — a second run
would have produced 36 URAT questions, each applicant seeing every question
twice). Verified at three layers: endpoints return 18/35, DB holds 18/35, UI
renders 18 textareas. **Found and logged, not fixed:**
`@Controller('readinesslevel')` has no class-level guard and its only caller
(`Application.svelte`) sends no credentials — guarding one without the other
repeats the PR #15 trap (`TODO_CHECKLIST.md` §2, still open).

**Same session: a live 503 became confident garbage, exposing a circular
confidence rule.** Vision **503 UNAVAILABLE** (not 429/quota — the two must
never share a code path) → swallowed by `catch` → Tesseract mangled the
handwriting → a second Gemini call extracted fields from the mangling → two
fields rendered green: `solution_description` scored a support ratio of
**1.00**, `startup_description` **0.83**, against the garbage they came
from. Root cause: on the vision path both field and transcription derive
independently from the image, so a genuinely unsupported field fails to
match; on the Tesseract-fallback path (and the PDF path, same circularity)
the model extracts from the very text it's scored against, so overlap is
guaranteed. **Three TDD fixes:** `classifyField`/`scoreFields` take a
*required* `EvidenceSource` (`vision`|`derived`, `derived` caps at `low` —
required rather than defaulted so a forgotten argument can't silently
restore the bug); `src/ai/retry-transient.ts` (3 attempts, 2s/4s backoff,
never retries 429, ported from `measure-grounding.js`, which has had this
since 2026-08-03 — the harness was more robust than the app it measures); a
service failure now raises `ServiceUnavailableException`, writes no
`ocr_documents` row, and the controller passes the `HttpException` through
instead of rewrapping as a 500 (the old frontend copy told the user to
re-upload a clearer image, which for a 503 was advice to re-photograph a
perfectly good page — failing loudly with the real message fixes that too).
Verified: 300/300 across 28 suites. **Not verified live** — a real 503
cannot be forced without editing `.env`, so the retry and fail-loud path are
test-proven only; the circular-evidence bug was diagnosed from live data but
its fix was not re-observed live. A capsule vision call was separately
observed to take **175 s** — budget client timeouts accordingly.

**Open items from this date not tracked elsewhere:** `readiness_evaluations`
holds mixed-scale rows (pre- and post- the ÷5→÷9 composite correction sit in
the same table, uncorrected); Neon TLS certificate verification is disabled;
VS Code's `git.postCommitCommand` setting is unresolved.

---

## Compressed — 2026-08-23 (the three linked controls)

Merged as **PR #33** (`0ab8b48`). Three signals that were computed correctly and
then ignored; each hid a second defect only a live check could find. Zero Gemini
calls.

**4c flag now gates the paths it names.** `generateRoadblocksFromPrompt` carried
the identical defect and was on no list. **But both normalization outputs —
`target_level_normalized` and `riskNumber_normalized` — have zero live
consumers**, so this is provenance-correctness only: it stops a run stamped
`scoreNormalization: false` from carrying normalized values. **Do not present it
as a user-facing fix.**

**Mentor baseline revision.** A mentor-only "Revise baseline scores" button.
Live-verified on a throwaway startup with six distinct values (`T7 A2 M5 O8 R3
I6` — uniform values cannot detect dimension mis-mapping): Technology 7 → 4
updated row 20 in place, count still 6. Replaced dead `readiness()`, whose empty
branch returned lowercase keys and success branch capitalised ones.

**SO 4.4 gained an action.** Approving a flagged application requires the Manager
to acknowledge review, recorded in `activity_logs`. Enforced in `approveApplicant`,
not the dialog — the route takes a client-controlled body, so a disabled button
is not a control. Live: flagged + unacknowledged → **409**, status stays PENDING,
0 log rows; acknowledged → QUALIFIED, exactly 1 row; balanced (ratio 0.800) →
approves unblocked, log unchanged. Confirmed independently by John from the
database side.

**Two defects promoted to standing notes**, both of which passed green tests:
a missing `populate` meant the gate silently never fired and the first live
request approved a flagged application; and a guard using
`JSON.stringify(obj, keysArray)` compared `{}` to `{}` — it would have passed
while ground-truth levels were overwritten.

Gates at the tip: jest **308/308** (28 suites), measurement **257/257**,
`tsc --noEmit` 0, `svelte-check` **119/14** unchanged from baseline, **0 entity
or migration files touched**.

**Still open from this session:** the failure toast was never observed (the 409
and its cross-origin readability were); the acknowledgement is per-approval, not
per-session, and untested across a reload; and the audit trail's `action:
'Manager'` is an assumption, not an enforced fact — `approve-applicant` is
`JwtGuard`-only, so any authenticated user can call it. `actor` is honest about
identity. The frontend still has no test runner.

---

## 2026-08-23 (later) — metric 6 (redundant-need rate): built, pre-registered, code-reviewed

Branch `feat/rna-redundancy-probe`, local, nothing pushed. **Zero Gemini
generation calls this session** — every commit is pre-generation build,
pilot, or review work.

**What metric 6 measures.** The gap every 1b figure names: production never
asks the model to assign levels, it consumes mentor-set levels and generates
recommendations. Metric 6 mirrors metric 5's classifier on the opposite bin —
does the RNA recommend acquiring an artifact class the document already
evidences (`artifactTokens`), rather than asserting one absent. Reference-free,
`CLASSIFIER_SOURCE` untouched. Pre-registered in `measurement/README.md`
before any quota spend, per this project's standing rule against scoring
under a rule chosen after seeing the data.

**The pilot caught the metric firing almost entirely on false positives.**
Run for free against 96 real observations already on disk
(`2026-08-06-supplied-level.json`, `2026-08-09-supplied-level.json`). As
first written it fired 10 times; a hand-read found essentially all 10 false
positives — the "satisfied" token named an origin being left behind
(*"transition from paper prototype"*) or a scope a recommendation ranged
over (*"across the target market"*), never the artifact actually being asked
for. **The uncorrected headline would have read baseline 21% vs corpus 0% on
`truth` — large, quotable, wrong, and favouring the corpus specifically.**

**Fixed with an acquisition requirement.** A satisfied token now only counts
as redundant when an acquisition verb (identify/define/establish/create/
develop/build/secure/obtain/acquire/find/determine/conduct) governs it
directly, with no origin/scope preposition or progression verb intervening —
both anchored directly against the token after a same-day review pass found
the first cut unanchored and able to veto (or fail to veto) a token a
different word in the clause actually governed. Re-run on the same 96
observations: **0/96.**

**Read 0/96 as pilot confirmation, not a precision figure.** It says the
corrected detector no longer fires on the false positives it used to fire
on. It is not a true-positive rate — **the metric has never yet produced a
true positive on real generated text**, because every observation scored so
far predates the metric existing as a probe.

**Defects fixed along the way, all caught before quota was spent:**

- **Two binary condition ternaries.** `levelsForCondition` and
  `conditionField` mapped only truth/inflated; a third (`deflated`)
  condition would have received truth-condition levels while being stored in
  the inflated pool — an unmanipulated prompt under a manipulated label,
  silently. Made total maps before `deflated` was added.
- **A merge double-push.** Metric 6 rescores the same stored
  `assertionTruthCalls`/`assertionDeflatedCalls` metric 5 already owns.
  `mergeRuns` iterates per metric key, so without a per-field guard a shared
  field would be pushed once per key referencing it — doubling `n` for any
  file scored by both metrics. Closed with a per-arm `fieldsPushed` set in
  the same commit that wired the sharing up, before it could ever ship.
- **A merge refusal that logged but never enforced.** `refusedKeys` was
  computed and printed to the console ("Not pooled...") but
  `summarizeResults` never consulted it — a refused pool still printed a
  number for both metric 5 and metric 6. Fixed in the commit that completed
  metric 6's fingerprint grid; both metrics' rows now read `refused` when
  their own key is refused.

**Then code-reviewed, and five more gaps closed** (fix-wave commits later the
same day):

- Metric 6 had no honesty column — `mentioned`/`unclassified` were computed
  per observation but never reached the printed row, so a printed
  `truth 0% (n=6)` was indistinguishable from the classifier reading nothing.
- `--merge`'s refusal for metric 6 is correct but was undocumented: no
  stored file predates the probe, so `--merge results/*.json` will correctly
  refuse every metric-6 row, including the fresh run's own valid data.
  Documented, not changed.
- `redundancy-inflated|<arm>` was fingerprinted and refusal-enforced but
  `printReports` hand-rolled `truth`/`deflated` only, orphaning the
  `inflated` row the code's own comments already said it reports. Fixed by
  switching to `console.table`, matching metric 5.
- A blank-string dimension was scored clean instead of skipped — the guard
  only caught `undefined`/`null`. At `--reps=1` (~6 observations/row) one
  blank moved a row's rate by roughly 17%.
- The null-dimension guard had no dedicated test. Added one, then proved it
  non-vacuous by mutation: weakening `typeof text !== 'string'` to
  `text === undefined` throws `TypeError: Cannot read properties of null
  (reading 'trim')` rather than silently mis-scoring — the guard is
  load-bearing, not decorative.

`backend/measurement/lib/assertions.js` stayed untouched throughout (its
source is hashed into every stored fingerprint). Measurement suite 300 → 304,
every new test failing before its fix and green after.

**The 12-call run was pre-registered, then run the same day — see below.**
Command and full rationale in `measurement/README.md`'s metric 6 section:

```
node measurement/measure-grounding.js --only-arm=baseline,sdd-semantic,deviation-deterministic --only-probe=rna --level-condition=truth,deflated --reps=1 --out=measurement/results/<date>-rna-redundancy.json
```

3 arms × 2 startups × 2 conditions × 1 rep = 12 calls, against a 20/day
free-tier budget.

## 2026-08-23 (evening) — the run, and prediction 1 failed

`measurement/results/2026-08-23-rna-redundancy.json`. 12/12 calls, no 429s,
no 503s, no retries.

**`redundantRate` is 0 in all six arm × condition cells** — `truth` and
`deflated` alike, every arm. `deniedCount` 0 everywhere. `mentioned` and
`unclassified` are equal in every cell (baseline truth/deflated 2/6, 1/6;
sdd-semantic 2/6, 2/6; deviation-deterministic 1/6, 1/6): every clause that
mentioned a satisfied token landed in `unclassified`, none in `recommended`
— so the acquisition gate never had a `recommended` verdict to act on. That
is consistent both with the model never making this error and with the
classifier being unable to read these constructions at all; this run can't
tell those two apart.

**Prediction 1 — the pre-registered rule that `deflated` must read
substantially above `truth` or the run is void — failed.** `deflated` reads
identical to `truth`: 0 everywhere. By the rule written before the run, this
voids it as a model result. Prediction 2 (corpus arm worse than baseline
under `deflated`) is untestable as a consequence — there is no arm
difference to read when every arm is 0.

**The pre-registration's own inference from a failed control turned out to
be wrong, and that's now recorded in `measurement/README.md` rather than
quietly revised.** The README said a failed control "reports a detector
problem." Reading the actual generated text under the deflated condition
shows the opposite: every arm produced forward-looking recommendations
correctly anchored to the source document, never a claim that the startup
already has what the deflation removed — e.g. *"Needs further market
penetration across the remaining target facilities"* (`baseline`, MediSync,
deflated). The manipulation didn't induce the target behaviour, so the
detector had nothing to catch. Different failure from a blind detector; the
two must not be conflated.

**The honest claim this run supports is narrow: the model did not make this
error in these 36 observations.** Not "the detector works," not "the model
is robust to a deflated supplied level." The two uncaught classes named in
the pre-registration (passive/postposed acquisition; acquisition verbs
outside the frozen list) are completely untested by this run. n=1 rep, 2
documents, 3 arms, one model.

**Also observed, not this run's question, n=1:** metric 5's `asserted` is
0/6 on every arm both conditions; `mentioned` on `truth` varied — baseline
1/6, `sdd-semantic` 2/6, `deviation-deterministic` 4/6.

Full arm × condition table and the complete verdict live in
`measurement/README.md`'s metric 6 "Result, 2026-08-23" subsection. Next
step: a stronger manipulation or a document/level pair where the rubric
criterion is unambiguously already met — pre-registered before it runs, same
as this one was.

---

## 2026-08-25 — first deployment of this codebase, and a cookie that could never have worked

Two threads: midterm planning, and getting both apps deployed for the first
time. PRs **#35, #36, #37**, all merged; tip `b93e213`. Zero Gemini generation
calls.

- Backend: Render free — `https://launchup-4w6d.onrender.com` (Render suffixed
  the name; `launchup-api` was not granted)
- Frontend: Vercel — `https://launchup-enhanced.vercel.app`

**The live `launchup.vercel.app` / `launchup.onrender.com` pair is the previous
team's.** This codebase had never been deployed at all — a different problem
from a broken deployment, because there was no working configuration to restore.

### Four failures, in the order they appeared

1. **`nest: not found`.** Render sets `NODE_ENV=production`, so pnpm skips
   devDependencies and `@nestjs/cli` disappears. Build command must be
   `pnpm install --prod=false && pnpm build`.
2. **`Cannot find module dist/main` — `pnpm start` has never worked here.** The
   standing note that `nest build` emits to `dist/src/` (because `seed-dummy.ts`
   sits at the backend root) already existed; `package.json`'s `start` script is
   an unfixed instance of it, invisible locally because `pnpm dev` never reads
   that path. Render's start command is overridden to `node dist/src/main`.
   **`package.json` itself is still wrong** — see `TODO_CHECKLIST` §4.
3. **No shell on Render's free tier** (paid-only), so the RAG corpus cannot be
   seeded after deploy. Moved into the build command instead, which is safe only
   because the seeder is idempotent: first run reported `0 created, 0 updated,
   64 unchanged, 0 embedded, 0 failed` — the Neon `production` branch inherited
   the corpus as a copy-on-write clone of `main`.
4. **`Unsupported Node.js version: v22`.** Deleting `frontend/vercel.json`
   removed a **load-bearing** `NODE_VERSION=20` pin: `adapter-auto@3` resolves to
   `adapter-vercel@4`, which recognises only Node 18 and 20. Pinning back to
   Node 20 fixes the build and breaks local dev, since pnpm enforces `engines`
   and everyone is on 22. Fixed by dropping `adapter-auto` for
   `adapter-vercel@6` — which the build log itself recommends.

### The cross-domain cookie — and why `axios.ts`'s comment was wrong

Pages rendered, every guarded client-side call returned 401, and the preflight
returned 204, so CORS was never the problem.

**`sameSite` was never the obstacle either.** The `Access` cookie is set by
SvelteKit and scoped to the frontend's own host, and a browser picks cookies by
**destination** host — so nothing held for `vercel.app` can be sent to
`onrender.com`. Different registrable domains cannot share a cookie, whatever
SameSite says; SameSite only governs a cookie that already matches.
**Locally both apps are `localhost`, and cookies ignore ports**, so this
mismatch cannot appear in development. The `sameSite: 'none'` change shipped
earlier the same day was harmless and pointless.

The network tab split the case cleanly: `getData()` in `lib/utils.ts` sends an
explicit `Authorization: Bearer` header and worked cross-domain; everything
relying on `withCredentials` failed. Same origin, same session, same backend —
only the credential channel differed.

Fixed with a same-origin proxy (`routes/api/[...path]/+server.ts`) that swaps
the cookie for a Bearer header: axios `baseURL: '/api'` covering 19 callers, 49
direct fetch sites across 16 components rewritten, `getData` dropped its
absolute prefix. The 13 `.server.ts` files are untouched — they hold the token
already. `sameSite` reverted to `'strict'`, correct again and stricter than the
state that shipped.

### New finding — the httpOnly cookie is partly defeated

`getData(url, access)` takes the raw JWT from `data.access`, so **the token is
serialised into the page payload the browser receives.** Any XSS reads it out of
hydration data without needing cookie access. The proxy makes the argument
unnecessary; removing it means dropping `data.access` from the layout load and
the parameter from ~40 call sites. Logged in `TODO_CHECKLIST` §1.

### Midterm planning

Course targets read against the repo. Recommended framework: **TAM primary, with
SUS and task success / time-on-task supporting**, and the existing measurement
harness presented as a separate output-quality layer rather than a substitute.
System type settled as **business/organisational workflow tooling** — the
educational frameworks and SBCVM are both out, the latter being the trap, since
the domain is startups but the deliverable is not a startup concept.

**Two deliverables are at zero: the SPMP and the traceability matrix.** Neither
exists in the repo or the capstone folder. `TODO_CHECKLIST` §0 is already most
of a traceability matrix and needs SRS requirement IDs, not a rewrite.

### Verified from outside

Backend `200` in 0.24 s; CORS preflight `204` with the correct
`access-control-allow-origin` and `-credentials`; frontend landing and `/login`
`200`; `/startups` while logged out `302 → /login?redirectTo=%2Fstartups`, which
proves `hooks.server.ts` runs and — since `JWT_SECRET` is a build-time static
import — that the secret is present. Login confirmed by John for both
`demo@` and `admin@`.

`svelte-check` **119/14 across 43 files, unchanged from master**, with none in
the touched files. Local `pnpm build` completes both vite phases and then fails
on Windows symlink permissions, which does not apply to Vercel's Linux builders
— so the proxy is **verified as far as this machine allows, not end to end**.

### Open

- **Retest Readiness Level after the proxy deploy** — `POST /api/readiness/score`
  should return 200 on the app's own origin.
- **Gemini ~20 calls/day is the binding constraint on the 30-user study.**
  Pre-seed the AI artifacts so testers review output rather than generate it —
  which is the product's real workflow anyway.
- `debug: true` (`mikro-orm.config.ts:26`) sends every SQL query, parameter
  values included, to Render's logs.
- `main.ts` seeds on every boot, so each redeploy re-seeds demo data into the
  production database.
- Render free spins down after 15 minutes with a ~1 minute cold start. Warm it
  before validation sessions.
- IDOR and the admissions endpoints are still `JwtGuard`-only — now behind a
  public URL rather than localhost.

### Next step

Confirm the proxy in the browser, then close the two production-hygiene items
(`debug: true`, boot seeding) before any second account exists. After that the
midterm critical path is the SPMP and traceability matrix, which compete for the
same two weeks as the 30-user study.
