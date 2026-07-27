import { ReadinessType } from '../entities/enums/readiness-type.enum';

/**
 * `rag_contexts.sourceType` values. One table, three populations.
 *
 * CAPSULE_SOURCE_TYPE is what startup.service.ts has always written; the other
 * two are the verified-knowledge corpus. Keeping them in one table means the
 * existing embedding path and boot-time backfill cover the corpus with no new
 * indexing code.
 */
export const RUBRIC_SOURCE_TYPE = 'readiness_rubric';
export const FRAMEWORK_SOURCE_TYPE = 'business_framework';
export const CAPSULE_SOURCE_TYPE = 'capsule_proposal';

/**
 * How much external authority a corpus row actually carries.
 *
 * Recorded per row rather than claimed for the corpus as a whole, because it is
 * not uniform: TRL is transcribed from a published standard, the other BRLa
 * dimensions are authored against a paywalled framework's stated criteria, and
 * IRL has no external source at all. SRS §2.2 requires a confidence/validity
 * indicator in API responses — this is what it is derived from.
 */
export type Provenance = 'standard' | 'framework-derived' | 'authored';

export const PROVENANCES: readonly Provenance[] = [
  'standard',
  'framework-derived',
  'authored',
];

export interface CorpusRowMetadata {
  /** Stable slug; the idempotency handle for the seeder. */
  key: string;
  provenance: Provenance;
  /** Null only when provenance is 'authored'. */
  citation: string | null;
  sourceUrl?: string;
  /** Rubric rows only. */
  readinessType?: ReadinessType;
  /** Rubric rows only, 1..MAX_READINESS_LEVEL. */
  level?: number;
  /**
   * Criteria vocabulary this row introduces. Authored with the content so the
   * grounding metric has a term list that was not reverse-engineered from the
   * output it scores.
   */
  keyTerms: string[];
}

export const MAX_READINESS_LEVEL = 9;

/**
 * Abbreviation used in the proposal, SRS and SDD. Note ARL is "Adoption
 * Readiness Level" in those documents while the enum value is 'Acceptance'.
 */
const RUBRIC_KEY_PREFIX: Record<ReadinessType, string> = {
  [ReadinessType.T]: 'trl',
  [ReadinessType.M]: 'mrl',
  [ReadinessType.A]: 'arl',
  [ReadinessType.O]: 'orl',
  [ReadinessType.R]: 'rrl',
  [ReadinessType.I]: 'irl',
};

export const rubricKey = (type: ReadinessType, level: number): string =>
  `${RUBRIC_KEY_PREFIX[type]}-${level}`;
