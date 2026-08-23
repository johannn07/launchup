// Stored readiness rows -> the mentor form's per-dimension levels.
// Extracted from the readiness-level page so the seeding rule can be read and
// tested on its own; the frontend has no test runner yet (TODO_CHECKLIST §4).

export const READINESS_TYPES = [
  'Technology',
  'Acceptance',
  'Market',
  'Organizational',
  'Regulatory',
  'Investment'
] as const;

export type ReadinessType = (typeof READINESS_TYPES)[number];
export type BaselineScores = Record<ReadinessType, number>;

/** Every dimension at level 1 — the form's state before any rating exists. */
export const unratedBaseline = (): BaselineScores =>
  Object.fromEntries(
    READINESS_TYPES.map((type) => [type, 1])
  ) as BaselineScores;

/**
 * Seeds the form from stored rows, the highest id per dimension winning.
 *
 * Always returns all six keys. A partial record is the dangerous case: an
 * unseeded select posts `undefined`, and the save is an upsert, so a single
 * stray click would overwrite a real level.
 */
export const baselineFromStoredLevels = (rows: unknown): BaselineScores => {
  const seeded = unratedBaseline();
  if (!Array.isArray(rows)) return seeded;

  for (const type of READINESS_TYPES) {
    const forType = rows.filter(
      (row) => row?.readinessLevel?.readinessType === type
    );
    if (forType.length === 0) continue;

    const latest = forType.reduce((a, b) => (b?.id > a?.id ? b : a));
    const level = Number(latest?.readinessLevel?.level);
    if (Number.isFinite(level)) seeded[type] = level;
  }

  return seeded;
};
