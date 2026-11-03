import { HttpException } from '@nestjs/common';
import {
  isQuotaError,
  isRateLimitError,
  isServiceFailure,
} from './retry-transient';

/** Six tries spans a busy hour or several daily-quota resets. */
export const MAX_JOB_ATTEMPTS = 6;

const MINUTE = 60_000;
// Busy-model waits grow, so a long outage costs few requests.
const BUSY_BACKOFF_MIN = [2, 5, 15, 30, 60];

/**
 * The Gemini refusal behind an error, or null when the error is something a
 * retry cannot fix. Generators wrap the refusal in a 503 via withAiRetry.
 */
export function refusalOf(e: unknown): unknown {
  if (isServiceFailure(e)) return e;
  const cause = (e as { cause?: unknown })?.cause;
  if (e instanceof HttpException && cause && isServiceFailure(cause))
    return cause;
  return null;
}

/** When to try again, or null to give up. */
export function nextAttemptAt(
  refusal: unknown,
  attempts: number,
  now: Date,
  quotaResetAt: Date,
): Date | null {
  if (attempts >= MAX_JOB_ATTEMPTS) return null;
  if (isRateLimitError(refusal)) return new Date(now.getTime() + 2 * MINUTE);
  // The daily cap reopens at the reset; earlier tries only earn another 429.
  if (isQuotaError(refusal))
    return new Date(quotaResetAt.getTime() + 2 * MINUTE);
  const wait =
    BUSY_BACKOFF_MIN[Math.min(attempts, BUSY_BACKOFF_MIN.length) - 1] ??
    BUSY_BACKOFF_MIN[0];
  return new Date(now.getTime() + wait * MINUTE);
}

/** What the requester is told when their request is queued. */
export function queuedMessage(refusal: unknown): string {
  if (isQuotaError(refusal) && !isRateLimitError(refusal))
    return 'The AI service has reached its daily quota, so your request is queued and will run automatically after the reset.';
  return 'The AI service is busy, so your request is queued and will run automatically in a few minutes.';
}
