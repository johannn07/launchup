/**
 * Transient-failure retry for Gemini calls.
 *
 * Ported from `measurement/measure-grounding.js`, which has had this since
 * 2026-08-03 — the measurement harness was more robust than the application it
 * measures, and a 503 during a live upload proved it on 2026-08-22.
 *
 * A 503 is the model being busy and usually clears in seconds. A 429 is the
 * daily cap, which does not reopen for ~24h. Retrying the first can save a
 * request; retrying the second only earns another 429, so they must never share
 * a code path.
 */

/** The daily cap. Never retry this. */
export function isQuotaError(e: unknown): boolean {
  const s = String((e as Error)?.message ?? e);
  return s.includes('429') || s.includes('RESOURCE_EXHAUSTED');
}

/** The model being busy. Worth one or two more attempts. */
export function isRetryableServerError(e: unknown): boolean {
  if (isQuotaError(e)) return false;
  const s = String((e as Error)?.message ?? e);
  return s.includes('503') || s.includes('UNAVAILABLE');
}

/** Either failure means the request cannot be served now, whatever the cause. */
export function isServiceFailure(e: unknown): boolean {
  return isQuotaError(e) || isRetryableServerError(e);
}

const sleepFor = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `attempts` is a TOTAL call budget, not extra tries on top of the first.
 *
 * Defaults are tuned for an interactive upload, not for the harness: a capsule
 * extraction already runs to ~200s, so the harness's 15s/30s would be felt.
 * 2s then 4s adds at most 6s and still catches a brief spike.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    attempts = 3,
    delayMs = 2000,
    sleep = sleepFor,
    onRetry,
  }: {
    attempts?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<unknown>;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= attempts || !isRetryableServerError(e)) throw e;
      onRetry?.(attempt, e);
      await sleep(delayMs * attempt);
    }
  }
}
