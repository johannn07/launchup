// Order is the specification's: SRS §1.3 and SDD §2.2 both list the dimensions
// TRL, MRL, RRL, ARL, ORL. Everything that displays dimensions in sequence
// derives from this — see DIMENSION_ORDER in readinesslevel.service.ts.
// Investment (IRL) is not in the specification; it is scored anyway and sorts last.
export enum ReadinessType {
  T = 'Technology',
  M = 'Market',
  R = 'Regulatory',
  A = 'Acceptance',
  O = 'Organizational',
  I = 'Investment',
}
