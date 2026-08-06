import { ReadinessType } from './entities/enums/readiness-type.enum';

/**
 * The readiness levels the two demo startups sit at.
 *
 * Shared because both seeders write them: `main.ts` on a cold boot, and
 * `seed-demo-full.js` when repairing a database seeded before these values were
 * corrected. Duplicating them is how they drifted out of agreement with the
 * capsule proposals in the first place.
 *
 * Each level is derived from that startup's own capsule proposal against the
 * readiness rubrics — the highest rung whose stated evidence the proposal
 * actually contains. Per-cell derivation, with the document phrase each was
 * read from, is in `measurement/data/ground-truth-adjudication.md`.
 *
 * These were previously chosen to look plausible and contradicted the proposals
 * in ten of twelve cells, which also made them a broken reference for the
 * grounding study's placement metric.
 */
export const DEMO_READINESS_LEVELS: Record<string, [ReadinessType, number][]> = {
  'AgroLink PH': [
    [ReadinessType.T, 2],
    [ReadinessType.M, 3],
    [ReadinessType.A, 3],
    [ReadinessType.O, 2],
    [ReadinessType.R, 1],
    [ReadinessType.I, 1],
  ],
  'MediSync Cebu': [
    [ReadinessType.T, 6],
    [ReadinessType.M, 5],
    [ReadinessType.A, 5],
    [ReadinessType.O, 2],
    [ReadinessType.R, 1],
    [ReadinessType.I, 1],
  ],
};

/** Marks a row as seeder-written, so a repair pass can tell it from a rating. */
export const SEEDED_LEVEL_REMARK = (startupName: string) => `Seeded baseline for ${startupName}`;
