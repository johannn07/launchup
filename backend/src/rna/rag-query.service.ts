import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { VectorEmbedding } from '../entities/vector-embeddings.entity';
import { RagRetrievalLog } from '../entities/rag-retrieval-log.entity';
import { Startup } from '../entities/startup.entity';

export interface RAGContext {
  verifiedFrameworks: any[];
  businessModels: any[];
  similarProfiles: any[];
  lowConfidence: boolean;
}

@Injectable()
export class RagQueryService {
  constructor(private readonly em: EntityManager) {}

  async queryVectorDatabase(startupId: string): Promise<RAGContext> {
    // 1. Retrieve the embedding for the given startup
    const sourceEmbedding = await this.em.findOne(VectorEmbedding, { source_type: 'startup', source_id: startupId });
    if (!sourceEmbedding) {
      return {
        verifiedFrameworks: [],
        businessModels: [],
        similarProfiles: [],
        lowConfidence: true,
      };
    }

    // 2. Retrieve all other embeddings (excluding this startup)
    const allEmbeddings = await this.em.find(VectorEmbedding, { source_type: 'startup', source_id: { $ne: startupId } });

    // 3. Compute cosine similarity between the source and all others
    function cosineSimilarity(a: number[], b: number[]): number {
      const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
      const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
      const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
      return normA && normB ? dot / (normA * normB) : 0;
    }

    const similarities = allEmbeddings.map(e => ({
      embedding: e,
      similarity: cosineSimilarity(sourceEmbedding.embedding, e.embedding),
    }));

    // 4. Sort by similarity and take top N (e.g., 5)
    const topN = similarities.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
    const similarProfiles = topN.map(item => ({
      source_id: item.embedding.source_id,
      similarity: item.similarity,
      metadata: item.embedding.metadata,
    }));

    // 5. Log the retrieval
    await this.logRetrieval(
      startupId,
      similarProfiles.length,
      topN.length > 0 && topN[0].similarity > 0.7 ? 'high' : 'low',
      topN.length === 0 || (topN[0].similarity < 0.7),
      similarProfiles.map(p => Number(p.source_id)),
    );

    // 6. Return context (verifiedFrameworks/businessModels can be filled in as needed)
    return {
      verifiedFrameworks: [], // TODO: fill with actual data if available
      businessModels: [],     // TODO: fill with actual data if available
      similarProfiles,
      lowConfidence: topN.length === 0 || (topN[0].similarity < 0.7),
    };
  }

  async logRetrieval(startupId: string, resultCount: number, confidenceLevel: string, lowConfidenceFlagged: boolean, retrievedProfileIds: number[]): Promise<void> {
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
