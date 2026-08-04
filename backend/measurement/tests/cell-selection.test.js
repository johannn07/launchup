const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const HARNESS = path.resolve(__dirname, '../measure-grounding.js');
const { selectCells, ARMS, STARTUPS, validateArgs } = require(HARNESS);

const STARTUP_NAMES = Object.keys(STARTUPS);

// --------------------------------------------------------------------------
// 2026-08-03: a 503 killed one cell (deviation-deterministic / MediSync /
// levels) and refilling it cost a whole 12-call rep, because the harness had
// no way to run a subset. These tests pin the filter that makes it 1 call.
//
// The load-bearing property is the LAST test: a filter that matches nothing
// must error, never fall through to the full run. Silently spending 12 calls
// when the operator asked for 1 is the same class of bug as --merge falling
// through to a live run (cli-args.test.js).
// --------------------------------------------------------------------------

test('no filters selects every cell', () => {
  const sel = selectCells(null, null, ARMS, STARTUP_NAMES);
  assert.deepEqual(sel.errors, []);
  assert.equal(sel.arms.length, ARMS.length);
  assert.deepEqual(sel.startups, STARTUP_NAMES);
});

test('an arm filter narrows arms and leaves startups whole', () => {
  const sel = selectCells('deviation-deterministic', null, ARMS, STARTUP_NAMES);
  assert.deepEqual(sel.errors, []);
  assert.deepEqual(
    sel.arms.map((a) => a.name),
    ['deviation-deterministic'],
  );
  assert.deepEqual(sel.startups, STARTUP_NAMES);
});

test('a startup filter narrows startups and leaves arms whole', () => {
  const sel = selectCells(null, 'MediSync Cebu', ARMS, STARTUP_NAMES);
  assert.deepEqual(sel.errors, []);
  assert.equal(sel.arms.length, ARMS.length);
  assert.deepEqual(sel.startups, ['MediSync Cebu']);
});

test('both filters together select exactly one cell — the 2026-08-03 case', () => {
  // Ran as --only-arm=deviation on 2026-08-03/04, when that prefix was still
  // unique. deviation-titles now shares it, so the recorded invocation is
  // spelled in full here — the cell it selects is unchanged.
  const sel = selectCells('deviation-deterministic', 'MediSync', ARMS, STARTUP_NAMES);
  assert.deepEqual(sel.errors, []);
  assert.deepEqual(
    sel.arms.map((a) => a.name),
    ['deviation-deterministic'],
  );
  assert.deepEqual(sel.startups, ['MediSync Cebu']);
});

test('matching is a case-insensitive prefix, so shell-friendly short forms work', () => {
  const sel = selectCells('SDD', 'medisync', ARMS, STARTUP_NAMES);
  assert.deepEqual(sel.errors, []);
  assert.deepEqual(
    sel.arms.map((a) => a.name),
    ['sdd-semantic'],
  );
  assert.deepEqual(sel.startups, ['MediSync Cebu']);
});

test('an ambiguous prefix errors rather than silently running both arms', () => {
  // Over-selection costs quota exactly as under-selection costs data: at a
  // 20/day cap, a prefix quietly expanding to two arms doubles the spend.
  const sel = selectCells('deviation', null, ARMS, STARTUP_NAMES);
  assert.equal(sel.arms.length, 0, 'nothing may be selected on an ambiguous filter');
  assert.equal(sel.errors.length, 1);
  assert.match(sel.errors[0], /ambiguous/);
  // Names both candidates, so the operator can retype without reading the source.
  assert.match(sel.errors[0], /deviation-deterministic/);
  assert.match(sel.errors[0], /deviation-titles/);
});

test('an exact name wins over a prefix that also matches a longer arm', () => {
  // Without the exact-match precedence, an arm whose full name prefixes another
  // would be permanently unselectable.
  const sel = selectCells('deviation-titles', null, ARMS, STARTUP_NAMES);
  assert.deepEqual(sel.errors, []);
  assert.deepEqual(
    sel.arms.map((a) => a.name),
    ['deviation-titles'],
  );
});

test('a comma-separated list selects several, in the harness’s own order', () => {
  // Order must follow ARMS, not the order the operator typed, so a filtered
  // run's arm ordering matches an unfiltered one's.
  const sel = selectCells('sdd-semantic,baseline', null, ARMS, STARTUP_NAMES);
  assert.deepEqual(sel.errors, []);
  assert.deepEqual(
    sel.arms.map((a) => a.name),
    ['baseline', 'sdd-semantic'],
  );
});

test('whitespace around a comma-separated entry is tolerated', () => {
  const sel = selectCells(' baseline , sdd-semantic ', null, ARMS, STARTUP_NAMES);
  assert.deepEqual(sel.errors, []);
  assert.deepEqual(
    sel.arms.map((a) => a.name),
    ['baseline', 'sdd-semantic'],
  );
});

test('an arm filter matching nothing errors rather than selecting everything', () => {
  const sel = selectCells('devation', null, ARMS, STARTUP_NAMES);
  assert.equal(sel.arms.length, 0);
  assert.equal(sel.errors.length, 1);
  assert.match(sel.errors[0], /devation/);
  // The message must name the real options - a typo'd filter is the whole
  // reason this path exists.
  assert.match(sel.errors[0], /deviation-deterministic/);
});

test('a startup filter matching nothing errors and names the real startups', () => {
  const sel = selectCells(null, 'Medisynk', ARMS, STARTUP_NAMES);
  assert.equal(sel.startups.length, 0);
  assert.equal(sel.errors.length, 1);
  assert.match(sel.errors[0], /Medisynk/);
  assert.match(sel.errors[0], /MediSync Cebu/);
});

test('one bad entry in a list fails the whole filter, rather than silently dropping it', () => {
  // Partial matching would quietly run fewer cells than asked for, which is
  // the same silent-underspend the 503 exposed.
  const sel = selectCells('baseline,nosucharm', null, ARMS, STARTUP_NAMES);
  assert.equal(sel.errors.length, 1);
  assert.match(sel.errors[0], /nosucharm/);
});

test('the CLI accepts --only-arm and --only-startup', () => {
  assert.deepEqual(validateArgs(['--only-arm=deviation'], []), []);
  assert.deepEqual(validateArgs(['--only-startup=MediSync Cebu'], []), []);
  assert.deepEqual(
    validateArgs(['--only-arm=deviation', '--only-startup=MediSync', '--out=x.json'], []),
    [],
  );
});

test('--only-arm with a space instead of "=" is caught like --out and --reps', () => {
  // Same shape as cli-args.test.js' --out/--reps cases: the bare flag and the
  // stray positional each produce an error; the positional carries the hint.
  const errs = validateArgs(['--only-arm', 'deviation'], []);
  const positional = errs.find((e) => e.includes('"deviation"'));
  assert.ok(positional, `expected an error naming "deviation", got ${JSON.stringify(errs)}`);
  assert.match(positional, /Did you mean "--only-arm=deviation"/);
});
