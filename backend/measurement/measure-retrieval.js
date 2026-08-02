/**
 * Does semantic retrieval actually beat the keyword matching it replaced?
 *
 * This is the Objective 1b arm comparison. AI_RAG_STRATEGY selects between the
 * two paths at runtime; this measures which one is worth selecting.
 *
 * Method: nine startup descriptions across three domains, each used in turn as
 * the query against the other eight. A retrieved document is "correct" if it
 * shares the query's domain — a health-referral startup should surface the
 * other health startups, not the agriculture ones. Both arms run over the same
 * documents with the same top-K and their production scoring functions:
 *
 *   keyword  - scoreRagMatch from ai.service.ts, verbatim (token-overlap
 *              Jaccard, keep anything scoring above zero)
 *   semantic - gemini-embedding-2 at 768 dims, cosine, floor RAG_MIN_SIMILARITY
 *
 * Ground truth is domain membership — coarser than a human judgement, but not
 * circular, since neither arm sees the labels. See README.md's caveats.
 *
 *   node measurement/measure-retrieval.js
 */
const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
require(path.join(BACKEND, 'node_modules/dotenv')).config({
  path: path.join(BACKEND, '.env'),
});
const { GoogleGenAI } = require(path.join(BACKEND, 'node_modules/@google/genai'));

const MODEL = 'gemini-embedding-2';
const DIMS = 768;
const TOP_K = 3; // RAG_TOP_K
const FLOOR = 0.78; // RAG_MIN_SIMILARITY

const DOCS = [
  ['health', 'MediSync Cebu', 'Referral coordination platform linking rural health units with district and tertiary hospitals, replacing paper-and-phone patient transfers. Structured referral records carry triage category and bed availability.'],
  ['health', 'ClinicBridge Bohol', 'Digital patient referral and bed-availability tracking between provincial clinics and regional hospitals. Replaces phone-based coordination for emergency transfers.'],
  ['health', 'TeleKonsulta Leyte', 'Remote consultation scheduling for barangay health stations, connecting midwives to district physicians for case review and prescription approval.'],
  ['agri', 'AgroLink PH', 'Connects smallholder rice and vegetable farmer cooperatives directly to institutional grain buyers, bypassing layers of traders that compress farmgate prices.'],
  ['agri', 'HarvestTrack Nueva Ecija', 'Mobile logging of expected harvest volumes for rice cooperatives, aggregating lots so cooperatives can meet institutional buyer minimums.'],
  ['agri', 'CoopCredit Mindanao', 'Working-capital lending to agricultural cooperatives, underwritten against recorded harvest volumes and standing buyer contracts.'],
  ['edu', 'SkillPath Davao', 'Competency tracking for technical-vocational students, mapping completed modules to employer-defined role requirements.'],
  ['edu', 'ClassKit Iloilo', 'Offline-first lesson delivery for public school teachers in low-connectivity areas, syncing student assessment records when a signal is available.'],
  ['edu', 'AlumniLoop Cebu', 'Tracks graduate employment outcomes for state universities and reports placement rates against programme accreditation requirements.'],
];

/** Verbatim from AiService.scoreRagMatch. */
function scoreRagMatch(query, candidate) {
  const tokenize = (value) =>
    value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  const queryTokens = new Set(tokenize(query));
  const candidateTokens = new Set(tokenize(candidate));
  if (!queryTokens.size || !candidateTokens.size) return 0;
  let overlap = 0;
  for (const token of queryTokens) if (candidateTokens.has(token)) overlap += 1;
  return overlap / Math.max(queryTokens.size, candidateTokens.size);
}

const cos = (a, b) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const n = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return dot / (n(a) * n(b));
};

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const texts = DOCS.map(([, title, body]) => `${title}\n\n${body}`);
  const res = await ai.models.embedContent({
    model: MODEL,
    contents: texts,
    config: { outputDimensionality: DIMS },
  });
  const vecs = res.embeddings.map((e) => e.values);

  const tally = {
    keyword: { retrieved: 0, correct: 0, queriesWithNothing: 0, perQuery: [] },
    semantic: { retrieved: 0, correct: 0, queriesWithNothing: 0, perQuery: [] },
  };

  for (let q = 0; q < DOCS.length; q++) {
    const [domain, title] = DOCS[q];
    const others = DOCS.map((_, i) => i).filter((i) => i !== q);

    const arms = {
      keyword: others
        .map((i) => ({ i, score: scoreRagMatch(texts[q], texts[i]) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K),
      semantic: others
        .map((i) => ({ i, score: cos(vecs[q], vecs[i]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K)
        .filter((x) => x.score >= FLOOR),
    };

    for (const [arm, hits] of Object.entries(arms)) {
      const correct = hits.filter(({ i }) => DOCS[i][0] === domain).length;
      tally[arm].retrieved += hits.length;
      tally[arm].correct += correct;
      if (hits.length === 0) tally[arm].queriesWithNothing += 1;
      tally[arm].perQuery.push({
        query: title,
        domain,
        returned: hits.length,
        correct,
        top: hits.length ? DOCS[hits[0].i][1] : '-',
        topIsSameDomain: hits.length ? DOCS[hits[0].i][0] === domain : null,
      });
    }
  }

  console.log(`${DOCS.length} documents, 3 domains, top-K ${TOP_K}, semantic floor ${FLOOR}\n`);

  const summary = Object.entries(tally).map(([arm, t]) => ({
    arm,
    'returned total': t.retrieved,
    'correct (same domain)': t.correct,
    precision: t.retrieved ? `${((t.correct / t.retrieved) * 100).toFixed(0)}%` : 'n/a',
    'top hit correct': `${t.perQuery.filter((p) => p.topIsSameDomain).length}/${DOCS.length}`,
    'queries returning nothing': t.queriesWithNothing,
  }));
  console.table(summary);

  console.log('\nper-query top hit:');
  console.table(
    tally.keyword.perQuery.map((k, i) => ({
      query: k.query,
      domain: k.domain,
      'keyword top': k.top,
      'kw ok': k.topIsSameDomain === null ? '-' : k.topIsSameDomain ? 'yes' : 'NO',
      'semantic top': tally.semantic.perQuery[i].top,
      'sem ok': tally.semantic.perQuery[i].topIsSameDomain === null
        ? '-'
        : tally.semantic.perQuery[i].topIsSameDomain
          ? 'yes'
          : 'NO',
    })),
  );

  // Precision alone rewards an arm that returns nothing, so report recall too:
  // of the 2 same-domain documents per query, how many surfaced.
  const available = 2 * DOCS.length;
  console.log(
    `\nsame-domain documents available across all queries: ${available}` +
      `\n  keyword surfaced  ${tally.keyword.correct} (${((tally.keyword.correct / available) * 100).toFixed(0)}%)` +
      `\n  semantic surfaced ${tally.semantic.correct} (${((tally.semantic.correct / available) * 100).toFixed(0)}%)`,
  );
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
