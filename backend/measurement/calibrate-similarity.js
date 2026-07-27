/**
 * Where should the retrieval similarity floor sit?
 *
 * The floor decides which stored contexts are shown to the model as "verified
 * context". Too high and retrieval never fires; too low and an unrelated
 * startup is presented as corroboration, which manufactures exactly the
 * hallucination Objective 1 is meant to reduce. A first guess of 0.70 was
 * wrong: an agriculture startup scored 0.765 against a health-referral query.
 *
 * This measures the actual separation. Nine startup descriptions across three
 * domains, every pair compared, then the same-domain and cross-domain
 * distributions reported. Production compares a startup's own prose against
 * other startups' prose, so every comparison here is document-to-document —
 * the same regime, unlike a short question against a document.
 *
 *   node measurement/calibrate-similarity.js
 */
const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
require(path.join(BACKEND, 'node_modules/dotenv')).config({
  path: path.join(BACKEND, '.env'),
});
const { GoogleGenAI } = require(path.join(BACKEND, 'node_modules/@google/genai'));

const MODEL = 'gemini-embedding-2';
const DIMS = 768;

// Three domains, three startups each. Within a domain they are genuine
// neighbours; across domains they are not.
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

const cos = (a, b) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const n = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return dot / (n(a) * n(b));
};

const stats = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: xs.length,
    min: sorted[0],
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    max: sorted[sorted.length - 1],
  };
};

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.embedContent({
    model: MODEL,
    contents: DOCS.map(([, title, body]) => `${title}\n\n${body}`),
    config: { outputDimensionality: DIMS },
  });
  const vecs = res.embeddings.map((e) => e.values);

  const same = [];
  const cross = [];
  for (let i = 0; i < DOCS.length; i++) {
    for (let j = i + 1; j < DOCS.length; j++) {
      const s = cos(vecs[i], vecs[j]);
      (DOCS[i][0] === DOCS[j][0] ? same : cross).push(s);
    }
  }

  console.log(`${MODEL} @ ${DIMS} dims, ${DOCS.length} documents\n`);
  console.log('same-domain (should be retrieved):');
  console.table([stats(same)]);
  console.log('cross-domain (should NOT be retrieved):');
  console.table([stats(cross)]);

  // A usable floor sits above the cross-domain mass and below the same-domain
  // mass. Report what each candidate would actually admit.
  console.log('\nthreshold sweep:');
  const rows = [];
  for (let t = 0.6; t <= 0.92; t += 0.02) {
    const kept = same.filter((s) => s >= t).length;
    const leaked = cross.filter((s) => s >= t).length;
    rows.push({
      threshold: t.toFixed(2),
      'same-domain kept': `${kept}/${same.length}`,
      'cross-domain leaked': `${leaked}/${cross.length}`,
      'leak rate': `${((leaked / cross.length) * 100).toFixed(0)}%`,
    });
  }
  console.table(rows);

  const overlap = Math.max(...cross) >= Math.min(...same);
  console.log(
    `\nsame-domain min ${Math.min(...same).toFixed(4)}  |  cross-domain max ${Math.max(...cross).toFixed(4)}`,
  );
  console.log(
    overlap
      ? 'DISTRIBUTIONS OVERLAP - no threshold separates them cleanly; pick by acceptable leak rate.'
      : 'Distributions are separable; any threshold in the gap works.',
  );
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
