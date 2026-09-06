/** Orphan OCR rows older than this are parse leftovers, not records. */
export const DEFAULT_OCR_RETENTION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * MS_PER_DAY);
}

/** 0 disables pruning. Anything unparseable or negative falls back rather than
 *  widening the delete. */
export function resolveRetentionDays(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_OCR_RETENTION_DAYS;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_OCR_RETENTION_DAYS;
  }

  return parsed;
}
