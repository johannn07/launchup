import { ReadinessType } from 'src/entities/enums/readiness-type.enum';
import { OutputValidatorService } from './output-validator.service';
import { checkRecommendationFacts, sourceTextOf } from './recommendation-facts';

// SRS 2.2: recommendations checked against rated levels and profile fields.
const MEDISYNC = {
  ratedLevels: {
    [ReadinessType.T]: 7,
    [ReadinessType.I]: 1,
    [ReadinessType.O]: 2,
  },
  sourceText:
    'Live across six facilities. PHP 5,000 MRR. Expansion to 12 rural health units and 3 district hospitals.',
};

const check = (content: string) =>
  checkRecommendationFacts({ content, ...MEDISYNC });

describe('checkRecommendationFacts', () => {
  it('passes a stored MediSync RNA as written', () => {
    expect(
      check(
        'At TRL 7, MediSync Cebu operates across 6 facilities. To advance to TRL 8, deploy across 12 rural health units and 3 district hospitals.',
      ),
    ).toEqual({ levelMismatches: [], unsupportedNumbers: [] });
  });

  it.each([
    ['Currently at IRL 3, with a drafted funding plan', 'IRL 3'],
    ['MediSync is at TRL 6 with a live prototype', 'TRL 6'],
    [
      'Operating at Organizational Readiness Level 4, the team',
      'Organizational Readiness Level 4',
    ],
  ])(
    'flags a current-level claim that contradicts the rating: %s',
    (text, mention) => {
      expect(check(text).levelMismatches).toEqual([
        expect.stringContaining(`States ${mention}`),
      ]);
    },
  );

  it('does not treat a target level as a claim', () => {
    expect(
      check('To progress to IRL 2, draft a funding hypothesis.')
        .levelMismatches,
    ).toEqual([]);
  });

  it('ignores a dimension that has no rating', () => {
    expect(check('At MRL 5 with paid subscriptions').levelMismatches).toEqual(
      [],
    );
  });

  it('flags figures absent from the sources, with commas and words normalized', () => {
    expect(
      check('PHP 5000 MRR across 6 facilities and 40 clinics, 25% growth')
        .unsupportedNumbers,
    ).toEqual(['40', '25']);
  });

  it.each([
    'To reach ARL 6, run 10 structured interviews.',
    'Validate demand with 10 interviews.',
    'The team needs to sign 4 paid pilots.',
  ])('does not check figures in a recommendation: %s', (text) => {
    expect(check(text).unsupportedNumbers).toEqual([]);
  });

  it('still checks the state sentence before a recommendation', () => {
    expect(
      check('Live across 9 facilities. To reach MRL 6, add 20 more.')
        .unsupportedNumbers,
    ).toEqual(['9']);
  });

  it('does not count level digits as cited figures', () => {
    expect(
      check('To reach TRL 9, harden the platform.').unsupportedNumbers,
    ).toEqual([]);
  });
});

describe('sourceTextOf', () => {
  it('flattens nested fields and survives a cycle', () => {
    const capsule: Record<string, unknown> = {
      title: 'MediSync',
      historicalTimeline: [
        { monthYear: 'June 2025', description: 'Pilot at 2 sites' },
      ],
    };
    capsule.self = capsule;
    expect(sourceTextOf(capsule)).toBe('MediSync\nJune 2025\nPilot at 2 sites');
  });
});

describe('OutputValidatorService with facts', () => {
  const validator = new OutputValidatorService();

  it('marks a contradicting recommendation unverifiable with both reasons', () => {
    const verdict = validator.validate({
      content: '<p>Currently at IRL 3 with 40 investors lined up.</p>',
      retrievalLowConfidence: false,
      facts: MEDISYNC,
    });
    expect(verdict.validationStatus).toBe('unverifiable');
    expect(verdict.notes).toContain('States IRL 3, but Investment is rated 1.');
    expect(verdict.notes).toContain('Cites 40, not found');
  });

  it('still prefers the length flag', () => {
    const verdict = validator.validate({
      content: 'Currently at IRL 3',
      retrievalLowConfidence: false,
      maxLength: 5,
      facts: MEDISYNC,
    });
    expect(verdict.validationStatus).toBe('flagged');
  });

  it('validates when no facts are given', () => {
    expect(
      validator.validate({ content: 'At IRL 3', retrievalLowConfidence: false })
        .validationStatus,
    ).toBe('validated');
  });
});
