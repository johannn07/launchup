import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { RagContext } from '../entities/rag-context.entity';
import { VectorEmbedding } from '../entities/vector-embeddings.entity';
import { EmbeddingIndexService, RAG_CONTEXT_SOURCE } from './embedding-index.service';
import {
  CorpusRowMetadata,
  FRAMEWORK_SOURCE_TYPE,
  RUBRIC_SOURCE_TYPE,
} from './rag-corpus.types';

export interface SeedResult {
  created: number;
  updated: number;
  unchanged: number;
  /**
   * Row present with identical content but no vector — repaired, not left
   * "unchanged" forever. A crash, spent quota, or missing GEMINI_API_KEY
   * mid-run leaves exactly this: row landed, embedding never ran. Retrieval
   * joins rag_contexts to vector_embeddings, so it would never see the row.
   */
  reindexed: number;
  embedded: number;
  /**
   * `indexRagContext` threw on its vector-write path — not the "no embedding
   * produced" case, which it reports by returning `false` and which shows up
   * as embedded < created+updated+reindexed. Counted per-row so one failure
   * can't abort the batch before `seed()` returns.
   */
  failed: number;
}

export interface CorpusFileRow extends CorpusRowMetadata {
  title: string;
  content: string;
}

/**
 * Two `../` reach `backend/data` from `src/ai/` and from a `dist/ai/` build,
 * but `nest build` emits to `dist/src/ai/` here (a `.ts` sits at the backend
 * root), needing a third. Try two, fall back to three.
 */
const twoUp = join(__dirname, '../../data/rag-corpus');
const DATA_DIR = existsSync(twoUp) ? twoUp : join(__dirname, '../../../data/rag-corpus');

/**
 * Loads the checked-in corpus into `rag_contexts` and indexes it.
 *
 * A service rather than logic in seed-rag-corpus.js so the upsert rules stay
 * unit-testable — above all "unchanged means no embedding call", which is what
 * makes re-running safe. Embedding costs quota, and a seeder nobody dares
 * re-run is a corpus that drifts from its data files.
 */
@Injectable()
export class RagCorpusSeederService {
  private readonly logger = new Logger(RagCorpusSeederService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly embeddingIndex: EmbeddingIndexService,
  ) {}

  // Callers must wrap this in `RequestContext.create(orm.em, …)`. seed-rag-corpus.js
  // runs under createApplicationContext, which has no request scope, and MikroORM's
  // injected EntityManager rejects use outside one — here and inside
  // EmbeddingIndexService, which holds its own instance. The wrapper resolves both
  // to one per-call fork, so these methods stay plain request-scoped services.
  async seed(): Promise<SeedResult> {
    const rubrics = this.load('readiness-rubrics.json');
    const frameworks = this.load('business-frameworks.json');

    const a = await this.seedRows(RUBRIC_SOURCE_TYPE, rubrics);
    const b = await this.seedRows(FRAMEWORK_SOURCE_TYPE, frameworks);

    const total: SeedResult = {
      created: a.created + b.created,
      updated: a.updated + b.updated,
      unchanged: a.unchanged + b.unchanged,
      reindexed: a.reindexed + b.reindexed,
      embedded: a.embedded + b.embedded,
      failed: a.failed + b.failed,
    };
    this.logger.log(
      `Corpus seeded: ${total.created} created, ${total.updated} updated, ` +
        `${total.unchanged} unchanged, ${total.reindexed} reindexed, ${total.embedded} embedded, ` +
        `${total.failed} failed`,
    );
    return total;
  }

  private load(file: string): CorpusFileRow[] {
    return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
  }

  async seedRows(sourceType: string, rows: CorpusFileRow[]): Promise<SeedResult> {
    const existing = await this.em.find(RagContext, { sourceType });
    const byKey = new Map<string, RagContext>();
    for (const context of existing) {
      const key = (context.metadata as CorpusRowMetadata | undefined)?.key;
      if (key) {
        byKey.set(key, context);
      }
    }

    // Content comparison can't tell whether a row was ever vectored, so check
    // that separately — see `reindexed` on SeedResult.
    const vectors = await this.em.find(VectorEmbedding, { source_type: RAG_CONTEXT_SOURCE });
    const vectoredIds = new Set(vectors.map((v) => v.source_id));

    const result: SeedResult = {
      created: 0,
      updated: 0,
      unchanged: 0,
      reindexed: 0,
      embedded: 0,
      failed: 0,
    };
    const toIndex: RagContext[] = [];

    for (const row of rows) {
      const { title, content, ...metadata } = row;
      const current = byKey.get(row.key);

      if (!current) {
        const created = this.em.create(RagContext, {
          sourceType,
          title,
          content,
          metadata: metadata as unknown as Record<string, unknown>,
          confidence: null,
          createdAt: new Date(),
        });
        this.em.persist(created);
        toIndex.push(created);
        result.created += 1;
        continue;
      }

      // Title and content both, since the vector is derived from both.
      // Metadata is not — it never reaches the embedding.
      const changed = current.content !== content || current.title !== title;
      current.title = title;
      current.content = content;
      current.metadata = metadata as unknown as Record<string, unknown>;

      if (changed) {
        this.em.persist(current);
        toIndex.push(current);
        result.updated += 1;
      } else if (!vectoredIds.has(String(current.id))) {
        toIndex.push(current);
        result.reindexed += 1;
      } else {
        result.unchanged += 1;
      }
    }

    await this.em.flush();

    for (const context of toIndex) {
      // Isolated per row: one failure here must not abort the batch, or the
      // caller never sees `result` at all.
      try {
        if (await this.embeddingIndex.indexRagContext(context)) {
          result.embedded += 1;
        }
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          `Failed to index rag_context ${context.id} ("${context.title}"): ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result;
  }
}
