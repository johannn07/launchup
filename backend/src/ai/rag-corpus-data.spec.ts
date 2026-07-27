import { readFileSync } from 'fs';
import { join } from 'path';
import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { rubricKey, PROVENANCES, MAX_READINESS_LEVEL } from './rag-corpus.types';

const load = (file: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../data/rag-corpus', file), 'utf8'));

describe('readiness-rubrics.json', () => {
  const rows = load('readiness-rubrics.json');

  it('covers every dimension at every level exactly once', () => {
    const expected = Object.values(ReadinessType).flatMap((type) =>
      Array.from({ length: MAX_READINESS_LEVEL }, (_, i) => rubricKey(type, i + 1)),
    );
    expect(rows).toHaveLength(expected.length);
    expect(rows.map((r) => r.key).sort()).toEqual(expected.sort());
  });

  it('gives every row a key matching its own readinessType and level', () => {
    // A mismatched key is the one error deterministic retrieval cannot survive:
    // it would silently return another dimension's rubric.
    for (const row of rows) {
      expect(row.key).toBe(rubricKey(row.readinessType, row.level));
    }
  });

  it('uses only the three provenance values, and cites anything not authored', () => {
    for (const row of rows) {
      expect(PROVENANCES).toContain(row.provenance);
      if (row.provenance === 'authored') {
        expect(row.citation).toBeNull();
      } else {
        expect(typeof row.citation).toBe('string');
        expect(row.citation.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every row substantive content and key terms', () => {
    for (const row of rows) {
      expect(row.title.length).toBeGreaterThan(0);
      // Short enough to be a placeholder is short enough to be a bug.
      expect(row.content.length).toBeGreaterThan(120);
      expect(Array.isArray(row.keyTerms)).toBe(true);
      expect(row.keyTerms.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('marks Technology as standard and Investment as authored', () => {
    const byType = (t: ReadinessType) => rows.filter((r) => r.readinessType === t);
    for (const row of byType(ReadinessType.T)) {
      expect(row.provenance).toBe('standard');
    }
    // IRL is not in the specification's five dimensions and has no external
    // source; it is seeded only because the code still requests it.
    for (const row of byType(ReadinessType.I)) {
      expect(row.provenance).toBe('authored');
    }
  });
});
