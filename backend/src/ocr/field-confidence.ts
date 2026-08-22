/**
 * Objective 3a. How confident are we that an extracted field reflects the
 * document, rather than the model filling a blank?
 *
 * What this replaces: `text.length < 40 ? 'low' : 'verified'`. The extraction
 * prompt orders the model to never leave a field empty, to infer one when the
 * document doesn't contain it, and to write "at least 40 characters" — so the
 * old rule rewarded exactly the behaviour it should have caught. A wholly
 * invented field scored `verified`.
 *
 * The signal now available: Gemini returns `raw_transcription`, a verbatim read
 * of the page, alongside the eight fields. A field grounded in the document
 * reuses its words; an inferred one does not.
 *
 * `scope` is the case to think about — it has no section in either sample
 * capsule proposal, so it is invented on every extraction.
 */

/** Vocabulary is fixed: the frontend renders these as green / amber / rose badges. */
export type FieldConfidence = 'verified' | 'low' | 'failed';

// Function words carry no evidence — a field sharing only "the" and "of" with
// the page is not grounded in it.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in',
  'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
  'were', 'will', 'with', 'we', 'our', 'their', 'they',
]);

/** Content words, lowercased, punctuation stripped. Digits kept — figures are evidence. */
export function tokenize(text: string): Set<string> {
  const words = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Share of the field's content words that also appear in the transcription.
 *
 * Returns null when the field has no content words to check — borrowed from
 * `measurement/lib/field-overlap.js`, where 0/0 must never read as 1. An
 * unscoreable field is an absent observation, not a perfect match.
 */
export function supportRatio(fieldText: string, transcription: string): number | null {
  const fieldTokens = tokenize(fieldText);
  if (fieldTokens.size === 0) return null;

  const pageTokens = tokenize(transcription);
  let shared = 0;
  for (const token of fieldTokens) if (pageTokens.has(token)) shared += 1;
  return shared / fieldTokens.size;
}

/**
 * PROVISIONAL, and deliberately so — 0.5 is a guess, not a measurement. There is
 * no handwriting dataset to calibrate against yet; objective 3c's harness is
 * what replaces this number with one that was measured. Do not cite it.
 */
export const SUPPORT_THRESHOLD = 0.5;

/**
 * Three states, and the split is only ever between "we checked it" and "we
 * couldn't". `failed` keeps its existing meaning — nothing was extracted — so
 * an unsupported field reads `low`, not `failed`: the text exists, the evidence
 * for it doesn't.
 *
 * Everything unverifiable also lands on `low`, because the alternative is
 * claiming `verified` on something never checked, which is the failure this
 * whole rule replaces. A PDF has no transcription; so does a page whose OCR
 * failed. Neither earns a green badge.
 *
 * @param fieldText     one extracted field's value
 * @param transcription raw_transcription, or '' when unavailable
 */
export function classifyField(
  fieldText: string,
  transcription: string,
): FieldConfidence {
  if (!String(fieldText ?? '').trim()) return 'failed';
  if (!String(transcription ?? '').trim()) return 'low';

  const ratio = supportRatio(fieldText, transcription);
  if (ratio === null) return 'low';

  return ratio >= SUPPORT_THRESHOLD ? 'verified' : 'low';
}

/** Applies classifyField across the extracted fields. No decisions here. */
export function scoreFields(
  fields: Record<string, string>,
  transcription: string,
): Record<string, FieldConfidence> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      classifyField(String(value ?? ''), transcription),
    ]),
  );
}
