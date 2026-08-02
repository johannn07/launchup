import { ReadinessType } from '../entities/enums/readiness-type.enum';

/**
 * `rag_contexts.sourceType` values — one table, three populations. CAPSULE is
 * what startup.service.ts has always written; the other two are the verified
 * corpus. Sharing the table lets the existing embedding path and boot-time
 * backfill cover the corpus with no new indexing code.
 */
export const RUBRIC_SOURCE_TYPE = 'readiness_rubric';
export const FRAMEWORK_SOURCE_TYPE = 'business_framework';
export const CAPSULE_SOURCE_TYPE = 'capsule_proposal';

/**
 * How much external authority a corpus row carries. Per row, because it is not
 * uniform: TRL is transcribed from a published standard, other BRLa dimensions
 * are authored against a paywalled framework's criteria, IRL has no source at
 * all. SRS §2.2's confidence/validity indicator derives from this.
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
   * Criteria vocabulary this row introduces. Authored alongside the content so
   * the grounding metric's term list isn't reverse-engineered from the output
   * it scores.
   */
  keyTerms: string[];
}

export const MAX_READINESS_LEVEL = 9;

/**
 * Abbreviations from the proposal, SRS and SDD. ARL is "Adoption Readiness
 * Level" there, while the enum value is 'Acceptance'.
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
