const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const HARNESS = path.resolve(__dirname, '../measure-grounding.js');
const { isRetryableServerError, is429, withRetry } = require(HARNESS);

// --------------------------------------------------------------------------
// 2026-08-03: rep 3 lost deviation-deterministic / MediSync / levels to a
// transient 503 "This model is currently experiencing high demand", which the
// harness treated exactly like any other non-429 error - recorded and moved
// on. A 503 is retryable; a 429 is not (the daily cap does not reopen for
// ~24h, so retrying it burns wall-clock to earn another 429).
//
// The separation between those two is the whole point of these tests.
// --------------------------------------------------------------------------

const err = (msg) => new Error(msg);

test('a 503 is classified retryable', () => {
  assert.equal(
    isRetryableServerError(
      err('got status: 503 Service Unavailable. {"error":{"code":503,"message":"This model is currently experiencing high demand."}}'),
    ),
    true,
  );
});

test('an UNAVAILABLE status with no numeric code is retryable', () => {
  assert.equal(isRetryableServerError(err('{"status":"UNAVAILABLE"}')), true);
});

test('a 429 is NOT retryable, and is still classified as a quota hit', () => {
  const quota = err('got status: 429 Too Many Requests. RESOURCE_EXHAUSTED');
  assert.equal(isRetryableServerError(quota), false, '429 must never be retried');
  assert.equal(is429(quota), true, 'the existing quota path must still fire');
});

test('an error naming BOTH a quota code and a server code counts as quota', () => {
  // The is429 early-return in isRetryableServerError is only load-bearing here:
  // a plain 429 body contains neither "503" nor "UNAVAILABLE", so removing the
  // guard passes every other test in this file (confirmed by mutation).
  // Precedence must be explicit — retrying a quota error burns wall-clock to
  // earn another 429, and Google has shipped bodies mentioning both before.
  const mixed = err(
    'got status: 429 Too Many Requests. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED",' +
      '"message":"quota exceeded; the 503 UNAVAILABLE fallback pool is also saturated"}}',
  );
  assert.equal(is429(mixed), true);
  assert.equal(isRetryableServerError(mixed), false, 'quota must win over the server-error match');
});

test('a 400 or a parse failure is not retryable', () => {
  assert.equal(isRetryableServerError(err('got status: 400 Bad Request')), false);
  assert.equal(isRetryableServerError(err('Unexpected token < in JSON')), false);
});

test('withRetry returns the first success without sleeping', async () => {
  const slept = [];
  let calls = 0;
  const out = await withRetry(
    async () => {
      calls++;
      return 'ok';
    },
    { attempts: 3, delayMs: 1000, sleep: async (ms) => slept.push(ms) },
  );
  assert.equal(out, 'ok');
  assert.equal(calls, 1);
  assert.deepEqual(slept, []);
});

test('withRetry retries a 503 and returns the eventual success', async () => {
  const slept = [];
  let calls = 0;
  const out = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw err('got status: 503 Service Unavailable');
      return 'recovered';
    },
    { attempts: 3, delayMs: 1000, sleep: async (ms) => slept.push(ms) },
  );
  assert.equal(out, 'recovered');
  assert.equal(calls, 3, 'should have called through until it succeeded');
  assert.equal(slept.length, 2, 'one sleep per retry, none after the success');
});

test('withRetry backs off progressively rather than hammering', async () => {
  const slept = [];
  await assert.rejects(
    withRetry(
      async () => {
        throw err('got status: 503 Service Unavailable');
      },
      { attempts: 3, delayMs: 1000, sleep: async (ms) => slept.push(ms) },
    ),
  );
  assert.deepEqual(slept, [1000, 2000], 'delay should grow with the attempt');
});

test('withRetry gives up after the attempt budget and rethrows the real error', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw err('got status: 503 Service Unavailable');
      },
      { attempts: 3, delayMs: 1, sleep: async () => {} },
    ),
    /503/,
    'the original error must survive, not be replaced by a retry wrapper error',
  );
  assert.equal(calls, 3, 'attempts is a total call budget, not extra retries on top');
});

test('withRetry does NOT retry a 429 — it rethrows immediately', async () => {
  const slept = [];
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw err('got status: 429 Too Many Requests');
      },
      { attempts: 3, delayMs: 1000, sleep: async (ms) => slept.push(ms) },
    ),
    /429/,
  );
  assert.equal(calls, 1, 'a quota error must cost exactly one attempt');
  assert.deepEqual(slept, [], 'and must not burn wall-clock sleeping');
});
