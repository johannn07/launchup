import { EntityManager } from '@mikro-orm/core';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ReadinessLevel } from './entities/readiness-level.entity';
import { ReadinessType } from './entities/enums/readiness-type.enum';

/** See RagCorpusSeederService for why two `../` is tried before three. */
const twoUp = join(__dirname, '../data/rag-corpus');
const DATA_DIR = existsSync(twoUp)
  ? twoUp
  : join(__dirname, '../../data/rag-corpus');

interface RubricRow {
  readinessType: ReadinessType;
  level: number;
  title: string;
}

/**
 * "TRL 1 — Basic principles observed" -> "Basic principles observed".
 *
 * radio.svelte renders "Level {level} - {name}", so carrying the corpus
 * prefix through would print the number twice.
 */
export function readinessLevelName(title: string): string {
  return title.replace(/^[A-Z]{3} \d+ — /, '');
}

function loadRubrics(): RubricRow[] {
  return JSON.parse(
    readFileSync(join(DATA_DIR, 'readiness-rubrics.json'), 'utf8'),
  );
}

/**
 * Backfills `readiness_levels.name` from the corpus descriptors.
 *
 * 49 of the 54 rows named themselves after their own number — 41 as
 * "{Type} Readiness Level {n}" and 8 as "Seeded {type} level {n}" from
 * `ensureReadinessLevelExists` — so anything rendering `name` as a descriptor
 * showed a restatement of the level. Real descriptor text has existed in
 * `data/rag-corpus/readiness-rubrics.json` since the corpus landed.
 *
 * Reconciles row by row rather than guarding on emptiness, because the table
 * is never empty and no UI edits these names — `name` is read-only everywhere
 * it is rendered. A level the corpus does not cover keeps whatever it has;
 * blanking it would be worse than a stale name.
 */
export async function seedReadinessLevelNames(
  em: EntityManager,
  rows: RubricRow[] = loadRubrics(),
): Promise<{ updated: number; unchanged: number; missing: number }> {
  const byDimensionAndLevel = new Map(
    rows.map((row) => [`${row.readinessType}:${row.level}`, row]),
  );

  const levels = await em.find(ReadinessLevel, {});

  let updated = 0;
  let unchanged = 0;
  let missing = 0;

  for (const level of levels) {
    const row = byDimensionAndLevel.get(
      `${level.readinessType}:${level.level}`,
    );

    if (!row) {
      missing += 1;
      continue;
    }

    const name = readinessLevelName(row.title);
    if (level.name === name) {
      unchanged += 1;
      continue;
    }

    level.name = name;
    updated += 1;
  }

  await em.flush();

  return { updated, unchanged, missing };
}
