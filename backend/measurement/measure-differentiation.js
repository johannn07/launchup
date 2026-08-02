/**
 * Follow-up to measure-models.js.
 *
 * Leniency (Objective 4) is not "does the model score low" but "does it inflate
 * a weak venture"; differentiation (Objective 2) is whether an early- and a
 * mid-stage startup land at different levels. One document shows neither.
 *
 *   AgroLink PH   — paper prototype, zero revenue, no pilot   -> should be LOW
 *   MediSync Cebu — 6 paying facilities, PHP 5k MRR, 3 founders -> should be HIGHER
 *
 * The number that matters is the GAP between them, plus whether the weak one
 * is scored above what its evidence supports.
 */
const path = require('path');
const BACKEND = 'C:/Users/John Anthony/Projects/Github/Projects/Launchup/launchup/backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({
  path: path.join(BACKEND, '.env'),
});
const { GoogleGenAI } = require(path.join(BACKEND, 'node_modules/@google/genai'));

const MODELS = ['gemini-2.5-flash-lite', 'gemini-3.6-flash'];
const REPS = 3;
const DELAY_MS = 4000;

const GROUNDING =
  'Only use facts explicitly present in the user-provided input. Never invent names, numbers, dates, or organizations. If you are uncertain about a field, return null instead of guessing.';

const DOCS = {
  'AgroLink (early)': `Title: AgroLink PH: Cooperative Market Access Platform
Description: Connects smallholder farmer cooperatives in Central Luzon directly to institutional buyers.
Problem Statement: Smallholder farmers sell through a chain of traders and capture only a fraction of the final market price.
Target Market: Rice and vegetable cooperatives in Nueva Ecija and Tarlac (roughly 400 cooperatives).
Solution: A mobile-first platform where cooperative officers register expected harvest volumes and buyers post standing demand. Includes SMS fallback.
Timeline: 2025-06 field interviews with 18 cooperatives. 2025-09 paper prototype of the lot-aggregation flow tested with 3 cooperatives. 2026-01 two founders committed full-time; provisional agreement with one buyer.
Revenue: None to date.
IP Status: No patents filed. The "AgroLink PH" wordmark has not been registered with IPOPHL.
Team: Rafael Domingo (6 years agricultural extension officer), Ana Beltran (4 years backend engineer).`,

  'MediSync (mid)': `Title: MediSync Cebu: Referral Coordination for Provincial Clinics
Description: Links rural health units across Cebu province with district and tertiary hospitals, replacing a paper-and-phone referral process.
Problem Statement: Referrals move by handwritten form and phone call; clinical history is frequently lost in transit.
Target Market: The 44 rural health units in Cebu province, 8 district hospitals, and 3 tertiary referral centres.
Solution: A structured referral record transmitted to the receiving facility with bed-availability status, triage category, and attached history.
Timeline: 2025-02 pilot with 2 rural health units and 1 district hospital. 2025-08 expanded to 6 facilities; first paid facility subscriptions. 2026-02 reached PHP 5,000 monthly recurring revenue; team grew to 3 founders.
Revenue: PHP 5,000 monthly recurring.
IP Status: No patents. Trademark application filed with IPOPHL, pending.
Team: Dr. Elena Reyes (9 years provincial public health), Marco Villanueva (7 years health IT), Joy Tabotabo (5 years LGU administration).`,
};

const promptFor = (doc) => `${doc}

Assess this startup's readiness on a 1-9 scale for each dimension, where 1 = idea only and 9 = proven at scale in the market. Be rigorous: a level is only justified if the document contains evidence for it.

Respond ONLY with a JSON array of objects with keys "dimension" and "level" (integer 1-9), for exactly these dimensions: Technology, Market, Acceptance, Organizational, Regulatory, Investment.

Grounding instruction: ${GROUNDING}`;

function extractJsonPayload(text) {
  const cands = [text.indexOf('{'), text.indexOf('[')].filter((i) => i !== -1);
  const start = cands.length ? Math.min(...cands) : -1;
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start === -1 || end === -1 || end <= start) return null;
  return text.substring(start, end + 1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const out = {};

  for (const model of MODELS) {
    out[model] = {};
    for (const [label, doc] of Object.entries(DOCS)) {
      const levels = [];
      const byDim = {};
      for (let rep = 0; rep < REPS; rep++) {
        try {
          const res = await ai.models.generateContent({
            model,
            contents: promptFor(doc),
            config: { temperature: 0 },
          });
          const payload = extractJsonPayload(res.text ?? '');
          const parsed = payload ? JSON.parse(payload) : null;
          if (Array.isArray(parsed)) {
            for (const x of parsed) {
              if (typeof x.level === 'number') {
                levels.push(x.level);
                (byDim[x.dimension] ||= []).push(x.level);
              }
            }
          }
        } catch (e) {
          if (String(e.message).includes('429')) {
            console.log(`  [quota hit on ${model} / ${label}]`);
            break;
          }
        }
        await sleep(DELAY_MS);
      }
      out[model][label] = { levels, byDim };
      console.log(`${model} / ${label}: mean=${mean(levels).toFixed(2)} n=${levels.length}`);
    }
  }

  console.log('\n============ DIFFERENTIATION ============\n');
  const rows = [];
  for (const model of MODELS) {
    const weak = mean(out[model]['AgroLink (early)'].levels);
    const mid = mean(out[model]['MediSync (mid)'].levels);
    const all = [
      ...out[model]['AgroLink (early)'].levels,
      ...out[model]['MediSync (mid)'].levels,
    ];
    rows.push({
      model,
      'AgroLink mean': weak.toFixed(2),
      'MediSync mean': mid.toFixed(2),
      GAP: (mid - weak).toFixed(2),
      'overall range': `${Math.min(...all)}-${Math.max(...all)}`,
      'distinct levels used': new Set(all).size,
    });
  }
  console.table(rows);

  console.log('\nPer-dimension means (AgroLink -> MediSync):');
  const dims = ['Technology', 'Market', 'Acceptance', 'Organizational', 'Regulatory', 'Investment'];
  for (const model of MODELS) {
    console.log(`\n  ${model}`);
    for (const d of dims) {
      const w = out[model]['AgroLink (early)'].byDim[d] || [];
      const m = out[model]['MediSync (mid)'].byDim[d] || [];
      if (!w.length && !m.length) continue;
      console.log(
        `    ${d.padEnd(16)} ${mean(w).toFixed(1)} -> ${mean(m).toFixed(1)}   (${(mean(m) - mean(w)).toFixed(1)})`,
      );
    }
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
