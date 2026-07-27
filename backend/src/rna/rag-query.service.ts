import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { RagRetrievalLog } from '../entities/rag-retrieval-log.entity';
import { Startup } from '../entities/startup.entity';
import { RAG_CONTEXT_SOURCE } from '../ai/embedding-index.service';
import { RAG_MIN_SIMILARITY, RAG_TOP_K } from '../ai/ai.service';

export interface RAGContext {
  verifiedFrameworks: any[];
  businessModels: any[];
  similarProfiles: any[];
  lowConfidence: boolean;
}

const EMPTY_CONTEXT: RAGContext = {
  verifiedFrameworks: [],
  businessModels: [],
  similarProfiles: [],
  lowConfidence: true,
};

/**
 * Finds startups whose stored text is nearest to a given startup's.
 *
 * Two things changed here when embeddings started being written:
 *
 * 1. The corpus. This used to look for `source_type = 'startup'`, which nothing
 *    has ever written — so it always returned empty with lowConfidence, and the
 *    RNA/RNS prompts were "grounded" in nothing. Vectors live under
 *    'rag_context'; a startup is reached through that row's startup_id.
 *
 * 2. Where the similarity is computed. It used to load every embedding into
 *    Node and sort in JS. At 768 float4 per row that is ~3KB transferred per
 *    candidate to pick three, and it cannot use an index. pgvector's `<=>`
 *    does it in the database.
 */
@Injectable()
export class RagQueryService {
  private readonly logger = new Logger(RagQueryService.name);

  constructor(private readonly em: EntityManager) {}

  async queryVectorDatabase(startupId: string): Promise<RAGContext> {
    const id = Number(startupId);
    if (!Number.isInteger(id)) {
      this.logger.warn(`Ignoring non-numeric startup id "${startupId}"`);
      return EMPTY_CONTEXT;
    }

    const rows = await this.em.getConnection().execute<
      {
        startup_id: number;
        title: string;
        source_type: string;
        similarity: number;
      }[]
    >(
      // The subquery is this startup's own vector, used as the query point.
      // Ordering happens against `other.embedding` so the index on that column
      // is what does the work.
      `with source as (
         select ve.embedding
           from vector_embeddings ve
           join rag_contexts rc on rc.id = ve.source_id::int
          where ve.source_type = ? and rc.startup_id = ?
          order by ve.id desc
          limit 1
       )
       select rc.startup_id, rc.title, rc.source_type,
              1 - (ve.embedding <=> (select embedding from source)) as similarity
         from vector_embeddings ve
         join rag_contexts rc on rc.id = ve.source_id::int
        where ve.source_type = ?
          and rc.startup_id is not null
          and rc.startup_id <> ?
          and exists (select 1 from source)
        order by ve.embedding <=> (select embedding from source)
        limit ?`,
      [RAG_CONTEXT_SOURCE, id, RAG_CONTEXT_SOURCE, id, RAG_TOP_K],
    );

    const similarProfiles = rows
      .filter((row) => row.similarity >= RAG_MIN_SIMILARITY)
      .map((row) => ({
        source_id: String(row.startup_id),
        similarity: row.similarity,
        metadata: { title: row.title, sourceType: row.source_type },
      }));

    // Report low confidence whenever nothing cleared the floor, including when
    // this startup has no vector of its own — a caller that cannot distinguish
    // "no matches" from "not indexed" would present an ungrounded generation
    // as a grounded one.
    const lowConfidence = similarProfiles.length === 0;

    await this.logRetrieval(
      startupId,
      similarProfiles.length,
      lowConfidence ? 'low' : 'high',
      lowConfidence,
      similarProfiles.map((profile) => Number(profile.source_id)),
    );

    return {
      verifiedFrameworks: [],
      businessModels: [],
      similarProfiles,
      lowConfidence,
    };
  }

  async logRetrieval(
    startupId: string,
    resultCount: number,
    confidenceLevel: string,
    lowConfidenceFlagged: boolean,
    retrievedProfileIds: number[],
  ): Promise<void> {
    const log = this.em.create(RagRetrievalLog, {
      startup: this.em.getReference(Startup, Number(startupId)),
      result_count: resultCount,
      confidence_level: confidenceLevel,
      low_confidence_flagged: lowConfidenceFlagged,
      retrieved_profile_ids: retrievedProfileIds,
      retrieved_at: new Date(),
    });
    await this.em.persistAndFlush(log);
  }
}
