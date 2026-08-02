import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { RagRetrievalLog } from '../entities/rag-retrieval-log.entity';
import { RagContext } from '../entities/rag-context.entity';
import { Startup } from '../entities/startup.entity';
import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { RAG_CONTEXT_SOURCE } from '../ai/embedding-index.service';
import { RAG_MIN_SIMILARITY, RAG_TOP_K } from '../ai/ai.service';
import { EmbeddingService } from '../ai/embedding.service';
import { AiPipelineConfig } from '../ai/ai-config.types';
import {
  CorpusRowMetadata,
  FRAMEWORK_SOURCE_TYPE,
  MAX_READINESS_LEVEL,
  RUBRIC_SOURCE_TYPE,
  rubricKey,
} from '../ai/rag-corpus.types';

export interface RetrievedDoc {
  sourceType: string;
  title: string;
  content: string;
  provenance?: string;
  citation?: string;
  similarity?: number;
  startupId?: number;
  /** Rubric rows only — the dimension this row's rubric text describes. */
  readinessType?: ReadinessType;
}

/**
 * The three retrieval channels SDD §3.2 specifies: "verified startup
 * frameworks, business model references, and contextually similar prior
 * validated profiles" — here rubrics, frameworks and peers respectively.
 */
export interface RAGContext {
  verifiedFrameworks: RetrievedDoc[];
  businessModels: RetrievedDoc[];
  similarProfiles: RetrievedDoc[];
  lowConfidence: boolean;
}

export interface RagQueryOptions {
  config: AiPipelineConfig;
  /** Dimensions being generated for. Drives the rubric channel's key lookup. */
  dimensions?: { readinessType: ReadinessType; level: number }[];
}

export interface ChannelCounts {
  rubrics: number;
  frameworks: number;
  peers: number;
}

const EMPTY_CONTEXT: RAGContext = {
  verifiedFrameworks: [],
  businessModels: [],
  similarProfiles: [],
  lowConfidence: true,
};

@Injectable()
export class RagQueryService {
  private readonly logger = new Logger(RagQueryService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly embeddings: EmbeddingService,
  ) {}

  async queryVectorDatabase(
    startupId: string,
    opts?: RagQueryOptions,
  ): Promise<RAGContext> {
    const id = Number(startupId);
    if (!Number.isInteger(id)) {
      this.logger.warn(`Ignoring non-numeric startup id "${startupId}"`);
      return EMPTY_CONTEXT;
    }

    const corpusOn = opts?.config?.ragCorpus ?? false;
    // Honoured here too, not just in ai.service.ts — otherwise disabling
    // AI_RAG_ENABLED still left RNA/RNS fully augmented through the peer
    // channel, and the "no retrieval" baseline arm was never actually produced.
    const ragOn = opts?.config?.rag ?? false;

    const verifiedFrameworks = corpusOn ? await this.retrieveRubrics(opts!) : [];
    const businessModels = corpusOn ? await this.retrieveFrameworks(id) : [];
    const similarProfiles = ragOn ? await this.retrievePeers(id) : [];

    // SRS §2.2's low-confidence flag, keyed on all three channels rather than
    // peers alone — flagging a rubric-grounded generation just because no peer
    // cleared the floor teaches users to ignore the indicator.
    const lowConfidence =
      verifiedFrameworks.length === 0 &&
      businessModels.length === 0 &&
      similarProfiles.length === 0;

    await this.logRetrieval(
      startupId,
      verifiedFrameworks.length + businessModels.length + similarProfiles.length,
      lowConfidence ? 'low' : 'high',
      lowConfidence,
      similarProfiles.map((p) => p.startupId!).filter(Number.isInteger),
      {
        rubrics: verifiedFrameworks.length,
        frameworks: businessModels.length,
        peers: similarProfiles.length,
      },
    );

    return { verifiedFrameworks, businessModels, similarProfiles, lowConfidence };
  }

  /**
   * Channel 1 — readiness rubrics. Deterministic by default: the right context
   * for a Technology assessment at level 3 is the TRL 3 and TRL 4 rubric,
   * whatever its cosine distance to the capsule proposal. See RubricMode in
   * ai-config.types.ts for why `semantic` exists and what it measured.
   */
  private async retrieveRubrics(opts: RagQueryOptions): Promise<RetrievedDoc[]> {
    const dimensions = opts.dimensions ?? [];
    if (dimensions.length === 0) {
      return [];
    }

    if (opts.config.rubricMode === 'semantic') {
      return this.searchCorpus(RUBRIC_SOURCE_TYPE, dimensions.map((d) => d.readinessType).join(' '));
    }

    const wanted = new Set<string>();
    for (const { readinessType, level } of dimensions) {
      wanted.add(rubricKey(readinessType, level));
      wanted.add(rubricKey(readinessType, Math.min(level + 1, MAX_READINESS_LEVEL)));
    }

    // 54 short rows — in-memory filtering avoids a Postgres-specific JSON query.
    const rows = await this.em.find(RagContext, { sourceType: RUBRIC_SOURCE_TYPE });
    return rows
      .filter((row) => wanted.has((row.metadata as CorpusRowMetadata | undefined)?.key ?? ''))
      .map((row) => this.toDoc(row));
  }

  /** Channel 2 — business frameworks, always semantic. */
  private async retrieveFrameworks(startupId: number): Promise<RetrievedDoc[]> {
    const startup = await this.em.findOne(Startup, { id: startupId }, { populate: ['capsuleProposal'] });
    const query = [
      startup?.name ?? '',
      startup?.capsuleProposal?.description ?? '',
      startup?.capsuleProposal?.targetMarket ?? '',
    ].join(' ').trim();
    if (!query) {
      return [];
    }
    return this.searchCorpus(FRAMEWORK_SOURCE_TYPE, query, 2);
  }

  /** Vector search restricted to one corpus population. */
  private async searchCorpus(
    sourceType: string,
    query: string,
    limit = 2,
  ): Promise<RetrievedDoc[]> {
    const vector = await this.embeddings.embed(query);
    if (!vector) {
      return [];
    }

    const literal = `[${vector.join(',')}]`;
    const rows = await this.em.getConnection().execute<
      {
        source_type: string;
        title: string;
        content: string;
        metadata: CorpusRowMetadata | null;
        similarity: number;
      }[]
    >(
      `select rc.source_type, rc.title, rc.content, rc.metadata,
              1 - (ve.embedding <=> ?::vector) as similarity
         from vector_embeddings ve
         join rag_contexts rc on rc.id = ve.source_id::int
        where ve.source_type = ? and rc.source_type = ?
        order by ve.embedding <=> ?::vector
        limit ?`,
      [literal, RAG_CONTEXT_SOURCE, sourceType, literal, limit],
    );

    return rows
      .filter((row) => row.similarity >= RAG_MIN_SIMILARITY)
      .map((row) => ({
        sourceType: row.source_type,
        title: row.title,
        content: row.content,
        provenance: row.metadata?.provenance,
        citation: row.metadata?.citation ?? undefined,
        similarity: row.similarity,
        readinessType: row.metadata?.readinessType,
      }));
  }

  /** Channel 3 — peer startups. */
  private async retrievePeers(id: number): Promise<RetrievedDoc[]> {
    const rows = await this.em.getConnection().execute<
      {
        startup_id: number;
        title: string;
        content: string;
        source_type: string;
        similarity: number;
      }[]
    >(
      `with source as (
         select ve.embedding
           from vector_embeddings ve
           join rag_contexts rc on rc.id = ve.source_id::int
          where ve.source_type = ? and rc.startup_id = ?
          order by ve.id desc
          limit 1
       )
       select rc.startup_id, rc.title, rc.content, rc.source_type,
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

    return rows
      .filter((row) => row.similarity >= RAG_MIN_SIMILARITY)
      .map((row) => ({
        sourceType: row.source_type,
        title: row.title,
        content: row.content,
        similarity: row.similarity,
        startupId: row.startup_id,
      }));
  }

  private toDoc(row: RagContext): RetrievedDoc {
    const metadata = row.metadata as CorpusRowMetadata | undefined;
    return {
      sourceType: row.sourceType,
      title: row.title,
      content: row.content,
      provenance: metadata?.provenance,
      citation: metadata?.citation ?? undefined,
      readinessType: metadata?.readinessType,
    };
  }

  async logRetrieval(
    startupId: string,
    resultCount: number,
    confidenceLevel: string,
    lowConfidenceFlagged: boolean,
    retrievedProfileIds: number[],
    channelCounts?: ChannelCounts,
  ): Promise<void> {
    const log = this.em.create(RagRetrievalLog, {
      startup: this.em.getReference(Startup, Number(startupId)),
      result_count: resultCount,
      confidence_level: confidenceLevel,
      low_confidence_flagged: lowConfidenceFlagged,
      retrieved_profile_ids: retrievedProfileIds,
      // A single total cannot distinguish "the rubric was missing" from "no
      // peer cleared the floor", and those call for opposite fixes.
      channel_counts: channelCounts ?? null,
      retrieved_at: new Date(),
    });
    await this.em.persistAndFlush(log);
  }
}
