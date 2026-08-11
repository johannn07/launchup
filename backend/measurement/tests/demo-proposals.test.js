const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src/demo-capsule-proposals.ts');
const SEED = path.resolve(__dirname, '../../seed-demo-full.js');

// The seeder and this module must not hold separate copies. seed-demo-full.js
// held the only copy and did not export it, so a measurement script would have
// had to transcribe it. Two copies of a shared fixture drifting apart is what
// inverted the grounding study in July.
test('seed-demo-full.js imports the proposals rather than declaring its own', () => {
  const seed = fs.readFileSync(SEED, 'utf8');
  assert.ok(
    !/^const PROPOSALS = \{/m.test(seed),
    'seed-demo-full.js still declares its own PROPOSALS literal',
  );
  assert.match(seed, /demo-capsule-proposals/, 'seed-demo-full.js should import the shared copy');
});

test('both demo startups are present with the fields the summary prompt reads', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  for (const name of ['AgroLink PH', 'MediSync Cebu']) {
    assert.ok(src.includes(name), `${name} missing from the shared proposals`);
  }
  for (const field of [
    'title', 'description', 'problemStatement', 'targetMarket', 'solutionDescription',
    'objectives', 'historicalTimeline', 'competitiveAdvantageAnalysis',
    'intellectualPropertyStatus', 'scope', 'methodology',
  ]) {
    assert.ok(new RegExp(`\\b${field}:`).test(src), `field ${field} missing`);
  }
});

test('the DTO adapter renames scope and omits the hand-written summary', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.match(src, /proposalScope:\s*p\.scope/, 'scope must be renamed to proposalScope for the DTO');
  assert.ok(
    !/aiAnalysisSummary/.test(src.split('toApplicationDto')[1] || ''),
    'aiAnalysisSummary is hand-written prose, not model output — it must not reach the DTO',
  );
});
