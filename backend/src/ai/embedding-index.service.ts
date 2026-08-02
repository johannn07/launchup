import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { RagContext } from 'src/entities/rag-context.entity';
import { VectorEmbedding } from 'src/entities/vector-embeddings.entity';
import { EmbeddingService } from './embedding.service';

/**
 * The only corpus: rows of `rag_contexts`. RagQueryService still looks for a
 * `source_type: 'startup'` from an earlier design, but a startup's retrievable
 * text *is* its capsule proposal, already stored as a rag_context — embedding
 * it under two source types would let two vectors of the same sentence drift
 * apart. Ownership lives in metadata.startupId instead.
 */
export const RAG_CONTEXT_SOURCE = 'rag_context';

/**
 * Owns writes to `vector_embeddings`. Separate from EmbeddingService so that
 * one stays a pure Gemini client with no DB dependency, and stays mockable.
 */
@Injectable()
export class EmbeddingIndexService {
  private readonly logger = new Logger(EmbeddingIndexService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly embeddings: EmbeddingService,
  ) {}

  /**
   * Title goes in with the body: titles carry the domain noun ("referral
   * coordination") the body only implies, and queries are built from names.
   */
  private textFor(context: RagContext): string {
    return `${context.title}\n\n${context.content}`.trim();
  }

  /**
   * Returns whether a vector was stored. Callers treat false as "retrieval
   * won't see this row yet", not as an error — see EmbeddingService.embed.
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
   * @param em Explicit because indexRagContext runs in a request and needs the
   *   contextual instance, while backfill runs at boot and needs a fork —
   *   MikroORM rejects global-instance writes outside a request context.
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
   * Embed every context row that has no vector yet. `rag_contexts` was written
   * long before anything embedded it, so on an existing database the corpus
   * starts fully unindexed and semantic retrieval returns nothing.
   *
   * @param limit Caps one invocation, since each row costs an API call.
   */
  async backfill(limit = 200): Promise<{ indexed: number; skipped: number; total: number }> {
    // Boot-time path — no request context, so the injected global EM is rejected.
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

    // Batched, not N calls: per-call latency dominates and the free-tier quota
    // counts requests.
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
