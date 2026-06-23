/**
 * Hebrew typography rules for all site text:
 * - No orphan words: the last two words in each line stay together.
 * - No hyphen at line start: hyphens and dashes stay with the preceding word.
 */

const NBSP = "\u00A0";
const NB_HYPHEN = "\u2011";
const MAQAF = "\u05BE";
const HYPHEN_CHARS = `-${MAQAF}`;
const SPACED_DASH_CHARS = `${HYPHEN_CHARS}–—`;

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
  return line
    .replace(new RegExp(`(?<=[\\p{L}\\d])[${HYPHEN_CHARS}](?=[\\p{L}\\d])`, "gu"), NB_HYPHEN)
    .replace(new RegExp(`(\\S)\\s+([${SPACED_DASH_CHARS}])`, "g"), `$1${NBSP}$2`);
}

function preventOrphans(line) {
  const trimmed = line.trimEnd();
  if (!trimmed) return line;

  const leading = line.slice(0, line.length - trimmed.length);
  const tied = trimmed.replace(/(\S+)\s(\S+)\s*$/u, `$1${NBSP}$2`);
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
