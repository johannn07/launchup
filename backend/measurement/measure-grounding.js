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
 *   Step B - the three generation arms. Expensive: up to 3 calls (RNA text,
 *   1-9 levels, hallucination probe) x 2 startups x 3 arms x 3 reps = 54
 *   calls. Stops cleanly on a 429 and reports partial results with n= counts
 *   per cell rather than padding or dropping them silently.
 *
 * Metrics are mechanical, not LLM-judged - model leniency is one of the things
 * under investigation, so grading the output with a model would fold the
 * thing being measured into the measurement.
 *
 *   node measurement/measure-grounding.js                  (full harness)
 *   node measurement/measure-grounding.js --retrieval-only  (Step A only, free)
 */
const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
require(path.join(BACKEND, 'node_modules/dotenv')).config({
  path: path.join(BACKEND, '.env'),
});
const { GoogleGenAI } = require(path.join(BACKEND, 'node_modules/@google/genai'));

const RETRIEVAL_ONLY = process.argv.includes('--retrieval-only');

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
const REPS = 3;
const DELAY_MS = 4000; // matches measure-models.js/measure-differentiation.js's pacing

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

function rnaPrompt(doc, rubricBlock) {
  return `${doc}${rubricBlock}
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
  console.log('\n\n=== Step B: generation arms (baseline / sdd-semantic / deviation-deterministic) ===\n');

  const embedState = {}; // memoizes the one embed call `semantic` needs, see retrieveRubricsForArm
  const results = {};
  // Every arm gets an entry up front, even one a 429 stops us from ever
  // starting - the report functions below iterate all of ARMS unconditionally
  // and must see an empty (n=0), not undefined, cell for anything not reached.
  for (const arm of ARMS) {
    results[arm.name] = { startups: {}, quotaHit: false };
  }
  let quotaHit = false;

  armLoop: for (const arm of ARMS) {
    for (const [startupName, startup] of Object.entries(STARTUPS)) {
      const retrieved = await retrieveRubricsForArm(ai, arm, startup, corpusVecs, embedState);
      const rubricBlock = renderRubricBlock(retrieved);

      const cell = { retrieved, rnaCalls: [], levelCalls: [], hallucCalls: [] };
      results[arm.name].startups[startupName] = cell;

      for (let rep = 0; rep < REPS; rep++) {
        // --- RNA generation (metric 1) ---
        try {
          const out = await call(ai, rnaPrompt(startup.doc, rubricBlock));
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
            break armLoop;
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
          const out = await call(ai, levelsPrompt(startup.doc, rubricBlock));
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
            break armLoop;
          } else {
            console.error(`  [error: ${arm.name} / ${startupName} / rep ${rep} / levels]`, e.message);
          }
        }
        await sleep(DELAY_MS);

        // --- Hallucination probe (metric 2) ---
        try {
          const out = await call(ai, hallucinationPrompt(startup.doc, rubricBlock, startup.present, startup.absent));
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
            break armLoop;
          } else {
            console.error(`  [error: ${arm.name} / ${startupName} / rep ${rep} / hallucination]`, e.message);
          }
        }
        await sleep(DELAY_MS);
      }

      console.log(
        `${arm.name} / ${startupName}: rna n=${cell.rnaCalls.length} levels n=${cell.levelCalls.length} halluc n=${cell.hallucCalls.length}`,
      );
    }
  }

  reportMetric1(results);
  reportMetric2(results);
  reportMetric3(results);

  if (quotaHit) {
    console.log('\n[QUOTA HIT] Stopped cleanly; the tables above and below reflect only what completed. Check n= before comparing cells.');
  }

  return results;
}

/** Metric 1: rubric-term grounding rate. */
function reportMetric1(results) {
  console.log('\n--- Metric 1: rubric-term grounding rate ---');
  console.log('(proportion of generated RNA text containing a keyTerm from the rubric level actually retrieved for that dimension)\n');

  const rows = [];
  for (const arm of ARMS) {
    const armResult = results[arm.name];
    if (!arm.ragCorpus) {
      rows.push({ arm: arm.name, hits: 'n/a', checked: 'n/a', rate: 'n/a (no rubric ever retrieved)' });
      continue;
    }
    let hits = 0;
    let checked = 0;
    for (const [, cell] of Object.entries(armResult.startups)) {
      const retrievedByDim = new Map();
      for (const r of cell.retrieved) {
        if (!retrievedByDim.has(r.readinessType)) retrievedByDim.set(r.readinessType, []);
        retrievedByDim.get(r.readinessType).push(r);
      }
      for (const rnaCall of cell.rnaCalls) {
        for (const dim of DIMENSIONS) {
          const rows2 = retrievedByDim.get(dim);
          const rnaText = rnaCall.byDim[dim];
          if (!rows2 || !rows2.length || typeof rnaText !== 'string') continue; // no rubric retrieved for this dimension -> not counted
          checked++;
          const terms = rows2.flatMap((r) => r.keyTerms).map((t) => t.toLowerCase());
          const lower = rnaText.toLowerCase();
          if (terms.some((t) => lower.includes(t))) hits++;
        }
      }
    }
    rows.push({
      arm: arm.name,
      hits,
      checked,
      rate: checked ? `${((hits / checked) * 100).toFixed(0)}%` : 'n/a (nothing retrieved)',
    });
  }
  console.table(rows);
}

/** Metric 2: unsupported-claim rate (absent-field probe, measure-models.js design). */
function reportMetric2(results) {
  console.log('\n--- Metric 2: unsupported-claim rate (absent-field probe) ---');
  console.log('(a value invented for a field deliberately absent from the document is a grounding failure)\n');

  const rows = [];
  for (const arm of ARMS) {
    const armResult = results[arm.name];
    let inventedAbsent = 0;
    let absentChecked = 0;
    let presentCorrect = 0;
    let presentChecked = 0;
    for (const [, cell] of Object.entries(armResult.startups)) {
      for (const h of cell.hallucCalls) {
        inventedAbsent += h.inventedAbsent;
        absentChecked += h.absentChecked;
        presentCorrect += h.presentCorrect;
        presentChecked += h.presentChecked;
      }
    }
    rows.push({
      arm: arm.name,
      invented: `${inventedAbsent}/${absentChecked}`,
      'invented rate': absentChecked ? `${((inventedAbsent / absentChecked) * 100).toFixed(0)}%` : 'n/a',
      'present recalled': `${presentCorrect}/${presentChecked}`,
      'n reps': Object.values(armResult.startups).reduce((s, c) => s + c.hallucCalls.length, 0),
    });
  }
  console.table(rows);
}

/** Metric 3: differentiation gap (early vs mid mean level), measure-differentiation.js design. */
function reportMetric3(results) {
  console.log('\n--- Metric 3: differentiation gap (early vs mid) ---');
  console.log('Baseline to hold or beat: +2.28 on gemini-3.6-flash (measure-differentiation.js, 2026-07-27)\n');

  const rows = [];
  for (const arm of ARMS) {
    const armResult = results[arm.name];
    const agro = armResult.startups['AgroLink PH'];
    const medi = armResult.startups['MediSync Cebu'];
    const agroLevels = agro ? agro.levelCalls.flatMap((c) => Object.values(c.byDim)) : [];
    const mediLevels = medi ? medi.levelCalls.flatMap((c) => Object.values(c.byDim)) : [];
    const agroMean = mean(agroLevels);
    const mediMean = mean(mediLevels);
    rows.push({
      arm: arm.name,
      'AgroLink mean': Number.isNaN(agroMean) ? 'n/a' : agroMean.toFixed(2),
      'AgroLink n': agroLevels.length,
      'MediSync mean': Number.isNaN(mediMean) ? 'n/a' : mediMean.toFixed(2),
      'MediSync n': mediLevels.length,
      GAP: Number.isNaN(agroMean) || Number.isNaN(mediMean) ? 'n/a' : (mediMean - agroMean).toFixed(2),
    });
  }
  console.table(rows);
}

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const { corpusVecs } = await runRetrievalOnly(ai);

  if (RETRIEVAL_ONLY) {
    console.log('\n--retrieval-only: stopping before generation arms.');
    return;
  }

  await runGenerationArms(ai, corpusVecs);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
