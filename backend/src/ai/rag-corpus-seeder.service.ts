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
   * Present with byte-identical content, but had no vector yet — repaired
   * rather than left "unchanged" forever. A crash, quota exhaustion, or a
   * missing GEMINI_API_KEY mid-run leaves exactly this state: the row landed
   * but embedding never ran. Content-only change detection would call that
   * row unchanged on every future run and retrieval would never see it,
   * since retrieval joins rag_contexts against vector_embeddings.
   */
  reindexed: number;
  embedded: number;
  /**
   * A row was queued for embedding but `indexRagContext` itself rejected —
   * a DB error in its vector-write path (find/remove/create/flush on
   * VectorEmbedding), not the "no embedding produced" case it already
   * reports by returning `false` (that's counted by embedded being lower
   * than created+updated+reindexed, not here). Isolated per-row so one
   * failure can't abort the whole batch before `seed()` ever returns — the
   * same failure mode, one level deeper, that produced the original 54
   * unvectored rows this task had to repair.
   */
  failed: number;
}

export interface CorpusFileRow extends CorpusRowMetadata {
  title: string;
  content: string;
}

/**
 * Two levels up reaches `backend/data` from source (`src/ai/`) and from a
 * `dist/ai/` build. But `nest build` emits to `dist/src/ai/` in this repo
 * (a `.ts` file sits at the backend root), which needs a third `../` — so try
 * two first and fall back to three rather than hardcoding either.
 */
const twoUp = join(__dirname, '../../data/rag-corpus');
const DATA_DIR = existsSync(twoUp) ? twoUp : join(__dirname, '../../../data/rag-corpus');

/**
 * Loads the checked-in corpus into `rag_contexts` and indexes it.
 *
 * A service rather than logic inside seed-rag-corpus.js so the upsert rules are
 * unit-testable — particularly "unchanged means no embedding call", which is
 * the property that makes re-running safe. Embedding costs quota, and a seeder
 * nobody dares re-run is a corpus that drifts from its data files.
 */
@Injectable()
export class RagCorpusSeederService {
  private readonly logger = new Logger(RagCorpusSeederService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly embeddingIndex: EmbeddingIndexService,
  ) {}

  // seed-rag-corpus.js (the only real caller of `seed`) runs via
  // NestFactory.createApplicationContext, which has no HTTP request scope.
  // MikroORM's injected EntityManager rejects direct use outside one — both
  // here and, more subtly, inside EmbeddingIndexService.indexRagContext,
  // which holds its own separately-injected instance. The runner is
  // responsible for wrapping this call in `RequestContext.create(orm.em, …)`
  // so every injected EntityManager across the whole call graph resolves to
  // the same per-call fork; `seed`/`seedRows` stay written against a plain
  // request-scoped EntityManager, same as any other service in this app.
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

    // A row can exist with byte-identical content yet have no vector at all —
    // exactly what a crash, quota exhaustion, or missing GEMINI_API_KEY
    // mid-run leaves behind. Content comparison alone cannot see that, so
    // check what is actually vectored up front rather than trusting that
    // "the row exists and matches the file" implies "retrieval can see it".
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

      // Only `content` decides whether re-embedding is needed for an edit —
      // the vector is derived from title + content, so a title change counts
      // too. Separately, a row with no change at all may still need its
      // first-ever embedding if an earlier run landed the row but never
      // vectored it.
      const changed = current.content !== content || current.title !== title;
      current.title = title;
      current.content = content;
      current.metadata = metadata as unknown as Record<string, unknown>;

      if (changed) {
        this.em.persist(current);
        toIndex.push(current);
        result.updated += 1;
      } else if (!vectoredIds.has(String(current.id))) {
        // Present, content identical, but never actually embedded — repair
        // it rather than reporting false success.
        toIndex.push(current);
        result.reindexed += 1;
      } else {
        result.unchanged += 1;
      }
    }

    await this.em.flush();

    for (const context of toIndex) {
      // One row's DB write failing inside indexRagContext must not abort the
      // rest of the batch or the caller never sees `result` at all — that
      // would be the same silent-partial-failure shape this task exists to
      // repair, just moved one level deeper into the embed loop itself.
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
