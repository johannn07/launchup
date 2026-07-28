import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { rubricKey, MAX_READINESS_LEVEL } from './rag-corpus.types';

describe('rubricKey', () => {
  it('uses the specification abbreviation, not the enum value', () => {
    // The documents say TRL/MRL/RRL/ARL/ORL. Keys read back in review, so they
    // should match the vocabulary a reader already has.
    expect(rubricKey(ReadinessType.T, 3)).toBe('trl-3');
    expect(rubricKey(ReadinessType.M, 1)).toBe('mrl-1');
    expect(rubricKey(ReadinessType.R, 9)).toBe('rrl-9');
    expect(rubricKey(ReadinessType.A, 5)).toBe('arl-5');
    expect(rubricKey(ReadinessType.O, 2)).toBe('orl-2');
    expect(rubricKey(ReadinessType.I, 7)).toBe('irl-7');
  });

  it('covers every ReadinessType, so a new dimension cannot be silently unkeyed', () => {
    for (const type of Object.values(ReadinessType)) {
      expect(rubricKey(type, 1)).toMatch(/^[a-z]{3}-1$/);
    }
  });

  it('caps levels at 9', () => {
    expect(MAX_READINESS_LEVEL).toBe(9);
  });
});
