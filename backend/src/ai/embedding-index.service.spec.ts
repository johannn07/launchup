import { EntityManager } from '@mikro-orm/core';
import { RagContext } from 'src/entities/rag-context.entity';
import { VectorEmbedding } from 'src/entities/vector-embeddings.entity';
import { EmbeddingIndexService, RAG_CONTEXT_SOURCE } from './embedding-index.service';
import { EmbeddingService, EMBEDDING_DIMENSIONS } from './embedding.service';

const vector = (tag: number) => [tag, ...Array(EMBEDDING_DIMENSIONS - 1).fill(0)];

const context = (over: Partial<RagContext> = {}) =>
  ({
    id: 1,
    title: 'MediSync Cebu',
    content: 'Referral coordination for provincial clinics.',
    sourceType: 'capsule_proposal',
    startup: { id: 7 },
    ...over,
  }) as RagContext;

/**
 * Minimal EntityManager double. `find` is queue-driven so a test can script
 * successive calls: existing vectors, then pending contexts.
 */
const emDouble = () => {
  const findResults: unknown[][] = [];
  const created: Record<string, unknown>[] = [];
  const removed: unknown[] = [];
  const calls: { entity: unknown; where: unknown }[] = [];

  const em: Record<string, jest.Mock> = {
    // backfill must fork (MikroORM rejects global-instance writes outside a
    // request). The double returns itself so assertions see one call log.
    fork: jest.fn(() => em),
    find: jest.fn(async (entity: unknown, where: unknown) => {
      calls.push({ entity, where });
      return findResults.shift() ?? [];
    }),
    create: jest.fn((_entity: unknown, data: Record<string, unknown>) => {
      created.push(data);
      return data;
    }),
    remove: jest.fn((row: unknown) => removed.push(row)),
    flush: jest.fn(async () => undefined),
  };

  return { em: em as unknown as EntityManager, findResults, created, removed, calls, raw: em };
};

const embeddingsDouble = (impl: Partial<EmbeddingService> = {}) =>
  ({
    model: 'gemini-embedding-2',
    embed: jest.fn().mockResolvedValue(vector(1)),
    embedBatch: jest.fn().mockResolvedValue([vector(1)]),
    ...impl,
  }) as unknown as EmbeddingService;

describe('EmbeddingIndexService', () => {
  beforeEach(() => {
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('indexRagContext', () => {
    it('embeds title and content together', async () => {
      const { em } = emDouble();
      const embeddings = embeddingsDouble();

      await new EmbeddingIndexService(em, embeddings).indexRagContext(context());

      const text = (embeddings.embed as jest.Mock).mock.calls[0][0];
      expect(text).toContain('MediSync Cebu');
      expect(text).toContain('Referral coordination');
    });

    it('stores the vector under the rag_context source with its startup id', async () => {
      const { em, created } = emDouble();

      const stored = await new EmbeddingIndexService(em, embeddingsDouble()).indexRagContext(
        context(),
      );

      expect(stored).toBe(true);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        source_type: RAG_CONTEXT_SOURCE,
        source_id: '1',
        embedding: expect.any(Array),
        metadata: expect.objectContaining({ startupId: 7, model: 'gemini-embedding-2' }),
      });
    });

    it('records a null startup id for a context that belongs to no startup', async () => {
      const { em, created } = emDouble();

      await new EmbeddingIndexService(em, embeddingsDouble()).indexRagContext(
        context({ startup: undefined }),
      );

      expect((created[0].metadata as Record<string, unknown>).startupId).toBeNull();
    });

    it('replaces an existing vector rather than adding a second one', async () => {
      // Two vectors for one row would both surface in retrieval, letting a
      // stale copy of edited text keep winning.
      const { em, findResults, created, removed } = emDouble();
      const stale = { id: 99 } as VectorEmbedding;
      findResults.push([stale]);

      await new EmbeddingIndexService(em, embeddingsDouble()).indexRagContext(context());

      expect(removed).toEqual([stale]);
      expect(created).toHaveLength(1);
    });

    it('reports failure and writes nothing when no embedding comes back', async () => {
      const { em, created } = emDouble();
      const embeddings = embeddingsDouble({
        embed: jest.fn().mockResolvedValue(null) as never,
      });

      const stored = await new EmbeddingIndexService(em, embeddings).indexRagContext(context());

      expect(stored).toBe(false);
      expect(created).toHaveLength(0);
    });
  });

  describe('backfill', () => {
    it('forks the EntityManager, because it runs outside a request context', async () => {
      // Regression: the first version used the injected global EM and every
      // boot threw "Using global EntityManager instance methods … is
      // disallowed". No mocked-EM test caught it, so assert the fork directly.
      const { em, raw, findResults } = emDouble();
      findResults.push([]);
      findResults.push([]);

      await new EmbeddingIndexService(em, embeddingsDouble()).backfill();

      expect(raw.fork).toHaveBeenCalled();
    });

    it('does not fork for a single index inside a request', async () => {
      const { em, raw } = emDouble();

      await new EmbeddingIndexService(em, embeddingsDouble()).indexRagContext(context());

      expect(raw.fork).not.toHaveBeenCalled();
    });

    it('excludes rows that already have a vector', async () => {
      const { em, findResults, calls } = emDouble();
      findResults.push([{ source_id: '4' }, { source_id: '9' }]); // already indexed
      findResults.push([]); // nothing pending

      await new EmbeddingIndexService(em, embeddingsDouble()).backfill();

      expect(calls[1].where).toEqual({ id: { $nin: [4, 9] } });
    });

    it('does not send an empty $nin when nothing is indexed yet', async () => {
      // `{ id: { $nin: [] } }` is a filter that matches nothing in some drivers,
      // which would make the first-ever backfill silently index zero rows.
      const { em, findResults, calls } = emDouble();
      findResults.push([]);
      findResults.push([]);

      await new EmbeddingIndexService(em, embeddingsDouble()).backfill();

      expect(calls[1].where).toEqual({});
    });

    it('uses a single batched request for all pending rows', async () => {
      const { em, findResults } = emDouble();
      findResults.push([]);
      findResults.push([context({ id: 1 }), context({ id: 2 })]);
      const embeddings = embeddingsDouble({
        embedBatch: jest.fn().mockResolvedValue([vector(1), vector(2)]) as never,
      });

      const result = await new EmbeddingIndexService(em, embeddings).backfill();

      expect(embeddings.embedBatch).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ indexed: 2, skipped: 0, total: 2 });
    });

    it('skips only the rows whose embedding failed', async () => {
      const { em, findResults, created } = emDouble();
      findResults.push([]);
      findResults.push([context({ id: 1 }), context({ id: 2 }), context({ id: 3 })]);
      const embeddings = embeddingsDouble({
        embedBatch: jest.fn().mockResolvedValue([vector(1), null, vector(3)]) as never,
      });

      const result = await new EmbeddingIndexService(em, embeddings).backfill();

      expect(result).toEqual({ indexed: 2, skipped: 1, total: 3 });
      expect(created.map((row) => row.source_id)).toEqual(['1', '3']);
    });

    it('makes no API call when nothing is pending', async () => {
      const { em, findResults } = emDouble();
      findResults.push([{ source_id: '1' }]);
      findResults.push([]);
      const embeddings = embeddingsDouble();

      const result = await new EmbeddingIndexService(em, embeddings).backfill();

      expect(embeddings.embedBatch).not.toHaveBeenCalled();
      expect(result).toEqual({ indexed: 0, skipped: 0, total: 0 });
    });
  });
});
