import { ReadinessType } from './entities/enums/readiness-type.enum';
import {
  readinessLevelName,
  seedReadinessLevelNames,
} from './seed-readiness-level-names';

const rubric = (readinessType: ReadinessType, level: number, title: string) => ({
  readinessType,
  level,
  title,
});

function buildEm(levels: { readinessType: ReadinessType; level: number; name: string }[]) {
  return {
    find: jest.fn().mockResolvedValue(levels),
    flush: jest.fn().mockResolvedValue(undefined),
  };
}

describe('readinessLevelName', () => {
  it('strips the dimension prefix the render site already supplies', () => {
    // radio.svelte renders "Level {level} - {name}", so keeping "TRL 1 — "
    // would print the number twice.
    expect(readinessLevelName('TRL 1 — Basic principles observed')).toBe(
      'Basic principles observed',
    );
  });

  it('keeps a title that does not carry the prefix', () => {
    expect(readinessLevelName('Something else entirely')).toBe(
      'Something else entirely',
    );
  });

  it('keeps an em dash that appears later in the descriptor', () => {
    expect(
      readinessLevelName('IRL 4 — Term sheet — non-binding — received'),
    ).toBe('Term sheet — non-binding — received');
  });
});

describe('seedReadinessLevelNames', () => {
  it('replaces a name that only restates the level number', async () => {
    const level = {
      readinessType: ReadinessType.T,
      level: 1,
      name: 'Technology Readiness Level 1',
    };
    const em = buildEm([level]);

    const result = await seedReadinessLevelNames(em as never, [
      rubric(ReadinessType.T, 1, 'TRL 1 — Basic principles observed'),
    ]);

    expect(level.name).toBe('Basic principles observed');
    expect(result.updated).toBe(1);
    expect(em.flush).toHaveBeenCalled();
  });

  it('replaces a Seeded placeholder', async () => {
    const level = {
      readinessType: ReadinessType.I,
      level: 3,
      name: 'Seeded Investment level 3',
    };
    const em = buildEm([level]);

    await seedReadinessLevelNames(em as never, [
      rubric(ReadinessType.I, 3, 'IRL 3 — Funding plan drafted'),
    ]);

    expect(level.name).toBe('Funding plan drafted');
  });

  it('matches on dimension as well as level', async () => {
    const market = {
      readinessType: ReadinessType.M,
      level: 1,
      name: 'Market Readiness Level 1',
    };
    const em = buildEm([market]);

    await seedReadinessLevelNames(em as never, [
      rubric(ReadinessType.T, 1, 'TRL 1 — Basic principles observed'),
      rubric(ReadinessType.M, 1, 'MRL 1 — Problem hypothesis only'),
    ]);

    expect(market.name).toBe('Problem hypothesis only');
  });

  it('reports nothing updated on a second run', async () => {
    const level = {
      readinessType: ReadinessType.T,
      level: 1,
      name: 'Technology Readiness Level 1',
    };
    const rows = [rubric(ReadinessType.T, 1, 'TRL 1 — Basic principles observed')];

    await seedReadinessLevelNames(buildEm([level]) as never, rows);
    const second = await seedReadinessLevelNames(buildEm([level]) as never, rows);

    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(1);
  });

  it('leaves a level the corpus does not cover alone rather than blanking it', async () => {
    const level = {
      readinessType: ReadinessType.R,
      level: 9,
      name: 'Regulatory Readiness Level 9',
    };
    const em = buildEm([level]);

    const result = await seedReadinessLevelNames(em as never, []);

    expect(level.name).toBe('Regulatory Readiness Level 9');
    expect(result.missing).toBe(1);
    expect(result.updated).toBe(0);
  });
});
