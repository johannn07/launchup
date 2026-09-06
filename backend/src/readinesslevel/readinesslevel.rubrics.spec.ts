import { ReadinesslevelService } from './readinesslevel.service';
import { RagContext } from 'src/entities/rag-context.entity';
import { RUBRIC_SOURCE_TYPE } from '../ai/rag-corpus.types';
import { ReadinessType } from 'src/entities/enums/readiness-type.enum';

type Row = Partial<RagContext>;

function buildService(rows: Row[]) {
  const em = {
    find: jest.fn((entity: unknown, where: { sourceType?: string }) => {
      if (entity !== RagContext) return Promise.resolve([]);
      return Promise.resolve(
        rows.filter((row) => row.sourceType === where.sourceType),
      );
    }),
  };

  return new ReadinesslevelService(em as never);
}

function rubricRow(type: ReadinessType, level: number, extra: object = {}): Row {
  return {
    sourceType: RUBRIC_SOURCE_TYPE,
    title: `${type} ${level} title`,
    content: `${type} ${level} descriptor`,
    metadata: {
      key: `k-${type}-${level}`,
      readinessType: type,
      level,
      provenance: 'framework-derived',
      citation: 'BRLa (2021)',
      sourceUrl: 'https://example.test',
      keyTerms: [],
      ...extra,
    },
  };
}

describe('ReadinesslevelService.getReadinessRubrics', () => {
  it('flattens the rubric metadata alongside the text', async () => {
    const service = buildService([rubricRow(ReadinessType.T, 1)]);

    const [rubric] = await service.getReadinessRubrics();

    expect(rubric).toEqual({
      readinessType: 'Technology',
      level: 1,
      title: 'Technology 1 title',
      content: 'Technology 1 descriptor',
      provenance: 'framework-derived',
      citation: 'BRLa (2021)',
      sourceUrl: 'https://example.test',
    });
  });

  it('orders levels ascending within a dimension', async () => {
    const service = buildService([
      rubricRow(ReadinessType.M, 7),
      rubricRow(ReadinessType.M, 2),
      rubricRow(ReadinessType.M, 9),
    ]);

    const levels = (await service.getReadinessRubrics()).map((r) => r.level);

    expect(levels).toEqual([2, 7, 9]);
  });

  it('groups dimensions together rather than interleaving them', async () => {
    const service = buildService([
      rubricRow(ReadinessType.I, 1),
      rubricRow(ReadinessType.T, 1),
      rubricRow(ReadinessType.I, 2),
      rubricRow(ReadinessType.T, 2),
    ]);

    const types = (await service.getReadinessRubrics()).map((r) => r.readinessType);

    expect(types).toEqual(['Technology', 'Technology', 'Investment', 'Investment']);
  });

  // The table also holds capsule proposals and business frameworks.
  it('reads only rubric rows', async () => {
    const service = buildService([
      rubricRow(ReadinessType.T, 1),
      { sourceType: 'capsule_proposal', title: 'a startup', content: 'x' },
      { sourceType: 'business_framework', title: 'a framework', content: 'y' },
    ]);

    const rubrics = await service.getReadinessRubrics();

    expect(rubrics).toHaveLength(1);
    expect(rubrics[0].readinessType).toBe('Technology');
  });

  // A row without a dimension or level cannot be attached to a picker.
  it('skips rows missing a readiness type or level', async () => {
    const service = buildService([
      rubricRow(ReadinessType.T, 1),
      { ...rubricRow(ReadinessType.T, 2), metadata: { key: 'no-type' } },
    ]);

    await expect(service.getReadinessRubrics()).resolves.toHaveLength(1);
  });

  it('returns nothing when the corpus is not seeded', async () => {
    const service = buildService([]);

    await expect(service.getReadinessRubrics()).resolves.toEqual([]);
  });
});
