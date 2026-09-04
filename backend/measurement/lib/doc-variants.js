/**
 * `unlabelled` document variants — the metric 6 salience manipulation
 * (design 2026-09-04).
 *
 * WHY A DOCUMENT MANIPULATION AND NOT ANOTHER LEVEL ONE. `deflated` failed on
 * 2026-08-23 because the supplied level never overrode the document: every arm
 * read the evidence and correctly framed it as an origin to move on from. Both
 * source documents put each fact under an explicit label — `Target Market:`,
 * `Revenue:`, `Timeline:` — and `Target Market:` names the very artifact class
 * the rubric asks for, so matching is free and there is nothing for the model to
 * miss. Redundancy needs the artifact EVIDENCED BUT NOT SALIENT, which is a
 * property of the document.
 *
 * THE RULE, applied mechanically: for the three dimensions lib/satisfactions.js
 * specifies (Technology, Market, Acceptance), the evidence phrase stays
 * BYTE-IDENTICAL, its field label is removed by relocating the phrase into an
 * existing narrative field (`Description`, `Problem Statement`, `Solution`), and
 * nothing else changes. No connective words were added: any prose written here
 * is authorial influence on the outcome, and the run's whole defence is that the
 * variant could not have been authored into producing the effect. The cost is
 * that relocated timeline sentences read as fragments — a real validity cost,
 * accepted deliberately in exchange for leaving no room to have shaped the
 * result.
 *
 * WHAT IT IS NOT. Production's capsule proposal is a structured DTO, so
 * `unlabelled` is LESS production-like than the labelled form. It buys a
 * condition under which the error can plausibly occur; only `original` cells
 * speak to what users actually receive.
 */

const { SATISFACTIONS } = require('./satisfactions.js');

/**
 * THE source of both documents. measure-grounding.js' STARTUPS and
 * audit-ground-truth.js' loadDocuments() both read from here, so there is one
 * copy rather than a copy per consumer — src/demo-readiness-levels.ts exists
 * because two copies of the levels drifted apart, and the `unlabelled` variants
 * below are edits OF these strings, which is exactly the situation that
 * produces drift.
 *
 * Verified byte-identical to what STARTUPS previously inlined: all 45
 * fingerprints stored in results/2026-08-23-rna-redundancy.json are unchanged
 * by the move, and `common.startups` hashes the doc text.
 */
const ORIGINAL_DOCS = {
  'AgroLink PH': `Title: AgroLink PH: Cooperative Market Access Platform
Description: Connects smallholder farmer cooperatives in Central Luzon directly to institutional buyers.
Problem Statement: Smallholder farmers sell through a chain of traders and capture only a fraction of the final market price.
Target Market: Rice and vegetable cooperatives in Nueva Ecija and Tarlac (roughly 400 cooperatives).
Solution: A mobile-first platform where cooperative officers register expected harvest volumes and buyers post standing demand. Includes SMS fallback.
Timeline: 2025-06 field interviews with 18 cooperatives. 2025-09 paper prototype of the lot-aggregation flow tested with 3 cooperatives. 2026-01 two founders committed full-time; provisional agreement with one buyer.
Revenue: None to date.
IP Status: No patents filed. The "AgroLink PH" wordmark has not been registered with IPOPHL.
Team: Rafael Domingo (6 years agricultural extension officer), Ana Beltran (4 years backend engineer).`,

  'MediSync Cebu': `Title: MediSync Cebu: Referral Coordination for Provincial Clinics
Description: Links rural health units across Cebu province with district and tertiary hospitals, replacing a paper-and-phone referral process.
Problem Statement: Referrals move by handwritten form and phone call; clinical history is frequently lost in transit.
Target Market: The 44 rural health units in Cebu province, 8 district hospitals, and 3 tertiary referral centres.
Solution: A structured referral record transmitted to the receiving facility with bed-availability status, triage category, and attached history.
Timeline: 2025-02 pilot with 2 rural health units and 1 district hospital. 2025-08 expanded to 6 facilities; first paid facility subscriptions. 2026-02 reached PHP 5,000 monthly recurring revenue; team grew to 3 founders.
Revenue: PHP 5,000 monthly recurring.
IP Status: No patents. Trademark application filed with IPOPHL, pending.
Team: Dr. Elena Reyes (9 years provincial public health), Marco Villanueva (7 years health IT), Joy Tabotabo (5 years LGU administration).`,
};

/**
 * AgroLink: the Technology and Acceptance evidence phrases move out of
 * `Timeline:` into `Solution:`. The third timeline sentence stays put — it
 * carries an Organizational fact ("two founders committed full-time"), and
 * Organizational is outside the manipulation.
 *
 * MediSync: the Market evidence moves out of `Target Market:` into
 * `Description:` (the label goes with it, as there is nothing left under it);
 * the Technology and Acceptance evidence move out of `Timeline:` into
 * `Solution:`.
 *
 * KNOWN CONFOUND, MediSync only. The Acceptance evidence
 * ("2026-02 reached PHP 5,000 monthly recurring revenue") shares its sentence
 * with an Organizational fact ("team grew to 3 founders"), and splitting the
 * sentence would be the reordering the rule forbids. So that Organizational
 * fact is unlabelled as a side effect. Metric 6 scores only T/M/A, so it cannot
 * produce a metric 6 observation, but metric 5 does read O/R/I and its
 * `unlabelled` numbers carry this confound. Named rather than fixed.
 *
 * `Revenue: PHP 5,000 monthly recurring.` is deliberately left labelled: it is
 * a different field carrying a related fact, and the rule touches only the
 * evidence phrase's own label. It weakens the Acceptance manipulation and that
 * is a stated limit, not an oversight.
 */
const DOC_VARIANTS = {
  'AgroLink PH': {
    unlabelled: `Title: AgroLink PH: Cooperative Market Access Platform
Description: Connects smallholder farmer cooperatives in Central Luzon directly to institutional buyers.
Problem Statement: Smallholder farmers sell through a chain of traders and capture only a fraction of the final market price.
Target Market: Rice and vegetable cooperatives in Nueva Ecija and Tarlac (roughly 400 cooperatives).
Solution: A mobile-first platform where cooperative officers register expected harvest volumes and buyers post standing demand. Includes SMS fallback. 2025-06 field interviews with 18 cooperatives. 2025-09 paper prototype of the lot-aggregation flow tested with 3 cooperatives.
Timeline: 2026-01 two founders committed full-time; provisional agreement with one buyer.
Revenue: None to date.
IP Status: No patents filed. The "AgroLink PH" wordmark has not been registered with IPOPHL.
Team: Rafael Domingo (6 years agricultural extension officer), Ana Beltran (4 years backend engineer).`,
  },

  'MediSync Cebu': {
    unlabelled: `Title: MediSync Cebu: Referral Coordination for Provincial Clinics
Description: Links rural health units across Cebu province with district and tertiary hospitals, replacing a paper-and-phone referral process. The 44 rural health units in Cebu province, 8 district hospitals, and 3 tertiary referral centres.
Problem Statement: Referrals move by handwritten form and phone call; clinical history is frequently lost in transit.
Solution: A structured referral record transmitted to the receiving facility with bed-availability status, triage category, and attached history. 2025-02 pilot with 2 rural health units and 1 district hospital. 2026-02 reached PHP 5,000 monthly recurring revenue; team grew to 3 founders.
Timeline: 2025-08 expanded to 6 facilities; first paid facility subscriptions.
Revenue: PHP 5,000 monthly recurring.
IP Status: No patents. Trademark application filed with IPOPHL, pending.
Team: Dr. Elena Reyes (9 years provincial public health), Marco Villanueva (7 years health IT), Joy Tabotabo (5 years LGU administration).`,
  },
};

/** The five cells the manipulation reaches. */
const MANIPULATED_CELLS = [
  { startup: 'AgroLink PH', dimension: 'Technology' },
  { startup: 'AgroLink PH', dimension: 'Acceptance' },
  { startup: 'MediSync Cebu', dimension: 'Technology' },
  { startup: 'MediSync Cebu', dimension: 'Market' },
  { startup: 'MediSync Cebu', dimension: 'Acceptance' },
];

/**
 * The sixth, recorded rather than silently skipped. Any `unlabelled` claim
 * covers five of six cells; AgroLink's Market cell is a within-document control
 * that nobody designed, and it must not be read as a manipulated observation.
 */
const UNMANIPULATED_CELLS = [
  {
    startup: 'AgroLink PH',
    dimension: 'Market',
    why: 'Its evidence phrase INCLUDES its own field label ("Target Market: Rice and vegetable cooperatives..."), so "evidence stays byte-identical" and "the field label is deleted" cannot both hold. Editing SATISFACTIONS to drop the label was declined: lib/satisfactions.js is out of scope for this design, and it is hashed as `satisfactions` fingerprint material, so changing it would refuse pooling for the `original` cells that required change 3 exists to protect.',
  },
];

/** Splits a document into { label: value }. Labels are the leading `Word: ` of
 *  each line; a line without one continues the previous field. */
function fields(doc) {
  const out = {};
  let current = null;
  for (const line of doc.split('\n')) {
    const m = line.match(/^([A-Z][A-Za-z ]*?): (.*)$/);
    if (m) {
      current = m[1];
      out[current] = m[2];
    } else if (current) {
      out[current] += `\n${line}`;
    }
  }
  return out;
}

/** Which field's value contains this phrase, or null. */
function hostFieldOf(doc, phrase) {
  for (const [label, value] of Object.entries(fields(doc))) {
    if (value.includes(phrase)) return label;
    // The Market evidence carries its own label, so it is never inside a value.
    if (`${label}: ${value}`.includes(phrase)) return label;
  }
  return null;
}

/**
 * The fact multiset: dates, numbers, and capitalised or all-caps tokens.
 *
 * Field labels are stripped first. Deleting a label IS the manipulation, so
 * counting `Timeline` or `Target`/`Market` as facts would make every correct
 * variant fail — and, worse, would tempt the check to be loosened later for the
 * wrong reason.
 *
 * Sorted rather than set-compared: a multiset catches a number duplicated or
 * dropped where a set would not.
 */
function extractFacts(text) {
  const body = text
    .split('\n')
    .map((line) => line.replace(/^([A-Z][A-Za-z ]*?): /, ''))
    .join('\n');
  const dates = body.match(/\b\d{4}-\d{2}(?:-\d{2})?\b/g) ?? [];
  const stripped = body.replace(/\b\d{4}-\d{2}(?:-\d{2})?\b/g, ' ');
  const numbers = stripped.match(/\b\d[\d,]*(?:\.\d+)?\b/g) ?? [];
  const propers = stripped.match(/\b(?:[A-Z]{2,}|[A-Z][a-z]+)\b/g) ?? [];
  return [...dates, ...numbers, ...propers].sort();
}

const VARIANTS = ['original', 'unlabelled'];

/** The document map for one variant. Throws on an unknown name — the same
 *  hard-fail semantics `--only-arm` and `--only-probe` already have, so a typo
 *  cannot silently run the wrong condition. */
function variantDocs(variant) {
  if (!VARIANTS.includes(variant)) {
    throw new Error(`unknown document variant "${variant}" — expected one of: ${VARIANTS.join(', ')}`);
  }
  if (variant === 'original') return { ...ORIGINAL_DOCS };
  return Object.fromEntries(Object.entries(DOC_VARIANTS).map(([s, v]) => [s, v[variant]]));
}

/** Both blocking checks, together, as the run gate will call them. */
function verifyVariants() {
  const problems = [];
  for (const [startup, original] of Object.entries(ORIGINAL_DOCS)) {
    const variant = DOC_VARIANTS[startup]?.unlabelled;
    if (!variant) { problems.push(`${startup}: no unlabelled variant`); continue; }
    const a = extractFacts(original).join('|');
    const b = extractFacts(variant).join('|');
    if (a !== b) problems.push(`${startup}: fact multiset changed between original and unlabelled`);
  }
  for (const cell of MANIPULATED_CELLS) {
    const { evidence } = SATISFACTIONS[cell.startup][cell.dimension];
    const variant = DOC_VARIANTS[cell.startup].unlabelled;
    if (!variant.includes(evidence)) problems.push(`${cell.startup}/${cell.dimension}: evidence phrase is not present verbatim`);
  }
  if (problems.length) throw new Error(`unlabelled variants are wrong:\n  ${problems.join('\n  ')}`);
  return true;
}

module.exports = {
  ORIGINAL_DOCS,
  DOC_VARIANTS,
  VARIANTS,
  MANIPULATED_CELLS,
  UNMANIPULATED_CELLS,
  fields,
  hostFieldOf,
  extractFacts,
  variantDocs,
  verifyVariants,
};
