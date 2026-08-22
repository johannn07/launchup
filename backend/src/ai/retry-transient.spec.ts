import { isQuotaError, isRetryableServerError, withRetry } from './retry-transient';

const err = (message: string) => new Error(message);

const SERVICE_BUSY =
  'got status: 503 Service Unavailable. {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}';
const QUOTA =
  'got status: 429 Too Many Requests. {"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}';

describe('classifying the two failures that must never share a code path', () => {
  it('treats a real 503 body as retryable', () => {
    expect(isRetryableServerError(err(SERVICE_BUSY))).toBe(true);
  });

  it('refuses to retry a real 429 body', () => {
    // Retrying a quota error only earns another one; the cap does not reopen
    // for ~24h. This is the guard that matters most.
    expect(isRetryableServerError(err(QUOTA))).toBe(false);
    expect(isQuotaError(err(QUOTA))).toBe(true);
  });

  it('does not mistake a 429 for a service outage', () => {
    expect(isQuotaError(err(SERVICE_BUSY))).toBe(false);
  });

  it('leaves ordinary errors alone', () => {
    expect(isRetryableServerError(err('Unexpected token < in JSON'))).toBe(false);
    expect(isQuotaError(err('Unexpected token < in JSON'))).toBe(false);
  });
});

describe('withRetry', () => {
  const noSleep = jest.fn().mockResolvedValue(undefined);
  beforeEach(() => noSleep.mockClear());

  it('calls once and returns when nothing fails', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(noSleep).not.toHaveBeenCalled();
  });

  it('recovers a call that 503s once', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(err(SERVICE_BUSY))
      .mockResolvedValue('recovered');

    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe('recovered');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never makes a second call on a quota error', async () => {
    const fn = jest.fn().mockRejectedValue(err(QUOTA));

    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow('429');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt budget and rethrows the original error', async () => {
    const fn = jest.fn().mockRejectedValue(err(SERVICE_BUSY));

    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow('503');

    // attempts is a total call budget, not extra tries on top of the first.
    expect(fn).toHaveBeenCalledTimes(3);
    expect(noSleep).toHaveBeenCalledTimes(2);
  });

  it('backs off further on each successive attempt', async () => {
    const fn = jest.fn().mockRejectedValue(err(SERVICE_BUSY));

    await withRetry(fn, { attempts: 3, delayMs: 2000, sleep: noSleep }).catch(() => {});

    expect(noSleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000]);
  });
});

describe('the real error, verbatim', () => {
  // Copied from the backend terminal 2026-08-22. A classifier that matches a
  // paraphrase of the error but not the SDK's actual message is worthless.
  const observed = new Error(
    'got status: 503 Service Unavailable. {"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}',
  );

  it('classifies the 503 that broke the live upload as retryable, not quota', () => {
    expect(isRetryableServerError(observed)).toBe(true);
    expect(isQuotaError(observed)).toBe(false);
  });
});
