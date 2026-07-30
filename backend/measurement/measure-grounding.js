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
 *   Step A - mechanism comparison (--retrieval-only stops here). Whether each
 *   rubric mode retrieves the CORRECT dimension's rubric for a given startup
 *   is a pure retrieval question, checkable against rubricKey(type, level) as
 *   ground truth. Uses the embedding endpoint only (batched, 3 calls total),
 *   not the rate-limited generation endpoint, so it reproduces at full N on
 *   every run and costs none of the generation budget.
 *
 *   Step B - the three generation arms. Expensive: 2 calls (RNA text, 1-9
 *   levels) x 2 startups x 3 arms = 12 calls PER REP by default, or 18 with
 *   --with-fabrication-probe adding the hallucination-probe call back in.
 *   Stops cleanly on a 429 and reports partial results with n= counts per
 *   cell rather than padding or dropping them silently.
 *
 * Metrics are mechanical, not LLM-judged - model leniency is one of the things
 * under investigation, so grading the output with a model would fold the
 * thing being measured into the measurement.
 *
 *   node measurement/measure-grounding.js                  (full harness)
 *   node measurement/measure-grounding.js --retrieval-only  (Step A only, free)
 *   node measurement/measure-grounding.js --reps=1 --out=day1.json
 *   node measurement/measure-grounding.js --merge day1.json day2.json day3.json
 *   node measurement/measure-grounding.js --merge results/*.json   (glob - see below)
 *
 * ## Why one rep per day, accumulated
 *
 * gemini-3.6-flash's free tier allows 20 generateContent calls per day and a
 * full rep costs 12 by default (18 with --with-fabrication-probe), so a day
 * buys exactly one rep either way - two reps would need 24, over budget even
 * at the cheaper default. Two consequences are designed for here rather than
 * discovered at runtime:
 *
 *   1. Reps are the OUTERMOST loop, not the innermost. Arm-major ordering
 *      (the original) spends the whole daily budget inside the first arm, so
 *      a partial run yields one fully-powered arm and nothing to compare it
 *      against - which is worthless, since every metric here is a BETWEEN-arm
 *      contrast. Rep-major ordering means each completed rep is a full
 *      three-arm comparison, and a 429 costs precision rather than the
 *      comparison itself.
 *   2. --out persists the raw per-call records so separate days can be
 *      combined with --merge, which re-runs the report functions over the
 *      concatenated calls. Retrieval is deterministic, so merging days is
 *      sound as long as the corpus and the model are unchanged - both are
 *      recorded in the file and checked on merge.
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
 * Assembles and prints every arm's prompts without calling the model. The one
 * thing unit tests cannot check is whether the assembled prompt LOOKS right -
 * and this harness has now twice measured a property of the prompt rather
 * than of the model. Same philosophy as inspect-prompt.js: stop before sendToGemini.
 */
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * The absent-field probe is saturated - 0/15 invented on every arm, 2026-07-29,
 * reproducing the 2026-07-27 model comparison's 0/9 on two different models.
 * groundPrompt() already handles it completely, so it discriminates nothing.
 *
 * It is kept rather than deleted because 0/15 with 15/15 recalled is a PASSING
 * result against SRS 2.2's "return null for unverifiable fields" criterion, and
 * that evidence is worth having. Running it once per series is enough. Skipping
 * it by default takes a rep from 18 calls to 12, against a 20/day cap.
 */
const WITH_FABRICATION = process.argv.includes('--with-fabrication-probe');

const flagValue = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const OUT_FILE = flagValue('out');

// --merge takes every following non-flag argument:
//   node measurement/measure-grounding.js --merge results/day1.json results/day2.json
//   node measurement/measure-grounding.js --merge results/day*.json
// A bash shell expands the second form itself before this script ever sees
// it. PowerShell (and a plain Node child_process.spawn) does not glob at
// all, so without help the second form would silently pass through the
// literal, un-expanded string "results/day*.json" as a single "file" and
// fail confusingly. Node 22's fs.globSync closes that gap: any argument that
// actually contains glob metacharacters is expanded here, so the documented
// command works the same way regardless of shell. An argument with no glob
// metacharacters is never touched, even if the file doesn't exist yet - it
// passes straight through so a genuine typo still surfaces as a plain ENOENT
// naming exactly what was typed, from mergeRuns' fs.readFileSync, rather than
// disappearing into a glob that "matched nothing".
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
const KNOWN_VALUE_FLAG_PREFIXES = ['--out=', '--reps='];

/**
 * Pure validation over raw CLI args (process.argv.slice(2)) plus the already
 * glob-resolved --merge file list. Returns an array of error strings - empty
 * means the invocation is well-formed. Exported (and called only from the
 * require.main guard below, never at module load) so tests can exercise it
 * directly without spawning a subprocess or touching process.exit, and so
 * requiring this file from `node --test` - where argv[0..] is the test
 * runner's own arguments, not this script's - never runs it by accident.
 *
 * Two failure modes this closes, both of which previously spent the
 * generation budget silently instead of erroring:
 *   - `--merge` present but resolving to zero files (missing arguments, a
 *     bare trailing flag, or a glob matching nothing) used to fall straight
 *     through to a live 12-call run.
 *   - `--out foo.json` (a space instead of `=`) used to leave OUT_FILE null
 *     and "foo.json" ignored as if never typed, so a full run's results were
 *     computed and then never written anywhere.
 */
function validateArgs(argv, mergeFiles) {
  const errors = [];
  const mergeIdx = argv.indexOf('--merge');
  // Everything from --merge onward is file arguments for it - never validated
  // as a flag or a stray positional here, since MERGE_FILES' own scan already
  // consumes that entire tail of argv.
  const toValidate = mergeIdx === -1 ? argv : argv.slice(0, mergeIdx);

  for (let i = 0; i < toValidate.length; i++) {
    const arg = toValidate[i];
    if (arg.startsWith('--')) {
      const known = KNOWN_EXACT_FLAGS.has(arg) || KNOWN_VALUE_FLAG_PREFIXES.some((p) => arg.startsWith(p));
      if (!known) {
        errors.push(
          `Unrecognized flag "${arg}". Known flags: --retrieval-only, --dry-run, ` +
            '--with-fabrication-probe, --fingerprint, --out=<file>, --reps=<n>, --merge <files...>.',
        );
      }
    } else {
      // The most common way to land here is `--out foo.json` or `--reps 3`
      // (a space where "=" belongs) - the preceding bare flag names exactly
      // what was probably meant, so say so instead of a generic message.
      const prev = toValidate[i - 1];
      const hint =
        prev === '--out' || prev === '--reps'
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
 * gemini-3.6-flash's free-tier ceiling for generateContent is
 * GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20/day (confirmed via
 * the 429 body, 2026-07-28) - a hard daily cap, not a per-minute rate limit.
 * No amount of re-pacing works around it; 54 calls in one day is not
 * possible on this tier for this model. Re-run on a day with fresh quota, or
 * split the three arms across multiple days.
 */
const GEN_MODEL = 'gemini-3.6-flash'; // the model the +2.28 differentiation baseline was measured on
// One rep costs 12 of the 20 daily calls by default (18 with
// --with-fabrication-probe), so the default is what a single day can
// actually buy either way. Raise it only against a paid key; --reps=3 on the
// free tier reproduces exactly the 2026-07-28 failure (arm 1 completes,
// nothing to compare it to).
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

// The two seeded startups. Documents are measure-differentiation.js's verbatim
// text (same early/mid pair already validated for this purpose); levels are
// the actual per-dimension StartupReadinessLevel rows main.ts seeds for them
// (seedDemoStartups), not a guess.
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
    levels: { Technology: 2, Market: 2, Acceptance: 1, Organizational: 2, Regulatory: 1, Investment: 1 },
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
    levels: { Technology: 5, Market: 4, Acceptance: 3, Organizational: 4, Regulatory: 3, Investment: 3 },
    present: ['rural_health_units_in_cebu', 'monthly_recurring_revenue_php', 'number_of_founders'],
    absent: ['monthly_burn_rate_php', 'lead_investor_name', 'date_of_incorporation'],
  },
};

const ARMS = [
  { name: 'baseline', ragCorpus: false, rubricMode: null },
  { name: 'sdd-semantic', ragCorpus: true, rubricMode: 'semantic' },
  { name: 'deviation-deterministic', ragCorpus: true, rubricMode: 'deterministic' },
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
 * "Quota-free" in the brief means "does not touch the rate-limited generation
 * endpoint" - it still calls embedContent, which turned out to have its own
 * free-tier ceiling (observed 2026-07-28: embed_content_free_tier_requests
 * exhausted independently of any generateContent usage). Embeddings are
 * deterministic (calibrate-similarity.js's point), so a failure here is
 * reported plainly rather than retried in a loop - re-run once the embed
 * quota resets and the numbers reproduce exactly.
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

    // Per-dimension query used when RagQueryService.retrieveRubrics is called
    // with exactly one missing dimension (dimensions.map(d=>d.readinessType)
    // .join(' ') degenerates to the bare readinessType string in that case).
    // NOTE: this is the CODE's dimension-name substitute, not SDD §3.2's
    // mechanism - see the profile-embedding query below for that.
    dimVecs = await embedAll(ai, DIMENSIONS);

    // SDD §3.2, as written: "queries the vector database using the startup's
    // profile data as the search embedding." rag-query.service.ts:126 does not
    // do this for the rubric channel - it embeds the bare readinessType name
    // instead - so this is the one query in this script that tests the SDD's
    // actual specified mechanism rather than the code's substitute for it.
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

      // semantic: nearest neighbours to the bare dimension name, floor 0.78,
      // top-2 (searchCorpus's default limit). Classified by the top hit, same
      // convention as measure-retrieval.js's "top hit correct".
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

  // --- SDD §3.2 as actually written: "the startup's profile data as the
  // search embedding." One query per startup (not per dimension - a whole
  // profile isn't aimed at one dimension), checked against the union of all
  // 12 (dimension, current-or-next-level) keys for that startup: does the
  // profile, embedded whole, surface ANY rubric row that's actually relevant
  // to where this startup currently sits, across all six dimensions?
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
 * Retrieval is deterministic (both modes are pure functions of fixed
 * embeddings/keys), so it is computed once per (arm, startup) and reused
 * across all reps rather than re-run 3x for no informational gain - the same
 * property calibrate-similarity.js's caveats note about re-running retrieval.
 *
 * `deterministic` needs no embedding call at all (pure key lookup), so it -
 * and the baseline arm, which needs no rubric at all - must never be blocked
 * by the one embed call `semantic` needs. That call is requested lazily, at
 * most once (memoized on `state`), and degrades to "nothing retrieved" on
 * failure exactly as EmbeddingService.embed does in production: an embedding
 * outage lowers confidence, it does not fail the run.
 */
async function retrieveRubricsForArm(ai, arm, startup, corpusVecs, state) {
  if (!arm.ragCorpus) return [];

  if (arm.rubricMode === 'deterministic') {
    const wanted = new Set();
    for (const dim of DIMENSIONS) {
      const level = startup.levels[dim];
      wanted.add(rubricKey(dim, level));
      wanted.add(rubricKey(dim, Math.min(level + 1, MAX_READINESS_LEVEL)));
    }
    return RUBRICS.filter((r) => wanted.has(r.key));
  }

  // semantic: dimensions.map(d => d.readinessType).join(' ') when ALL six
  // types are missing (a fresh startup's first RNA generation) - this string
  // does not depend on the startup at all, so both startups receive the
  // identical retrieved set. That is a property of the production code being
  // measured, not an artifact of this harness; it's called out in the README.
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
 * Verbatim in shape from ai.service.ts:937-943. Production emits this for EVERY
 * arm - only rubricBlock varies with ragCorpus - so omitting it here made the
 * harness measure "told its levels" against "not told its levels", which is a
 * contrast production never presents and not a retrieval effect.
 *
 * The abbreviation order is production's and must not be re-sorted: a reviewer
 * comparing the two prompts should see the same block.
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
 * The nine-rung ladder for every dimension, for the LEVELS probe only.
 *
 * Deterministic retrieval keys on (readinessType, level) using the startup's
 * actual level. Handing that to a probe that asks the model to assess the level
 * shows it the answer, so any differentiation advantage for that arm is leakage
 * rather than grounding - and no number of reps fixes it.
 *
 * The RNA probe deliberately keeps the (L, L+1) lookup, because that is what
 * production ships. These are different instruments and the asymmetry is
 * intentional: do not "tidy" them into agreement.
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

async function runGenerationArms(ai, corpusVecs) {
  console.log('\n\n=== Step B: generation arms (baseline / sdd-semantic / deviation-deterministic) ===');
  const callsPerCell = WITH_FABRICATION ? 3 : 2;
  const perRep = ARMS.length * Object.keys(STARTUPS).length * callsPerCell;
  console.log(
    `reps=${REPS}, ${perRep} calls per rep (${REPS * perRep} total) ` +
      `against a 20/day free-tier cap on ${GEN_MODEL}` +
      (WITH_FABRICATION ? ' [+ fabrication probe]' : '') + '\n',
  );

  const embedState = {}; // memoizes the one embed call `semantic` needs, see retrieveRubricsForArm
  const results = {};
  // Every arm gets an entry up front, even one a 429 stops us from ever
  // starting - the report functions below iterate all of ARMS unconditionally
  // and must see an empty (n=0), not undefined, cell for anything not reached.
  for (const arm of ARMS) {
    results[arm.name] = { startups: {}, quotaHit: false };
  }
  let quotaHit = false;

  // Retrieval is deterministic and independent of the rep, so it is resolved
  // once for every (arm, startup) pair BEFORE the rep loop opens. Under the
  // old arm-major ordering this fell out naturally; with reps outermost it has
  // to be hoisted deliberately, or `semantic` would re-embed once per rep.
  // Two rubric blocks per (arm, startup), not one. The RNA probe mirrors
  // production's (L, L+1) lookup; the levels probe gets the full ladder so it
  // is not handed the quantity it is being asked to predict. See
  // fullLadderRubrics for why the asymmetry is deliberate.
  const rnaBlocks = new Map();    // `${arm}|${startup}` -> block for the RNA probe
  const levelBlocks = new Map();  // `${arm}|${startup}` -> block for the levels probe
  for (const arm of ARMS) {
    for (const [startupName, startup] of Object.entries(STARTUPS)) {
      const retrieved = await retrieveRubricsForArm(ai, arm, startup, corpusVecs, embedState);
      rnaBlocks.set(`${arm.name}|${startupName}`, renderRubricBlock(retrieved));
      // Only a corpus arm gets a rubric at all. `semantic` retrieves nothing
      // against this corpus (Step A: 0/12), which is what makes it a
      // null-condition replicate of baseline - preserved deliberately as a
      // noise control, not a third condition.
      const ladder = arm.ragCorpus && retrieved.length ? fullLadderRubrics() : [];
      levelBlocks.set(`${arm.name}|${startupName}`, renderRubricBlock(ladder));
      results[arm.name].startups[startupName] = { retrieved, rnaCalls: [], levelCalls: [], hallucCalls: [] };
    }
  }

  // Reps outermost: a 429 partway through costs precision, not the comparison.
  // See the header - every metric in this file is a between-arm contrast, so a
  // run that completes one arm and abandons the others measures nothing.
  repLoop: for (let rep = 0; rep < REPS; rep++) {
    for (const arm of ARMS) {
      for (const [startupName, startup] of Object.entries(STARTUPS)) {
        const rnaBlock = rnaBlocks.get(`${arm.name}|${startupName}`);
        const levelBlock = levelBlocks.get(`${arm.name}|${startupName}`);
        const cell = results[arm.name].startups[startupName];

        // --- RNA generation (metric 1) ---
        try {
          const out = await call(ai, rnaPrompt(startup.doc, rnaBlock, startup.levels));
          const payload = extractJsonPayload(out.text);
          const parsed = payload ? JSON.parse(payload) : null;
          if (Array.isArray(parsed)) {
            const byDim = {};
            for (const x of parsed) {
              if (typeof x.rna === 'string' && typeof x.readiness_level_type === 'string') {
                byDim[x.readiness_level_type] = x.rna;
              }
            }
            cell.rnaCalls.push({ byDim });
          }
        } catch (e) {
          if (is429(e)) {
            console.log(`  [quota hit: ${arm.name} / ${startupName} / rep ${rep} / rna]`);
            quotaHit = true;
            results[arm.name].quotaHit = true;
            break repLoop;
          } else {
            // Anything else (parse failure, network blip, schema error) must
            // not vanish silently: this harness is meant to run unattended
            // across a 20-request daily cap, and the only symptom of a
            // swallowed non-429 error is a lower n= with no explanation.
            console.error(`  [error: ${arm.name} / ${startupName} / rep ${rep} / rna]`, e.message);
          }
        }
        await sleep(DELAY_MS);

        // --- Levels (metric 3) ---
        try {
          const out = await call(ai, levelsPrompt(startup.doc, levelBlock));
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
        await sleep(DELAY_MS);

        // --- Hallucination probe (metric 2) ---
        if (WITH_FABRICATION) {
          try {
            const out = await call(ai, hallucinationPrompt(startup.doc, rnaBlock, startup.present, startup.absent));
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
          await sleep(DELAY_MS);
        }

        console.log(
          `rep ${rep} / ${arm.name} / ${startupName}: rna n=${cell.rnaCalls.length} ` +
            `levels n=${cell.levelCalls.length} halluc n=${cell.hallucCalls.length} (cumulative)`,
        );
      }
    }
  }

  printReports(results);

  if (quotaHit) {
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

  for (const arm of ARMS) {
    const armResult = results[arm.name] || { startups: {} };

    // --- Metric 1: level-placement accuracy vs seeded ground truth ---
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
  }

  return { metric1, metric2, metric3, metric4 };
}

function printReports(results) {
  const s = summarizeResults(results);

  console.log('\n--- Metric 1: level-placement accuracy (vs seeded ground truth) ---');
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
      fullLadderRubrics: fullLadderRubrics.toString(),
    },
    arms: ARMS,
    levelsRubricScope: 'full-ladder',
    rnaRubricScope: 'current-and-next',
  });
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
  const FIELD = { levels: 'levelCalls', rna: 'rnaCalls', fabrication: 'hallucCalls' };

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
              rnaCalls: [],
              levelCalls: [],
              hallucCalls: [],
            });
          dst[field].push(...cell[field]);
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
      for (const arm of ARMS) {
        for (const [startupName, startup] of Object.entries(STARTUPS)) {
          const retrieved = await retrieveRubricsForArm(ai, arm, startup, corpusVecs, embedState);
          const rnaBlock = renderRubricBlock(retrieved);
          const ladder = arm.ragCorpus && retrieved.length ? fullLadderRubrics() : [];
          const levelBlock = renderRubricBlock(ladder);
          console.log(`\n${'='.repeat(78)}\n${arm.name} / ${startupName}\n${'='.repeat(78)}`);
          console.log(`retrieved for RNA probe: ${retrieved.length} rows; levels probe: ${ladder.length} rows`);
          console.log(`\n----- RNA PROMPT -----\n${rnaPrompt(startup.doc, rnaBlock, startup.levels)}`);
          console.log(`\n----- LEVELS PROMPT -----\n${levelsPrompt(startup.doc, levelBlock)}`);
        }
      }
      console.log('\n--dry-run: no generation quota spent.');
      return;
    }

    const results = await runGenerationArms(ai, corpusVecs);
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
  extractJsonPayload,
  isAbsentAnswer,
  mean,
  summarizeResults,
  mergeRuns,
  currentFingerprints,
  validateArgs,
};
