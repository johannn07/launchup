import { EntityManager } from '@mikro-orm/core';
import { RagQueryService } from './rag-query.service';
import { EmbeddingService } from '../ai/embedding.service';
import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { AiPipelineConfig } from '../ai/ai-config.types';
import { RUBRIC_SOURCE_TYPE, FRAMEWORK_SOURCE_TYPE } from '../ai/rag-corpus.types';

const config = (over: Partial<AiPipelineConfig> = {}): AiPipelineConfig => ({
  model: 'test-model',
  temperature: 0,
  grounding: true,
  rag: true,
  ragStrategy: 'semantic',
  ragCorpus: true,
  rubricMode: 'deterministic',
  biasReview: true,
  scoreNormalization: true,
  ...over,
});

const rubricRow = (key: string, type: ReadinessType, level: number) => ({
  sourceType: RUBRIC_SOURCE_TYPE,
  title: `${key} title`,
  content: `${key} content`,
  metadata: { key, readinessType: type, level, provenance: 'standard', citation: 'a source' },
});

const emDouble = (opts: { ormRows?: unknown[]; sqlRows?: unknown[] } = {}) => {
  const execute = jest.fn().mockResolvedValue(opts.sqlRows ?? []);
  const find = jest.fn().mockResolvedValue(opts.ormRows ?? []);
  const findOne = jest.fn().mockResolvedValue(null);
  const persistAndFlush = jest.fn().mockResolvedValue(undefined);
  return {
    em: {
      find,
      findOne,
      create: jest.fn((_e, d) => d),
      persistAndFlush,
      getReference: jest.fn((_e, id) => ({ id })),
      getConnection: () => ({ execute }),
    } as unknown as EntityManager,
    execute,
    find,
    findOne,
    persistAndFlush,
  };
};

const build = (em: EntityManager, embed = jest.fn()) =>
  new RagQueryService(em, { embed } as unknown as EmbeddingService);

const dims = [{ readinessType: ReadinessType.T, level: 3 }];

describe('RagQueryService — rubric channel', () => {
  it('retrieves the current level and the next one by exact key', async () => {
    const { em, find } = emDouble({
      ormRows: [
        rubricRow('trl-3', ReadinessType.T, 3),
        rubricRow('trl-4', ReadinessType.T, 4),
        rubricRow('trl-9', ReadinessType.T, 9),
        rubricRow('mrl-3', ReadinessType.M, 3),
      ],
    });

    const result = await build(em).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(find).toHaveBeenCalledWith(expect.anything(), { sourceType: RUBRIC_SOURCE_TYPE });
    expect(result.verifiedFrameworks.map((f) => f.title)).toEqual(['trl-3 title', 'trl-4 title']);
  });

  it('clamps the next level at 9 rather than asking for a level 10 that cannot exist', async () => {
    const { em } = emDouble({ ormRows: [rubricRow('trl-9', ReadinessType.T, 9)] });

    const result = await build(em).queryVectorDatabase('1', {
      config: config(),
      dimensions: [{ readinessType: ReadinessType.T, level: 9 }],
    });

    expect(result.verifiedFrameworks).toHaveLength(1);
    expect(result.verifiedFrameworks[0].title).toBe('trl-9 title');
  });

  it('carries provenance and citation through to the caller', async () => {
    // SRS 2.2 requires a confidence/validity indicator; it is derived from these.
    const { em } = emDouble({ ormRows: [rubricRow('trl-3', ReadinessType.T, 3)] });

    const result = await build(em).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(result.verifiedFrameworks[0]).toMatchObject({
      provenance: 'standard',
      citation: 'a source',
      content: 'trl-3 content',
    });
  });

  it('does not embed anything in deterministic mode', async () => {
    const embed = jest.fn();
    const { em } = emDouble({ ormRows: [rubricRow('trl-3', ReadinessType.T, 3)] });

    await build(em, embed).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(embed).not.toHaveBeenCalled();
  });

  it('uses the vector path in semantic mode, scoped to rubric rows', async () => {
    const embed = jest.fn().mockResolvedValue([0.1, 0.2]);
    const { em, execute } = emDouble({
      sqlRows: [
        {
          source_type: RUBRIC_SOURCE_TYPE,
          title: 'trl-3 title',
          content: 'trl-3 content',
          metadata: { provenance: 'standard', citation: 'a source' },
          similarity: 0.9,
        },
      ],
    });

    const result = await build(em, embed).queryVectorDatabase('1', {
      config: config({ rubricMode: 'semantic' }),
      dimensions: dims,
    });

    expect(embed).toHaveBeenCalled();
    expect(execute.mock.calls.some((c) => c[1]?.includes(RUBRIC_SOURCE_TYPE))).toBe(true);
    expect(result.verifiedFrameworks[0].title).toBe('trl-3 title');
  });

  it('drops semantic rubric hits below the similarity floor', async () => {
    const embed = jest.fn().mockResolvedValue([0.1, 0.2]);
    const { em } = emDouble({
      sqlRows: [
        { source_type: RUBRIC_SOURCE_TYPE, title: 'far', content: 'far', metadata: {}, similarity: 0.4 },
      ],
    });

    const result = await build(em, embed).queryVectorDatabase('1', {
      config: config({ rubricMode: 'semantic' }),
      dimensions: dims,
    });

    expect(result.verifiedFrameworks).toEqual([]);
  });

  it('returns no rubrics when the corpus is disabled', async () => {
    const { em, find } = emDouble({ ormRows: [rubricRow('trl-3', ReadinessType.T, 3)] });

    const result = await build(em).queryVectorDatabase('1', {
      config: config({ ragCorpus: false }),
      dimensions: dims,
    });

    expect(result.verifiedFrameworks).toEqual([]);
    expect(find).not.toHaveBeenCalledWith(expect.anything(), { sourceType: RUBRIC_SOURCE_TYPE });
  });
});

describe('RagQueryService — lowConfidence', () => {
  it('is false when rubrics were found even with no peers', async () => {
    // Flagging low confidence whenever no peer cleared the floor would mark a
    // rubric-grounded generation unreliable and train users to ignore it.
    const { em } = emDouble({ ormRows: [rubricRow('trl-3', ReadinessType.T, 3)] });

    const result = await build(em).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(result.similarProfiles).toEqual([]);
    expect(result.lowConfidence).toBe(false);
  });

  it('is true only when all three channels are empty', async () => {
    const { em } = emDouble({ ormRows: [], sqlRows: [] });

    const result = await build(em).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(result.lowConfidence).toBe(true);
  });
});

const peerSqlRow = (startupId: number, similarity = 0.9) => ({
  startup_id: startupId,
  title: 'peer title',
  content: 'peer content',
  source_type: 'capsule_proposal',
  similarity,
});

describe('RagQueryService — AI_RAG_ENABLED gating (peer channel)', () => {
  // queryVectorDatabase used to read only config.ragCorpus and always run
  // retrievePeers, so AI_RAG_ENABLED never reached RNA/RNS generation and the
  // "no retrieval" baseline arm was never produced.
  it('does not query peers when rag is disabled', async () => {
    const { em, execute } = emDouble({ sqlRows: [peerSqlRow(2)] });

    const result = await build(em).queryVectorDatabase('1', {
      config: config({ rag: false, ragCorpus: false }),
      dimensions: dims,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.similarProfiles).toEqual([]);
  });

  it('still queries peers when rag is enabled, independent of the corpus flag', async () => {
    const { em, execute } = emDouble({ sqlRows: [peerSqlRow(2)] });

    const result = await build(em).queryVectorDatabase('1', {
      config: config({ rag: true, ragCorpus: false }),
      dimensions: dims,
    });

    expect(execute).toHaveBeenCalled();
    expect(result.similarProfiles).toHaveLength(1);
    expect(result.similarProfiles[0].startupId).toBe(2);
  });

  it('leaves the rubric and framework channels gated on ragCorpus, not rag', async () => {
    const { em, find } = emDouble({ ormRows: [rubricRow('trl-3', ReadinessType.T, 3)] });

    const result = await build(em).queryVectorDatabase('1', {
      config: config({ rag: false, ragCorpus: true }),
      dimensions: dims,
    });

    expect(find).toHaveBeenCalledWith(expect.anything(), { sourceType: RUBRIC_SOURCE_TYPE });
    expect(result.verifiedFrameworks).toHaveLength(1);
  });
});

describe('RagQueryService — readinessType on RetrievedDoc', () => {
  // RNS loops per RNA but fetches the rubric channel once for every dimension
  // in the call, so without knowing a row's dimension the loop cannot filter
  // out the other dimensions' rubrics.
  it('carries readinessType through the deterministic exact-key path', async () => {
    const { em } = emDouble({ ormRows: [rubricRow('trl-3', ReadinessType.T, 3)] });

    const result = await build(em).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(result.verifiedFrameworks[0].readinessType).toBe(ReadinessType.T);
  });

  it('carries readinessType through the semantic vector path', async () => {
    const embed = jest.fn().mockResolvedValue([0.1, 0.2]);
    const { em } = emDouble({
      sqlRows: [
        {
          source_type: RUBRIC_SOURCE_TYPE,
          title: 'trl-3 title',
          content: 'trl-3 content',
          metadata: { provenance: 'standard', citation: 'a source', readinessType: ReadinessType.T },
          similarity: 0.9,
        },
      ],
    });

    const result = await build(em, embed).queryVectorDatabase('1', {
      config: config({ rubricMode: 'semantic' }),
      dimensions: dims,
    });

    expect(result.verifiedFrameworks[0].readinessType).toBe(ReadinessType.T);
  });
});

describe('RagQueryService — channel_counts persistence', () => {
  it('reaches persistAndFlush on the log row', async () => {
    const { em, persistAndFlush } = emDouble({
      ormRows: [rubricRow('trl-3', ReadinessType.T, 3), rubricRow('trl-4', ReadinessType.T, 4)],
      sqlRows: [peerSqlRow(2)],
    });

    await build(em).queryVectorDatabase('1', { config: config(), dimensions: dims });

    expect(persistAndFlush).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_counts: { rubrics: 2, frameworks: 0, peers: 1 },
      }),
    );
  });
});
