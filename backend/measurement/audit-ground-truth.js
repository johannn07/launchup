#!/usr/bin/env node
/**
 * Re-scores the already-collected grounding runs against a ground truth derived
 * from the startup documents, instead of the seeded StartupReadinessLevel rows.
 *
 * Why this exists: metric 1 scores the model against `seedDemoStartups`' levels.
 * Those are demo fixtures authored for the UI; nobody ever checked them against
 * the documents the model is actually shown. Several are flatly contradicted by
 * their own document (see CONTRADICTIONS below), so "error" against them is not
 * necessarily error.
 *
 * Spends no quota — it reads measurement/results/*.json.
 */

const fs = require('fs');
const path = require('path');
const { levelPlacement } = require('./lib/metrics');
const { HARD_ABSENCES, verifyAbsences } = require(path.join(__dirname, 'lib/hard-absences.js'));
const { ORIGINAL_DOCS } = require(path.join(__dirname, 'lib/doc-variants.js'));

const DIMENSIONS = ['Technology', 'Market', 'Acceptance', 'Organizational', 'Regulatory', 'Investment'];

// Excludes 2026-07-29-rep1.json: pre-redesign, and the fingerprint guard in
// measure-grounding.js refuses to pool it for the same reason.
const RESULT_FILES = [
  '2026-07-30-redesign-rep1.json',
  '2026-08-03-rep2.json',
  '2026-08-03-rep3.json',
  '2026-08-04-rep3-refill.json',
  '2026-08-04-titles-arm.json',
  '2026-08-04-bare-arm.json',
];

/**
 * FROZEN. The reference metric 1 used from the 2026-07-30 redesign until it was
 * corrected on 2026-08-05 — the values the runs in results/ were actually
 * scored against.
 *
 * Do NOT update these to match measure-grounding.js. They deliberately no
 * longer agree with it: this file re-scores historical runs, and the
 * reproduction test below pins the published figures, which only reproduce
 * against the reference that produced them. A test asserts the divergence so a
 * well-meaning sync cannot land silently.
 */
const SEEDED = {
  'AgroLink PH': { Technology: 2, Market: 2, Acceptance: 1, Organizational: 2, Regulatory: 1, Investment: 1 },
  'MediSync Cebu': { Technology: 5, Market: 4, Acceptance: 3, Organizational: 4, Regulatory: 3, Investment: 3 },
};

/**
 * provenance: model-adjudicated, post-hoc. Read this before quoting anything
 * scored against it.
 *
 * Set by Claude from the documents and the rubric ladders, by one rule applied
 * to every cell: the level is the highest whose core condition the document
 * supports. `strict` = stated outright, `permissive` = entailed by something
 * stated. They differ on four cells; both are reported because the choice is a
 * judgement call and no conclusion should rest on it. `quote` is the document
 * text the level is read from, so any cell is checkable without the rubric.
 *
 * Two limits, and they are not symmetric:
 *   - It is sound for RETIRING the old conclusion. That rests on CONTRADICTIONS
 *     below — the seeded level's own rubric text negated by a document sentence
 *     — which holds however these cells are set.
 *   - It CANNOT establish that a corpus arm places better. An adjudicator
 *     reading the document with the full rubric ladder in front of it is
 *     approximately the deviation-deterministic condition, so agreement with
 *     that arm is close to circular. It was also set after the results were
 *     known. Use HARD_ABSENCES for any claim about which arm is better.
 *
 * A human-set reference would break the circularity: data/ground-truth-
 * adjudication.md is the blind worksheet for that.
 */
const DERIVED = {
  'AgroLink PH': {
    Technology: { strict: 2, permissive: 2, quote: 'paper prototype of the lot-aggregation flow', why: 'TRL 2 is concept + sketch with no built code; TRL 3 wants a proof-of-concept producing a recorded result. A paper prototype is explicitly not code.' },
    Market: { strict: 3, permissive: 4, quote: 'field interviews with 18 cooperatives', why: 'MRL 3 is informal problem interviews. MRL 4 wants a consistent script and a discovery report; 18 field interviews imply that but the document does not say so.' },
    Acceptance: { strict: 3, permissive: 4, quote: 'paper prototype ... tested with 3 cooperatives', why: 'ARL 3 is informal demos with reactions captured. ARL 4 wants task-completion data, which is not stated. ARL 1, the seeded value, requires that no user has interacted with the product in any form.' },
    Organizational: { strict: 2, permissive: 2, quote: 'two founders committed full-time', why: 'ORL 2 is an informal split between founders. ORL 3 needs a first non-founder contributor.' },
    Regulatory: { strict: 1, permissive: 1, quote: 'has not been registered with IPOPHL', why: 'No regulatory analysis of any kind is described. RRL 2 needs at least an internal note naming the likely regulator.' },
    Investment: { strict: 1, permissive: 1, quote: 'Revenue: None to date', why: 'No funding plan, no investor contact. IRL 1 by definition.' },
  },
  'MediSync Cebu': {
    Technology: { strict: 6, permissive: 7, quote: 'pilot with 2 rural health units and 1 district hospital ... expanded to 6 facilities', why: 'TRL 6 is a pilot with real customers in their own environment. TRL 7 wants monitoring in place, which is not stated. TRL 5, the seeded value, explicitly says the system "has not yet gone live for actual users".' },
    Market: { strict: 5, permissive: 6, quote: 'first paid facility subscriptions ... PHP 5,000 monthly recurring revenue', why: 'MRL 5 is paid commitments from more than one customer. MRL 6 wants documented renewal or expansion revenue. MRL 4, the seeded value, requires that "no prospect has yet indicated a specific willingness to pay".' },
    Acceptance: { strict: 5, permissive: 5, quote: 'expanded to 6 facilities; first paid facility subscriptions', why: 'ARL 5 is independent real use beyond the founders; its measurement artifact is not documented, which is why this is not 6. ARL 3, the seeded value, means no behaviour has been observed at all.' },
    Organizational: { strict: 2, permissive: 2, quote: 'team grew to 3 founders', why: 'Founders only, informally split. ORL 3 needs a non-founder contributor and ORL 4, the seeded value, needs written role definitions and a first full-time hire beyond the founders.' },
    Regulatory: { strict: 1, permissive: 2, quote: 'Trademark application filed with IPOPHL, pending', why: 'A trademark filing is IP, not product regulation. RRL 2 wants the governing regulatory domain named; permissive credits operating knowingly in a health context. RRL 3, the seeded value, needs counsel engaged and a preliminary opinion.' },
    Investment: { strict: 1, permissive: 1, quote: 'Revenue: PHP 5,000 monthly recurring', why: 'Revenue is not investment. No funding plan, amount, or investor contact appears anywhere. IRL 3, the seeded value, needs a written funding plan with a stated target raise.' },
  },
};

/** Cells where the seeded level's own rubric text is contradicted by the document. */
const CONTRADICTIONS = [
  ['MediSync Cebu', 'Market', 'MRL 4: "no prospect has yet indicated a specific willingness to pay"', 'PHP 5,000 monthly recurring revenue'],
  ['MediSync Cebu', 'Organizational', 'ORL 4: "first full-time hire beyond the founders"', 'team grew to 3 founders'],
  ['MediSync Cebu', 'Investment', 'IRL 3: "a written funding plan document with a stated amount"', 'no funding activity mentioned at all'],
  ['MediSync Cebu', 'Technology', 'TRL 5: "has not yet gone live for actual users"', 'paid subscriptions at 6 live facilities'],
  ['AgroLink PH', 'Acceptance', 'ARL 1: "no user has interacted with the product in any form"', 'paper prototype tested with 3 cooperatives'],
];

/**
 * The two documents, imported from the single source the harness also reads
 * (lib/doc-variants.js' ORIGINAL_DOCS) so they cannot drift from it.
 *
 * This used to regex-scrape the `doc:` template literal out of
 * measure-grounding.js. That broke the moment the documents moved, which is the
 * argument against source-scraping — but it was also quietly returning the RAW
 * source text, so on a CRLF checkout the audit read documents with \r\n while
 * the harness parsed the same literal to \n. Importing removes both problems.
 */
function loadDocuments() {
  const out = {};
  for (const name of Object.keys(SEEDED)) {
    if (typeof ORIGINAL_DOCS[name] !== 'string') throw new Error(`could not extract document for ${name}`);
    out[name] = ORIGINAL_DOCS[name];
  }
  return out;
}

/** Placements at or above a rung whose required evidence the document lacks. */
function unsupportedPlacements(calls) {
  const byArm = {};
  for (const call of calls) {
    const a = (byArm[call.arm] ||= { unsupported: 0, checked: 0, detail: [] });
    for (const [dim, spec] of Object.entries(HARD_ABSENCES)) {
      const placed = call.byDim[dim];
      if (typeof placed !== 'number') continue;
      a.checked++;
      if (placed > spec.ceiling) {
        a.unsupported++;
        a.detail.push(`${call.startup}/${dim}=${placed}`);
      }
    }
  }
  return byArm;
}

function reference(name) {
  if (name === 'seeded') return SEEDED;
  const out = {};
  for (const [startup, dims] of Object.entries(DERIVED)) {
    out[startup] = {};
    for (const [dim, cell] of Object.entries(dims)) out[startup][dim] = cell[name];
  }
  return out;
}

/** All levels calls in the pooled files, flattened to {arm, startup, byDim}. */
function loadCalls() {
  const calls = [];
  for (const file of RESULT_FILES) {
    const full = path.join(__dirname, 'results', file);
    if (!fs.existsSync(full)) throw new Error(`missing results file: ${file}`);
    const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    for (const [arm, armData] of Object.entries(parsed.results || {})) {
      for (const [startup, sv] of Object.entries(armData.startups || {})) {
        for (const call of sv.levelCalls || []) calls.push({ arm, startup, byDim: call.byDim, file });
      }
    }
  }
  return calls;
}

function score(calls, truth) {
  const byArm = {};
  for (const call of calls) {
    const t = truth[call.startup];
    if (!t) continue;
    const a = (byArm[call.arm] ||= { errors: [], signed: {}, startups: new Set() });
    a.startups.add(call.startup);
    const p = levelPlacement(call.byDim, t, DIMENSIONS);
    a.errors.push(p);
    for (const dim of DIMENSIONS) {
      if (typeof call.byDim[dim] !== 'number') continue;
      (a.signed[dim] ||= []).push(call.byDim[dim] - t[dim]);
    }
  }
  const out = {};
  for (const [arm, a] of Object.entries(byArm)) {
    const n = a.errors.reduce((s, e) => s + e.n, 0);
    out[arm] = {
      n,
      mae: a.errors.reduce((s, e) => s + e.mae * e.n, 0) / n,
      exact: a.errors.reduce((s, e) => s + e.exact, 0),
      within1: a.errors.reduce((s, e) => s + e.within1, 0),
      signed: Object.fromEntries(
        DIMENSIONS.map((d) => [d, mean(a.signed[d] || [])]),
      ),
    };
  }
  return out;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '  — ');

function table(title, scored) {
  console.log(`\n### ${title}\n`);
  console.log('| arm | n | MAE | exact | within1 |');
  console.log('|---|---|---|---|---|');
  for (const [arm, s] of Object.entries(scored)) {
    console.log(`| ${arm} | ${s.n} | ${f2(s.mae)} | ${s.exact}/${s.n} | ${s.within1}/${s.n} |`);
  }
}

function signedTable(title, scored) {
  console.log(`\n### ${title} — mean signed error (+ = placed too high)\n`);
  console.log(`| arm | ${DIMENSIONS.map((d) => d.slice(0, 4)).join(' | ')} |`);
  console.log(`|---|${DIMENSIONS.map(() => '---').join('|')}|`);
  for (const [arm, s] of Object.entries(scored)) {
    console.log(`| ${arm} | ${DIMENSIONS.map((d) => f2(s.signed[d])).join(' | ')} |`);
  }
}

function main() {
  const calls = loadCalls();

  console.log('# Ground-truth audit — re-scoring the collected runs against the documents\n');
  console.log(`Pooled ${calls.length} levels calls from ${RESULT_FILES.length} result files. No quota spent.\n`);

  console.log('## Seeded levels contradicted by their own document\n');
  console.log('| startup | dim | what the seeded level requires | what the document says |');
  console.log('|---|---|---|---|');
  for (const [s, d, req, doc] of CONTRADICTIONS) console.log(`| ${s} | ${d} | ${req} | ${doc} |`);

  console.log('\n## Reference levels compared\n');
  console.log('| startup | dim | seeded | derived (strict) | derived (permissive) |');
  console.log('|---|---|---|---|---|');
  for (const startup of Object.keys(DERIVED)) {
    for (const dim of DIMENSIONS) {
      const c = DERIVED[startup][dim];
      const flag = SEEDED[startup][dim] === c.strict ? '' : ' ⚠';
      console.log(`| ${startup} | ${dim} | ${SEEDED[startup][dim]}${flag} | ${c.strict} | ${c.permissive} |`);
    }
  }

  for (const ref of ['seeded', 'strict', 'permissive']) {
    const scored = score(calls, reference(ref));
    table(`Scored against: ${ref}`, scored);
    signedTable(`Scored against: ${ref}`, scored);
  }

  const docs = loadDocuments();
  verifyAbsences(docs);
  console.log('\n---\n');
  console.log('## Reference-free: placements asserting evidence the document does not contain\n');
  console.log('Verified at run time that none of the required artifact classes appear in either document.');
  console.log('Ceilings are one rung more generous than the documents support, so this is a lower bound.\n');
  for (const [dim, spec] of Object.entries(HARD_ABSENCES)) {
    console.log(`- **${dim}** — unsupported above ${spec.ceiling}. ${spec.requires}`);
  }
  console.log('\n| arm | unsupported | of | rate |');
  console.log('|---|---|---|---|');
  for (const [arm, a] of Object.entries(unsupportedPlacements(calls))) {
    console.log(`| ${arm} | ${a.unsupported} | ${a.checked} | ${(100 * a.unsupported / a.checked).toFixed(0)}% |`);
  }
  console.log('\nThis is directional: it catches over-placement into absent evidence and says nothing about under-placement.');
}

if (require.main === module) main();

module.exports = {
  SEEDED, DERIVED, HARD_ABSENCES, reference, loadCalls, score, DIMENSIONS, RESULT_FILES,
  loadDocuments, verifyAbsences, unsupportedPlacements,
};
