import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { RagContext } from 'src/entities/rag-context.entity';
import { VectorEmbedding } from 'src/entities/vector-embeddings.entity';
import { EmbeddingService } from './embedding.service';

/**
 * Source type for every vector this service writes.
 *
 * There is exactly one corpus: the rows of `rag_contexts`. An earlier design
 * implied a second one — RagQueryService looks for `source_type: 'startup'` —
 * but a startup's retrievable text *is* its capsule proposal, which is already
 * stored as a rag_context. Embedding it twice under two source types would mean
 * two vectors of the same sentence drifting apart as the text is edited.
 * Ownership is carried in metadata.startupId instead.
 */
export const RAG_CONTEXT_SOURCE = 'rag_context';

/**
 * Owns writes to `vector_embeddings`. Kept separate from EmbeddingService so
 * that one stays a pure Gemini client with no database dependency, which is
 * what makes it trivially mockable in the retrieval tests.
 */
@Injectable()
export class EmbeddingIndexService {
  private readonly logger = new Logger(EmbeddingIndexService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly embeddings: EmbeddingService,
  ) {}

  /**
   * The text we actually embed for a context row.
   *
   * Title is included with the body because titles carry the domain noun
   * ("referral coordination", "cooperative market access") that the body often
   * only implies, and retrieval queries are built from startup names.
   */
  private textFor(context: RagContext): string {
    return `${context.title}\n\n${context.content}`.trim();
  }

  /**
   * Embed one context row and store the vector, replacing any vector already
   * held for it.
   *
   * Returns whether a vector was stored. Callers treat false as "retrieval will
   * not see this row yet", not as an error — see EmbeddingService.embed.
   */
  async indexRagContext(context: RagContext): Promise<boolean> {
    const vector = await this.embeddings.embed(this.textFor(context));
    if (!vector) {
      this.logger.warn(`No embedding produced for rag_context ${context.id}; not indexed`);
      return false;
    }

    await this.store(this.em, context, vector);
    return true;
  }

  /**
   * @param em The EntityManager to write through. Passed explicitly because
   *   indexRagContext runs inside a request and must use the contextual
   *   instance, while backfill runs at boot and must use a fork — MikroORM
   *   rejects global-instance writes outside a request context.
   */
  private async store(
    em: EntityManager,
    context: RagContext,
    vector: number[],
  ): Promise<void> {
    const sourceId = String(context.id);
    // Replace rather than update-in-place: the row is derived data, and a
    // delete+insert cannot leave a stale vector paired with fresh metadata.
    const existing = await em.find(VectorEmbedding, {
      source_type: RAG_CONTEXT_SOURCE,
      source_id: sourceId,
    });
    for (const row of existing) {
      em.remove(row);
    }

    em.create(VectorEmbedding, {
      source_type: RAG_CONTEXT_SOURCE,
      source_id: sourceId,
      embedding: vector,
      metadata: {
        startupId: context.startup?.id ?? null,
        sourceType: context.sourceType,
        title: context.title,
        model: this.embeddings.model,
      },
      created_at: new Date(),
    });

    await em.flush();
  }

  /**
   * Embed every context row that has no vector yet.
   *
   * Exists because `rag_contexts` has been written since long before anything
   * embedded it, so on any existing database the corpus starts out entirely
   * unindexed and semantic retrieval would return nothing at all.
   *
   * @param limit Caps one invocation, since each row costs an API call.
   */
  async backfill(limit = 200): Promise<{ indexed: number; skipped: number; total: number }> {
    // Boot-time call path, so there is no request context and the injected
    // global EntityManager would be rejected outright.
    const em = this.em.fork();

    const indexedIds = (
      await em.find(
        VectorEmbedding,
        { source_type: RAG_CONTEXT_SOURCE },
        { fields: ['source_id'] },
      )
    ).map((row) => Number(row.source_id));

    const pending = await em.find(
      RagContext,
      indexedIds.length ? { id: { $nin: indexedIds } } : {},
      { limit, orderBy: { id: 'ASC' } },
    );

    if (!pending.length) {
      return { indexed: 0, skipped: 0, total: 0 };
    }

    // One batched request rather than N, because the per-call latency dominates
    // and the free-tier quota is counted in requests.
    const vectors = await this.embeddings.embedBatch(pending.map((c) => this.textFor(c)));

    let indexed = 0;
    let skipped = 0;
    for (const [position, context] of pending.entries()) {
      const vector = vectors[position];
      if (!vector) {
        skipped += 1;
        continue;
      }
      await this.store(em, context, vector);
      indexed += 1;
    }

    this.logger.log(
      `Backfilled ${indexed} of ${pending.length} rag_contexts (${skipped} skipped)`,
    );
    return { indexed, skipped, total: pending.length };
  }
}
