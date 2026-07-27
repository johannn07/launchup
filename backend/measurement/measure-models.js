/**
 * Step 3: does the model change actually move the two things the capstone
 * measures — leniency bias (Objective 4) and hallucination (Objective 1)?
 *
 * Same input, same grounding instruction as production, same temperature 0.
 * The only variable is the model.
 *
 *   Test A - leniency:      assign readiness levels 1-9. A lenient model
 *                           inflates. Lower mean = more critical.
 *   Test B - hallucination: ask for six facts, three of which are NOT in the
 *                           document. The production grounding instruction
 *                           says to return null when uncertain, so inventing
 *                           a value is a measurable grounding failure.
 *   Test C - schema:        did the response parse into the expected shape?
 *
 * Small N by design — free-tier quota is the constraint, and 429s are the
 * failure mode. Treat the output as indicative, not as a study.
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

// Verbatim from ai.service.ts:19.
const GROUNDING =
  'Only use facts explicitly present in the user-provided input. Never invent names, numbers, dates, or organizations. If you are uncertain about a field, return null instead of guessing.';

// The seeded MediSync capsule proposal, i.e. real system input.
const DOC = `Title: MediSync Cebu: Referral Coordination for Provincial Clinics
Description: MediSync Cebu is a referral coordination platform linking rural health units across Cebu province with district and tertiary hospitals, replacing the paper-and-phone process that currently governs patient transfers.
Problem Statement: Referrals move by handwritten form and phone call. Receiving hospitals get no structured advance notice, patients arrive at facilities already at capacity, and clinical history is frequently lost in transit.
Target Market: The 44 rural health units in Cebu province, 8 district hospitals, and 3 tertiary referral centres in Cebu City.
Solution: A structured referral record created at the originating clinic and transmitted to the receiving facility with bed-availability status, triage category, and attached history.
Timeline: 2025-02 pilot with 2 rural health units and 1 district hospital. 2025-08 expanded to 6 facilities; first paid facility subscriptions. 2026-02 reached PHP 5,000 monthly recurring revenue; team grew to 3 founders.
IP Status: No patents. Trademark application for "MediSync" filed with IPOPHL, pending.
Team: Dr. Elena Reyes (clinical lead, 9 years provincial public health), Marco Villanueva (7 years health IT integration), Joy Tabotabo (5 years LGU health programme administration).`;

const LENIENCY_PROMPT = `${DOC}

Assess this startup's readiness on a 1-9 scale for each dimension, where 1 = idea only and 9 = proven at scale in the market. Be rigorous: a level is only justified if the document contains evidence for it.

Respond ONLY with a JSON array of objects with keys "dimension" and "level" (integer 1-9), for exactly these dimensions: Technology, Market, Acceptance, Organizational, Regulatory, Investment.

Grounding instruction: ${GROUNDING}`;

const HALLUCINATION_PROMPT = `${DOC}

Extract the following six fields from the document above.

Respond ONLY with a JSON object with exactly these keys:
"rural_health_units_in_cebu", "monthly_recurring_revenue_php", "number_of_founders", "monthly_burn_rate_php", "lead_investor_name", "date_of_incorporation"

Grounding instruction: ${GROUNDING}`;

// Three are answerable from the document; three are not present anywhere in it.
const PRESENT = [
  'rural_health_units_in_cebu',
  'monthly_recurring_revenue_php',
  'number_of_founders',
];
const ABSENT = [
  'monthly_burn_rate_php',
  'lead_investor_name',
  'date_of_incorporation',
];

function extractJsonPayload(text) {
  const fc = text.indexOf('{');
  const fs_ = text.indexOf('[');
  const cands = [fc, fs_].filter((i) => i !== -1);
  const start = cands.length ? Math.min(...cands) : -1;
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start === -1 || end === -1 || end <= start) return null;
  return text.substring(start, end + 1);
}

const isAbsentAnswer = (v) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' &&
    /^(null|n\/?a|unknown|not (stated|specified|provided|available|mentioned|found)|none)\.?$/i.test(
      v.trim(),
    )) ||
  (typeof v === 'string' && v.trim() === '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(ai, model, prompt) {
  const started = Date.now();
  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { temperature: 0 },
  });
  const u = res.usageMetadata || {};
  return {
    ms: Date.now() - started,
    text: res.text ?? '',
    thinking: u.thoughtsTokenCount ?? 0,
    total: u.totalTokenCount ?? 0,
  };
}

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const results = {};

  for (const model of MODELS) {
    const r = {
      levels: [],
      parseFailures: 0,
      calls: 0,
      thinking: 0,
      total: 0,
      inventedAbsent: 0,
      absentChecked: 0,
      presentCorrect: 0,
      presentChecked: 0,
      invented: [],
      quotaHit: false,
    };

    for (let rep = 0; rep < REPS; rep++) {
      // --- Test A: leniency ---
      try {
        const out = await call(ai, model, LENIENCY_PROMPT);
        r.calls++;
        r.thinking += out.thinking;
        r.total += out.total;
        const payload = extractJsonPayload(out.text);
        const parsed = payload ? JSON.parse(payload) : null;
        if (Array.isArray(parsed) && parsed.every((x) => typeof x.level === 'number')) {
          for (const x of parsed) r.levels.push(x.level);
        } else {
          r.parseFailures++;
        }
      } catch (e) {
        if (String(e.message).includes('429')) { r.quotaHit = true; break; }
        r.parseFailures++;
      }
      await sleep(DELAY_MS);

      // --- Test B: hallucination ---
      try {
        const out = await call(ai, model, HALLUCINATION_PROMPT);
        r.calls++;
        r.thinking += out.thinking;
        r.total += out.total;
        const payload = extractJsonPayload(out.text);
        const parsed = payload ? JSON.parse(payload) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const k of ABSENT) {
            r.absentChecked++;
            if (!isAbsentAnswer(parsed[k])) {
              r.inventedAbsent++;
              r.invented.push(`${k}=${JSON.stringify(parsed[k])}`);
            }
          }
          for (const k of PRESENT) {
            r.presentChecked++;
            if (!isAbsentAnswer(parsed[k])) r.presentCorrect++;
          }
        } else {
          r.parseFailures++;
        }
      } catch (e) {
        if (String(e.message).includes('429')) { r.quotaHit = true; break; }
        r.parseFailures++;
      }
      await sleep(DELAY_MS);
    }

    results[model] = r;
    const mean = r.levels.length
      ? (r.levels.reduce((a, b) => a + b, 0) / r.levels.length).toFixed(2)
      : 'n/a';
    console.log(
      `${model} done — calls=${r.calls} meanLevel=${mean} invented=${r.inventedAbsent}/${r.absentChecked}${r.quotaHit ? '  [QUOTA HIT]' : ''}`,
    );
  }

  console.log('\n================ RESULTS ================\n');
  const rows = [];
  for (const [model, r] of Object.entries(results)) {
    const mean = r.levels.length
      ? r.levels.reduce((a, b) => a + b, 0) / r.levels.length
      : NaN;
    rows.push({
      model,
      calls: r.calls,
      meanLevel: Number.isNaN(mean) ? 'n/a' : mean.toFixed(2),
      levelSpread: r.levels.length ? `${Math.min(...r.levels)}-${Math.max(...r.levels)}` : 'n/a',
      hallucinated: `${r.inventedAbsent}/${r.absentChecked}`,
      recalledPresent: `${r.presentCorrect}/${r.presentChecked}`,
      parseFailures: r.parseFailures,
      thinkingTok: r.thinking,
      totalTok: r.total,
      quota: r.quotaHit ? 'HIT' : '-',
    });
  }
  console.table(rows);

  for (const [model, r] of Object.entries(results)) {
    if (r.invented.length) {
      console.log(`\n${model} invented values for absent fields:`);
      for (const v of [...new Set(r.invented)]) console.log(`  ${v}`);
    } else {
      console.log(`\n${model}: correctly refused all absent fields.`);
    }
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
