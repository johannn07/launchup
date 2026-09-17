/**
 * Fixture data for the dev-only dashboard preview.
 *
 * Only ever reached from `+page.server.ts` behind a `dev` check, so this never
 * runs in a production build. Numbers are illustrative, not real scores.
 */
export const previewReadiness = {
  compositeScore: 62,
  tierLabel: 'Emerging',
  dimensions: [
    {
      key: 'team' as const,
      label: 'Team',
      score: 7,
      percent: 70,
      weight: 0.2,
      weightedScore: 14,
      rationale:
        'Two technical founders with prior domain experience; no named operations lead.'
    },
    {
      key: 'market' as const,
      label: 'Market',
      score: 8,
      percent: 80,
      weight: 0.2,
      weightedScore: 16,
      rationale:
        '31 paid pilots across two provinces, with a clearly defined buyer.'
    },
    {
      key: 'product' as const,
      label: 'Product',
      score: 6,
      percent: 60,
      weight: 0.2,
      weightedScore: 12,
      rationale: 'Working prototype on the bench; no field trial has run yet.'
    },
    {
      key: 'traction' as const,
      label: 'Traction',
      score: 6,
      percent: 60,
      weight: 0.15,
      weightedScore: 9,
      rationale:
        'Two of five pilot sites renewed. Retention data is still thin.'
    },
    {
      key: 'regulatory' as const,
      label: 'Regulatory',
      score: 3,
      percent: 30,
      weight: 0.15,
      weightedScore: 4.5,
      rationale:
        'Accreditation described as "exploring". No filing has been made.'
    },
    {
      key: 'funding' as const,
      label: 'Funding',
      score: 5,
      percent: 50,
      weight: 0.1,
      weightedScore: 5,
      rationale:
        'One unsigned term sheet from a partner fund; 7 months of runway.'
    }
  ],
  recommendations: [
    {
      priority: 1,
      urgency: 'High' as const,
      dimension: 'regulatory' as const,
      title: 'Start the accreditation filing',
      details:
        'Regulatory is the weakest weighted contribution and the one an investment committee will ask about first. Move from "exploring" to a submitted application with a reference number.'
    },
    {
      priority: 2,
      urgency: 'Medium' as const,
      dimension: 'product' as const,
      title: 'Run one field trial outside the lab',
      details:
        'A bench prototype caps the Product score. One trial at a live pilot site would move this two levels and de-risk the Traction story at the same time.'
    },
    {
      priority: 3,
      urgency: 'Low' as const,
      dimension: 'team' as const,
      title: 'Name an operations lead',
      details:
        'The gap is organisational rather than technical. Naming the person already doing the work is usually enough to close it.'
    }
  ],
  weightRationale: [
    {
      key: 'team' as const,
      label: 'Team',
      weight: 0.2,
      rationale:
        'Early-stage outcomes track the team more than any other single factor.'
    },
    {
      key: 'market' as const,
      label: 'Market',
      weight: 0.2,
      rationale:
        'A weak market caps every other dimension, so it carries equal top weight.'
    },
    {
      key: 'product' as const,
      label: 'Product',
      weight: 0.2,
      rationale:
        'Evidence the thing works is what converts interest into a pilot.'
    },
    {
      key: 'traction' as const,
      label: 'Traction',
      weight: 0.15,
      rationale:
        'Weighted below product at this stage, since early traction is noisy.'
    },
    {
      key: 'regulatory' as const,
      label: 'Regulatory',
      weight: 0.15,
      rationale:
        'Sector-dependent, but a blocker rather than a differentiator when unresolved.'
    },
    {
      key: 'funding' as const,
      label: 'Funding',
      weight: 0.1,
      rationale:
        'An outcome of the other five more than an input, so it carries the least weight.'
    }
  ]
};
