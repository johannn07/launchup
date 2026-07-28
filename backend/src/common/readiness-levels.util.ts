import { ReadinessType } from '../entities/enums/readiness-type.enum';

/** Shape shared by StartupReadinessLevel and any DTO that mirrors it. */
export interface StartupReadinessLevelLike {
  readinessLevel: { readinessType: ReadinessType | string; level: number };
}

export interface ReadinessLevelsByType {
  T: number;
  M: number;
  A: number;
  O: number;
  R: number;
  I: number;
}

/**
 * Keyed by ReadinessType rather than array position: `em.find(StartupReadinessLevel, ...)`
 * has no `orderBy`, so rows can come back in any order (insertion order, which
 * differs between the live DB and a freshly-seeded one). A positional read
 * (`levels[0]`, `levels[1]`, ...) would silently mislabel dimensions — e.g.
 * Acceptance data read as Technology — whenever insertion order doesn't match
 * declaration order. A keyed lookup cannot regress that way even if ordering
 * changes again.
 *
 * Shared by ai.service.ts's createBasePrompt and rns.service.ts's
 * generateTasks/refineRnsDescription, all three of which previously
 * duplicated (or, for the latter two, never fixed) this exact lookup.
 */
export function readinessLevelsByType(
  levels: StartupReadinessLevelLike[],
): ReadinessLevelsByType {
  const levelByType = new Map<string, number>();
  for (const srl of levels) {
    levelByType.set(srl.readinessLevel.readinessType, srl.readinessLevel.level);
  }
  return {
    T: levelByType.get(ReadinessType.T) ?? 0,
    M: levelByType.get(ReadinessType.M) ?? 0,
    A: levelByType.get(ReadinessType.A) ?? 0,
    O: levelByType.get(ReadinessType.O) ?? 0,
    R: levelByType.get(ReadinessType.R) ?? 0,
    I: levelByType.get(ReadinessType.I) ?? 0,
  };
}
