// Audit status for a reviewed score. A review that never ran is not a pass (SRS 2.1).
export const biasStatusOf = (r: {
  biasFlagged: boolean;
  reviewFailed: boolean;
}) =>
  r.reviewFailed ? 'bias-unverified' : r.biasFlagged ? 'flagged' : 'normalized';
