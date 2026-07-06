/**
 * Hebrew typography rules for all site text:
 * - No orphan words: the last two words in each line stay together.
 * - Maqaf (־) and hyphens stay with both adjacent words (never alone at line
 *   start or end). Em dash (—) may end a wrapped line only when followed by a
 *   space (spaced usage); tight ranges (e.g. 650—760) keep the dash with both
 *   sides and must not start a wrapped line.
 */

const NBSP = "\u00A0";
const NB_HYPHEN = "\u2011";
const WORD_JOINER = "\u2060";
const MAQAF = "\u05BE";
const EM_DASH = "\u2014";
const EN_DASH = "\u2013";
const HYPHEN_CHARS = `-${MAQAF}`;
/** Dashes that must not be orphaned at line end (excludes em dash). */
const SPACED_DASH_KEEP_WITH_NEXT = `${HYPHEN_CHARS}${EN_DASH}`;
/** Em/en dash glued to both neighbors (year and number ranges). */
const TIGHT_RANGE_DASH = `${EM_DASH}${EN_DASH}`;

const SENTENCE_END_RE = /[.?!…׃]$/u;

const CLOSING_TRAIL_CHARS = new Set([
  ")",
  "]",
  '"',
  "'",
  "`",
  "\u05F3", // ׳
  "\u05F4", // ״
  "\u2018", // ‘
  "\u2019", // ’
  "\u201C", // “
  "\u201D", // ”
  "\u00AB", // «
  "\u00BB", // »
]);

function peelClosingTrail(text) {
  let core = text;
  let trailing = "";
  while (core.length > 0) {
    const ch = core[core.length - 1];
    if (!CLOSING_TRAIL_CHARS.has(ch)) break;
    trailing = ch + trailing;
    core = core.slice(0, -1).trimEnd();
  }
  return { core, trailing };
}

/** Append a period when a content block does not end with sentence punctuation. */
function ensureSentenceEnding(text) {
  if (!text?.trim()) return text;

  const { core, trailing } = peelClosingTrail(text.trimEnd());
  if (!core) return `${text.trimEnd()}.${trailing}`;
  if (SENTENCE_END_RE.test(core)) return core + trailing;
  return `${core}.${trailing}`;
}

function tieHyphens(line) {
  // ה-7 → ה־7 (Hebrew maqaf before digits)
  let result = line.replace(/(?<=[\u0590-\u05FF])-(?=\d)/gu, MAQAF);

  // ASCII hyphen only → non-breaking hyphen (keep Hebrew maqaf visible in UI fonts)
  result = result.replace(/(?<=[\p{L}\d])-(?=[\p{L}\d])/gu, NB_HYPHEN);

  // Maqaf must never sit alone at a wrapped line boundary.
  result = result.replace(
    new RegExp(`(?<=\\S)${MAQAF}`, "gu"),
    `${WORD_JOINER}${MAQAF}`
  );
  result = result.replace(
    new RegExp(`${MAQAF}(?=\\S)`, "gu"),
    `${MAQAF}${WORD_JOINER}`
  );

  // Spaced dashes (not em dash) must stay with the word that follows them.
  result = result.replace(
    new RegExp(`([${SPACED_DASH_KEEP_WITH_NEXT}])\\s+(?=\\S)`, "g"),
    `$1${NBSP}`
  );

  // Em dash stays with the preceding word; the regular space after it still
  // allows a break so the dash may end a wrapped line.
  result = result.replace(
    new RegExp(`(\\S)\\s+${EM_DASH}\\s+(?=\\S)`, "gu"),
    `$1${NBSP}${EM_DASH} `
  );

  // Tight em/en dash (e.g. 650—760, 1947–1949): glue to both neighbors so the
  // dash never sits alone at a line end (only spaced em dash may do that).
  result = result.replace(
    new RegExp(`(\\S)([${TIGHT_RANGE_DASH}])(?=\\S)`, "gu"),
    `$1${WORD_JOINER}$2${WORD_JOINER}`
  );

  return result;
}

function preventOrphans(line) {
  const trimmed = line.trimEnd();
  if (!trimmed) return line;

  const leading = line.slice(0, line.length - trimmed.length);
  const tied = trimmed.replace(/(\S+)\s(\S+)\s*$/u, (match, w1, w2) => {
    // Em dash may end a wrapped line; never glue it to the word that follows.
    if (w1 === EM_DASH) return match;
    return `${w1}${NBSP}${w2}`;
  });
  return leading + tied;
}

function applyLineTypography(line) {
  if (!line.trim()) return line;
  return preventOrphans(tieHyphens(line));
}

/**
 * Apply orphan and hyphen rules to plain text.
 * Handles line breaks (\n) as separate typography units.
 */
export function applyTypographyRules(text) {
  if (!text) return text;
  return text.split("\n").map(applyLineTypography).join("\n");
}

/**
 * Typography for a single content block (definition, emphasizes, users, etc.).
 * Collapses internal line breaks into flowing text, then applies rules once.
 * @param {{ ensurePeriod?: boolean }} [options]
 */
export function applyBlockTypography(text, options = {}) {
  if (!text) return text;
  const { ensurePeriod = true } = options;
  const collapsed = text.trim().replace(/\s*\n+\s*/g, " ");
  const normalized = ensurePeriod ? ensureSentenceEnding(collapsed) : collapsed;
  return applyLineTypography(normalized);
}
