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
    // IRL is not one of the spec's five dimensions and has no external source;
    // it is seeded only because the code still requests it.
    for (const row of byType(ReadinessType.I)) {
      expect(row.provenance).toBe('authored');
    }
  });

  it('marks Market, Regulatory, Acceptance and Organizational as framework-derived', () => {
    // BRLa dimensions authored against a paywalled paper's criteria, not
    // transcribed from a public standard. Without this, a row mislabelled
    // 'standard' passes every other assertion here while claiming an authority
    // the text does not have.
    const byType = (t: ReadinessType) => rows.filter((r) => r.readinessType === t);
    for (const type of [
      ReadinessType.M,
      ReadinessType.R,
      ReadinessType.A,
      ReadinessType.O,
    ]) {
      for (const row of byType(type)) {
        expect(row.provenance).toBe('framework-derived');
      }
    }
  });
});

describe('business-frameworks.json', () => {
  const rows = load('business-frameworks.json');

  it('holds ten rows with unique keys', () => {
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((r) => r.key)).size).toBe(10);
  });

  it('carries no dimension key — these are not retrieved by dimension', () => {
    for (const row of rows) {
      expect(row.readinessType).toBeUndefined();
      expect(row.level).toBeUndefined();
    }
  });

  it('uses only the three provenance values, and cites anything not authored', () => {
    for (const row of rows) {
      expect(PROVENANCES).toContain(row.provenance);
      if (row.provenance === 'authored') {
        expect(row.citation).toBeNull();
      } else {
        expect(typeof row.citation).toBe('string');
      }
    }
  });

  it('gives every row substantive content and key terms', () => {
    for (const row of rows) {
      expect(row.content.length).toBeGreaterThan(200);
      expect(row.keyTerms.length).toBeGreaterThanOrEqual(3);
    }
  });
});
