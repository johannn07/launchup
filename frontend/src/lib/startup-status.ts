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
export function tierOf(startup: {
  qualificationStatus?: number | null;
  readinessEvaluations?: { tierLabel: string }[];
} | null): string | null {
  if (
    startup?.qualificationStatus !== QualificationStatus.QUALIFIED &&
    startup?.qualificationStatus !== QualificationStatus.COMPLETED
  )
    return null;
  const evals = startup?.readinessEvaluations;
  return evals?.length ? evals[evals.length - 1].tierLabel : null;
}

export const tierLine = (tier: string | null) =>
  tier ? `Readiness: ${tier}` : 'Readiness not scored';
