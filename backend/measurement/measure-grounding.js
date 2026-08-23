/**
 * Does grounding generation in the verified RAG corpus actually reduce
 * hallucination and improve differentiation? Tasks 1-8 built the corpus (54
 * readiness rubrics, 10 business frameworks), three retrieval channels, and
 * wired both prompt paths to consume them. This measures whether it worked.
 *
 * Three arms (see rag-corpus.types.ts / ai-config.types.ts for the flags):
 *
 *   baseline    ragCorpus: false                    - no verified corpus at all
 *   sdd         ragCorpus: true, rubricMode: semantic     - SDD SS3.2's mechanism
 *   deviation   ragCorpus: true, rubricMode: deterministic - the shipped default
 *
 * Two halves, run in a specific order because quota is the binding constraint:
 *
 *   Step A - mechanism comparison (--retrieval-only stops here). Whether a
 *   rubric mode retrieves the CORRECT dimension is pure retrieval, checkable
 *   against rubricKey(type, level). Embedding endpoint only (3 batched calls),
 *   so it reproduces at full N and costs no generation budget.
 *
 *   Step B - the three generation arms. 2 calls x 2 startups x 3 arms = 12 per
 *   rep, or 18 with --with-fabrication-probe. Stops cleanly on a 429 and
 *   reports partial results with per-cell n= rather than padding them.
 *
 * Metrics are mechanical, not LLM-judged: model leniency is under
 * investigation, so grading with a model would fold it into the measurement.
 *
 *   node measurement/measure-grounding.js                  (full harness)
 *   node measurement/measure-grounding.js --retrieval-only  (Step A only, free)
 *   node measurement/measure-grounding.js --reps=1 --out=day1.json
 *   node measurement/measure-grounding.js --merge day1.json day2.json day3.json
 *   node measurement/measure-grounding.js --merge results/*.json   (glob - see below)
 *
 *   # Refill one cell a transient 503 killed, for 2 calls instead of a 12-call
 *   # rep. Names are case-insensitive prefixes, comma-separated for several.
 *   node measurement/measure-grounding.js --only-arm=deviation \
 *     --only-startup=MediSync --out=results/refill.json
 *
 * A filtered file is a partial rep: --merge it with a full run rather than
 * reading its tables alone, since unselected cells report n=0.
 *
 * ## Why one rep per day, accumulated
 *
 * The free tier allows 20 generateContent calls/day and a rep costs 12 (18 with
 * --with-fabrication-probe), so a day buys exactly one rep. Two consequences:
 *
 *   1. Reps are the OUTERMOST loop. Arm-major ordering spends the whole daily
 *      budget inside the first arm, leaving one fully-powered arm and nothing
 *      to compare it against — worthless, since every metric is a BETWEEN-arm
 *      contrast. Rep-major means a 429 costs precision, not the comparison.
 *   2. --out persists raw per-call records so days combine with --merge, which
 *      re-runs the report over the concatenated calls. Sound because retrieval
 *      is deterministic — the corpus and model are recorded and checked.
 */
const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
require(path.join(BACKEND, 'node_modules/dotenv')).config({
  path: path.join(BACKEND, '.env'),
});
const { GoogleGenAI } = require(path.join(BACKEND, 'node_modules/@google/genai'));

const fs = require('fs');

const RETRIEVAL_ONLY = process.argv.includes('--retrieval-only');

/**
 * Assembles and prints every arm's prompts without calling the model. Unit
 * tests cannot check whether an assembled prompt LOOKS right, and this harness
 * has twice measured a property of the prompt rather than of the model.
 */
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * The absent-field probe is saturated — 0/15 invented on every arm (2026-07-29,
 * reproducing 0/9 across two models on 2026-07-27). groundPrompt() handles it
 * completely, so it discriminates nothing.
 *
 * Kept because 0/15 with 15/15 recalled is a PASSING result against SRS 2.2's
 * "return null for unverifiable fields", and that evidence is worth having.
 * Once per series is enough; skipping it takes a rep from 18 calls to 12.
 */
const WITH_FABRICATION = process.argv.includes('--with-fabrication-probe');

const flagValue = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const OUT_FILE = flagValue('out');

// --merge takes every following non-flag argument, including globs. bash
// expands those itself; PowerShell and child_process.spawn do not, and would
// pass "results/day*.json" through as one literal filename. fs.globSync closes
// that gap so the documented command works in any shell.
//
// Arguments without glob metacharacters pass through untouched, so a typo
// still surfaces as a plain ENOENT naming what was typed rather than
// vanishing into a glob that "matched nothing".
const MERGE_INDEX = process.argv.indexOf('--merge');
const MERGE_ARGS = MERGE_INDEX === -1
  ? []
  : process.argv.slice(MERGE_INDEX + 1).filter((a) => !a.startsWith('--'));
const GLOB_CHARS = /[*?[\]{}]/;
const MERGE_FILES = MERGE_ARGS.flatMap((pattern) =>
  GLOB_CHARS.test(pattern) ? fs.globSync(pattern) : [pattern],
);

const KNOWN_EXACT_FLAGS = new Set([
  '--retrieval-only', '--dry-run', '--with-fabrication-probe', '--fingerprint', '--merge',
]);
const KNOWN_VALUE_FLAG_PREFIXES = ['--out=', '--reps=', '--only-arm=', '--only-startup=', '--only-probe=', '--level-condition='];

const ALL_PROBES = ['rna', 'levels'];

/**
 * Which generation probes to run. Exact names only — unlike arms and startups
 * there are two fixed values, so a prefix match would buy nothing and could
 * silently select the wrong one.
 *
 * Returns { probes, errors }. An unrecognised name errors rather than being
 * dropped: silently running fewer probes than asked for looks identical to a
 * quota hit in the output.
 */
function selectProbes(filter) {
  if (filter == null) return { probes: ALL_PROBES, errors: [] };
  const entries = String(filter).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!entries.length) {
    return { probes: [], errors: [`--only-probe=${filter} named no probe. Available: ${ALL_PROBES.join(', ')}.`] };
  }
  const unknown = entries.filter((e) => !ALL_PROBES.includes(e));
  if (unknown.length) {
    return {
      probes: [],
      errors: [
        `--only-probe=${filter} is not a probe: ${unknown.map((u) => `"${u}"`).join(', ')}. ` +
          `Available: ${ALL_PROBES.join(', ')}.`,
      ],
    };
  }
  // Canonical order, so a filtered run's call order matches an unfiltered one's.
  return { probes: ALL_PROBES.filter((p) => entries.includes(p)), errors: [] };
}

const ALL_LEVEL_CONDITIONS = ['truth', 'inflated', 'deflated'];

// `both` is FROZEN at its pre-2026-08-23 meaning. Widening it would silently
// change what an already-recorded command produces — the --merge failure mode
// in a different costume. `all` is the new name for everything.
const CONDITION_ALIASES = {
  both: ['truth', 'inflated'],
  all: ['truth', 'inflated', 'deflated'],
};

/**
 * Organizational, Regulatory and Investment are the three dimensions with
 * verified hard absences, and both startups sit at O2 R1 I1 — so one override
 * covers both and the manipulated cells pool.
 *
 * 3, not 4. Deterministic retrieval pulls (L, L+1), so 3 pulls rows 3-4 — the
 * rows that name a non-founder contributor under contract (ORL 3), counsel
 * engaged with a preliminary opinion received (RRL 3), and a drafted funding
 * plan (IRL 3). IRL 3 is the literal source of the observed fabrication; at 4
 * it sits in neither condition's block, so the manipulation would never inject
 * the rubric row that produced the instance being reproduced.
 *
 * All three stay above HARD_ABSENCES' ceiling of 2, so nothing stops being
 * scoreable, and +1/+2/+2 is a likelier mentor error than +2/+3/+3. T/M/A stay
 * at truth so every call carries its own unmanipulated control.
 */
const INFLATED_OVERRIDE = { Organizational: 3, Regulatory: 3, Investment: 3 };

/** Returns a NEW object. STARTUPS.levels is inside `common` and is hashed into
 *  all 15 fingerprints — mutating it would orphan every collected result file. */
function inflatedLevels(levels) {
  return { ...levels, ...INFLATED_OVERRIDE };
}

/**
 * The mirror of INFLATED_OVERRIDE, and the split is forced by the data rather
 * than chosen. Both startups sit at O2 R1 I1, which has no deflation room;
 * MediSync's T6 M5 A5 has plenty and its document evidences the level-1/2
 * criteria plainly. O/R/I stay at truth so every call carries its own
 * unmanipulated control, exactly as T/M/A do under `inflated`.
 */
const DEFLATED_OVERRIDE = { Technology: 1, Market: 1, Acceptance: 1 };

/** Returns a NEW object, for the reason inflatedLevels does. */
function deflatedLevels(levels) {
  return { ...levels, ...DEFLATED_OVERRIDE };
}

/** The one place a condition maps to supplied levels — live run and --dry-run.
 *  A total map, not a ternary: an unknown condition used to fall through to
 *  truth levels, which would have sent an unmanipulated prompt under a
 *  manipulated label. */
const CONDITION_LEVELS = {
  truth: (startup) => startup.levels,
  inflated: (startup) => inflatedLevels(startup.levels),
  deflated: (startup) => deflatedLevels(startup.levels),
};

function levelsForCondition(startup, condition) {
  const build = CONDITION_LEVELS[condition];
  if (!build) throw new Error(`levelsForCondition: unknown condition "${condition}"`);
  return build(startup);
}

/** The one place a condition maps to its storage field — scoring and audit trail.
 *  Total for the same reason: the old `else` sent every non-truth condition into
 *  the inflated pool, which would have silently mixed two manipulations. */
const CONDITION_FIELD = {
  truth: 'assertionTruthCalls',
  inflated: 'assertionInflatedCalls',
  deflated: 'assertionDeflatedCalls',
};

function conditionField(condition) {
  const field = CONDITION_FIELD[condition];
  if (!field) throw new Error(`conditionField: unknown condition "${condition}"`);
  return field;
}

/**
 * Exact names, comma lists, or an alias. Prefix matching is still refused — it
 * buys nothing over three fixed values and could silently select the wrong one.
 * An unrecognised entry hard-errors before any network call, like selectProbes:
 * silently running fewer conditions than asked for looks identical to a clean run.
 */
function selectLevelConditions(filter) {
  if (filter == null) return { conditions: ['truth'], errors: [] };
  const raw = String(filter).trim().toLowerCase();
  const available = `Available: ${ALL_LEVEL_CONDITIONS.join(', ')}, both, all.`;
  if (CONDITION_ALIASES[raw]) return { conditions: CONDITION_ALIASES[raw].slice(), errors: [] };

  const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0) {
    return { conditions: [], errors: [`--level-condition=${filter} named no condition. ${available}`] };
  }
  const unknown = entries.filter((e) => !ALL_LEVEL_CONDITIONS.includes(e));
  if (unknown.length) {
    return {
      conditions: [],
      errors: [
        `--level-condition=${filter} is not a condition: ${unknown.map((u) => `"${u}"`).join(', ')}. ${available}`,
      ],
    };
  }
  // Canonical order, not argument order, so two spellings of the same request
  // produce the same run shape.
  return { conditions: ALL_LEVEL_CONDITIONS.filter((c) => entries.includes(c)), errors: [] };
}

/**
 * Pure validation over raw CLI args plus the glob-resolved --merge list.
 * Returns error strings; empty means well-formed. Exported and called only
 * from the require.main guard, so tests can call it without a subprocess and
 * `node --test` never runs the harness by accident on the runner's own argv.
 *
 * Closes two failure modes that used to spend the generation budget silently:
 *   - `--merge` resolving to zero files fell through to a live 12-call run.
 *   - `--out foo.json` (space instead of `=`) left OUT_FILE null, so results
 *     were computed and then written nowhere.
 */
function validateArgs(argv, mergeFiles) {
  const errors = [];
  const mergeIdx = argv.indexOf('--merge');
  // Everything from --merge onward is its file list — MERGE_FILES' own scan
  // already consumes that tail, so don't re-validate it as flags here.
  const toValidate = mergeIdx === -1 ? argv : argv.slice(0, mergeIdx);

  for (let i = 0; i < toValidate.length; i++) {
    const arg = toValidate[i];
    if (arg.startsWith('--')) {
      const known = KNOWN_EXACT_FLAGS.has(arg) || KNOWN_VALUE_FLAG_PREFIXES.some((p) => arg.startsWith(p));
      if (!known) {
        errors.push(
          `Unrecognized flag "${arg}". Known flags: --retrieval-only, --dry-run, ` +
            '--with-fabrication-probe, --fingerprint, --out=<file>, --reps=<n>, ' +
            '--only-arm=<names>, --only-startup=<names>, --only-probe=<rna|levels>, ' +
            '--level-condition=<truth|inflated|deflated|both|all|comma-list>, --merge <files...>.',
        );
      }
    } else {
      // Usually `--out foo.json` or `--reps 3` — a space where "=" belongs.
      // The preceding bare flag names the likely intent, so quote it back.
      const prev = toValidate[i - 1];
      const hint = ['--out', '--reps', '--only-arm', '--only-startup'].includes(prev)
        ? ` Did you mean "${prev}=${arg}"? That flag takes "=", not a space.`
        : '';
      errors.push(
        `Unrecognized argument "${arg}" - positional arguments are only accepted after --merge.${hint}`,
      );
    }
  }

  if (mergeIdx !== -1 && mergeFiles.length === 0) {
    errors.push(
      '--merge was given no files to pool (missing arguments, a glob that matched nothing, or ' +
        '--merge placed last with nothing after it). Refusing to fall through to a live generation run.',
    );
  }

  return errors;
}

const EMBED_MODEL = 'gemini-embedding-2';
const DIMS = 768;
const FLOOR = 0.78; // RAG_MIN_SIMILARITY, ai.service.ts
const RUBRIC_LIMIT = 2; // searchCorpus's default limit, rag-query.service.ts
const MAX_READINESS_LEVEL = 9;

/**
 * A hard daily cap, not a per-minute rate limit:
 * GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20/day (confirmed from
 * the 429 body, 2026-07-28). Re-pacing cannot work around it — re-run on a day
 * with fresh quota, or split the arms across days.
 */
const GEN_MODEL = 'gemini-3.6-flash'; // the model the +2.28 differentiation baseline was measured on
// A rep costs 12 of the 20 daily calls (18 with --with-fabrication-probe), so
// 1 is what a day buys. Raise it only against a paid key — --reps=3 on the free
// tier reproduces the 2026-07-28 failure: arm 1 completes, nothing to compare.
const REPS = Number(flagValue('reps') ?? 1);
const DELAY_MS = 4000; // matches measure-models.js/measure-differentiation.js's pacing

if (!Number.isInteger(REPS) || REPS < 1) {
  console.error(`--reps must be a positive integer, got "${flagValue('reps')}"`);
  process.exit(1);
}

// Verbatim from ai.service.ts:72-73.
const GROUNDING =
  'Only use facts explicitly present in the user-provided input. Never invent names, numbers, dates, or organizations. If you are uncertain about a field, return null instead of guessing.';

const DIMENSIONS = ['Technology', 'Market', 'Acceptance', 'Organizational', 'Regulatory', 'Investment'];

// rag-corpus.types.ts RUBRIC_KEY_PREFIX, keyed by the human-readable enum value
// rather than the enum's short code since that's all a JSON corpus row carries.
const TYPE_PREFIX = {
  Technology: 'trl',
  Market: 'mrl',
  Acceptance: 'arl',
  Organizational: 'orl',
  Regulatory: 'rrl',
  Investment: 'irl',
};
const rubricKey = (type, level) => `${TYPE_PREFIX[type]}-${level}`;

const RUBRICS = require(path.join(BACKEND, 'data/rag-corpus/readiness-rubrics.json'));

const { levelPlacement, stageAppropriateness, differentiationGap } = require(
  path.join(__dirname, 'lib/metrics.js'),
);
const { isStageInappropriate } = require(path.join(__dirname, 'lib/stage-markers.js'));

// Documents are measure-differentiation.js's verbatim early/mid pair; levels
// mirror src/demo-readiness-levels.ts, the rows seedDemoStartups writes.
//
// They serve two roles at once: metric 1's ground truth, and the
// `Initial Readiness Level` block fed INTO the RNA prompt. Corrected 2026-08-05
// - the previous values were demo fixtures that contradicted these very
// documents in ten of twelve cells, so metric 1 was scoring placement against a
// reference the source text refutes. Derivation per cell, with the document
// phrase each was read from, is in data/ground-truth-adjudication.md.
//
// This changes `common`, so every fingerprint changes and runs collected before
// the correction will refuse to pool with runs after it. That is correct: the
// RNA prompt itself changed. audit-ground-truth.js keeps the OLD values, frozen
// deliberately, because that is what the already-collected runs were scored
// against.
const STARTUPS = {
  'AgroLink PH': {
    doc: `Title: AgroLink PH: Cooperative Market Access Platform
Description: Connects smallholder farmer cooperatives in Central Luzon directly to institutional buyers.
Problem Statement: Smallholder farmers sell through a chain of traders and capture only a fraction of the final market price.
Target Market: Rice and vegetable cooperatives in Nueva Ecija and Tarlac (roughly 400 cooperatives).
Solution: A mobile-first platform where cooperative officers register expected harvest volumes and buyers post standing demand. Includes SMS fallback.
Timeline: 2025-06 field interviews with 18 cooperatives. 2025-09 paper prototype of the lot-aggregation flow tested with 3 cooperatives. 2026-01 two founders committed full-time; provisional agreement with one buyer.
Revenue: None to date.
IP Status: No patents filed. The "AgroLink PH" wordmark has not been registered with IPOPHL.
Team: Rafael Domingo (6 years agricultural extension officer), Ana Beltran (4 years backend engineer).`,
    levels: { Technology: 2, Market: 3, Acceptance: 3, Organizational: 2, Regulatory: 1, Investment: 1 },
    present: ['target_cooperative_count', 'number_of_founders', 'cooperatives_in_prototype_test'],
    absent: ['monthly_burn_rate_php', 'lead_investor_name', 'date_of_incorporation'],
  },
  'MediSync Cebu': {
    doc: `Title: MediSync Cebu: Referral Coordination for Provincial Clinics
Description: Links rural health units across Cebu province with district and tertiary hospitals, replacing a paper-and-phone referral process.
Problem Statement: Referrals move by handwritten form and phone call; clinical history is frequently lost in transit.
Target Market: The 44 rural health units in Cebu province, 8 district hospitals, and 3 tertiary referral centres.
Solution: A structured referral record transmitted to the receiving facility with bed-availability status, triage category, and attached history.
Timeline: 2025-02 pilot with 2 rural health units and 1 district hospital. 2025-08 expanded to 6 facilities; first paid facility subscriptions. 2026-02 reached PHP 5,000 monthly recurring revenue; team grew to 3 founders.
Revenue: PHP 5,000 monthly recurring.
IP Status: No patents. Trademark application filed with IPOPHL, pending.
Team: Dr. Elena Reyes (9 years provincial public health), Marco Villanueva (7 years health IT), Joy Tabotabo (5 years LGU administration).`,
    levels: { Technology: 6, Market: 5, Acceptance: 5, Organizational: 2, Regulatory: 1, Investment: 1 },
    present: ['rural_health_units_in_cebu', 'monthly_recurring_revenue_php', 'number_of_founders'],
    absent: ['monthly_burn_rate_php', 'lead_investor_name', 'date_of_incorporation'],
  },
};

const ARMS = [
  { name: 'baseline', ragCorpus: false, rubricMode: null },
  { name: 'sdd-semantic', ragCorpus: true, rubricMode: 'semantic' },
  { name: 'deviation-deterministic', ragCorpus: true, rubricMode: 'deterministic' },
  // Identical to deviation-deterministic on the RNA probe; on the levels probe
  // it renders the same 54 rows as titles only. Level coverage is unchanged, so
  // exact placement stays reachable and nothing leaks — only the bodies drop.
  // Isolates "too much text" from "the ladder itself", which trimming levels
  // could not: dropping levels removes the right answer.
  //
  // Measured, not estimated: the levels prompt goes 31,850 -> 12,552 chars, a
  // 61% cut rather than the order of magnitude a body-length estimate suggests.
  // The residue is repeated citation boilerplate — the same BRLa attribution on
  // all 36 framework-derived rows — which is now ~80% of the block. If this arm
  // shows no effect, strip citations next; that is the remaining volume.
  { name: 'deviation-titles', ragCorpus: true, rubricMode: 'deterministic', levelsRubricScope: 'full-ladder-titles-only' },
  // Titles with the provenance/citation suffix removed as well. deviation-titles
  // only reached 12,552 chars because the same BRLa attribution repeats on all
  // 36 framework-derived rows — ~80% of that block is boilerplate the model
  // cannot use. This is the floor of the volume ladder: the same 54 keys, the
  // same level coverage, nothing but the level names.
  { name: 'deviation-bare', ragCorpus: true, rubricMode: 'deterministic', levelsRubricScope: 'full-ladder-bare-titles' },
];

const cos = (a, b) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const n = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return dot / (n(a) * n(b));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

function extractJsonPayload(text) {
  const cands = [text.indexOf('{'), text.indexOf('[')].filter((i) => i !== -1);
  const start = cands.length ? Math.min(...cands) : -1;
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start === -1 || end === -1 || end <= start) return null;
  return text.substring(start, end + 1);
}

// Verbatim from measure-models.js.
const isAbsentAnswer = (v) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' &&
    /^(null|n\/?a|unknown|not (stated|specified|provided|available|mentioned|found)|none)\.?$/i.test(
      v.trim(),
    )) ||
  (typeof v === 'string' && v.trim() === '');

async function call(ai, prompt) {
  const started = Date.now();
  const res = await ai.models.generateContent({
    model: GEN_MODEL,
    contents: prompt,
    config: { temperature: 0 },
  });
  const u = res.usageMetadata || {};
  return {
    ms: Date.now() - started,
    text: res.text ?? '',
    total: u.totalTokenCount ?? 0,
  };
}

function is429(e) {
  return String(e.message || e).includes('429');
}

/**
 * A 503 is the model being busy; a 429 is the daily cap, which does not reopen
 * for ~24h. Retrying the first can save a cell, retrying the second only earns
 * another 429 — so they must never share a code path. 2026-08-03 lost
 * deviation-deterministic / MediSync / levels to an unretried 503.
 */
function isRetryableServerError(e) {
  const s = String(e.message || e);
  if (is429(e)) return false;
  return s.includes('503') || s.includes('UNAVAILABLE');
}

/**
 * `attempts` is a total call budget, not extra tries on top of the first.
 * Delay grows with the attempt so a busy model gets progressively longer to
 * recover; `sleep` is injected so tests don't wait in real time.
 */
async function withRetry(fn, { attempts = 3, delayMs = 15000, sleep: nap = sleep, onRetry } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= attempts || !isRetryableServerError(e)) throw e;
      if (onRetry) onRetry(attempt, e);
      await nap(delayMs * attempt);
    }
  }
}

/**
 * Retry policy for transient 503s. Three attempts at 15s/30s costs at most ~45s
 * of wall-clock to save a cell that would otherwise cost a whole 12-call rep to
 * refill. Deliberately modest: a 503 that outlives this is the model being down
 * rather than busy, and sitting in a retry loop would only delay the report.
 */
const RETRY = { attempts: 3, delayMs: 15000 };

/** Retries transient 503s around a generation call; 429s propagate untouched. */
const attempt = (fn, ai, prompt, retry, label) =>
  withRetry(() => fn(ai, prompt), {
    ...retry,
    onRetry: (n, e) => console.log(`  [503 retry ${n}: ${label}] ${String(e.message || e).slice(0, 120)}`),
  });

/**
 * Resolves --only-arm / --only-startup into the cells to run. Case-insensitive
 * prefix match over comma-separated names, so `--only-arm=deviation` works
 * without quoting and `--only-startup=MediSync` avoids the space in the real
 * name.
 *
 * An entry that matches nothing is an error, never a silent drop: the point of
 * this filter is to spend 1 call instead of 12, so quietly running the full set
 * (or quietly running fewer cells than asked) defeats it in the expensive
 * direction. Same reasoning as validateArgs' refusal to fall through.
 */
function selectCells(armFilter, startupFilter, arms, startupNames) {
  const errors = [];

  const pick = (filter, candidates, nameOf, label) => {
    if (filter == null) return candidates;
    const entries = String(filter)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const matchesFor = (e) => {
      const lower = e.toLowerCase();
      // An exact name always wins, so one arm's name being another's prefix
      // never makes it unselectable.
      const exact = candidates.filter((c) => nameOf(c).toLowerCase() === lower);
      if (exact.length) return exact;
      return candidates.filter((c) => nameOf(c).toLowerCase().startsWith(lower));
    };

    const unmatched = entries.filter((e) => matchesFor(e).length === 0);
    if (unmatched.length) {
      errors.push(
        `--only-${label}=${filter} matched no ${label}: ${unmatched.map((u) => `"${u}"`).join(', ')}. ` +
          `Available: ${candidates.map(nameOf).join(', ')}.`,
      );
      return [];
    }

    // Over-selection is as costly as under-selection here: silently expanding a
    // prefix to two arms doubles the calls spent against a 20/day cap. Refuse
    // and name the candidates rather than guessing which was meant.
    const ambiguous = entries.filter((e) => matchesFor(e).length > 1);
    if (ambiguous.length) {
      errors.push(
        `--only-${label}=${filter} is ambiguous: ` +
          ambiguous
            .map((a) => `"${a}" matches ${matchesFor(a).map(nameOf).join(', ')}`)
            .join('; ') +
          `. Use the full name.`,
      );
      return [];
    }
    // Filter the canonical list rather than mapping over the entries, so the
    // run order matches an unfiltered run's regardless of how it was typed.
    return candidates.filter((c) =>
      entries.some((e) => nameOf(c).toLowerCase().startsWith(e.toLowerCase())),
    );
  };

  return {
    arms: pick(armFilter, arms, (a) => a.name, 'arm'),
    startups: pick(startupFilter, startupNames, (s) => s, 'startup'),
    errors,
  };
}

// --------------------------------------------------------------------------
// Step A - mechanism comparison (quota-free: embedding calls only)
// --------------------------------------------------------------------------

async function embedAll(ai, texts) {
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: texts,
    config: { outputDimensionality: DIMS },
  });
  return res.embeddings.map((e) => e.values);
}

/** All 12 (current + next level) keys across all six dimensions for one startup. */
function allWantedKeysForStartup(startup) {
  const wanted = new Set();
  for (const dim of DIMENSIONS) {
    const level = startup.levels[dim];
    wanted.add(rubricKey(dim, level));
    wanted.add(rubricKey(dim, Math.min(level + 1, MAX_READINESS_LEVEL)));
  }
  return wanted;
}

/**
 * "Quota-free" means it avoids the generation endpoint, not that it is free:
 * embedContent has its own free-tier ceiling (observed 2026-07-28, exhausted
 * independently of generateContent). Embeddings are deterministic, so a failure
 * is reported plainly rather than retried — re-run and the numbers reproduce.
 */
async function runRetrievalOnly(ai) {
  console.log('=== Step A: rubric-retrieval mechanism comparison (quota-free of the generation endpoint) ===\n');

  let corpusVecs;
  let dimVecs;
  let profileVecs;
  try {
    // Text embedded verbatim as production does: `${title}\n\n${content}`
    // (embedding-index.service.ts textFor). One batched call for all 54 rows.
    corpusVecs = await embedAll(
      ai,
      RUBRICS.map((r) => `${r.title}\n\n${r.content}`),
    );

    // What retrieveRubrics sends when exactly one dimension is missing — the
    // join degenerates to the bare readinessType. This is the CODE's
    // substitute, not SDD §3.2's mechanism; see the profile query below.
    dimVecs = await embedAll(ai, DIMENSIONS);

    // SDD §3.2 as written: "the startup's profile data as the search
    // embedding". The rubric channel embeds the bare readinessType instead, so
    // this is the only query here testing the SDD's actual mechanism.
    profileVecs = await embedAll(
      ai,
      Object.values(STARTUPS).map((s) => s.doc),
    );
  } catch (e) {
    console.log(`[QUOTA HIT on embed_content] ${e.message}`);
    console.log('Step A could not run this time. Re-run once the embed quota resets; the result is deterministic and reproduces exactly.');
    return { tally: null, rows: [], corpusVecs: null };
  }

  const rows = [];
  const tally = {
    deterministic: { queries: 0, correct: 0, wrong: 0, empty: 0 },
    semantic: { queries: 0, correct: 0, wrong: 0, empty: 0 },
  };

  for (const [startupName, startup] of Object.entries(STARTUPS)) {
    for (let d = 0; d < DIMENSIONS.length; d++) {
      const dim = DIMENSIONS[d];
      const level = startup.levels[dim];

      // deterministic: exact (type, level) and (type, level+1) key lookup.
      const wanted = new Set([
        rubricKey(dim, level),
        rubricKey(dim, Math.min(level + 1, MAX_READINESS_LEVEL)),
      ]);
      const detRows = RUBRICS.filter((r) => wanted.has(r.key));
      const detClass = detRows.length === 0 ? 'empty' : detRows.every((r) => r.readinessType === dim) ? 'correct' : 'wrong';

      // semantic: neighbours of the bare dimension name, floor 0.78, top-2.
      // Classified by top hit, as measure-retrieval.js does.
      const scored = RUBRICS.map((r, i) => ({ r, score: cos(dimVecs[d], corpusVecs[i]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, RUBRIC_LIMIT)
        .filter((x) => x.score >= FLOOR);
      const semClass = scored.length === 0 ? 'empty' : scored[0].r.readinessType === dim ? 'correct' : 'wrong';

      tally.deterministic.queries++;
      tally.deterministic[detClass]++;
      tally.semantic.queries++;
      tally.semantic[semClass]++;

      rows.push({
        startup: startupName,
        dimension: dim,
        level,
        'det top': detRows.map((r) => r.key).join(', ') || '-',
        'det result': detClass,
        'sem top': scored.length ? `${scored[0].r.key} (${scored[0].score.toFixed(3)})` : '-',
        'sem result': semClass,
      });
    }
  }

  console.log('per-query detail (deterministic vs the CODE\'s dimension-name substitute for semantic mode):');
  console.table(rows);

  console.log('\nsummary (mode | queries | correct dimension | wrong dimension | empty):');
  console.table(
    Object.entries(tally).map(([mode, t]) => ({
      mode,
      queries: t.queries,
      'correct dimension': t.correct,
      'wrong dimension': t.wrong,
      empty: t.empty,
    })),
  );

  const codeSubSettled = tally.semantic.correct < tally.semantic.queries;
  console.log(
    codeSubSettled
      ? `\nthe code's dimension-name substitute for semantic mode scored ${tally.semantic.correct}/${tally.semantic.queries} ` +
          `correct-dimension - below deterministic's ${tally.deterministic.correct}/${tally.deterministic.queries}. This is ` +
          `NOT a test of SDD §3.2's specified mechanism (see below for that) - rag-query.service.ts:126 embeds the bare ` +
          `readinessType name ("Technology", "Regulatory", ...), not "the startup's profile data as the search embedding" ` +
          `SDD §3.2 calls for. What this settles is narrower: the CODE's current substitute does not reliably deliver the ` +
          `correct dimension's rubric for this corpus and query shape.`
      : `\nthe code's dimension-name substitute matched deterministic at ${tally.semantic.correct}/${tally.semantic.queries}. ` +
          `Still not a test of SDD §3.2 itself - see the profile-embedding query below for that.`,
  );

  // One query per startup, not per dimension — a whole profile isn't aimed at
  // one. Checked against the union of that startup's 12 (dimension, level) keys:
  // does the profile surface ANY rubric row relevant to where it sits?
  const profileRows = [];
  const profileTally = { queries: 0, correct: 0, wrong: 0, empty: 0 };
  const startupNames = Object.keys(STARTUPS);
  for (let s = 0; s < startupNames.length; s++) {
    const startupName = startupNames[s];
    const startup = STARTUPS[startupName];
    const wantedAnyDim = allWantedKeysForStartup(startup);

    const scored = RUBRICS.map((r, i) => ({ r, score: cos(profileVecs[s], corpusVecs[i]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RUBRIC_LIMIT)
      .filter((x) => x.score >= FLOOR);
    const cls = scored.length === 0 ? 'empty' : scored.every((x) => wantedAnyDim.has(x.r.key)) ? 'correct' : 'wrong';

    profileTally.queries++;
    profileTally[cls]++;
    profileRows.push({
      startup: startupName,
      top: scored.length ? scored.map((x) => `${x.r.key} (${x.score.toFixed(3)})`).join(', ') : '-',
      result: cls,
    });
  }

  console.log('\n--- SDD §3.2 as specified: profile-data query (the mechanism the code does NOT use for rubrics) ---');
  console.log(
    'Ground truth: "correct" means every returned row\'s key is one of this startup\'s 12 valid (dimension, current-or-\n' +
      'next-level) keys across all six dimensions - a profile query is not aimed at one dimension, so any relevant rubric counts.\n' +
      'A profile embedding contains no dimension name at all, so a low score here would be a STRUCTURAL property of the\n' +
      'mechanism (whole-document prose vs a short abbreviation-heavy rubric row), not an artifact of a bad query string.\n',
  );
  console.table(profileRows);
  console.log(
    `profile query: ${profileTally.correct}/${profileTally.queries} correct, ${profileTally.empty}/${profileTally.queries} empty.`,
  );

  return { tally, profileTally, rows, corpusVecs };
}

// --------------------------------------------------------------------------
// Step B - the three generation arms
// --------------------------------------------------------------------------

/** Mirrors GroundedPromptBuilderService.buildGroundedPrompt's rubric section. */
function renderRubricBlock(rows) {
  if (!rows.length) return '';
  const body = rows
    .map((r, i) => {
      const source = r.citation ? ` [${r.provenance ?? 'unattributed'} - ${r.citation}]` : r.provenance ? ` [${r.provenance}]` : '';
      return `${i + 1}. ${r.title}${source}\n   ${r.content}`;
    })
    .join('\n');
  return `\n--- Verified Readiness Rubrics (authoritative) ---\n${body}\n`;
}

/**
 * Same rows, same header, same numbering — bodies dropped.
 *
 * Deliberately a separate function rather than an option on renderRubricBlock:
 * every (metric, arm) fingerprint hashes renderRubricBlock's source, so editing
 * it in place would change all nine existing fingerprints and stop three reps
 * of collected data from pooling. See lib/fingerprint.js.
 */
/**
 * The one place an arm's levels-ladder rendering is chosen.
 *
 * Both the live run and --dry-run go through this. They rendered the ladder
 * independently before, and the first arm to differ made --dry-run print a
 * prompt the live run would not send — which defeats the only quota-free way
 * to check a prompt before spending on it.
 */
function renderLevelsBlockFor(arm, ladder) {
  if (arm.levelsRubricScope === 'full-ladder-titles-only') return renderTitlesOnlyBlock(ladder);
  if (arm.levelsRubricScope === 'full-ladder-bare-titles') return renderBareTitlesBlock(ladder);
  return renderRubricBlock(ladder);
}

/**
 * Titles with no body and no provenance suffix. Separate from
 * renderTitlesOnlyBlock for the same reason that one is separate from
 * renderRubricBlock: both are hashed into live fingerprints, so editing either
 * in place would strand already-collected data. See lib/fingerprint.js.
 */
function renderBareTitlesBlock(rows) {
  if (!rows.length) return '';
  const body = rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
  return `\n--- Verified Readiness Rubrics (authoritative) ---\n${body}\n`;
}

function renderTitlesOnlyBlock(rows) {
  if (!rows.length) return '';
  const body = rows
    .map((r, i) => {
      const source = r.citation ? ` [${r.provenance ?? 'unattributed'} - ${r.citation}]` : r.provenance ? ` [${r.provenance}]` : '';
      return `${i + 1}. ${r.title}${source}`;
    })
    .join('\n');
  return `\n--- Verified Readiness Rubrics (authoritative) ---\n${body}\n`;
}

/**
 * Retrieval is deterministic, so it is computed once per (arm, startup, condition)
 * and reused across reps rather than re-run for no informational gain.
 *
 * `deterministic` is a pure key lookup and baseline needs no rubric, so neither
 * may be blocked by the single embed call `semantic` needs. That call is lazy,
 * memoized on `state`, and degrades to "nothing retrieved" on failure — as
 * EmbeddingService.embed does in production.
 */
async function retrieveRubricsForArm(ai, arm, startup, corpusVecs, state, levels = startup.levels) {
  if (!arm.ragCorpus) return [];

  if (arm.rubricMode === 'deterministic') {
    const wanted = new Set();
    for (const dim of DIMENSIONS) {
      const level = levels[dim];
      wanted.add(rubricKey(dim, level));
      wanted.add(rubricKey(dim, Math.min(level + 1, MAX_READINESS_LEVEL)));
    }
    return RUBRICS.filter((r) => wanted.has(r.key));
  }

  // With all six types missing, the joined query does not depend on the startup
  // at all, so both startups get an identical retrieved set. That is production
  // code's property, not a harness artifact — see the README.
  if (!corpusVecs) return []; // Step A's embed already failed; nothing to compare against.
  if (state.combinedDimVec === undefined) {
    try {
      state.combinedDimVec = (await embedAll(ai, [DIMENSIONS.join(' ')]))[0];
    } catch (e) {
      console.log(`[QUOTA HIT on embed_content, semantic rubric retrieval] ${e.message}`);
      state.combinedDimVec = null;
    }
  }
  if (!state.combinedDimVec) return [];

  return RUBRICS.map((r, i) => ({ r, score: cos(state.combinedDimVec, corpusVecs[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, RUBRIC_LIMIT)
    .filter((x) => x.score >= FLOOR)
    .map((x) => x.r);
}

/**
 * The one place an RNA cell's retrieval and rubric block are built.
 *
 * --dry-run and the live run built these independently before, and that is
 * precisely how the harness once shipped a --dry-run printing a prompt the run
 * would not send — defeating the only quota-free way to check a prompt.
 */
async function buildRnaCell(ai, arm, startup, levels, corpusVecs, state) {
  const retrieved = await retrieveRubricsForArm(ai, arm, startup, corpusVecs, state, levels);
  return { retrieved, rnaBlock: renderRubricBlock(retrieved) };
}

/**
 * Production emits this for EVERY arm — only rubricBlock varies with ragCorpus.
 * Omitting it made the harness measure "told its levels" vs "not told its
 * levels", a contrast production never presents and not a retrieval effect.
 *
 * Abbreviation order is production's; do not re-sort it.
 */
function readinessLevelBlock(levels) {
  return `
Initial Readiness Level:
TRL ${levels.Technology}
MRL ${levels.Market}
ARL ${levels.Acceptance}
ORL ${levels.Organizational}
RRL ${levels.Regulatory}
IRL ${levels.Investment}`;
}

/**
 * The nine-rung ladder for every dimension, LEVELS probe only.
 *
 * Deterministic retrieval keys on the startup's actual level, so handing it to a
 * probe that asks the model to assess that level shows it the answer — any
 * advantage is leakage, not grounding, and no number of reps fixes it.
 *
 * The RNA probe keeps the (L, L+1) lookup because that is what production
 * ships. The asymmetry is intentional: do not tidy them into agreement.
 */
function fullLadderRubrics() {
  return RUBRICS.slice().sort(
    (a, b) => a.readinessType.localeCompare(b.readinessType) || a.level - b.level,
  );
}

function rnaPrompt(doc, rubricBlock, levels) {
  return `${doc}${rubricBlock}${readinessLevelBlock(levels)}
--- Task ---
Generate a Readiness and Needs Assessment (RNA) for these readiness types: ${DIMENSIONS.join(', ')}.
Respond ONLY with a JSON array: [{"readiness_level_type": (string), "rna": (string, max 500 characters)}]
- readiness_level_type must be exactly one of: ${DIMENSIONS.join(', ')}
- Be specific and grounded strictly in the provided data.

Grounding instruction: ${GROUNDING}`;
}

function levelsPrompt(doc, rubricBlock) {
  return `${doc}${rubricBlock}

Assess this startup's readiness on a 1-9 scale for each dimension, where 1 = idea only and 9 = proven at scale in the market. Be rigorous: a level is only justified if the document contains evidence for it.

Respond ONLY with a JSON array of objects with keys "dimension" and "level" (integer 1-9), for exactly these dimensions: ${DIMENSIONS.join(', ')}.

Grounding instruction: ${GROUNDING}`;
}

function hallucinationPrompt(doc, rubricBlock, present, absent) {
  const keys = [...present, ...absent];
  return `${doc}${rubricBlock}

Extract the following six fields from the document above.

Respond ONLY with a JSON object with exactly these keys:
${keys.map((k) => `"${k}"`).join(', ')}

Grounding instruction: ${GROUNDING}`;
}

/**
 * Everything variable is injected with a production default, so the loop can be
 * exercised without a model call. `arms`/`startupNames` are what --only-arm /
 * --only-startup narrow; `callFn` and `retry` are what let the wiring tests
 * prove the filter and the 503 retry are actually used rather than merely
 * present (measurement/tests/generation-wiring.test.js).
 */
async function runGenerationArms(ai, corpusVecs, opts = {}) {
  const {
    arms = ARMS,
    startupNames = Object.keys(STARTUPS),
    reps = REPS,
    callFn = call,
    retry = RETRY,
    withFabrication = WITH_FABRICATION,
    report = true,
    pacingMs = DELAY_MS,
    // Metric 2 has been saturated at 0% on every arm since the 2026-07-30
    // redesign, so half of each rep's calls buy nothing. Narrowing to the
    // levels probe doubles the reps a day's cap affords for the only metric
    // that discriminates.
    probes = ['rna', 'levels'],
    conditions = ['truth'],
  } = opts;

  // Metric 5's lower bound rests on these tokens being absent from the
  // documents. The README and the metric-5 comment both say that is asserted at
  // run time; before this line only audit-ground-truth.js asserted it.
  verifyAbsences(Object.fromEntries(Object.entries(STARTUPS).map(([n, s]) => [n, s.doc])));

  const selectedStartups = startupNames.map((n) => [n, STARTUPS[n]]);
  const filtered = arms.length !== ARMS.length || startupNames.length !== Object.keys(STARTUPS).length;

  if (report) {
    console.log('\n\n=== Step B: generation arms (baseline / sdd-semantic / deviation-deterministic) ===');
    const callsPerCell = (withFabrication ? 1 : 0) + (probes.includes('levels') ? 1 : 0) + (probes.includes('rna') ? conditions.length : 0);
    const perRep = arms.length * selectedStartups.length * callsPerCell;
    console.log(
      `reps=${reps}, ${perRep} calls per rep (${reps * perRep} total) ` +
        `against a 20/day free-tier cap on ${GEN_MODEL}` +
        (withFabrication ? ' [+ fabrication probe]' : '') +
        (filtered
          ? `\n[filtered] arms: ${arms.map((a) => a.name).join(', ')} | startups: ${startupNames.join(', ')}` +
            '\n[filtered] unselected cells report n=0 - merge this file with a full run rather than reading it alone.'
          : '') +
        '\n',
    );
  }

  const embedState = {}; // memoizes the one embed call `semantic` needs, see retrieveRubricsForArm
  const results = {};
  // Every arm gets an entry up front, even one a 429 prevents starting or a
  // filter excludes — the report functions iterate all of ARMS and need an
  // empty cell, not undefined.
  for (const arm of ARMS) {
    results[arm.name] = { startups: {}, quotaHit: false };
  }
  let quotaHit = false;

  // Hoisted above the rep loop deliberately — with reps outermost, `semantic`
  // would otherwise re-embed once per rep.
  //
  // Two rubric blocks per (arm, startup): the RNA probe mirrors production's
  // (L, L+1) lookup, the levels probe gets the full ladder so it isn't handed
  // the quantity it must predict. See fullLadderRubrics.
  const rnaBlocks = new Map();    // `${arm}|${startup}` -> block for the RNA probe
  const levelBlocks = new Map();  // `${arm}|${startup}` -> block for the levels probe
  for (const arm of arms) {
    for (const [startupName, startup] of selectedStartups) {
      // Unconditional, whatever conditions were selected: the levels probe's
      // ladder and the fabrication probe's rubric block both key off the truth
      // retrieval, and deriving them from `inflated` (or from nothing) is a
      // silently degraded probe carrying a valid fingerprint. Free — baseline
      // returns [], deterministic is a key lookup, and semantic's one embed is
      // memoized on embedState.
      const truthRetrieved = await retrieveRubricsForArm(ai, arm, startup, corpusVecs, embedState);
      for (const condition of conditions) {
        const levels = levelsForCondition(startup, condition);
        const built = await buildRnaCell(ai, arm, startup, levels, corpusVecs, embedState);
        rnaBlocks.set(`${arm.name}|${startupName}|${condition}`, { block: built.rnaBlock, levels });
      }
      // The levels probe is unaffected by the manipulation — its prompt carries
      // no supplied levels at all — so its ladder keys off the truth retrieval.
      // Only corpus arms get a rubric. `semantic` retrieves nothing here
      // (Step A: 0/12), making it a null-condition replicate of baseline —
      // kept deliberately as a noise control, not a third condition.
      const ladder = arm.ragCorpus && truthRetrieved.length ? fullLadderRubrics() : [];
      levelBlocks.set(`${arm.name}|${startupName}`, renderLevelsBlockFor(arm, ladder));
      results[arm.name].startups[startupName] = {
        retrieved: truthRetrieved,
        rnaCalls: [], levelCalls: [], hallucCalls: [],
        assertionTruthCalls: [], assertionInflatedCalls: [], assertionDeflatedCalls: [],
      };
    }
  }

  // Reps outermost: a 429 partway through costs precision, not the comparison.
  repLoop: for (let rep = 0; rep < reps; rep++) {
    for (const arm of arms) {
      for (const [startupName, startup] of selectedStartups) {
        const levelBlock = levelBlocks.get(`${arm.name}|${startupName}`);
        const cell = results[arm.name].startups[startupName];

        // --- RNA generation (metrics 1-2 on truth; metric 5 on both) ---
        if (probes.includes('rna')) for (const condition of conditions) {
          const entry = rnaBlocks.get(`${arm.name}|${startupName}|${condition}`);
          try {
            const out = await attempt(callFn, ai, rnaPrompt(startup.doc, entry.block, entry.levels), retry, `${arm.name} / ${startupName} / rep ${rep} / rna(${condition})`);
            const payload = extractJsonPayload(out.text);
            const parsed = payload ? JSON.parse(payload) : null;
            if (Array.isArray(parsed)) {
              const byDim = {};
              for (const x of parsed) {
                if (typeof x.rna === 'string' && typeof x.readiness_level_type === 'string') {
                  byDim[x.readiness_level_type] = x.rna;
                }
              }
              // rnaCalls is the truth-only pool metrics 1-2 read. The
              // per-condition pool is chosen by the total map so a new condition
              // cannot land in another condition's field.
              if (condition === 'truth') cell.rnaCalls.push({ byDim });
              cell[conditionField(condition)].push({ byDim });
            }
          } catch (e) {
            if (is429(e)) {
              console.log(`  [quota hit: ${arm.name} / ${startupName} / rep ${rep} / rna(${condition})]`);
              quotaHit = true;
              results[arm.name].quotaHit = true;
              break repLoop;
            } else {
              // Parse failures, network blips and schema errors must not vanish
              // silently: this harness runs unattended
              // across a 20-request daily cap, and the only symptom of a
              // swallowed non-429 error is a lower n= with no explanation.
              console.error(`  [error: ${arm.name} / ${startupName} / rep ${rep} / rna(${condition})]`, e.message);
            }
          }
          if (pacingMs) await sleep(pacingMs);
        }

        // --- Levels (metric 3) ---
        if (probes.includes('levels')) try {
          const out = await attempt(callFn, ai, levelsPrompt(startup.doc, levelBlock), retry, `${arm.name} / ${startupName} / rep ${rep} / levels`);
          const payload = extractJsonPayload(out.text);
          const parsed = payload ? JSON.parse(payload) : null;
          if (Array.isArray(parsed)) {
            const byDim = {};
            for (const x of parsed) {
              if (typeof x.level === 'number') byDim[x.dimension] = x.level;
            }
            cell.levelCalls.push({ byDim });
          }
        } catch (e) {
          if (is429(e)) {
            console.log(`  [quota hit: ${arm.name} / ${startupName} / rep ${rep} / levels]`);
            quotaHit = true;
            results[arm.name].quotaHit = true;
            break repLoop;
          } else {
            console.error(`  [error: ${arm.name} / ${startupName} / rep ${rep} / levels]`, e.message);
          }
        }
        if (pacingMs) await sleep(pacingMs);

        // --- Hallucination probe (metric 2) ---
        // Unaffected by the level manipulation, so it reads the truth-condition
        // block via cell.retrieved, which is now computed whatever conditions
        // were selected — see the retrieval above.
        if (withFabrication) {
          try {
            const out = await attempt(callFn, ai, hallucinationPrompt(startup.doc, renderRubricBlock(cell.retrieved), startup.present, startup.absent), retry, `${arm.name} / ${startupName} / rep ${rep} / hallucination`);
            const payload = extractJsonPayload(out.text);
            const parsed = payload ? JSON.parse(payload) : null;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              let inventedAbsent = 0;
              for (const k of startup.absent) {
                if (!isAbsentAnswer(parsed[k])) inventedAbsent++;
              }
              let presentCorrect = 0;
              for (const k of startup.present) {
                if (!isAbsentAnswer(parsed[k])) presentCorrect++;
              }
              cell.hallucCalls.push({
                inventedAbsent,
                absentChecked: startup.absent.length,
                presentCorrect,
                presentChecked: startup.present.length,
              });
            }
          } catch (e) {
            if (is429(e)) {
              console.log(`  [quota hit: ${arm.name} / ${startupName} / rep ${rep} / hallucination]`);
              quotaHit = true;
              results[arm.name].quotaHit = true;
              break repLoop;
            } else {
              console.error(`  [error: ${arm.name} / ${startupName} / rep ${rep} / hallucination]`, e.message);
            }
          }
          if (pacingMs) await sleep(pacingMs);
        }

        if (report) {
          console.log(
            `rep ${rep} / ${arm.name} / ${startupName}: rna n=${cell.rnaCalls.length} ` +
              `levels n=${cell.levelCalls.length} halluc n=${cell.hallucCalls.length} (cumulative)`,
          );
        }
      }
    }
  }

  if (report) printReports(results);

  if (quotaHit && report) {
    console.log('\n[QUOTA HIT] Stopped cleanly; the tables above and below reflect only what completed. Check n= before comparing cells.');
  }

  return results;
}

/**
 * Pure over the results object so it can be tested without a model call, and
 * so --merge and a live run share exactly one scoring path. Every arm always
 * gets a row, including one a 429 stopped us from reaching - an absent row and
 * a zero row mean different things and the tables must not conflate them.
 */
function summarizeResults(results) {
  const metric1 = [];
  const metric2 = [];
  const metric3 = [];
  const metric4 = [];
  const metric5 = [];

  for (const arm of ARMS) {
    const armResult = results[arm.name] || { startups: {} };

    // --- Metric 1: level-placement accuracy vs the document-derived reference ---
    let n = 0, exact = 0, within1 = 0, errSum = 0;
    for (const [startupName, cell] of Object.entries(armResult.startups)) {
      const truth = STARTUPS[startupName].levels;
      for (const lc of cell.levelCalls) {
        const p = levelPlacement(lc.byDim, truth, DIMENSIONS);
        if (!p.n) continue;
        n += p.n;
        exact += p.exact;
        within1 += p.within1;
        errSum += p.mae * p.n;
      }
    }
    metric1.push({
      arm: arm.name,
      n,
      mae: n ? (errSum / n).toFixed(2) : 'n/a',
      exact,
      within1,
      'exact %': n ? `${((exact / n) * 100).toFixed(0)}%` : 'n/a',
    });

    // --- Metric 2: stage-inappropriate recommendation rate ---
    let flagged = 0, checked = 0;
    for (const [startupName, cell] of Object.entries(armResult.startups)) {
      const truth = STARTUPS[startupName].levels;
      for (const rc of cell.rnaCalls) {
        const s = stageAppropriateness(rc.byDim, truth, DIMENSIONS, isStageInappropriate);
        flagged += s.flagged;
        checked += s.checked;
      }
    }
    metric2.push({
      arm: arm.name,
      flagged,
      checked,
      rate: checked ? `${((flagged / checked) * 100).toFixed(0)}%` : 'n/a',
    });

    // --- Metric 3: differentiation gap ---
    const agro = armResult.startups['AgroLink PH'];
    const medi = armResult.startups['MediSync Cebu'];
    const g = differentiationGap(
      agro ? agro.levelCalls.flatMap((c) => Object.values(c.byDim)) : [],
      medi ? medi.levelCalls.flatMap((c) => Object.values(c.byDim)) : [],
    );
    metric3.push({
      arm: arm.name,
      'AgroLink mean': Number.isNaN(g.earlyMean) ? 'n/a' : g.earlyMean.toFixed(2),
      'AgroLink n': g.earlyN,
      'MediSync mean': Number.isNaN(g.midMean) ? 'n/a' : g.midMean.toFixed(2),
      'MediSync n': g.midN,
      GAP: Number.isNaN(g.gap) ? 'n/a' : g.gap.toFixed(2),
    });

    // --- Metric 4: absent-field probe (only when --with-fabrication-probe) ---
    let invented = 0, absentChecked = 0, presentCorrect = 0, presentChecked = 0, reps = 0;
    for (const [, cell] of Object.entries(armResult.startups)) {
      for (const h of cell.hallucCalls) {
        invented += h.inventedAbsent;
        absentChecked += h.absentChecked;
        presentCorrect += h.presentCorrect;
        presentChecked += h.presentChecked;
        reps++;
      }
    }
    metric4.push({
      arm: arm.name,
      invented: `${invented}/${absentChecked}`,
      'invented rate': absentChecked ? `${((invented / absentChecked) * 100).toFixed(0)}%` : 'n/a',
      'present recalled': `${presentCorrect}/${presentChecked}`,
      'n reps': reps,
    });

    // --- Metric 5: supplied-level fabrication (asserted absent evidence) ---
    //
    // Reference-free: HARD_ABSENCES names artifact classes neither document
    // mentions, asserted at run time by verifyAbsences rather than trusted. One
    // binary observation per (call, dimension) — counting tokens would reward
    // verbosity, and the corpus arm writes longer RNAs.
    for (const condition of ALL_LEVEL_CONDITIONS) {
      const field = conditionField(condition);
      let asserted = 0, mentioned = 0, unclassified = 0, obs = 0;
      for (const [, cell] of Object.entries(armResult.startups)) {
        for (const c of cell[field] || []) {
          for (const o of scoreAssertedAbsences(c.byDim, HARD_ABSENCES).observations) {
            obs++;
            if (o.asserted) asserted++;
            if (o.mentioned) mentioned++;
            if (o.unclassified) unclassified++;
          }
        }
      }
      metric5.push({
        arm: arm.name,
        condition,
        asserted: `${asserted}/${obs}`,
        'asserted %': obs ? `${((asserted / obs) * 100).toFixed(0)}%` : 'n/a',
        mentioned: `${mentioned}/${obs}`,
        // x/obs, never a bare 0: at obs=0 a bare 0 reads as "the classifier
        // handled everything cleanly" for an arm that was never run — in the
        // one column the design calls the honesty column.
        unclassified: obs ? `${unclassified}/${obs}` : 'n/a',
      });
    }
  }

  return { metric1, metric2, metric3, metric4, metric5 };
}

function printReports(results) {
  const s = summarizeResults(results);

  console.log('\n--- Metric 1: level-placement accuracy (vs the document-derived reference) ---');
  console.log('(mean absolute error between the assigned level and the startup\'s actual level; lower is better)\n');
  console.table(s.metric1);

  console.log('\n--- Metric 2: stage-inappropriate recommendation rate ---');
  console.log('(share of generated RNAs recommending actions from more than two rungs above the startup\'s level - SO 1.3\'s example; lower is better)\n');
  console.table(s.metric2);

  console.log('\n--- Metric 3: differentiation gap (early vs mid) ---');
  console.log('Baseline to hold or beat: +2.28 on gemini-3.6-flash (measure-differentiation.js, 2026-07-27)');
  console.log('Measured noise floor: +/-1.0 gap points between byte-identical prompts (2026-07-29)\n');
  console.table(s.metric3);

  if (WITH_FABRICATION) {
    console.log('\n--- Metric 4: absent-field probe (regression check) ---');
    console.log('(saturated at 0/15 on 2026-07-29 across every arm; kept as evidence for SRS 2.2, not as a discriminator)\n');
    console.table(s.metric4);
  }

  console.log('\n--- Metric 5: supplied-level fabrication (asserted absent evidence) ---');
  console.log('(share of dimensions whose RNA asserts an artifact class neither document mentions;');
  console.log(' `asserted` is a lower bound and `mentioned` an upper one. A large `unclassified`');
  console.log(' means the classifier cannot read this output and the rate should not be quoted.)\n');
  console.table(s.metric5);
}

// --------------------------------------------------------------------------
// Cross-day accumulation
// --------------------------------------------------------------------------

/**
 * A day buys one rep, so the reps that answer metrics 1-3 at any useful
 * precision necessarily span days. Persisting the raw per-call records (not
 * the computed rates) is what makes that sound: the report functions are pure
 * over the concatenated calls, so merging three days is arithmetically
 * identical to one 3-rep run - provided the corpus and model didn't move
 * underneath, which is why both are recorded and checked.
 */
const { fingerprintMap } = require(path.join(__dirname, 'lib/fingerprint.js'));
const { MARKERS } = require(path.join(__dirname, 'lib/stage-markers.js'));
const { scoreAssertedAbsences, CLASSIFIER_SOURCE } = require(path.join(__dirname, 'lib/assertions.js'));
const { HARD_ABSENCES, verifyAbsences } = require(path.join(__dirname, 'lib/hard-absences.js'));

function currentFingerprints() {
  return fingerprintMap({
    common: {
      grounding: GROUNDING,
      dimensions: DIMENSIONS,
      startups: Object.fromEntries(
        Object.entries(STARTUPS).map(([k, v]) => [k, { doc: v.doc, levels: v.levels, present: v.present, absent: v.absent }]),
      ),
    },
    markers: MARKERS,
    rubrics: RUBRICS,
    sources: {
      rna: rnaPrompt.toString(),
      levels: levelsPrompt.toString(),
      fabrication: hallucinationPrompt.toString(),
      // Called FROM INSIDE rnaPrompt/levelsPrompt, so their bodies are invisible
      // to the builders' own .toString() above - see lib/fingerprint.js's header.
      readinessLevelBlock: readinessLevelBlock.toString(),
      renderRubricBlock: renderRubricBlock.toString(),
      renderTitlesOnlyBlock: renderTitlesOnlyBlock.toString(),
      renderBareTitlesBlock: renderBareTitlesBlock.toString(),
      fullLadderRubrics: fullLadderRubrics.toString(),
      // Not scoreAssertedAbsences.toString(): it contains neither the cue
      // regexes nor the helpers it calls. See CLASSIFIER_SOURCE.
      assertion: CLASSIFIER_SOURCE,
    },
    arms: ARMS,
    levelsRubricScope: 'full-ladder',
    rnaRubricScope: 'current-and-next',
    absences: HARD_ABSENCES,
    inflatedLevels: INFLATED_OVERRIDE,
  });
}

/**
 * Every clause the classifier flagged, verbatim — the audit trail the lower-bound
 * claim depends on being checkable rather than trusted. Pure and exported so the
 * seven-field shape is tested, not merely produced.
 */
function flaggedClauses(results) {
  const out = [];
  for (const [armName, armResult] of Object.entries(results)) {
    for (const [startupName, cell] of Object.entries(armResult.startups || {})) {
      for (const condition of ALL_LEVEL_CONDITIONS) {
        (cell[conditionField(condition)] || []).forEach((c, rep) => {
          for (const o of scoreAssertedAbsences(c.byDim, HARD_ABSENCES).observations) {
            for (const cl of o.clauses) {
              out.push({ arm: armName, startup: startupName, condition, rep, dimension: o.dimension, klass: cl.klass, text: cl.text });
            }
          }
        });
      }
    }
  }
  return out;
}

function writeResults(file, results) {
  const payload = {
    generatedAt: new Date().toISOString(),
    genModel: GEN_MODEL,
    embedModel: EMBED_MODEL,
    reps: REPS,
    corpusRows: RUBRICS.length,
    floor: FLOOR,
    fingerprints: currentFingerprints(),
    results,
    flaggedClauses: flaggedClauses(results),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(`\nRaw per-call records written to ${file} (merge later with --merge).`);
}

/**
 * Pools per (metric, arm). Throws rather than exiting so it is testable; the
 * CLI wrapper below catches and exits 1.
 */
function mergeRuns(files, arms) {
  const days = files.map((f) => ({ file: f, data: JSON.parse(fs.readFileSync(f, 'utf8')) }));

  const envKey = (d) => `${d.data.genModel}|${d.data.embedModel}|${d.data.corpusRows}|${d.data.floor}`;
  const distinctEnv = [...new Set(days.map(envKey))];
  if (distinctEnv.length > 1) {
    throw new Error(
      'Refusing to merge: these runs are not comparable.\n' +
        '(genModel|embedModel|corpusRows|floor)\n' +
        days.map((d) => `  ${d.file}: ${envKey(d)}`).join('\n'),
    );
  }

  // The reference for each (metric, arm) is the first file that actually HAS a
  // fingerprint for it — NOT blindly days[0].
  //
  // days[0] was this plan's original rule and it silently defeats the whole
  // point of the task. The documented workflow is `--merge results/*.json`,
  // and a glob resolved this way - whether by a bash shell before this script
  // ever runs, or by this script's own fs.globSync on a shell that doesn't
  // glob (see MERGE_FILES above) - naturally comes back name-sorted, so the
  // one legacy file's earlier date sorts FIRST. With a fingerprint-less file
  // as the reference, every key's `ref` is undefined, so EVERY file is
  // refused for EVERY metric — including two perfectly compatible
  // post-redesign runs that should pool with each other. Verified:
  // legacy-first pooled 0 calls where legacy-last pooled 2.
  const reference = {};
  for (const { data } of days) {
    for (const [key, value] of Object.entries(data.fingerprints || {})) {
      if (reference[key] === undefined) reference[key] = value;
    }
  }
  const merged = {};
  for (const arm of arms) merged[arm.name] = { startups: {}, quotaHit: false };

  const contributions = {};
  const refusals = [];
  const FIELD = {
    levels: 'levelCalls',
    rna: 'rnaCalls',
    fabrication: 'hallucCalls',
    assertion: 'assertionTruthCalls',
    'assertion-inflated': 'assertionInflatedCalls',
  };

  for (const { file, data } of days) {
    for (const arm of arms) {
      const src = data.results[arm.name];
      if (!src) continue;
      merged[arm.name].quotaHit = merged[arm.name].quotaHit || src.quotaHit;

      for (const [metric, field] of Object.entries(FIELD)) {
        const key = `${metric}|${arm.name}`;
        const mine = (data.fingerprints || {})[key];
        const ref = reference[key];
        // undefined on either side is a pre-fingerprint file: never pool it
        // with anything, in either direction.
        //
        // Logging a refusal does not depend on whether this cell happens to
        // hold any calls yet: the mismatch itself is the fact worth surfacing
        // ("this metric/arm's probe design differs between these files"), not
        // a consequence of how much data would have been lost. Gating the log
        // on cell content silently swallowed exactly the case this exists to
        // catch - a real fingerprint mismatch on a metric/arm whose data
        // hadn't accumulated anywhere yet.
        if (mine === undefined || ref === undefined || mine !== ref) {
          refusals.push(`${key} (${path.basename(file)}: ${mine ?? 'pre-fingerprint'} vs ${ref ?? 'pre-fingerprint'})`);
          continue;
        }

        for (const [startupName, cell] of Object.entries(src.startups)) {
          const dst =
            merged[arm.name].startups[startupName] ||
            (merged[arm.name].startups[startupName] = {
              retrieved: cell.retrieved,
              rnaCalls: [], levelCalls: [], hallucCalls: [],
              assertionTruthCalls: [], assertionInflatedCalls: [], assertionDeflatedCalls: [],
            });
          // Defensive: a file carrying an assertion fingerprint but no assertion
          // array (hand-edited, or written by a partial run) must not throw.
          dst[field].push(...(cell[field] || []));
        }
        contributions[key] = (contributions[key] || []).concat(path.basename(file));
      }
    }
  }

  return { merged, contributions, refusals };
}

function runMergeCli(files) {
  const { merged, contributions, refusals } = mergeRuns(files, ARMS);
  console.log(`=== Merged ${files.length} run(s), pooled per (metric, arm) ===`);
  console.table(
    Object.entries(contributions).map(([k, v]) => ({ 'metric|arm': k, files: v.join(', ') })),
  );
  if (refusals.length) {
    console.log('\nNot pooled (fingerprint mismatch - different probe design):');
    for (const r of refusals) console.log(`  ${r}`);
  }
  printReports(merged);
}

/**
 * Guarded so the module can be required by tests without executing anything.
 * Every scorer and prompt builder below is a pure function; the tests exercise
 * them directly rather than through a model call, which is what keeps the whole
 * suite free of the 20/day generation budget.
 */
if (require.main === module) {
  (async () => {
    // Validated only here, never at module load - process.argv when this file
    // is `require()`d by `node --test` is the test runner's own argv (e.g. the
    // test file's path as argv[2]), not a set of flags for this script, and
    // must never be run through CLI validation.
    const argErrors = validateArgs(process.argv.slice(2), MERGE_FILES);
    if (argErrors.length) {
      for (const e of argErrors) console.error(e);
      process.exit(1);
    }

    // Resolved before any network call so a typo'd filter costs nothing.
    const selection = selectCells(
      flagValue('only-arm'),
      flagValue('only-startup'),
      ARMS,
      Object.keys(STARTUPS),
    );
    const probeSelection = selectProbes(flagValue('only-probe'));
    const conditionSelection = selectLevelConditions(flagValue('level-condition'));
    if (selection.errors.length || probeSelection.errors.length || conditionSelection.errors.length) {
      for (const e of [...selection.errors, ...probeSelection.errors, ...conditionSelection.errors]) console.error(e);
      process.exit(1);
    }

    if (process.argv.includes('--fingerprint')) {
      console.log(JSON.stringify(currentFingerprints(), null, 2));
      return;
    }

    if (MERGE_FILES.length) {
      try {
        runMergeCli(MERGE_FILES);
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      return;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const { corpusVecs } = await runRetrievalOnly(ai);

    if (RETRIEVAL_ONLY) {
      console.log('\n--retrieval-only: stopping before generation arms.');
      return;
    }

    if (DRY_RUN) {
      const embedState = {};
      for (const arm of selection.arms) {
        for (const startupName of selection.startups) {
          const startup = STARTUPS[startupName];
          const retrieved = await retrieveRubricsForArm(ai, arm, startup, corpusVecs, embedState);
          const ladder = arm.ragCorpus && retrieved.length ? fullLadderRubrics() : [];
          const levelBlock = renderLevelsBlockFor(arm, ladder);
          console.log(`\n${'='.repeat(78)}\n${arm.name} / ${startupName}\n${'='.repeat(78)}`);
          console.log(`retrieved for RNA probe: ${retrieved.length} rows; levels probe: ${ladder.length} rows`);
          for (const condition of conditionSelection.conditions) {
            const levels = levelsForCondition(startup, condition);
            const built = await buildRnaCell(ai, arm, startup, levels, corpusVecs, embedState);
            console.log(`\n----- RNA PROMPT (${condition}) -----\n${rnaPrompt(startup.doc, built.rnaBlock, levels)}`);
          }
          console.log(`\n----- LEVELS PROMPT -----\n${levelsPrompt(startup.doc, levelBlock)}`);
        }
      }
      console.log('\n--dry-run: no generation quota spent.');
      return;
    }

    const results = await runGenerationArms(ai, corpusVecs, {
      arms: selection.arms,
      startupNames: selection.startups,
      probes: probeSelection.probes,
      conditions: conditionSelection.conditions,
    });
    if (OUT_FILE) writeResults(OUT_FILE, results);
  })().catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  });
}

module.exports = {
  DIMENSIONS,
  STARTUPS,
  ARMS,
  RUBRICS,
  MAX_READINESS_LEVEL,
  GEN_MODEL,
  EMBED_MODEL,
  FLOOR,
  GROUNDING,
  TYPE_PREFIX,
  rubricKey,
  renderRubricBlock,
  readinessLevelBlock,
  fullLadderRubrics,
  rnaPrompt,
  levelsPrompt,
  hallucinationPrompt,
  buildRnaCell,
  extractJsonPayload,
  isAbsentAnswer,
  mean,
  summarizeResults,
  mergeRuns,
  currentFingerprints,
  flaggedClauses,
  validateArgs,
  selectCells,
  selectProbes,
  ALL_LEVEL_CONDITIONS,
  INFLATED_OVERRIDE,
  inflatedLevels,
  DEFLATED_OVERRIDE,
  deflatedLevels,
  selectLevelConditions,
  levelsForCondition,
  conditionField,
  isRetryableServerError,
  is429,
  withRetry,
  runGenerationArms,
};
