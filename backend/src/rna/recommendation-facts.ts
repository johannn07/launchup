import { ReadinessType } from 'src/entities/enums/readiness-type.enum';

/**
 * SRS 2.2: checks a recommendation against the startup's rated levels and the
 * text it was generated from. Pure, so it runs the same on stored rows.
 *
 * Only "at <level>" phrases are claims about the present; "to TRL 5" is the
 * target and is not checked.
 */

const ABBREVIATION: Record<string, ReadinessType> = {
  TRL: ReadinessType.T,
  MRL: ReadinessType.M,
  RRL: ReadinessType.R,
  ARL: ReadinessType.A,
  ORL: ReadinessType.O,
  IRL: ReadinessType.I,
};

// "Adoption" is the SRS's name for Acceptance.
const DIMENSION_WORD =
  /(Technology|Market|Regulatory|Acceptance|Adoption|Organizational|Investment)\s+Readiness\s+Level/i;

const LEVEL_MENTION = new RegExp(
  `\\b(?:(TRL|MRL|RRL|ARL|ORL|IRL)|${DIMENSION_WORD.source})\\s*(\\d)\\b`,
  'gi',
);

// Up to three words between "at" and the level, e.g. "at the TRL 7".
const AT_BEFORE = /\bat\s+(?:\S+\s+){0,2}$/i;

const RECOMMENDATION_CUE =
  /\b(?:to\s+(?:reach|advance|progress|move|transition|achieve|get)|needs?|must|should|requires?|recommend\w*|aims?\s+to|targets?)\b/i;

// The verbs stored RNAs open recommendations with; an unlisted one is checked.
const IMPERATIVE_START =
  /^\s*(?:validate|conduct|run|secure|establish|draft|build|develop|hire|recruit|formalize|complete|launch|expand|document|track|acquire|engage|register|file|define|create|implement|test|pilot|sign|obtain|prepare|identify|begin|start|set)\b/i;

const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  fifteen: '15',
  twenty: '20',
  thirty: '30',
  fifty: '50',
  hundred: '100',
};

export interface FactCheckInput {
  content: string;
  ratedLevels: Partial<Record<ReadinessType, number>>;
  /** Everything the prompt stated about the startup. */
  sourceText: string;
}

export interface FactCheckResult {
  levelMismatches: string[];
  unsupportedNumbers: string[];
}

const typeOf = (abbr: string | undefined, word: string | undefined) => {
  if (abbr) return ABBREVIATION[abbr.toUpperCase()];
  const w = word!.toLowerCase();
  if (w === 'adoption') return ReadinessType.A;
  return Object.values(ReadinessType).find((t) => t.toLowerCase() === w);
};

const numbersIn = (text: string): Set<string> => {
  const found = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    found.add(m[0].replace(/,/g, '').replace(/\.0+$/, ''));
  }
  for (const m of text.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    if (NUMBER_WORDS[m[0]]) found.add(NUMBER_WORDS[m[0]]);
  }
  return found;
};

export function checkRecommendationFacts({
  content,
  ratedLevels,
  sourceText,
}: FactCheckInput): FactCheckResult {
  const levelMismatches: string[] = [];
  // Level numbers are blanked before the number check: they come from the
  // scale, not from the startup's documents.
  let withoutLevels = content;

  for (const m of content.matchAll(LEVEL_MENTION)) {
    const [mention, abbr, word, digit] = m;
    withoutLevels = withoutLevels.replace(mention, ' ');
    const type = typeOf(abbr, word);
    if (!type) continue;
    const before = content.slice(0, m.index);
    if (!AT_BEFORE.test(before)) continue;
    const rated = ratedLevels[type];
    const stated = Number(digit);
    if (rated !== undefined && rated !== stated) {
      levelMismatches.push(
        `States ${mention.trim()}, but ${type} is rated ${rated}.`,
      );
    }
  }

  // Figures in a recommendation are targets, not claims, so only sentences
  // describing the present are checked. Ambiguity resolves to not flagging.
  const claims = withoutLevels
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !RECOMMENDATION_CUE.test(s) && !IMPERATIVE_START.test(s))
    .join(' ');
  const known = numbersIn(sourceText);
  const unsupportedNumbers = [
    ...numbersIn(claims.replace(/\b[a-z]+\b/gi, ' ')),
  ].filter((n) => !known.has(n));

  return { levelMismatches, unsupportedNumbers };
}

/** Flattens a capsule proposal into the text the prompt was built from. */
export function sourceTextOf(...parts: unknown[]): string {
  const out: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
    else if (typeof v === 'object' && !seen.has(v)) {
      seen.add(v);
      (Array.isArray(v) ? v : Object.values(v)).forEach(walk);
    }
  };
  parts.forEach(walk);
  return out.join('\n');
}
