/**
 * Character Error Rate against a human-typed reference span.
 *
 * The reference is what a human read off the photograph, so CER here measures
 * the model against the page — not against whatever the writer was copying.
 * That distinction is the whole reason the AI source text would have been the
 * wrong reference even if it had survived: the writers introduced their own
 * misspellings, and scoring a correct read as an error inflates CER for a
 * reason that has nothing to do with the model.
 */

/**
 * Pre-registered, fixed before the run.
 *
 * Case and punctuation are KEPT — both are real transcription errors, and the
 * writers' own inconsistent capitalisation ("AgriTrack" / "Agritrack" on one
 * page) is on the page, so charging it is correct.
 *
 * Whitespace is collapsed because the reference is typed as a flat span while
 * the model returns re-flowed prose; line breaks would otherwise dominate the
 * distance without saying anything about character recognition. Typographic
 * variants are folded to ASCII for the same reason — a curly apostrophe for a
 * straight one is an encoding choice, not a misread.
 */
function normalize(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Full Levenshtein distance. Two rows, so long transcriptions stay cheap. */
function editDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const sub = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, sub);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/**
 * Edit distance between `reference` and the best-matching substring of
 * `haystack` — free start and free end, so only the reference's own span is
 * charged.
 *
 * Needed because the reference is one section and the transcription is the
 * whole page: scoring them whole would charge every other section as a
 * deletion. A model that omits the span entirely still scores distance ≈
 * |reference|, i.e. CER ≈ 1, which is the correct answer for a total miss.
 */
function infixDistance(reference, haystack) {
  if (reference.length === 0) return 0;
  if (haystack.length === 0) return reference.length;

  // Row 0 is all zeroes: any prefix of the haystack may be skipped for free.
  let prev = new Array(haystack.length + 1).fill(0);
  let cur = new Array(haystack.length + 1);

  for (let i = 1; i <= reference.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= haystack.length; j += 1) {
      const sub = prev[j - 1] + (reference[i - 1] === haystack[j - 1] ? 0 : 1);
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, sub);
    }
    [prev, cur] = [cur, prev];
  }

  // Free end: the best match may stop anywhere.
  let best = Infinity;
  for (let j = 0; j <= haystack.length; j += 1) if (prev[j] < best) best = prev[j];
  return best;
}

/**
 * CER for one span. Returns null when the reference is empty — an unscoreable
 * span is an absent observation, never a perfect score.
 *
 * Not clamped to 1: a transcription that inserts material inside the matched
 * span can exceed it, and hiding that behind a cap would misreport it.
 */
function characterErrorRate(reference, transcription) {
  const ref = normalize(reference);
  const hay = normalize(transcription);
  if (ref.length === 0) return null;

  const distance = infixDistance(ref, hay);
  return { distance, refLength: ref.length, cer: distance / ref.length };
}

/**
 * mulberry32 — a small deterministic PRNG so span selection is reproducible
 * from the seed alone, and cannot be quietly re-rolled into a friendlier draw.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One section per document, drawn uniformly, in the corpus's own order.
 *
 * Metadata blocks are eligible. They hold the funding figures and dates that
 * downstream extraction depends on, and digits are the hardest characters on
 * these pages — excluding them would have flattered the number, and choosing
 * that after seeing results is the move this file exists to prevent.
 */
function selectSpans(documents, seed) {
  const rand = mulberry32(seed);
  return documents.map((doc) => {
    const index = Math.floor(rand() * doc.sections.length);
    return {
      file: doc.file,
      writer: doc.writer,
      sectionIndex: index,
      section: doc.sections[index],
    };
  });
}

module.exports = {
  normalize,
  editDistance,
  infixDistance,
  characterErrorRate,
  mulberry32,
  selectSpans,
};
