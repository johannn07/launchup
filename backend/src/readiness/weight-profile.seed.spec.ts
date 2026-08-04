import { DIMENSION_KEYS, SEED_WEIGHT_PROFILES } from './readiness.weights';

describe('SEED_WEIGHT_PROFILES', () => {
  it('seeds exactly three profiles', () => {
    // Three, not eight: authoring a profile per sector with no basis would
    // manufacture false specificity.
    expect(SEED_WEIGHT_PROFILES).toHaveLength(3);
  });

  it('includes a global default with both keys null', () => {
    const global = SEED_WEIGHT_PROFILES.find((p) => p.sector === null);

    expect(global).toBeDefined();
    expect(global?.businessModel).toBeNull();
  });

  it.each(SEED_WEIGHT_PROFILES.map((p) => [p.sector ?? 'global', p] as const))(
    'profile %s covers every dimension and sums to 1.0',
    (_label, profile) => {
      for (const key of DIMENSION_KEYS) {
        expect(typeof profile.weights[key]).toBe('number');
      }

      const sum = DIMENSION_KEYS.reduce((total, key) => total + profile.weights[key], 0);
      expect(sum).toBeCloseTo(1, 5);
    },
  );

  it('weights regulatory higher for healthtech than agritech', () => {
    const health = SEED_WEIGHT_PROFILES.find((p) => p.sector === 'healthtech');
    const agri = SEED_WEIGHT_PROFILES.find((p) => p.sector === 'agritech');

    expect(health!.weights.regulatory).toBeGreaterThan(agri!.weights.regulatory);
  });
});
