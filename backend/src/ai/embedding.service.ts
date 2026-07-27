import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMBEDDING_DIMENSIONS } from '../common/types/vector-type';

export { EMBEDDING_DIMENSIONS };

/**
 * `gemini-embedding-2`, not `gemini-embedding-001`, on two measurements against
 * this key (2026-07-27):
 *
 *  - Retrieval margin. Scoring one relevant and one irrelevant document against
 *    the same query, embedding-2 separated them by 0.082 at 768 dims vs 0.070
 *    for -001. Small, but the right direction, and -001 is the older model.
 *  - Truncation safety. embedding-2 returns unit-normalised vectors at 768 dims
 *    (norm 1.0000). -001 returns norm 0.5891 at 768 — it truncates without
 *    re-normalising, so cosine still works but inner-product distance silently
 *    does not. That is a footgun we do not need to carry.
 *
 * Note that embedding-2 ignores `taskType` entirely: RETRIEVAL_DOCUMENT and
 * RETRIEVAL_QUERY returned bit-identical vectors (cosine 1.000000) for the same
 * text, where -001 returned different ones (cosine 0.917). So there is no
 * asymmetric doc/query encoding to get right here, and we do not send taskType.
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
   * Embed one text. Returns null rather than throwing.
   *
   * Callers use this to enrich a prompt, never to produce the answer itself, so
   * an embedding failure should degrade retrieval to "no context found" — the
   * same state the system was in before any of this existed — rather than fail
   * a user's assessment generation. The null is logged, not swallowed silently.
   */
  async embed(text: string): Promise<number[] | null> {
    const [vector] = await this.embedBatch([text]);
    return vector ?? null;
  }

  /**
   * Embed several texts in one request.
   *
   * Blank inputs are dropped before the call and come back as null in their
   * original position, so the result array always lines up index-for-index with
   * the input — callers zip these against entity rows and a silent length
   * change would misattribute vectors to the wrong record.
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
          // Storing a wrong-length vector would be rejected by the column, and
          // any that slipped through would corrupt every later comparison.
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
