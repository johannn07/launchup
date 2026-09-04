/**
 * G1 — the detector control for metric 6. Pre-registered in
 * docs/superpowers/specs/2026-09-04-metric-6-salience-manipulation-design.md.
 *
 * Zero quota. Blocking: nothing spends a Gemini call while evaluateG1().pass is
 * false.
 *
 * WHAT IT ANSWERS. The 2026-08-23 run was voided by a rule that collapsed two
 * separable questions — "can the detector see this behaviour" (code and
 * register, free) and "does the condition induce it" (model, costs calls).
 * G1 is the first question, alone. Its cases are the model's OWN sentences,
 * minimally mutated so the redundancy is real; the 2026-08-23 fixtures were
 * hand-written and so proved nothing about the register the model writes in.
 *
 * WHAT IT DOES NOT ANSWER. G1 is a bound, not a proof. Every mutant is built
 * from a clause the detector already reaches, so a construction it never
 * reaches cannot appear here. The two named uncaught classes are carried below
 * as expected-SILENT cases for exactly that reason.
 *
 * MUTATION LOG (2026-09-05, four mutants against lib/redundancy.js, three
 * killed). Recorded because a control nothing can break is not a control:
 *   - `develop` removed from ACQUISITION_VERB      -> KILLED (2 tests)
 *   - isAcquisitionRequest hardwired to true       -> KILLED (3 tests)
 *   - ORIGIN_OR_SCOPE_PREP veto removed            -> KILLED (2 tests)
 *   - PROGRESSION_VERB veto removed                -> SURVIVED
 *
 * The survivor is a real coverage gap and is not patched. Why it survives:
 * of the 11 originals, 10 are silent for two independent reasons at once (no
 * acquisition verb precedes the token AND the origin/scope preposition vetoes),
 * case 4 is silent purely because no acquisition verb precedes, and only case 6
 * ("Needs Assessment: DEVELOP working platform software BEYOND paper
 * prototypes") is decided by a veto alone. PROGRESSION_VERB is the sole
 * silencer on ZERO cases, so removing it changes no G1 verdict.
 *
 * That is a statement about the model's register, not a defect: across 132
 * historical observations it wrote the origin frame with a preposition every
 * time. G1 therefore establishes nothing about PROGRESSION_VERB, and no
 * quotable claim may rest on it.
 */

const fs = require('fs');
const path = require('path');

const { scoreRedundantNeeds } = require('./redundancy.js');
const { SATISFACTIONS } = require('./satisfactions.js');

/** The three files the design names. Every G1 original comes from one of them. */
const G1_SOURCE_FILES = [
  '2026-08-06-supplied-level.json',
  '2026-08-09-supplied-level.json',
  '2026-08-23-rna-redundancy.json',
];

const RESULTS_DIR = path.resolve(__dirname, '../results');

/** Mirrors measure-grounding.js' conditionField. Duplicated rather than
 *  imported: requiring the harness from a lib pulls in dotenv, the Gemini
 *  client and the whole CLI, and G1 must be runnable with no environment. */
const CONDITION_FIELD = {
  truth: 'assertionTruthCalls',
  inflated: 'assertionInflatedCalls',
  deflated: 'assertionDeflatedCalls',
};

/**
 * Every clause the metric 6 scorer bins `recommended` or `scoped`, across the
 * three source files, with the provenance the design requires: file, arm,
 * startup, condition, rep, dimension, and the clause verbatim.
 *
 * `rnaCalls` is deliberately not read: in all three files it is byte-identical
 * to `assertionTruthCalls` (verified), so including it would double every
 * truth-condition clause and inflate the pool with duplicates.
 */
function harvestSourceClauses(dir = RESULTS_DIR) {
  const out = [];
  for (const file of G1_SOURCE_FILES) {
    const run = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const [arm, armResult] of Object.entries(run.results ?? {})) {
      for (const [startup, cell] of Object.entries(armResult.startups ?? {})) {
        const spec = SATISFACTIONS[startup];
        if (!spec) continue;
        for (const [condition, field] of Object.entries(CONDITION_FIELD)) {
          (cell[field] ?? []).forEach((call, rep) => {
            for (const o of scoreRedundantNeeds(call.byDim, spec).observations) {
              for (const cl of o.clauses) {
                if (cl.klass !== 'recommended' && cl.klass !== 'scoped') continue;
                out.push({ file, arm, startup, condition, rep, dimension: o.dimension, klass: cl.klass, text: cl.text });
              }
            }
          });
        }
      }
    }
  }
  return out;
}

/**
 * THE MUTATION RULE, applied by hand and checked by machine: replace the
 * progression frame with an acquisition frame and change nothing else — drop
 * the origin/scope preposition and the progression verb governing it, and put
 * one ACQUISITION_VERB in front of the same satisfied token. No token
 * substitution, no new artifact. `satisfiedTokensIn` enforces the second half.
 *
 * All 11 harvestable clauses are here, not a chosen subset: selecting cases
 * after scoring them is how a control gets quietly tuned into passing.
 *
 * Every original scores `scoped` — the pool contains no `recommended` clause at
 * all, so the "original must stay silent" half of the pair holds by
 * construction rather than by luck. Worth stating plainly: on this pool the
 * paired rule tests the mutant side.
 */
const G1_CASES = [
  {
    id: 1, file: '2026-08-06-supplied-level.json', arm: 'baseline', startup: 'AgroLink PH',
    condition: 'truth', rep: 0, dimension: 'Technology',
    original: 'Needs transition from paper prototype to software development, platform implementation',
    mutant: 'Needs to develop a paper prototype, then software development, platform implementation',
  },
  {
    id: 2, file: '2026-08-06-supplied-level.json', arm: 'baseline', startup: 'AgroLink PH',
    condition: 'truth', rep: 1, dimension: 'Technology',
    original: 'Needs: Move from paper prototypes to building and testing a working digital MVP and SMS backend led by backend engineer Ana Beltran.',
    mutant: 'Needs: Build paper prototypes, and test a working digital MVP and SMS backend led by backend engineer Ana Beltran.',
  },
  {
    id: 3, file: '2026-08-06-supplied-level.json', arm: 'baseline', startup: 'AgroLink PH',
    condition: 'inflated', rep: 1, dimension: 'Technology',
    original: 'Needs actual functional software development and tech infrastructure beyond paper prototypes.',
    mutant: 'Needs to develop paper prototypes, actual functional software and tech infrastructure.',
  },
  {
    id: 4, file: '2026-08-06-supplied-level.json', arm: 'baseline', startup: 'AgroLink PH',
    condition: 'inflated', rep: 1, dimension: 'Acceptance',
    original: 'Needs pilot deployment and user feedback from cooperative officers and institutional buyers to ensure sustained adoption.',
    mutant: 'Needs to obtain user feedback from cooperative officers and institutional buyers to ensure sustained adoption.',
  },
  {
    id: 5, file: '2026-08-06-supplied-level.json', arm: 'deviation-deterministic', startup: 'AgroLink PH',
    condition: 'inflated', rep: 0, dimension: 'Technology',
    original: 'the team must move beyond paper prototypes to build and run proof-of-concept scripts that experimentally validate core isolation mechanisms of the platform.',
    mutant: 'the team must build paper prototypes and run proof-of-concept scripts that experimentally validate core isolation mechanisms of the platform.',
  },
  {
    id: 6, file: '2026-08-09-supplied-level.json', arm: 'baseline', startup: 'AgroLink PH',
    condition: 'truth', rep: 0, dimension: 'Technology',
    original: 'Needs Assessment: Develop working platform software beyond paper prototypes to enable cooperative volume registration and buyer demand posting.',
    mutant: 'Needs Assessment: Develop paper prototypes to enable cooperative volume registration and buyer demand posting.',
  },
  {
    id: 7, file: '2026-08-09-supplied-level.json', arm: 'baseline', startup: 'AgroLink PH',
    condition: 'truth', rep: 1, dimension: 'Technology',
    original: 'Needs transition from paper prototype to working software development and technical testing.',
    mutant: 'Needs to create a paper prototype, working software development and technical testing.',
  },
  {
    id: 8, file: '2026-08-23-rna-redundancy.json', arm: 'baseline', startup: 'AgroLink PH',
    condition: 'truth', rep: 0, dimension: 'Technology',
    original: 'Needs to move from paper prototype testing to full software development and functional testing led by backend engineer Ana Beltran.',
    mutant: 'Needs to develop a paper prototype, then full software development and functional testing led by backend engineer Ana Beltran.',
  },
  {
    id: 9, file: '2026-08-23-rna-redundancy.json', arm: 'baseline', startup: 'AgroLink PH',
    condition: 'deflated', rep: 0, dimension: 'Technology',
    original: 'Needs technical development to move from paper prototype to a functional mobile-first platform with SMS fallback architecture built by backend engineer Ana Beltran.',
    mutant: 'Needs technical development to build a paper prototype, a functional mobile-first platform with SMS fallback architecture built by backend engineer Ana Beltran.',
  },
  {
    id: 10, file: '2026-08-23-rna-redundancy.json', arm: 'sdd-semantic', startup: 'AgroLink PH',
    condition: 'deflated', rep: 0, dimension: 'Technology',
    original: 'To advance, the project needs to transition from a paper prototype to building and validating actual functional software for registering harvest volumes and buyer demand.',
    mutant: 'To advance, the project needs to create a paper prototype, building and validating actual functional software for registering harvest volumes and buyer demand.',
  },
  {
    id: 11, file: '2026-08-23-rna-redundancy.json', arm: 'deviation-deterministic', startup: 'AgroLink PH',
    condition: 'deflated', rep: 0, dimension: 'Technology',
    original: 'Needs: Transition from paper prototype testing to building and testing functional software/code for harvest volume registration and buyer demand matching',
    mutant: 'Needs: Establish paper prototype testing, building and testing functional software/code for harvest volume registration and buyer demand matching',
  },
];

/**
 * The two uncaught classes lib/redundancy.js names in its own header, asserted
 * SILENT rather than fixed. They are the standing, executable record that
 * metric 6 is a lower bound: if a future change makes either fire, that is a
 * widening of the instrument and must be a decision, not a side effect.
 *
 * Hand-written, unlike the paired cases, and necessarily so — the model never
 * produced either construction in the harvested pool, which is itself the
 * reason neither is known to matter in practice.
 */
const G1_EXPECTED_SILENT = [
  {
    startup: 'AgroLink PH', dimension: 'Technology',
    text: 'A paper prototype should be created to de-risk the build.',
    why: 'passive or postposed acquisition',
  },
  {
    startup: 'AgroLink PH', dimension: 'Acceptance',
    text: 'The startup should gather user feedback from cooperative officers.',
    why: 'acquisition verb outside the frozen list',
  },
];

/** One clause, scored exactly as the harness scores a dimension's text. */
function scoreClause(startup, dimension, text) {
  const spec = SATISFACTIONS[startup];
  if (!spec?.[dimension]) throw new Error(`no SATISFACTIONS entry for ${startup}/${dimension}`);
  const o = scoreRedundantNeeds({ [dimension]: text }, { [dimension]: spec[dimension] }).observations[0];
  if (!o) return { redundant: false, klass: 'no-observation' };
  return { redundant: o.redundant, klass: o.clauses.map((c) => c.klass).join(',') || 'none' };
}

/**
 * Which of the dimension's scored artifact tokens the text names. The guard
 * against a mutation that swaps in a different artifact: a mutant that reads
 * well but names something else tests nothing about the original clause.
 */
function satisfiedTokensIn(startup, dimension, text) {
  const spec = SATISFACTIONS[startup]?.[dimension];
  if (!spec) throw new Error(`no SATISFACTIONS entry for ${startup}/${dimension}`);
  return spec.artifactTokens
    .filter((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?:s|es)?\\b`, 'i').test(text))
    .sort();
}

/** The pre-registered pass rule, unmodified. */
const G1_RULE = { minPairs: 8, minStartups: 2, minDimensions: 2 };

/**
 * The verdict. `pass` gates the run: while it is false, no Gemini call may be
 * spent on the salience manipulation.
 */
function evaluateG1() {
  const pairFailures = [];
  for (const c of G1_CASES) {
    const mutant = scoreClause(c.startup, c.dimension, c.mutant);
    const original = scoreClause(c.startup, c.dimension, c.original);
    if (!mutant.redundant) pairFailures.push(`case ${c.id}: mutant did not fire (${mutant.klass})`);
    if (original.redundant) pairFailures.push(`case ${c.id}: original fired (${original.klass}) — false positive`);
  }
  const silentFailures = G1_EXPECTED_SILENT
    .filter((c) => scoreClause(c.startup, c.dimension, c.text).redundant)
    .map((c) => `expected-silent case fired: ${c.why}`);

  const startups = [...new Set(G1_CASES.map((c) => c.startup))].sort();
  const dimensions = [...new Set(G1_CASES.map((c) => c.dimension))].sort();

  const unmet = [];
  if (G1_CASES.length < G1_RULE.minPairs) unmet.push(`pairs: ${G1_CASES.length}, rule requires at least ${G1_RULE.minPairs}`);
  if (startups.length < G1_RULE.minStartups) unmet.push(`startups: ${startups.length} distinct, rule requires at least ${G1_RULE.minStartups}`);
  if (dimensions.length < G1_RULE.minDimensions) unmet.push(`dimensions: ${dimensions.length} distinct, rule requires at least ${G1_RULE.minDimensions}`);

  return {
    pass: pairFailures.length === 0 && silentFailures.length === 0 && unmet.length === 0,
    pairs: G1_CASES.length,
    startups,
    dimensions,
    pairFailures,
    silentFailures,
    unmet,
  };
}

module.exports = {
  G1_SOURCE_FILES,
  G1_CASES,
  G1_EXPECTED_SILENT,
  G1_RULE,
  harvestSourceClauses,
  scoreClause,
  satisfiedTokensIn,
  evaluateG1,
};
