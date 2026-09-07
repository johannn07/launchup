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

/**
 * Vocabulary. No state claims verification, because this metric cannot support
 * that claim — see SUPPORT_THRESHOLD.
 *
 * `unsupported` — checked against an independent transcription and the page
 *                 does not carry the words. The only state here that asserts
 *                 anything, and the only one measured to be reliable.
 * `unverified`  — either the check was inconclusive (ratio above the floor) or
 *                 it could not be run at all. Deliberately one state: both mean
 *                 "no finding", and splitting them would invite reading the
 *                 first as a positive result.
 * `failed`      — nothing was extracted.
 */
export type FieldConfidence = 'unsupported' | 'unverified' | 'failed';

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
 * A floor, not a verification line. 0.5 is unchanged; what it means is not.
 *
 * Measured 2026-09-05 on 80 human-labelled observations across 10 handwritten
 * pages (`measurement/README.md`): at 0.5, **sensitivity 100%, specificity
 * 30.8%**. Read directionally, that is one sound claim and one unusable one:
 *
 *   below 0.5 — no grounded field was observed here. Informative.
 *   at or above — 18 of 26 invented fields also land here. Says nothing.
 *
 * So the number stays and the claim goes. Raising it is the tempting move and
 * the wrong one: the classes cross *between* fields — an invented `scope`
 * averages 0.632 against a grounded `methodology`'s 0.575 — because
 * `supportRatio` has a field-dependent baseline. `title` copies page words
 * verbatim and scores 1.000 whether or not anyone checked. The pooled best
 * (0.7879) looks strong only because five fields are grounded on every page and
 * cluster near 1.0; it sorts field types rather than detecting grounding, and
 * its confound-free arm fails the pre-registered gate at specificity 43.8%.
 *
 * Per-field thresholds are the open hypothesis and need their own
 * pre-registered design on new data. Until then, nothing here says "verified".
 */
export const SUPPORT_THRESHOLD = 0.5;

/**
 * Where the transcription came from, which decides whether it is evidence at all.
 *
 * `vision`  — Gemini read the image and returned `raw_transcription` alongside
 *             the fields. Both derive from the page, so a field the page does
 *             not support genuinely fails to match. This is real evidence.
 * `derived` — the fields were extracted *from* this very text (the Tesseract
 *             fallback path). Checking them against it compares the output to
 *             its own input, so overlap is guaranteed and means nothing.
 *
 * Required rather than defaulted: defaulting to `vision` would let a forgotten
 * argument silently restore the bug this parameter exists to prevent.
 */
export type EvidenceSource = 'vision' | 'derived';

/**
 * The only positive finding available is a negative one: this field's words are
 * not on the page. Everything else is `unverified`, including a high ratio.
 *
 * `failed` keeps its existing meaning — nothing was extracted — so an
 * unsupported field is not `failed`: the text exists, the support for it
 * doesn't.
 *
 * Three ways the check cannot run, all `unverified` rather than `unsupported`,
 * because absence of evidence here is not evidence about the page: a PDF has no
 * transcription, a page whose OCR failed has none, and a `derived`
 * transcription is not independent of the fields it would score.
 *
 * @param fieldText     one extracted field's value
 * @param transcription raw_transcription, or '' when unavailable
 * @param source        whether that transcription is independent of the fields
 */
export function classifyField(
  fieldText: string,
  transcription: string,
  source: EvidenceSource,
): FieldConfidence {
  if (!String(fieldText ?? '').trim()) return 'failed';
  if (!String(transcription ?? '').trim()) return 'unverified';

  // Observed live 2026-08-22: a garbage field scored 1.0 against the garbage it
  // was extracted from, and rendered as a green "Verified" badge.
  if (source === 'derived') return 'unverified';

  const ratio = supportRatio(fieldText, transcription);
  if (ratio === null) return 'unverified';

  return ratio < SUPPORT_THRESHOLD ? 'unsupported' : 'unverified';
}

/**
 * The numeric encoding stored in `ocr_documents.field_confidence`.
 *
 * Write-only telemetry — nothing reads the column back — which is why the
 * values could be redefined with the vocabulary on 2026-09-07. Rows written
 * before then used 1 / 0.5 / 0 for verified / low / failed and are not
 * comparable with these.
 *
 * Here rather than inline at the three call sites, which is how the old mapping
 * came to be written out three times.
 */
export function confidenceScore(confidence: FieldConfidence): number {
  if (confidence === 'unverified') return 0.5;
  if (confidence === 'unsupported') return 0.25;
  return 0;
}

/** Applies classifyField across the extracted fields. No decisions here. */
export function scoreFields(
  fields: Record<string, string>,
  transcription: string,
  source: EvidenceSource,
): Record<string, FieldConfidence> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      classifyField(String(value ?? ''), transcription, source),
    ]),
  );
}
