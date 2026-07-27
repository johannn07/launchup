import { Type } from '@mikro-orm/core';

/**
 * Dimension of every vector stored in `vector_embeddings`.
 *
 * It lives here, next to the column definition, because the column type is the
 * thing that actually enforces it — Postgres rejects a vector of the wrong
 * length at insert. EmbeddingService imports this constant so the API request
 * and the column can never drift apart.
 *
 * 768 and not the embedding model's native 3072 because pgvector caps hnsw and
 * ivfflat at 2000 dimensions; at 3072 the column could never be ANN-indexed.
 * Verified against this database (pgvector 0.8.1) on 2026-07-27.
 *
 * Changing this requires re-embedding every existing row. Vectors of different
 * dimensions are not comparable, so a half-migrated table does not error — it
 * quietly returns meaningless similarity rankings.
 */
export const EMBEDDING_DIMENSIONS = 768;

export class VectorType extends Type<number[] | null, string | null> {
  convertToDatabaseValue(value: number[] | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return `[${value.join(',')}]`;
  }

  convertToJSValue(value: string | number[] | null | undefined): number[] | null {
    if (value === null || value === undefined) {
      return null;
    }
    // pgvector comes back as the literal '[0.1,0.2,...]'. Guard against an
    // already-parsed array so a re-hydrated entity does not get mangled into
    // a list of NaN by the string path below.
    if (Array.isArray(value)) {
      return value;
    }
    const inner = value.slice(1, -1);
    return inner.length ? inner.split(',').map(Number) : [];
  }

  getColumnType(): string {
    return `vector(${EMBEDDING_DIMENSIONS})`;
  }
}
