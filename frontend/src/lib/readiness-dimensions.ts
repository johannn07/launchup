// The canonical readiness dimension order, and the only place it is declared.
//
// The specification lists the dimensions TRL, MRL, RRL, ARL, ORL (SRS 1.2 scope,
// SDD 2.2 and the urat_questions.dimension column). Four different orders were
// in the codebase before this module existed; anything that shows dimensions in
// sequence must derive from here rather than restate the list.
//
// Investment (IRL) is not in the specification. It is scored anyway and sorts last.

export const READINESS_TYPES = [
  'Technology',
  'Market',
  'Regulatory',
  'Acceptance',
  'Organizational',
  'Investment'
] as const;

export type ReadinessTypeName = (typeof READINESS_TYPES)[number];
