import { Type } from '@mikro-orm/core';

/**
 * Dimension of every vector in `vector_embeddings`. Lives next to the column
 * definition because the column is what enforces it; EmbeddingService imports
 * it so the API request and the column cannot drift.
 *
 * 768, not the model's native 3072, because pgvector caps hnsw and ivfflat at
 * 2000 dimensions — at 3072 the column could never be ANN-indexed (verified
 * against pgvector 0.8.1, 2026-07-27).
 *
 * Changing it requires re-embedding every row. Different-dimension vectors are
 * not comparable, so a half-migrated table returns meaningless rankings rather
 * than erroring.
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
    // pgvector returns the literal '[0.1,0.2,...]'. Guard the already-parsed
    // case so a re-hydrated entity isn't mangled into NaNs by the string path.
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
