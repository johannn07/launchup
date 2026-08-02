const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HARNESS = path.resolve(__dirname, '../measure-grounding.js');
const { validateArgs } = require(HARNESS);

// --------------------------------------------------------------------------
// Finding 3: --merge resolving to zero files, or a mistyped --out/--reps,
// used to spend the (irreplaceable, 20/day) generation budget silently
// instead of erroring. validateArgs is the pure guard against both; it is
// called only from the require.main block (see measure-grounding.js), never
// at module load, so requiring this file here is safe.
// --------------------------------------------------------------------------

test('valid invocations produce no errors', () => {
  assert.deepEqual(validateArgs([], []), []);
  assert.deepEqual(validateArgs(['--dry-run'], []), []);
  assert.deepEqual(validateArgs(['--retrieval-only'], []), []);
  assert.deepEqual(validateArgs(['--fingerprint'], []), []);
  assert.deepEqual(validateArgs(['--with-fabrication-probe'], []), []);
  assert.deepEqual(validateArgs(['--reps=3', '--out=results/x.json'], []), []);
  assert.deepEqual(validateArgs(['--merge', 'a.json', 'b.json'], ['a.json', 'b.json']), []);
});

test('--merge with zero resolved files hard-errors, whatever the reason', () => {
  // Flag last, nothing after it at all.
  let errs = validateArgs(['--merge'], []);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /no files to pool/);
  assert.match(errs[0], /Refusing to fall through to a live generation run/);

  // A glob that matched nothing (MERGE_FILES' own resolution already
  // collapsed it to zero files by the time this runs).
  errs = validateArgs(['--merge', 'results/zzz-nomatch-*.json'], []);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /no files to pool/);
});

test('--merge with at least one resolved file passes', () => {
  assert.deepEqual(validateArgs(['--merge', 'a.json'], ['a.json']), []);
});

test('"--out foo.json" (space instead of "=") is rejected, not silently ignored', () => {
  // This is exactly the case that used to leave OUT_FILE null: 12 calls spent,
  // results printed to the console and never written anywhere.
  const errs = validateArgs(['--out', 'foo.json'], []);
  assert.ok(errs.length >= 1);
  const positional = errs.find((e) => e.includes('"foo.json"'));
  assert.ok(positional, `expected an error naming "foo.json", got ${JSON.stringify(errs)}`);
  assert.match(positional, /Did you mean "--out=foo\.json"/);
});

test('"--reps 3" (space instead of "=") is rejected the same way', () => {
  const errs = validateArgs(['--reps', '3'], []);
  const positional = errs.find((e) => e.includes('"3"'));
  assert.ok(positional, `expected an error naming "3", got ${JSON.stringify(errs)}`);
  assert.match(positional, /Did you mean "--reps=3"/);
});

test('a positional argument AFTER --merge is not flagged - it is a merge file, not a stray', () => {
  assert.deepEqual(validateArgs(['--merge', 'a.json', 'b.json', 'c.json'], ['a.json', 'b.json', 'c.json']), []);
});

test('an unrecognized flag is rejected', () => {
  const errs = validateArgs(['--bogus-flag'], []);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /Unrecognized flag "--bogus-flag"/);
});

// --------------------------------------------------------------------------
// Finding 2: the documented `node measurement/measure-grounding.js --merge
// results/*.json` must actually run on a shell that does not glob
// (PowerShell), not only on bash. Spawned with execFileSync's default (no
// shell), so the "*" reaches the script as one literal argv entry - exactly
// what PowerShell hands a program, and unlike what a shell-mediated spawn
// would do.
// --------------------------------------------------------------------------

function writeFixture(dir, name, agroLevel) {
  fs.writeFileSync(
    path.join(dir, name),
    JSON.stringify({
      generatedAt: '2026-07-30T00:00:00Z',
      genModel: 'gemini-3.6-flash',
      embedModel: 'gemini-embedding-2',
      corpusRows: 54,
      floor: 0.78,
      fingerprints: { 'levels|baseline': 'L1', 'rna|baseline': 'R1', 'fabrication|baseline': 'F1' },
      results: {
        baseline: {
          quotaHit: false,
          startups: {
            'AgroLink PH': { retrieved: [], rnaCalls: [], levelCalls: [{ byDim: { Technology: agroLevel } }], hallucCalls: [] },
          },
        },
        'sdd-semantic': { quotaHit: false, startups: {} },
        'deviation-deterministic': { quotaHit: false, startups: {} },
      },
    }),
  );
}

test('a real glob argument resolves and merges end-to-end with no shell to expand it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-glob-test-'));
  writeFixture(dir, 'a.json', 2);
  writeFixture(dir, 'b.json', 4);
  const glob = path.join(dir, '*.json');

  // MERGE_FILES.length > 0 returns before this script ever constructs a
  // GoogleGenAI client or spends a generation call - safe to spawn for real.
  const out = execFileSync(process.execPath, [HARNESS, '--merge', glob], { encoding: 'utf8' });
  assert.match(out, /Merged 2 run\(s\)/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('a glob matching nothing exits non-zero with the zero-files error, not a live run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-glob-test-empty-'));
  const glob = path.join(dir, '*.json'); // dir is empty - matches nothing

  let caught = null;
  try {
    execFileSync(process.execPath, [HARNESS, '--merge', glob], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, 'expected a non-zero exit instead of a silent live run');
  assert.match(caught.stderr.toString(), /no files to pool/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('an explicit (non-glob) path that does not exist is left untouched, not swallowed as "no matches"', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-glob-test-literal-'));
  const missing = path.join(dir, 'does-not-exist.json');

  let caught = null;
  try {
    execFileSync(process.execPath, [HARNESS, '--merge', missing], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    caught = e;
  }
  // This must fail as a normal missing-file error (mergeRuns' fs.readFileSync),
  // NOT as the "--merge was given no files to pool" guard - the argument was a
  // literal path, not a glob, so it must reach mergeRuns unchanged.
  assert.ok(caught, 'expected a non-zero exit for a genuinely missing file');
  assert.doesNotMatch(caught.stderr.toString(), /no files to pool/);

  fs.rmSync(dir, { recursive: true, force: true });
});
