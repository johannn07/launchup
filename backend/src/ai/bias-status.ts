// Audit status for a reviewed score. A review that never ran is not a pass (SRS 2.1).
export const biasStatusOf = (r: {
  biasFlagged: boolean;
  reviewFailed: boolean;
}) =>
  r.reviewFailed ? 'bias-unverified' : r.biasFlagged ? 'flagged' : 'normalized';

// A Manager replaced the corrected score; the reason is in overrideJustification.
export const BIAS_STATUS_OVERRIDDEN = 'overridden';
