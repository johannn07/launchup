import { QualificationStatus } from '$lib/enums/qualification-status.enum';

// Status is where a startup is in the programme; tier is how ready it scored.
// The two vocabularies never share a word. Keys match the .lu-status tokens.
export const STATUS: Record<number, { key: string; label: string }> = {
  [QualificationStatus.PENDING]: { key: 'pending', label: 'Pending' },
  [QualificationStatus.WAITLISTED]: { key: 'waitlisted', label: 'Waitlisted' },
  [QualificationStatus.QUALIFIED]: { key: 'qualified', label: 'Qualified' },
  [QualificationStatus.COMPLETED]: { key: 'completed', label: 'Completed' }
};

export function statusOf(qualificationStatus: number | null | undefined) {
  return (
    STATUS[qualificationStatus ?? QualificationStatus.PENDING] ??
    STATUS[QualificationStatus.PENDING]
  );
}

/** Latest tier label, only for startups that can have been scored. */
export function tierOf(
  startup: {
    qualificationStatus?: number | null;
    readinessEvaluations?: { id: number; tierLabel: string }[];
  } | null
): string | null {
  if (
    startup?.qualificationStatus !== QualificationStatus.QUALIFIED &&
    startup?.qualificationStatus !== QualificationStatus.COMPLETED
  )
    return null;
  const evals = startup?.readinessEvaluations;
  if (!evals?.length) return null;
  // The API returns the collection unordered, so "last" was an arbitrary row.
  return evals.reduce((a, b) => (b.id > a.id ? b : a)).tierLabel;
}

/**
 * Tier labels present in a list, best first. Tiers are Manager-configurable, so
 * the order comes from the scores rather than a fixed ladder.
 */
export function tiersBestFirst(
  startups: {
    qualificationStatus?: number | null;
    readinessEvaluations?: { id: number; tierLabel: string; compositeScore?: number }[];
  }[]
): string[] {
  const best = new Map<string, number>();
  for (const s of startups) {
    const tier = tierOf(s);
    if (!tier) continue;
    const latest = s.readinessEvaluations!.reduce((a, b) => (b.id > a.id ? b : a));
    const score = Number(latest.compositeScore ?? 0);
    best.set(tier, Math.max(best.get(tier) ?? -Infinity, score));
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export const tierLine = (tier: string | null) =>
  tier ? `Readiness: ${tier}` : 'Readiness not scored';
