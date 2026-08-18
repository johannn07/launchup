/**
 * The two demo startups' capsule proposals.
 *
 * Shared because both the seeder and measurement/measure-summary-bias.js read
 * them. seed-demo-full.js previously held the only copy and did not export it;
 * duplicating a shared fixture is how the app and the grounding study drifted
 * apart in July. Same rule as src/demo-readiness-levels.ts.
 */
export const DEMO_CAPSULE_PROPOSALS = {
  'AgroLink PH': {
    title: 'AgroLink PH: Cooperative Market Access Platform',
    description:
      'AgroLink PH connects smallholder farmer cooperatives in Central Luzon directly to institutional buyers, removing the layers of traders that currently absorb most of the margin on staple crops.',
    problemStatement:
      'Smallholder farmers sell through a chain of traders and typically capture only a fraction of the final market price. Price discovery is informal, buyers cannot verify supply volume ahead of harvest, and cooperatives have no tooling to aggregate member output into a single sellable lot.',
    targetMarket:
      'Rice and vegetable cooperatives in Nueva Ecija and Tarlac (roughly 400 cooperatives, 60-200 members each), and institutional buyers: supermarket chains, food processors, and government feeding programmes.',
    solutionDescription:
      'A mobile-first platform where cooperative officers register expected harvest volumes, buyers post standing demand, and matched lots are settled through the cooperative. Includes SMS fallback for members without smartphones.',
    objectives: [
      'Onboard 25 cooperatives and 1,200 individual farmer members in the first year',
      'Complete 100 verified buyer-cooperative transactions',
      'Demonstrate a measurable increase in farmgate price for participating members',
      'Validate the per-transaction commission model against cooperative willingness to pay',
    ],
    historicalTimeline: [
      { monthYear: '2025-06', description: 'Field interviews with 18 cooperatives across Nueva Ecija' },
      { monthYear: '2025-09', description: 'Paper prototype of the lot-aggregation flow tested with 3 cooperatives' },
      { monthYear: '2026-01', description: 'Two founders committed full-time; provisional agreement with one buyer' },
    ],
    competitiveAdvantageAnalysis: [
      { competitorName: 'Traditional traders / middlemen', offer: 'Immediate cash on collection at the farm gate', pricingStrategy: 'Buys well below market price; margin is opaque to the farmer' },
      { competitorName: 'Generic B2B marketplaces', offer: 'Listing and discovery for arbitrary goods', pricingStrategy: 'Subscription; no agricultural logistics or cooperative structure' },
    ],
    members: [
      { name: 'Rafael Domingo', role: 'Co-founder, operations and cooperative relations' },
      { name: 'Ana Beltran', role: 'Co-founder, engineering' },
    ],
    intellectualPropertyStatus:
      'No patents filed. The platform is proprietary software; the "AgroLink PH" wordmark has not yet been registered with IPOPHL.',
    curriculumVitae:
      'Rafael Domingo: 6 years as an agricultural extension officer with the Department of Agriculture. Ana Beltran: 4 years as a backend engineer at a Manila logistics firm.',
    scope:
      'Covers harvest-volume registration, buyer demand posting, matching, and transaction records through cooperative settlement. Excludes physical logistics, storage, credit, and crop insurance.',
    methodology:
      'Three-month acceleration: month 1 deepens buyer-side discovery and finalises the matching specification; month 2 builds and pilots the MVP with 3 cooperatives; month 3 runs live transactions and instruments farmgate price outcomes.',
    aiAnalysisSummary:
      'Early-stage venture with strong domain grounding on the supply side and a clearly articulated problem, but unvalidated buyer-side demand and no revenue. The commission model is untested against cooperative willingness to pay.',
  },
  'MediSync Cebu': {
    title: 'MediSync Cebu: Referral Coordination for Provincial Clinics',
    description:
      'MediSync Cebu is a referral coordination platform linking rural health units across Cebu province with district and tertiary hospitals, replacing the paper-and-phone process that currently governs patient transfers.',
    problemStatement:
      'Referrals move by handwritten form and phone call. Receiving hospitals get no structured advance notice, patients arrive at facilities already at capacity, and clinical history is frequently lost in transit. Neither side can audit where a referral stalled.',
    targetMarket:
      'The 44 rural health units in Cebu province, 8 district hospitals, and 3 tertiary referral centres in Cebu City. Secondary market: comparable provincial health systems in Bohol and Negros Oriental.',
    solutionDescription:
      'A structured referral record created at the originating clinic and transmitted to the receiving facility with bed-availability status, triage category, and attached history. Both sides see a shared timeline; escalation is prompted when a referral is unacknowledged past a threshold.',
    objectives: [
      'Deploy across 12 rural health units and 3 district hospitals',
      'Reduce median referral acknowledgement time from hours to under 30 minutes',
      'Achieve 80% of referrals arriving with complete structured clinical history',
      'Complete a Data Privacy Act compliance review and register the processing system with the NPC',
    ],
    historicalTimeline: [
      { monthYear: '2025-02', description: 'Pilot with 2 rural health units and 1 district hospital' },
      { monthYear: '2025-08', description: 'Expanded to 6 facilities; first paid facility subscriptions' },
      { monthYear: '2026-02', description: 'Reached PHP 5,000 monthly recurring revenue; team grew to 3 founders' },
    ],
    competitiveAdvantageAnalysis: [
      { competitorName: 'Paper referral slips and phone calls', offer: 'Zero cost, universally understood, no training needed', pricingStrategy: 'Free; cost is borne as delay, lost records, and unplanned arrivals' },
      { competitorName: 'Hospital-wide HIS vendors', offer: 'Full hospital information system including referrals', pricingStrategy: 'Six-figure licences aimed at tertiary hospitals; rural health units cannot afford or operate them' },
    ],
    members: [
      { name: 'Dr. Elena Reyes', role: 'Co-founder, clinical lead (practising physician)' },
      { name: 'Marco Villanueva', role: 'Co-founder, engineering' },
      { name: 'Joy Tabotabo', role: 'Co-founder, facility partnerships' },
    ],
    intellectualPropertyStatus:
      'No patents. Trademark application for "MediSync" filed with IPOPHL, pending. Source code proprietary; the FHIR mapping layer is built on open standards.',
    curriculumVitae:
      'Dr. Elena Reyes: 9 years in provincial public health, 3 as a rural health unit physician. Marco Villanueva: 7 years in health IT integration. Joy Tabotabo: 5 years in LGU health programme administration.',
    scope:
      'Covers referral creation, transmission, acknowledgement, and status tracking between participating facilities, plus bed-availability signalling. Excludes diagnosis, prescribing, billing, and insurance claim processing.',
    methodology:
      'Three-month acceleration: month 1 hardens the platform and completes the Data Privacy Act review; month 2 onboards 6 additional facilities with in-person training; month 3 measures acknowledgement latency and history completeness against the pre-deployment baseline.',
    aiAnalysisSummary:
      'Mid-stage venture with live deployments, early recurring revenue, and a clinically credible founding team. Principal risks are regulatory (health data handling under the Data Privacy Act) and the slow procurement cycles of LGU-run facilities.',
  },
};

export type DemoCapsuleProposal = (typeof DEMO_CAPSULE_PROPOSALS)[keyof typeof DEMO_CAPSULE_PROPOSALS];

/**
 * The subset generateStartupAnalysisSummary reads.
 *
 * `scope` is renamed: the DTO calls it `proposalScope`. `aiAnalysisSummary` is
 * deliberately omitted — it is hand-written seed prose, and feeding it back in
 * would make a measurement read its own fixture as a result.
 */
export function toApplicationDto(name: keyof typeof DEMO_CAPSULE_PROPOSALS) {
  const p = DEMO_CAPSULE_PROPOSALS[name];
  return {
    title: p.title,
    description: p.description,
    problemStatement: p.problemStatement,
    targetMarket: p.targetMarket,
    solutionDescription: p.solutionDescription,
    objectives: p.objectives,
    proposalScope: p.scope,
    methodology: p.methodology,
    historicalTimeline: p.historicalTimeline,
    competitiveAdvantageAnalysis: p.competitiveAdvantageAnalysis,
    intellectualPropertyStatus: p.intellectualPropertyStatus,
  };
}
