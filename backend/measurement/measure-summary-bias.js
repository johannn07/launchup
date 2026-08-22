/**
 * Does the adversarial pre-analysis (SO 4.2) actually change the readiness
 * summary, and does it do so WITHOUT collapsing the two demo startups into
 * uniform harshness?
 *
 * Two arms, one call each:
 *
 *   baseline     adversarialSummary: false - LEGACY_SUMMARY_PROMPT, the prompt
 *                that shipped before 2026-08-11, free text
 *   adversarial  adversarialSummary: true  - ADVERSARIAL_SUMMARY_PROMPT plus a
 *                field-ordered responseSchema, so unmet_criteria must be emitted
 *                before summary
 *
 * 2 arms x 2 startups x 3 reps = 12 planned calls, which fits one free-tier day
 * (20 generateContent calls, window resets 15:00 Philippine time).
 *
 *   node measurement/measure-summary-bias.js --dry-run --out=<scratch>/x.json
 *   node measurement/measure-summary-bias.js --fingerprint
 *   node measurement/measure-summary-bias.js --reps=3 \
 *     --out=measurement/results/<date>-summary-bias.json
 *
 * ## Why this boots Nest instead of calling the SDK
 *
 * measure-grounding.js reimplements its prompts and calls @google/genai
 * directly, which is why it twice measured a property of its own prompt rather
 * than of the model. Here the artifact under test is a production METHOD -
 * AiService.generateStartupAnalysisSummary - including its schema, its zod
 * validation, its corrective retry and its legacy fallback. Reimplementing that
 * would measure the reimplementation. So the harness resolves the real service
 * out of a real container (NestFactory.createApplicationContext, the technique
 * SESSION_NOTES.md prescribes) and calls the method.
 *
 * Consequence: this needs Neon reachable and GEMINI_API_KEY in backend/.env,
 * even under --dry-run. Booting is the point, not overhead.
 *
 * NOT side-effect free, even under --dry-run: callAiExpectJson's failure
 * bookkeeping appends to backend/data/ai-metrics.json on every schema miss, so a
 * degraded cell leaves rows in a tracked file. Nothing else is written - this
 * path opens no ai_generation_runs row and touches no EntityManager.
 * `git checkout -- data/ai-metrics.json` after a dry run.
 *
 * ## Why reps are the OUTERMOST loop
 *
 * The first version of the grounding harness iterated arm -> startup -> rep, so
 * a 20-call day was spent entirely inside the first arm and every BETWEEN-arm
 * metric read n=0. Rep-major means quota exhaustion costs precision, not the
 * comparison: what is left is a balanced partial pool. `callDescriptors()` is
 * the single source of that order and the run loop consumes it directly, so the
 * printed order and the executed order cannot drift apart.
 *
 * ## Why `source` is reported before anything else
 *
 * A schema parse failure degrades to LEGACY_SUMMARY_PROMPT - the CONTROL arm's
 * prompt - inside a run still labelled adversarialSummary: true. Any
 * `source: 'legacy'` row in the adversarial arm is baseline output wearing the
 * adversarial label, and averaging it in reproduces the confound that
 * invalidated the first grounding run. So metric 0 is a validity gate: one
 * degraded call is excluded and the reduced n reported; more than one and the
 * run is INCONCLUSIVE, because a <=5/6 schema-adherence rate is itself the
 * finding and it gets fixed in the prompt, not in the statistics.
 *
 * Degradation has two causes and only one of them is a finding about the prompt:
 * a rate limit inside the schema attempts also degrades to legacy. The two are
 * recorded separately (`degradeCause`).
 *
 * ## Quota accounting
 *
 * A cell is ONE call only on the happy path. A degraded cell costs three: two
 * schema attempts through callAiExpectJson's corrective retry, then the legacy
 * call. 12 planned cells can therefore cost up to 36 requests, well past a
 * free-tier day. The harness counts real generateContent invocations and stops
 * at --max-api-calls (default 20) rather than discovering the cap as a 429.
 */
const path = require('path');
const fs = require('fs');
const {
  fieldSet,
  overlapStats,
  completeSeparation,
  chanceReference,
  MIN_QUOTABLE_REPS,
  MAX_CHANCE_REFERENCE,
} = require(path.join(__dirname, 'lib/field-overlap.js'));

const BACKEND = path.resolve(__dirname, '..');
// dotenv 17 prints a ROTATING "tip" line to stdout on every config() call, which
// made `--fingerprint > file.json` emit unparseable JSON that differed between
// two otherwise identical runs. The env var, not just the option, because
// src/mikro-orm.config.ts calls config() itself at module load.
process.env.DOTENV_CONFIG_QUIET = 'true';
require(path.join(BACKEND, 'node_modules/dotenv')).config({
  path: path.join(BACKEND, '.env'),
  quiet: true,
});

// --------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------

const flagValue = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const KNOWN_EXACT_FLAGS = new Set(['--dry-run', '--fingerprint']);
const KNOWN_VALUE_FLAG_PREFIXES = ['--out=', '--reps=', '--degrade=', '--max-api-calls=', '--only-arm='];

const RESULTS_DIR = path.join(__dirname, 'results');

/**
 * Returns a list of human-readable errors, empty when the argv is usable.
 *
 * Called only from the `require.main` block, never at module load: when this
 * file is `require()`d by node --test, process.argv belongs to the test runner.
 */
/**
 * Resolves --only-arm into the arms to run. Case-insensitive prefix match over
 * comma-separated names, mirroring measure-grounding.js's selectCells so the two
 * harnesses behave the same way.
 *
 * Metric 3 is scoreable on the ADVERSARIAL arm only - the baseline cites no
 * proposal fields, so every one of its overlap pairs is null by construction -
 * and a full run spends 6 baseline calls that cannot contribute to it.
 *
 * An entry matching nothing is an error, never a silent drop, and an ambiguous
 * prefix is refused rather than expanded. Both failures cost calls against a
 * 20/day cap, in opposite directions.
 */
function selectArms(filter, arms = ARMS) {
  if (filter == null) return { arms, errors: [] };

  const entries = String(filter)
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const matchesFor = (e) => {
    const lower = e.toLowerCase();
    // Exact wins, so one arm's name being another's prefix never makes it
    // unselectable.
    const exact = arms.filter((a) => a.name.toLowerCase() === lower);
    if (exact.length) return exact;
    return arms.filter((a) => a.name.toLowerCase().startsWith(lower));
  };

  const available = arms.map((a) => a.name).join(', ');
  const unmatched = entries.filter((e) => matchesFor(e).length === 0);
  if (unmatched.length) {
    return {
      arms: [],
      errors: [
        `--only-arm=${filter} matched no arm: ${unmatched.map((u) => `"${u}"`).join(', ')}. ` +
          `Available: ${available}.`,
      ],
    };
  }

  const ambiguous = entries.filter((e) => matchesFor(e).length > 1);
  if (ambiguous.length) {
    return {
      arms: [],
      errors: [
        `--only-arm=${filter} is ambiguous: ${ambiguous.map((a) => `"${a}"`).join(', ')}. ` +
          `Available: ${available}.`,
      ],
    };
  }

  const chosen = new Set(entries.flatMap((e) => matchesFor(e).map((a) => a.name)));
  // Declaration order, not the order they were typed - arm order is the run
  // order and must not depend on how the flag was written.
  return { arms: arms.filter((a) => chosen.has(a.name)), errors: [] };
}

function validateArgs(argv) {
  const errors = [];

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      errors.push(`Unexpected positional argument "${arg}".`);
      continue;
    }
    if (KNOWN_EXACT_FLAGS.has(arg)) continue;
    if (KNOWN_VALUE_FLAG_PREFIXES.some((p) => arg.startsWith(p))) continue;
    errors.push(
      `Unrecognized flag "${arg}". Known flags: --dry-run, --fingerprint, ` +
        `--out=<file>, --reps=N, --degrade=N (--dry-run only), --max-api-calls=N, `+
        `--only-arm=<names>.`,
    );
  }

  const reps = flagValue('reps');
  if (reps !== null && !(Number.isInteger(Number(reps)) && Number(reps) > 0)) {
    errors.push(`--reps must be a positive integer, got "${reps}".`);
  }

  const dryRun = argv.includes('--dry-run');
  const degrade = flagValue('degrade');
  if (degrade !== null) {
    if (!dryRun) {
      errors.push('--degrade only means anything under --dry-run; a live run degrades or does not on its own.');
    } else if (!(Number.isInteger(Number(degrade)) && Number(degrade) >= 0)) {
      errors.push(`--degrade must be a non-negative integer, got "${degrade}".`);
    }
  }

  // A dry-run file in results/ is indistinguishable from real data six weeks
  // later, and every table in README.md is sourced from that directory.
  const out = flagValue('out');
  if (dryRun && out) {
    const resolved = path.resolve(out);
    if (resolved === RESULTS_DIR || resolved.startsWith(RESULTS_DIR + path.sep)) {
      errors.push(
        `Refusing to write --dry-run output into measurement/results/ ("${out}"). ` +
          'Stubbed payloads must not sit where real runs are read from; use a scratch path.',
      );
    }
  }

  errors.push(...selectArms(flagValue('only-arm')).errors);

  return errors;
}

const DRY_RUN = process.argv.includes('--dry-run');
const OUT_FILE = flagValue('out');
const REPS = Number(flagValue('reps') ?? 3);
const DEGRADE = Number(flagValue('degrade') ?? 0);
const MAX_API_CALLS = Number(flagValue('max-api-calls') ?? 20);
const DELAY_MS = 4000; // matches measure-grounding.js / measure-models.js pacing

// --------------------------------------------------------------------------
// Design constants
// --------------------------------------------------------------------------

const ARMS = [
  { name: 'baseline', adversarialSummary: false },
  { name: 'adversarial', adversarialSummary: true },
];

/**
 * The arms this invocation actually runs. A bad --only-arm resolves to [] and is
 * reported by validateArgs before main does anything, so it never reaches a
 * network call.
 */
const SELECTED_ARMS = selectArms(flagValue('only-arm')).arms;

/** Early-stage vs mid-stage. Metric 3 is the gap between these two. */
const EARLY = 'AgroLink PH';
const MID = 'MediSync Cebu';

/** A degraded cell costs three requests, not one. See the header. */
const CALLS_PER_DEGRADED_CELL = 3;

/** Below this a cell mean is not readable, so it can feed no verdict. */
const MIN_CELL_N = 2;

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const round = (n, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------------------
// Backend module loading
// --------------------------------------------------------------------------

/**
 * Requires the TypeScript sources through ts-node rather than ./dist.
 *
 * dist is the wrong dependency for this harness: refreshing it means
 * `pnpm build`, and the standing rule is never to run that while `pnpm dev` is
 * watching, because both write dist/ and the race breaks module resolution. A
 * harness that silently reads a stale dist would measure last week's prompt.
 * ts-node transpile-only costs a few seconds and reads the tree that is
 * actually checked out.
 *
 * Lazy so `require()`ing this module for its pure functions pays none of it.
 */
let _backend = null;
function loadBackend() {
  if (_backend) return _backend;

  require(path.join(BACKEND, 'node_modules/tsconfig-paths')).register({
    baseUrl: BACKEND,
    paths: {},
  });
  require(path.join(BACKEND, 'node_modules/ts-node')).register({
    transpileOnly: true,
    dir: BACKEND,
  });

  const req = (p) => require(path.join(BACKEND, 'src', p));

  _backend = {
    NestFactory: require(path.join(BACKEND, 'node_modules/@nestjs/core')).NestFactory,
    MikroORM: require(path.join(BACKEND, 'node_modules/@mikro-orm/core')).MikroORM,
    AppModule: req('app.module').AppModule,
    AiService: req('ai/ai.service').AiService,
    LEGACY_SUMMARY_PROMPT: req('ai/ai.service').LEGACY_SUMMARY_PROMPT,
    ADVERSARIAL_SUMMARY_PROMPT: req('ai/ai.service').ADVERSARIAL_SUMMARY_PROMPT,
    AiConfigService: req('ai/ai-config.service').AiConfigService,
    analyzeTone: req('ai/summary-tone').analyzeTone,
    DEMO_CAPSULE_PROPOSALS: req('demo-capsule-proposals').DEMO_CAPSULE_PROPOSALS,
    toApplicationDto: req('demo-capsule-proposals').toApplicationDto,
  };
  return _backend;
}

// --------------------------------------------------------------------------
// Call order
// --------------------------------------------------------------------------

/**
 * The 12 call descriptors, rep OUTERMOST. Pure, and the ONLY definition of the
 * order - the run loop iterates this array, so --dry-run's printed order and the
 * live run's executed order are the same list rather than two nested loops that
 * can drift.
 */
function callDescriptors({ reps, arms, startups }) {
  const out = [];
  for (let rep = 0; rep < reps; rep++) {
    for (const arm of arms) {
      for (const startup of startups) {
        out.push({ rep, arm: arm.name, adversarialSummary: arm.adversarialSummary, startup });
      }
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Rate-limit detection
// --------------------------------------------------------------------------

function is429(e) {
  const text = String(e?.message ?? e ?? '');
  return /\b429\b|RESOURCE_EXHAUSTED/i.test(text) || Number(e?.status) === 429;
}

/**
 * Rate limits do not always surface as a thrown error on this path. The SDK logs
 * some of them and callAiExpectJson's own failure bookkeeping never rethrows, so
 * a quota problem can present as an empty response that degrades quietly to
 * legacy - which would be scored as a schema-adherence failure, i.e. as a
 * finding about the prompt. Sniffing the console keeps the two apart.
 */
const RATE_LIMIT_NOISE = /\b429\b|RESOURCE_EXHAUSTED|quota exceeded|rateLimitExceeded|too many requests/i;

const looksRateLimited = (lines) => lines.some((l) => RATE_LIMIT_NOISE.test(l));

/**
 * Records console output without hiding it - every captured line is re-emitted
 * with a marker. A harness that swallows the model's own complaints is how an
 * unexplained low n= happens.
 */
function captureConsole() {
  const captured = [];
  const originals = {};
  for (const level of ['log', 'warn', 'error']) {
    originals[level] = console[level];
    console[level] = (...args) => {
      captured.push(args.map((a) => (typeof a === 'string' ? a : String(a?.message ?? a))).join(' '));
      originals[level]('   |', ...args);
    };
  }
  return () => {
    for (const level of Object.keys(originals)) console[level] = originals[level];
    return captured;
  };
}

// --------------------------------------------------------------------------
// The run
// --------------------------------------------------------------------------

/** A fresh ctx per call, so ctx.tokens attributes spend to one row. */
function ctxFor(baseConfig, arm) {
  return {
    runId: 0,
    // No ai_generation_runs row: AiRunService.begin needs a RequestContext and
    // would write a row per measurement call into the app's own provenance
    // table. generateStartupAnalysisSummary touches no EntityManager, so a plain
    // handle exercises the identical code path.
    run: {},
    config: Object.freeze({ ...baseConfig, adversarialSummary: arm.adversarialSummary }),
    tokens: { promptTokens: 0, completionTokens: 0, recorded: false },
  };
}

/**
 * Drives the 12 cells. `generate` is the generateContent implementation to
 * install on the resolved AiService: the real one in a live run, a stub under
 * --dry-run. Everything else - prompt assembly, schema, retry, fallback, tone
 * scoring, ordering, accounting - is identical in both modes, which is what
 * makes --dry-run a rehearsal rather than a separate program.
 */
async function runArms(aiService, baseConfig, opts) {
  const {
    reps = REPS,
    arms = SELECTED_ARMS,
    startups,
    dtos,
    analyzeTone,
    generate = null,
    beforeCall = null,
    maxApiCalls = MAX_API_CALLS,
    pacingMs = DELAY_MS,
  } = opts;

  const descriptors = callDescriptors({ reps, arms, startups });
  const armByName = new Map(arms.map((a) => [a.name, a]));

  const models = aiService.ai.models;
  const originalGenerate = models.generateContent.bind(models);
  const impl = generate ?? originalGenerate;

  let apiCalls = 0;
  models.generateContent = async (req) => {
    apiCalls++;
    return impl(req);
  };

  const rows = [];
  let stop = null;

  try {
    for (const d of descriptors) {
      if (stop) {
        rows.push({ ...d, status: 'skipped', reason: stop });
        continue;
      }
      // Checked before the cell, not after: a degraded cell costs three
      // requests, and finding the cap as a 429 wastes the request that finds it.
      if (apiCalls + CALLS_PER_DEGRADED_CELL > maxApiCalls) {
        stop = `budget: ${apiCalls} requests spent, a cell can cost ${CALLS_PER_DEGRADED_CELL} more, cap is ${maxApiCalls}`;
        console.log(`  [stopping: ${stop}]`);
        rows.push({ ...d, status: 'skipped', reason: stop });
        continue;
      }

      if (beforeCall) beforeCall(d);

      const ctx = ctxFor(baseConfig, armByName.get(d.arm));
      const before = apiCalls;
      const t0 = Date.now();
      const release = captureConsole();

      try {
        const analysis = await aiService.generateStartupAnalysisSummary(ctx, dtos[d.startup]);
        const noise = release();
        const rateLimited = looksRateLimited(noise);
        const degraded = d.adversarialSummary && analysis.source === 'legacy';

        rows.push({
          ...d,
          status: 'ok',
          source: analysis.source,
          // A degraded adversarial row is control output under an adversarial
          // label. Whether quota or the prompt caused it decides whether it is
          // a finding; only the prompt cause is.
          degradeCause: degraded ? (rateLimited ? 'rate-limit' : 'schema') : null,
          summary: analysis.summary,
          // Count unchanged: the criteria|* fingerprint hashes this metric, so
          // SO 4.2's result stays poolable across the metric-3 rebuild.
          unmetCriteria: analysis.unmetCriteria.length,
          unmetCriteriaDetail: criteriaDetail(analysis),
          criticalRisks: analysis.criticalRisks.length,
          tone: analyzeTone(analysis.summary),
          apiCalls: apiCalls - before,
          latencyMs: Date.now() - t0,
          tokens: { ...ctx.tokens },
          noise: rateLimited ? noise : undefined,
        });
      } catch (e) {
        const noise = release();
        const quota = is429(e) || looksRateLimited(noise);
        rows.push({
          ...d,
          // NOT a zero result. A failed call must never average in as 0
          // criticalCount, which would read as a maximally lenient summary.
          status: quota ? 'rate-limited' : 'error',
          error: String(e?.message ?? e),
          apiCalls: apiCalls - before,
          latencyMs: Date.now() - t0,
        });
        if (quota) {
          stop = 'daily generation quota reached';
          console.log(`  [quota hit: ${d.arm} / ${d.startup} / rep ${d.rep}]`);
        } else {
          console.error(`  [error: ${d.arm} / ${d.startup} / rep ${d.rep}]`, e?.message ?? e);
        }
      }

      const last = rows[rows.length - 1];
      console.log(
        `rep ${d.rep} / ${d.arm} / ${d.startup}: ${last.status}` +
          (last.source ? ` source=${last.source}` : '') +
          (last.degradeCause ? `(${last.degradeCause})` : '') +
          ` requests=${last.apiCalls ?? 0} total=${apiCalls}`,
      );

      if (pacingMs && !stop) await sleep(pacingMs);
    }
  } finally {
    models.generateContent = originalGenerate;
  }

  return { rows, apiCalls, plannedCalls: descriptors.length };
}

// --------------------------------------------------------------------------
// Aggregation
// --------------------------------------------------------------------------

const isOk = (r) => r.status === 'ok';

/** True for a row that is control output labelled adversarial. */
const isDegraded = (r) => isOk(r) && r.adversarialSummary && r.source === 'legacy';

/**
 * Rows the tone/criteria/differentiation means may read: successful, and not a
 * degraded adversarial row. The baseline arm's `source` is legitimately
 * 'legacy' - that arm IS the legacy prompt - so the exclusion is arm-specific.
 */
const analyzableRows = (rows) => rows.filter((r) => isOk(r) && !isDegraded(r));

function sourceBreakdown(rows, arms) {
  return arms.map((arm) => {
    const mine = rows.filter((r) => r.arm === arm.name);
    const ok = mine.filter(isOk);
    const degraded = mine.filter(isDegraded);
    return {
      arm: arm.name,
      planned: mine.length,
      ok: ok.length,
      schema: ok.filter((r) => r.source === 'schema').length,
      legacy: ok.filter((r) => r.source === 'legacy').length,
      degraded: degraded.length,
      degradedBySchema: degraded.filter((r) => r.degradeCause === 'schema').length,
      degradedByRateLimit: degraded.filter((r) => r.degradeCause === 'rate-limit').length,
      rateLimited: mine.filter((r) => r.status === 'rate-limited').length,
      errored: mine.filter((r) => r.status === 'error').length,
      skipped: mine.filter((r) => r.status === 'skipped').length,
      analyzed: mine.filter((r) => isOk(r) && !isDegraded(r)).length,
    };
  });
}

function toneTable(rows, arms) {
  const usable = analyzableRows(rows);
  return arms.map((arm) => {
    const mine = usable.filter((r) => r.arm === arm.name);
    return {
      arm: arm.name,
      n: mine.length,
      meanCritical: round(mean(mine.map((r) => r.tone.criticalCount))),
      meanPositive: round(mean(mine.map((r) => r.tone.positiveCount))),
      meanRatio: round(mean(mine.map((r) => r.tone.ratio))),
      flagged: mine.filter((r) => r.tone.flagged).length,
      flagRate: mine.length ? round(mine.filter((r) => r.tone.flagged).length / mine.length) : null,
    };
  });
}

function criteriaTable(rows, arms) {
  const usable = analyzableRows(rows);
  return arms.map((arm) => {
    const mine = usable.filter((r) => r.arm === arm.name);
    return {
      arm: arm.name,
      n: mine.length,
      meanUnmetCriteria: round(mean(mine.map((r) => r.unmetCriteria))),
      meanCriticalRisks: round(mean(mine.map((r) => r.criticalRisks))),
      // The baseline arm returns [] structurally, not because the model found
      // nothing - legacySummaryOnly has no criteria field to fill. Its 0 is not
      // a measurement and must not be read as one.
      structuralZero: !arm.adversarialSummary,
    };
  });
}

/**
 * The criteria detail metric 3 consumes. The harness previously kept only
 * `.length`, so the criterion and proposal_field text never reached a results
 * file - which is why neither stored run can be re-scored for field overlap.
 *
 * `whyUnmet` is kept on purpose: it is the audit trail for a hand-check, and
 * hand-checks have caught instrument errors twice on this project.
 */
function criteriaDetail(analysis) {
  return (analysis?.unmetCriteria ?? []).map((c) => ({
    criterion: c.criterion,
    proposalField: c.proposalField,
    whyUnmet: c.whyUnmet,
  }));
}

/**
 * Metric 3, the overcorrection guard. An arm that criticises the early-stage and
 * the mid-stage proposal equally has not counterbalanced leniency, it has
 * replaced it with uniform harshness - bias with the sign flipped.
 *
 * REBUILT. The previous rule was `separates = (critGap !== 0) || (unmetGap !== 0)`,
 * an exact-inequality test on a mean of 1-3 small integers, and it had three
 * defects: `criticalCount` saturates at 3 in a three-sentence summary; there was
 * no noise floor, so ONE call against a 3-call mean produced a PASS; and there
 * was no sign check, so an arm criticising the MID-stage proposal harder - the
 * opposite of the rationale - earned the same PASS.
 *
 * Both count columns are now DESCRIPTIVE ONLY. They are kept because they are
 * cheap and legible, but they own no verdict: across the two 2026-08-18 runs
 * `unmetCriteria` read 4,4 / 3,5 / 4 / 4,4,4 - coinciding means over values
 * differing in no consistent direction - so no statistic over those integers can
 * separate these two startups. Field overlap is the statistic that can, because
 * uniform harshness means citing the SAME proposal fields about both.
 *
 * No PASS/FAIL is returned at all. `separation` needs a margin, that margin has
 * never been observed, and setting it from the run it would score is the
 * post-hoc move the fingerprint guard exists to forbid. Part 3 pre-registers it.
 */
function differentiationTable(rows, arms) {
  const usable = analyzableRows(rows);
  return arms.map((arm) => {
    const mine = usable.filter((r) => r.arm === arm.name);
    const early = mine.filter((r) => r.startup === EARLY);
    const mid = mine.filter((r) => r.startup === MID);

    const earlyCrit = mean(early.map((r) => r.tone.criticalCount));
    const midCrit = mean(mid.map((r) => r.tone.criticalCount));
    const earlyUnmet = mean(early.map((r) => r.unmetCriteria));
    const midUnmet = mean(mid.map((r) => r.unmetCriteria));
    const critGap = earlyCrit - midCrit;
    const unmetGap = earlyUnmet - midUnmet;

    const overlap = overlapStats(
      early.map((r) => fieldSet(r.unmetCriteriaDetail)),
      mid.map((r) => fieldSet(r.unmetCriteriaDetail)),
    );

    // A mean over one call is not readable. reps=3 is the ceiling and this
    // harness loses cells to 503 routinely, so requiring 3 would be brittle.
    const underpowered = early.length < MIN_CELL_N || mid.length < MIN_CELL_N;

    return {
      arm: arm.name,
      nEarly: early.length,
      nMid: mid.length,
      underpowered,
      earlyCritical: round(earlyCrit),
      midCritical: round(midCrit),
      criticalGap: round(critGap),
      criticalFavours: favours(critGap),
      earlyUnmet: round(earlyUnmet),
      midUnmet: round(midUnmet),
      unmetGap: round(unmetGap),
      unmetFavours: favours(unmetGap),
      // 3dp, not the default 2: these ratios are the raw material for part 3's
      // pre-registered margin, and small-set Jaccard lands on thirds and sevenths.
      crossOverlap: round(overlap.crossOverlap, 3),
      nCrossPairs: overlap.nCrossPairs,
      withinOverlap: round(overlap.withinOverlap, 3),
      nWithinPairs: overlap.nWithinPairs,
      separation: round(overlap.separation, 3),
      // Raw pair values, not just their means: the pre-registered rule is
      // min/max over these, so they must survive into the results file.
      crossPairValues: overlap.crossPairValues.map((v) => round(v, 3)),
      withinPairValues: overlap.withinPairValues.map((v) => round(v, 3)),
      chanceReference: chanceReference(overlap.nCrossPairs, overlap.nWithinPairs),
      ...verdictFor({ nEarly: early.length, nMid: mid.length, underpowered, overlap }),
    };
  });
}

/**
 * Which startup a signed gap favours. The guard's rationale expects the
 * early-stage proposal to be criticised MORE, so `early` is the expected
 * direction - printed as a word because a reader scanning `-0.33` cannot see
 * that it points the wrong way.
 */
function favours(gap) {
  if (!Number.isFinite(gap)) return null;
  if (gap > 0) return 'early';
  if (gap < 0) return 'mid';
  return 'neither';
}

/**
 * The pre-registered rule (docs/superpowers/specs/2026-08-19-differentiation-margin-design.md).
 *
 * Two n/a gates come first and are about readability, not the rule: a mean over
 * one call says nothing, and an arm citing no fields cannot be scored at all.
 * Past those, complete separation decides PASS/FAIL and the n bar decides only
 * whether the answer is QUOTABLE - a comparison below the bar is still reported,
 * because declining to overclaim is not the same as having no result.
 */
function verdictFor({ nEarly, nMid, underpowered, overlap }) {
  if (underpowered) return { verdict: 'n/a - underpowered', separated: null, quotable: false };

  const separated = completeSeparation(overlap.crossPairValues, overlap.withinPairValues);
  if (separated === null) {
    return { verdict: 'n/a - no scoreable field citations', separated: null, quotable: false };
  }

  const chance = chanceReference(overlap.nCrossPairs, overlap.nWithinPairs);
  const quotable =
    nEarly >= MIN_QUOTABLE_REPS &&
    nMid >= MIN_QUOTABLE_REPS &&
    chance !== null &&
    chance <= MAX_CHANCE_REFERENCE;

  const outcome = separated ? 'PASS' : 'FAIL - uniform';
  return {
    verdict: quotable ? outcome : `${separated ? 'PASS' : 'FAIL'} - not quotable`,
    separated,
    quotable,
  };
}

/**
 * The validity gate. `degradedBySchema` drives it, not `degraded`: a rate-limit
 * degradation says nothing about schema adherence, so it invalidates the row's
 * arm label without being a finding about the prompt.
 */
function validity(rows, arms) {
  const adversarial = sourceBreakdown(rows, arms).find((s) => s.arm === 'adversarial');
  const bySchema = adversarial ? adversarial.degradedBySchema : 0;
  const total = adversarial ? adversarial.degraded : 0;
  return {
    degraded: total,
    degradedBySchema: bySchema,
    inconclusive: bySchema > 1,
    reason:
      bySchema > 1
        ? `${bySchema} of the adversarial calls degraded to LEGACY_SUMMARY_PROMPT on schema failure. ` +
          'A <=5/6 adherence rate is the finding; it is fixed in the prompt or the schema, not in the statistics.'
        : null,
  };
}

function summarize(rows, arms = SELECTED_ARMS) {
  const ok = rows.filter(isOk).length;
  return {
    planned: rows.length,
    succeeded: ok,
    source: sourceBreakdown(rows, arms),
    validity: validity(rows, arms),
    tone: toneTable(rows, arms),
    criteria: criteriaTable(rows, arms),
    differentiation: differentiationTable(rows, arms),
  };
}

// --------------------------------------------------------------------------
// Reports
// --------------------------------------------------------------------------

function printReports(rows, { apiCalls, arms = SELECTED_ARMS } = {}) {
  const s = summarize(rows, arms);

  const banner = `${s.succeeded}/${s.planned} calls succeeded`;
  console.log(`\n${'#'.repeat(78)}`);
  console.log(`# ${banner}${apiCalls != null ? `   (${apiCalls} generateContent requests spent)` : ''}`);
  if (s.succeeded < s.planned) {
    console.log('# PARTIAL RUN - every mean below is over the surviving rows only, never padded.');
  }
  console.log(`${'#'.repeat(78)}`);

  console.log('\n--- Metric 0: SOURCE breakdown (validity gate - read this before any other table) ---');
  console.log("(a 'legacy' row in the adversarial arm is control output wearing the adversarial label)\n");
  console.table(s.source);

  if (s.validity.degraded > 0) {
    console.log(
      `\n! ${s.validity.degraded} adversarial call(s) degraded to LEGACY_SUMMARY_PROMPT ` +
        `(${s.validity.degradedBySchema} schema, ${s.validity.degraded - s.validity.degradedBySchema} rate-limit). ` +
        'Excluded from every mean below; see the reduced n= columns.',
    );
    for (const r of rows.filter(isDegraded)) {
      console.log(`  - rep ${r.rep} / ${r.startup} / cause=${r.degradeCause}`);
    }
  }

  if (s.validity.inconclusive) {
    console.log(`\n${'='.repeat(78)}`);
    console.log('RUN INCONCLUSIVE - no arm comparison printed.');
    console.log(s.validity.reason);
    console.log(`${'='.repeat(78)}`);
    printSummaries(rows);
    return s;
  }

  console.log('\n--- Metric 1: tone (SO 4.4 instrument, src/ai/summary-tone.ts) ---');
  console.log('(flagged = criticalCount === 0, the uncalibrated boundary; ratio is reported as data,');
  console.log(' and is the distribution a future threshold would be set from)\n');
  console.table(s.tone);

  console.log('\n--- Metric 2: unmet criteria per call ---');
  console.log("(structuralZero=true means the arm has no criteria field at all - legacySummaryOnly");
  console.log(' returns [] by construction, so its 0 is not a measurement)\n');
  console.table(s.criteria);

  console.log(`\n--- Metric 3: DIFFERENTIATION guard - ${EARLY} (early) vs ${MID} (mid) ---`);
  console.log('(An arm that criticises both equally has overcorrected into uniform harshness -');
  console.log(' bias with the sign flipped. The verdict is COMPLETE SEPARATION, pre-registered');
  console.log(' 2026-08-19: every within-startup pair must beat every cross-startup pair.)\n');

  console.log('Counts - DESCRIPTIVE ONLY, they own no verdict:');
  console.table(
    s.differentiation.map((d) => ({
      arm: d.arm,
      nEarly: d.nEarly,
      nMid: d.nMid,
      earlyCritical: d.earlyCritical,
      midCritical: d.midCritical,
      criticalGap: d.criticalGap,
      criticalFavours: d.criticalFavours,
      earlyUnmet: d.earlyUnmet,
      midUnmet: d.midUnmet,
      unmetGap: d.unmetGap,
      unmetFavours: d.unmetFavours,
    })),
  );

  console.log('\nField overlap - SCORED. separation = withinOverlap - crossOverlap:');
  // The raw pair arrays are deliberately not printed - they are what the rule
  // is evaluated on, so they go to the results file where they can be re-read,
  // not to a console.table that truncates them to "... 6 more items".
  console.table(
    s.differentiation.map((d) => ({
      arm: d.arm,
      crossOverlap: d.crossOverlap,
      withinOverlap: d.withinOverlap,
      separation: d.separation,
      nCrossPairs: d.nCrossPairs,
      nWithinPairs: d.nWithinPairs,
      chance: d.chanceReference === null ? null : Number(d.chanceReference.toPrecision(2)),
      separated: d.separated,
      quotable: d.quotable,
      verdict: d.verdict,
    })),
  );
  console.log(`Quotable requires n>=${MIN_QUOTABLE_REPS} per startup AND chance <= ${MAX_CHANCE_REFERENCE}.`);
  console.log('Below that the comparison is reported and explicitly NOT quotable.');
  console.log(`Cells below n=${MIN_CELL_N} read n/a - one call against a multi-call mean is not a gap.`);
  console.log('The chance reference assumes exchangeable independent pairs; pairs share reps,');
  console.log('so it is OPTIMISTIC and is not a p-value.');

  printSummaries(rows);
  return s;
}

/**
 * Plan step 4. On both prior probes the by-hand read changed the finding - it is
 * the only reason the 2026-08-06 run's two missed fabrications were found, and
 * on 2026-08-09 it turned a reported 3/12 into a by-hand 6/12. Aggregate counts
 * cannot tell you whether a "critical observation" is substantive or a hedge.
 */
function printSummaries(rows) {
  console.log('\n--- All summaries, verbatim (read these by hand before quoting any figure) ---');
  for (const r of rows) {
    const head = `[rep ${r.rep} | ${r.arm} | ${r.startup}]`;
    if (!isOk(r)) {
      console.log(`\n${head} ${r.status.toUpperCase()}${r.error ? `: ${r.error}` : ''}${r.reason ? `: ${r.reason}` : ''}`);
      continue;
    }
    console.log(
      `\n${head} source=${r.source}${isDegraded(r) ? ` DEGRADED(${r.degradeCause}) - EXCLUDED` : ''} ` +
        `unmet=${r.unmetCriteria} risks=${r.criticalRisks} ` +
        `crit=${r.tone.criticalCount} pos=${r.tone.positiveCount} flagged=${r.tone.flagged}`,
    );
    console.log(r.summary);
  }
}

// --------------------------------------------------------------------------
// Comparability
// --------------------------------------------------------------------------

const { summaryFingerprintMap } = require(path.join(__dirname, 'lib/summary-fingerprint.js'));

/**
 * summary-tone.ts's whole file text, CRLF-normalised.
 *
 * Deliberately the whole file rather than lib/assertions.js's hand-assembled
 * CLASSIFIER_SOURCE: `analyzeTone.toString()` omits the body of splitSentences,
 * which it calls, and the cue regexes are module-level consts. Hashing the file
 * closes both holes without adding an export to a module the plan pins at
 * exactly one copy. It is over-sensitive - a comment edit invalidates pooling -
 * which is the safe direction for a comparability key.
 *
 * Normalised because git's autocrlf can change the bytes on checkout, and a
 * fingerprint that moves with line endings refuses to pool for a reason that is
 * not about the measurement.
 */
function toneSource() {
  return fs
    .readFileSync(path.join(BACKEND, 'src/ai/summary-tone.ts'), 'utf8')
    .replace(/\r\n/g, '\n');
}

/** Metric 3's scorer. Line endings normalised for the same reason toneSource does it. */
function overlapSource() {
  return fs
    .readFileSync(path.join(__dirname, 'lib/field-overlap.js'), 'utf8')
    .replace(/\r\n/g, '\n');
}

function currentFingerprints() {
  const b = loadBackend();
  const startups = Object.fromEntries(
    Object.keys(b.DEMO_CAPSULE_PROPOSALS).map((name) => [name, b.toApplicationDto(name)]),
  );
  const config = new b.AiConfigService({ get: (k) => process.env[k] }).defaults;

  return summaryFingerprintMap({
    common: {
      genModel: config.model,
      temperature: config.temperature,
      // groundPrompt() appends an instruction, so this changes the prompt sent.
      grounding: config.grounding,
      startups,
    },
    sources: {
      legacyPrompt: b.LEGACY_SUMMARY_PROMPT.toString(),
      adversarialPrompt: b.ADVERSARIAL_SUMMARY_PROMPT.toString(),
      tone: toneSource(),
      overlap: overlapSource(),
    },
    arms: SELECTED_ARMS,
  });
}

function writeResults(file, { rows, apiCalls, plannedCalls, baseConfig, mode }) {
  const payload = {
    generatedAt: new Date().toISOString(),
    mode,
    genModel: baseConfig.model,
    temperature: baseConfig.temperature,
    grounding: baseConfig.grounding,
    reps: REPS,
    // Records the --only-arm selection, so a filtered file is self-describing
    // rather than looking like a run whose other arms all failed.
    armsRun: SELECTED_ARMS.map((a) => a.name),
    plannedCalls,
    succeededCalls: rows.filter(isOk).length,
    apiRequests: apiCalls,
    fingerprints: currentFingerprints(),
    summary: summarize(rows),
    rows,
  };
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(`\nRaw per-call records written to ${file}.`);
}

// --------------------------------------------------------------------------
// --dry-run stub
// --------------------------------------------------------------------------

/** Three-sentence free-text replies, as the legacy prompt asks for. */
const STUB_LEGACY = {
  [EARLY]: [
    'AgroLink PH addresses a well-documented margin problem in Central Luzon with a strong founding pairing of extension and engineering experience. The cooperative aggregation model is a compelling wedge against traders and the SMS fallback shows real awareness of member constraints. Execution risk centres on buyer-side commitment, which currently rests on a single provisional agreement.',
    'AgroLink PH has significant market potential across roughly 400 cooperatives and a clear advantage over opaque trader pricing. The three-month methodology is feasible and the team is well positioned on the supply side. The commission model remains the primary open question.',
    'AgroLink PH presents a viable and scalable platform for cooperative market access with impressive domain grounding. Its competitive advantage over traditional traders is clear and the objectives are measurable. The opportunity in institutional procurement is substantial.',
  ],
  [MID]: [
    'MediSync Cebu shows strong traction with six live facilities and early recurring revenue behind a clinically credible team. The structured referral record is a compelling advantage over paper slips and unaffordable hospital-wide systems. Data Privacy Act obligations remain the principal constraint on expansion.',
    'MediSync Cebu is well positioned in provincial referral coordination with a solid deployment record and a viable subscription model. Growth strategy feasibility is high given the 44-unit addressable base in Cebu alone. The founding team combines clinical, engineering and LGU programme experience.',
    'MediSync Cebu demonstrates excellent product-market fit signals including paid subscriptions and measurable latency objectives. The platform is scalable to comparable provincial systems in Bohol and Negros Oriental. Its competitive advantage over six-figure HIS licences is clear.',
  ],
};

/** Varied schema payloads: differing counts, and one with no critical cue at all. */
const STUB_SCHEMA = {
  [EARLY]: [
    {
      unmet_criteria: [
        { criterion: 'No revenue of any kind', proposal_field: 'historicalTimeline', why_unmet: 'The timeline ends at a provisional buyer agreement; no transaction or revenue figure appears.' },
        { criterion: 'Buyer-side demand unvalidated', proposal_field: 'targetMarket', why_unmet: 'Institutional buyers are named as a category with no evidence of committed volume.' },
        { criterion: 'Willingness to pay untested', proposal_field: 'objectives', why_unmet: 'Validating the commission model is listed as an objective, so it is not yet met.' },
        { criterion: 'No registered IP', proposal_field: 'intellectualPropertyStatus', why_unmet: 'No patents filed and the wordmark is unregistered with IPOPHL.' },
      ],
      critical_risks: [
        { risk: 'Cooperatives may not accept a per-transaction commission', severity: 'high' },
        { risk: 'Single buyer dependency collapses the matching side', severity: 'high' },
        { risk: 'Trader incumbents can undercut on immediacy of cash', severity: 'medium' },
      ],
      summary:
        'AgroLink PH has no revenue and its buyer side rests on one provisional agreement, so demand is unvalidated. The commission model is listed as an objective rather than evidenced, leaving the business model untested. Supply-side domain grounding is real but does not offset these gaps.',
    },
    {
      unmet_criteria: [
        { criterion: 'No paying customer', proposal_field: 'historicalTimeline', why_unmet: 'Only interviews and a paper prototype are recorded.' },
        { criterion: 'Logistics excluded but required', proposal_field: 'proposalScope', why_unmet: 'Scope excludes physical logistics, which the matched-lot model depends on.' },
        { criterion: 'No evidence of technical build', proposal_field: 'solutionDescription', why_unmet: 'The platform is described but no working system is reported.' },
      ],
      critical_risks: [
        { risk: 'Excluded logistics is an unpriced dependency', severity: 'high' },
        { risk: 'Prototype-stage technology cannot support live settlement', severity: 'medium' },
      ],
      summary:
        'AgroLink PH remains at paper-prototype stage with no working platform and no paying customer. Its scope excludes the physical logistics the matching model depends on, which is an unpriced dependency. The stated farmgate-price outcome is therefore unproven.',
    },
    {
      unmet_criteria: [
        { criterion: 'No revenue', proposal_field: 'historicalTimeline', why_unmet: 'No figure reported.' },
        { criterion: 'No buyer contracts', proposal_field: 'competitiveAdvantageAnalysis', why_unmet: 'Competitors are described; no buyer commitments are.' },
        { criterion: 'Team of two for a field-heavy model', proposal_field: 'description', why_unmet: 'Two founders against 400 cooperatives is not resourced.' },
        { criterion: 'No regulatory position stated', proposal_field: 'methodology', why_unmet: 'Cooperative settlement handling is not addressed.' },
        { criterion: 'Unregistered wordmark', proposal_field: 'intellectualPropertyStatus', why_unmet: 'IPOPHL registration not filed.' },
      ],
      critical_risks: [
        { risk: 'Field operations do not scale with two founders', severity: 'high' },
        { risk: 'Settlement handling may attract financial regulation', severity: 'medium' },
        { risk: 'Wordmark exposure', severity: 'low' },
      ],
      // Deliberately carries NO critical cue: exercises criticalCount === 0,
      // ratio === 0 and flagged === true inside the ADVERSARIAL arm, which is
      // the case a tone check exists to catch.
      summary:
        'AgroLink PH has assembled a credible operations pairing with deep extension experience. The cooperative onboarding plan is sequenced across three months. Buyer commitments stand at one provisional agreement.',
    },
  ],
  [MID]: [
    {
      unmet_criteria: [
        { criterion: 'NPC registration not complete', proposal_field: 'objectives', why_unmet: 'Listed as an objective, so the compliance review is outstanding.' },
        { criterion: 'Revenue is immaterial', proposal_field: 'historicalTimeline', why_unmet: 'PHP 5,000 monthly recurring revenue does not cover a three-founder team.' },
      ],
      critical_risks: [{ risk: 'Processing health data before NPC registration', severity: 'high' }],
      summary:
        'MediSync Cebu is deployed at six facilities but its Data Privacy Act review is still an objective rather than a completed step. Recurring revenue of PHP 5,000 monthly is immaterial against a three-founder cost base. The clinical credibility of the team is the strongest evidence in the proposal.',
    },
    {
      unmet_criteria: [
        { criterion: 'Latency objective unmeasured', proposal_field: 'objectives', why_unmet: 'Reducing acknowledgement time is a target with no pre-deployment baseline reported.' },
        { criterion: 'LGU procurement path unproven', proposal_field: 'targetMarket', why_unmet: 'Secondary provincial markets are named with no procurement evidence.' },
      ],
      critical_risks: [
        { risk: 'Slow LGU procurement cycles stall the 12-unit target', severity: 'medium' },
        { risk: 'No baseline means the headline outcome cannot be evidenced', severity: 'medium' },
      ],
      summary:
        'MediSync Cebu reports no pre-deployment baseline, so its acknowledgement-latency objective cannot yet be evidenced. Expansion beyond the current six facilities depends on LGU procurement cycles the proposal does not describe. Paid subscriptions are present but small.',
    },
    {
      unmet_criteria: [
        { criterion: 'Trademark pending, not granted', proposal_field: 'intellectualPropertyStatus', why_unmet: 'The IPOPHL application is filed and pending.' },
      ],
      critical_risks: [{ risk: 'Regulatory handling of clinical history in transit', severity: 'high' }],
      summary:
        'MediSync Cebu carries a genuine deployment record across six facilities with paying subscriptions. Its principal risks are regulatory, with the Data Privacy Act review incomplete. The trademark remains pending rather than granted.',
    },
  ],
};

/**
 * Exercises every path except the network. Keyed off the descriptor the runner
 * hands it, so the degrade plan is deterministic and reproducible.
 *
 * A degraded cell returns prose with no JSON in it at all, on BOTH schema
 * attempts, which is what drives extractJsonPayload -> null -> corrective retry
 * -> null -> legacySummaryOnly. That is the real production fallback chain, not
 * a simulated one.
 */
function makeStub({ degradeCount, reps, arms, startups }) {
  const adversarialCells = callDescriptors({ reps, arms, startups }).filter((d) => d.adversarialSummary);
  const degradeKeys = new Set(
    adversarialCells.slice(0, degradeCount).map((d) => `${d.rep}|${d.startup}`),
  );

  let current = null;
  const usage = { promptTokenCount: 812, candidatesTokenCount: 194 };

  const bind = (d) => {
    current = d;
  };

  const generate = async (req) => {
    const d = current;
    const isSchemaCall = Boolean(req?.config?.responseSchema);

    if (isSchemaCall) {
      if (degradeKeys.has(`${d.rep}|${d.startup}`)) {
        // No brace or bracket anywhere, so extractJsonPayload returns null.
        return {
          text: 'I am unable to return structured output for this proposal.',
          usageMetadata: usage,
        };
      }
      const payload = STUB_SCHEMA[d.startup][d.rep % STUB_SCHEMA[d.startup].length];
      return { text: JSON.stringify(payload), usageMetadata: usage };
    }

    const texts = STUB_LEGACY[d.startup];
    return { text: texts[d.rep % texts.length], usageMetadata: usage };
  };

  return { generate, bind, degradeKeys: [...degradeKeys] };
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

async function main() {
  const argErrors = validateArgs(process.argv.slice(2));
  if (argErrors.length) {
    for (const e of argErrors) console.error(e);
    process.exit(1);
  }

  if (process.argv.includes('--fingerprint')) {
    console.log(JSON.stringify(currentFingerprints(), null, 2));
    return;
  }

  const b = loadBackend();
  const startups = Object.keys(b.DEMO_CAPSULE_PROPOSALS);
  const dtos = Object.fromEntries(startups.map((name) => [name, b.toApplicationDto(name)]));

  console.log(`Booting Nest application context (${DRY_RUN ? 'dry run' : 'LIVE - spends quota'})...`);
  const app = await b.NestFactory.createApplicationContext(b.AppModule, { logger: ['error', 'warn'] });

  try {
    // mikro-orm.config.ts hard-codes debug: true, which buries every report line.
    app.get(b.MikroORM).config.set('debug', false);

    const aiService = app.get(b.AiService);
    const baseConfig = app.get(b.AiConfigService).resolve();

    console.log(`model=${baseConfig.model} temperature=${baseConfig.temperature} grounding=${baseConfig.grounding}`);

    const stub = DRY_RUN ? makeStub({ degradeCount: DEGRADE, reps: REPS, arms: SELECTED_ARMS, startups }) : null;
    if (stub) {
      console.log(
        `--dry-run: stubbing generateContent only. degrade plan (${DEGRADE}): ` +
          (stub.degradeKeys.length ? stub.degradeKeys.join(', ') : 'none'),
      );
    }

    console.log('\nCall order (rep OUTERMOST - a quota stop must leave a balanced pool):');
    callDescriptors({ reps: REPS, arms: SELECTED_ARMS, startups }).forEach((d, i) =>
      console.log(`  ${String(i + 1).padStart(2)}. rep ${d.rep} / ${d.arm} / ${d.startup}`),
    );
    console.log('');

    const { rows, apiCalls, plannedCalls } = await runArms(aiService, baseConfig, {
      reps: REPS,
      arms: SELECTED_ARMS,
      startups,
      dtos,
      analyzeTone: b.analyzeTone,
      generate: stub ? stub.generate : null,
      beforeCall: stub ? stub.bind : null,
      // No network in a dry run, so no reason to pace it.
      pacingMs: DRY_RUN ? 0 : DELAY_MS,
    });

    printReports(rows, { apiCalls });

    if (OUT_FILE) {
      writeResults(OUT_FILE, {
        rows,
        apiCalls,
        plannedCalls,
        baseConfig,
        mode: DRY_RUN ? 'dry-run' : 'live',
      });
    }

    if (DRY_RUN) console.log('\n--dry-run: zero generation quota spent.');
  } finally {
    await app.close();
  }
}

/** Guarded so node --test can require the pure functions without running anything. */
if (require.main === module) {
  main().catch((e) => {
    console.error('FAILED:', e?.message ?? e);
    process.exit(1);
  });
}

module.exports = {
  ARMS,
  selectArms,
  SELECTED_ARMS,
  EARLY,
  MID,
  CALLS_PER_DEGRADED_CELL,
  MIN_CELL_N,
  callDescriptors,
  validateArgs,
  is429,
  looksRateLimited,
  isDegraded,
  analyzableRows,
  sourceBreakdown,
  toneTable,
  criteriaTable,
  criteriaDetail,
  differentiationTable,
  validity,
  summarize,
  printReports,
  printSummaries,
  runArms,
  ctxFor,
  makeStub,
  currentFingerprints,
  toneSource,
  overlapSource,
  mean,
};
