import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMBEDDING_DIMENSIONS } from '../common/types/vector-type';

export { EMBEDDING_DIMENSIONS };

/**
 * `gemini-embedding-2` over `-001`, on two measurements against this key
 * (2026-07-27):
 *
 *  - Retrieval margin: separated a relevant from an irrelevant document by
 *    0.082 at 768 dims vs 0.070 for -001.
 *  - Truncation safety: unit-normalised at 768 dims (norm 1.0000), where -001
 *    returns 0.5891 — it truncates without re-normalising, so cosine works but
 *    inner-product distance silently does not.
 *
 * No `taskType` is sent: embedding-2 ignores it, returning bit-identical
 * vectors for RETRIEVAL_DOCUMENT and RETRIEVAL_QUERY (-001 gave cosine 0.917).
 */
const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-2';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly ai: GoogleGenAI;
  readonly model: string;
  readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    this.enabled = Boolean(apiKey);
    this.model =
      this.config.get<string>('AI_EMBEDDING_MODEL') ?? DEFAULT_EMBEDDING_MODEL;
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Returns null rather than throwing. Callers enrich a prompt with this, never
   * produce the answer from it, so a failure degrades retrieval to "no context
   * found" instead of failing the user's generation. Logged, not swallowed.
   */
  async embed(text: string): Promise<number[] | null> {
    const [vector] = await this.embedBatch([text]);
    return vector ?? null;
  }

  /**
   * Blank inputs are dropped from the request but come back as null in place,
   * so the result stays index-for-index with the input — callers zip these
   * against entity rows, and a length change would misattribute vectors.
   */
  async embedBatch(texts: string[]): Promise<(number[] | null)[]> {
    if (!this.enabled) {
      this.logger.warn('GEMINI_API_KEY is not set; skipping embedding');
      return texts.map(() => null);
    }

    const results: (number[] | null)[] = texts.map(() => null);
    const sendable = texts
      .map((text, index) => ({ text: text?.trim() ?? '', index }))
      .filter(({ text }) => text.length > 0);

    if (sendable.length === 0) {
      return results;
    }

    try {
      const response = await this.ai.models.embedContent({
        model: this.model,
        contents: sendable.map(({ text }) => text),
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      });

      const embeddings = response.embeddings ?? [];
      sendable.forEach(({ index }, position) => {
        const values = embeddings[position]?.values;
        if (!values) {
          return;
        }
        if (values.length !== EMBEDDING_DIMENSIONS) {
          // The column rejects wrong-length vectors, and one that slipped
          // through would corrupt every later comparison.
          this.logger.error(
            `${this.model} returned ${values.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
          );
          return;
        }
        results[index] = values;
      });
    } catch (error) {
      this.logger.error(
        `Embedding failed for ${sendable.length} text(s): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return results;
  }
}
