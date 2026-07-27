import { EntityManager } from '@mikro-orm/core';
import { RagCorpusSeederService, CorpusFileRow } from './rag-corpus-seeder.service';
import { EmbeddingIndexService } from './embedding-index.service';
import { VectorEmbedding } from '../entities/vector-embeddings.entity';
import { RUBRIC_SOURCE_TYPE } from './rag-corpus.types';

// Cast rather than annotate: the fields below are plain strings so the
// literals stay easy to override in tests, while the service's real callers
// (the JSON corpus files, loaded via JSON.parse) go through the same
// assertion implicitly since JSON.parse's return type is `any`.
const row = (over: Record<string, unknown> = {}): CorpusFileRow =>
  ({
    key: 'trl-1',
    readinessType: 'Technology',
    level: 1,
    title: 'TRL 1',
    content: 'original content',
    keyTerms: ['a', 'b', 'c'],
    provenance: 'standard',
    citation: 'somewhere',
    ...over,
  }) as unknown as CorpusFileRow;

/**
 * EntityManager double. `find` is entity-aware because seedRows now queries
 * two different entities up front: existing RagContext rows (`existing`) and
 * which of them already have a vector (`vectorSourceIds`, matched against
 * VectorEmbedding.source_id) — the latter is what lets the seeder tell "never
 * embedded" apart from "content unchanged".
 */
const emDouble = (existing: unknown[] = [], vectorSourceIds: string[] = []) => {
  const persist = jest.fn();
  const flush = jest.fn().mockResolvedValue(undefined);
  const create = jest.fn((_entity, data) => ({ ...data, id: 1 }));
  const find = jest.fn((entity: unknown) => {
    if (entity === VectorEmbedding) {
      return Promise.resolve(vectorSourceIds.map((source_id) => ({ source_id })));
    }
    return Promise.resolve(existing);
  });
  return {
    em: { find, create, persist, flush } as unknown as EntityManager,
    persist,
    flush,
    create,
  };
};

const build = (em: EntityManager, index: jest.Mock) =>
  new RagCorpusSeederService(em, { indexRagContext: index } as unknown as EmbeddingIndexService);

describe('RagCorpusSeederService', () => {
  it('creates and embeds a row that does not exist yet', async () => {
    const { em, create } = emDouble([]);
    const index = jest.fn().mockResolvedValue(true);

    const result = await build(em, index).seedRows(RUBRIC_SOURCE_TYPE, [row()]);

    expect(create).toHaveBeenCalled();
    expect(index).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ created: 1, updated: 0, unchanged: 0, embedded: 1 });
  });

  it('leaves an unchanged, already-vectored row alone and does not spend an embedding call', async () => {
    // Embedding costs quota. A no-op re-run must cost nothing, or nobody will
    // re-run the seeder and the corpus will drift from the data files.
    const existing = {
      id: 4,
      sourceType: RUBRIC_SOURCE_TYPE,
      title: 'TRL 1',
      content: 'original content',
      metadata: { key: 'trl-1' },
    };
    // The row already has a vector (source_id '4') — this is the case that
    // should be skipped entirely.
    const { em, create } = emDouble([existing], ['4']);
    const index = jest.fn();

    const result = await build(em, index).seedRows(RUBRIC_SOURCE_TYPE, [row()]);

    expect(create).not.toHaveBeenCalled();
    expect(index).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 1, reindexed: 0, embedded: 0 });
  });

  it('reindexes an existing row with identical content but no vector yet', async () => {
    // This is the state a crash, quota exhaustion, or a missing
    // GEMINI_API_KEY mid-run leaves behind: the row landed in a prior run but
    // was never embedded. Content-only change detection would call this row
    // "unchanged" forever and retrieval would never see it, since retrieval
    // joins rag_contexts against vector_embeddings. That is a real failure
    // this seeder must repair, not silently report as success.
    const existing = {
      id: 4,
      sourceType: RUBRIC_SOURCE_TYPE,
      title: 'TRL 1',
      content: 'original content',
      metadata: { key: 'trl-1' },
    };
    // No vector for source_id '4' — same content, but never actually indexed.
    const { em, create } = emDouble([existing], []);
    const index = jest.fn().mockResolvedValue(true);

    const result = await build(em, index).seedRows(RUBRIC_SOURCE_TYPE, [row()]);

    expect(create).not.toHaveBeenCalled();
    expect(index).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 0,
      reindexed: 1,
      embedded: 1,
    });
  });

  it('re-embeds when the content changed', async () => {
    const existing = {
      id: 4,
      sourceType: RUBRIC_SOURCE_TYPE,
      title: 'TRL 1',
      content: 'stale content',
      metadata: { key: 'trl-1' },
    };
    const { em } = emDouble([existing]);
    const index = jest.fn().mockResolvedValue(true);

    const result = await build(em, index).seedRows(RUBRIC_SOURCE_TYPE, [row()]);

    expect(existing.content).toBe('original content');
    expect(index).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ created: 0, updated: 1, unchanged: 0, embedded: 1 });
  });

  it('matches existing rows by metadata key, not by title', async () => {
    // Titles are editable prose; the key is the identity. Matching on title
    // would create a duplicate row every time a title is reworded.
    const existing = {
      id: 4,
      sourceType: RUBRIC_SOURCE_TYPE,
      title: 'an old title',
      content: 'original content',
      metadata: { key: 'trl-1' },
    };
    const { em, create } = emDouble([existing]);

    const result = await build(em, jest.fn().mockResolvedValue(true)).seedRows(
      RUBRIC_SOURCE_TYPE,
      [row()],
    );

    expect(create).not.toHaveBeenCalled();
    expect(existing.title).toBe('TRL 1');
    expect(result.updated).toBe(1);
  });

  it('reports a row whose embedding failed as not embedded', async () => {
    const { em } = emDouble([]);
    const index = jest.fn().mockResolvedValue(false);

    const result = await build(em, index).seedRows(RUBRIC_SOURCE_TYPE, [row()]);

    expect(result).toMatchObject({ created: 1, embedded: 0 });
  });
});
