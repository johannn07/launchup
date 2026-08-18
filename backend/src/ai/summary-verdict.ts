/**
 * SO 4.4 — resolves the tone verdict a reviewing Manager sees beside a
 * readiness summary.
 *
 * Two sources, and the distinction is shown in the UI rather than smoothed
 * over. A `recorded` verdict is the one `startup.service.ts` persisted at
 * generation time, under whatever flag rule shipped then; a `recomputed` one is
 * read live from the summary text because no row was ever written.
 *
 * Recomputing is not a fallback that "fixes" a stale row — a recorded row is
 * always preferred, even when a fresh reading disagrees with it. The row is
 * attributable to a generation run and a fresh reading is not, and quietly
 * replacing a stored verdict with a current one rewrites what the system
 * actually decided. Where they disagree, `source` is how a Manager tells which
 * is which.
 *
 * The recompute branch exists because the persistence path only runs for
 * proposals created through `createStartupProposal`. Seeded and pre-feature
 * proposals have summary text and no row, and a badge that renders nothing for
 * them would reproduce the exact failure this objective names: an alert nobody
 * sees.
 */
import { analyzeTone } from './summary-tone';

/** The two strings `startup.service.ts` persists. One vocabulary for both branches. */
export type SummaryVerdictStatus = 'positive-language-flagged' | 'balanced';

export interface SummaryVerdict {
  status: SummaryVerdictStatus;
  source: 'recorded' | 'recomputed';
  /** Present only on `recorded` — which generation run decided this. */
  runId?: number;
  /** Present only on `recomputed`; the counts the status was derived from. */
  ratio?: number;
  criticalCount?: number;
  positiveCount?: number;
}

/** The fields this needs off an `AiRecommendation`, so callers can pass a row or a stub. */
interface RecordedRow {
  confidenceStatus: string;
  generationRun?: { id: number };
}

export function resolveSummaryVerdict(
  summaryText: string | undefined | null,
  recorded: RecordedRow | undefined,
): SummaryVerdict | undefined {
  if (!summaryText?.trim()) return undefined;

  if (recorded) {
    // No counts: the row stores a status only, so recomputed counts beside it
    // would be numbers the recorded status was not necessarily derived from.
    return {
      status: recorded.confidenceStatus === 'positive-language-flagged' ? 'positive-language-flagged' : 'balanced',
      source: 'recorded',
      ...(recorded.generationRun ? { runId: recorded.generationRun.id } : {}),
    };
  }

  const tone = analyzeTone(summaryText);
  return {
    status: tone.flagged ? 'positive-language-flagged' : 'balanced',
    source: 'recomputed',
    ratio: tone.ratio,
    criticalCount: tone.criticalCount,
    positiveCount: tone.positiveCount,
  };
}
