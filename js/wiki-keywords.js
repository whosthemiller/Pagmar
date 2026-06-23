/**
 * CSV keyword parsing and longest-match text linking for the term wiki.
 */

import { applyBlockTypography } from "./typography.js";

function isWordChar(ch) {
  if (!ch) return false;
  const code = ch.codePointAt(0);
  return (
    (code >= 0x5d0 && code <= 0x5ea) ||
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

/** Hebrew prepositions/prefixes that attach to the following word (בסילוואן, לירושלים, …). */
const HEBREW_PREFIX_CHARS = new Set(["ב", "כ", "ל", "מ", "ש", "ה", "ו"]);

function peelHebrewPrefixes(text, index) {
  let start = index;
  while (start > 0 && HEBREW_PREFIX_CHARS.has(text[start - 1])) {
    start--;
  }
  return start;
}

function isLeftBoundary(text, index) {
  const boundary = peelHebrewPrefixes(text, index);
  return boundary <= 0 || !isWordChar(text[boundary - 1]);
}

function isRightBoundary(text, index) {
  return index >= text.length || !isWordChar(text[index]);
}

function escapeHtml(text) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Quote glyphs that wrap a censored term should be censored/revealed with it. */
const WRAPPING_QUOTE_CHARS = new Set([
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

function isWrappingQuoteChar(ch) {
  return Boolean(ch && WRAPPING_QUOTE_CHARS.has(ch));
}

function expandRangeForWrappingQuotes(text, start, end, cursor) {
  let newStart = start;
  let newEnd = end;
  while (newStart > cursor && isWrappingQuoteChar(text[newStart - 1])) {
    newStart--;
  }
  while (newEnd < text.length && isWrappingQuoteChar(text[newEnd])) {
    newEnd++;
  }
  return { start: newStart, end: newEnd };
}

export function parseVariantCell(cell) {
  if (!cell?.trim()) return [];
  return cell
    .split(";")
    .map((part) => part.replace(/\s*\(\d+\)\s*$/, "").trim())
    .filter(Boolean);
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header.trim()] = (values[i] || "").trim();
    });
    return row;
  });
}

function normalizeMatchChar(ch) {
  if (ch === "\u2011" || ch === "\u05BE") return "-";
  if (ch === "\u00A0") return " ";
  return ch;
}

function compareAt(text, start, phrase) {
  if (start + phrase.length > text.length) return false;
  for (let i = 0; i < phrase.length; i++) {
    if (normalizeMatchChar(text[start + i]) !== normalizeMatchChar(phrase[i])) {
      return false;
    }
  }
  return true;
}

/** Prepositional prefixes only — not מ, which is part of מלחמת. */
const PREPOSITIONAL_PREFIXES = ["וש", "וב", "וכ", "ול", "ומ", "וה", "ו", "ה", "ב", "כ", "ל", "ש"];

function isMilhamaConstructForm(word) {
  let w = (word || "").trim();
  for (const prefix of PREPOSITIONAL_PREFIXES) {
    if (w.startsWith(prefix) && w.length > prefix.length + 2) {
      w = w.slice(prefix.length);
      break;
    }
  }
  if (w.startsWith("מ") && w.length > 2 && w.slice(1) === "מלחמת") return true;
  return w === "מלחמת";
}

/** מלחמת + שם מלחמה (מלחמת העצמאות…) — לא התאמה עצמאית ל«מלחמה». */
function isMilhamaConstructBeforeTerm(text, start, end) {
  if (!isMilhamaConstructForm(text.slice(start, end))) return false;
  let i = end;
  while (i < text.length && /\s/.test(text[i])) i++;
  return i < text.length && isWordChar(text[i]);
}

/** Bare מעבר/המעבר/במעבר — homograph; only border-crossing facility senses link as the term. */
function isMaavarHomographPhrase(phrase) {
  const p = (phrase || "").trim();
  return p === "מעבר" || p === "המעבר" || p === "במעבר";
}

function isMaavarPassagewayContext(text, start, end) {
  const after = text.slice(end).trimStart();
  const word = text.slice(start, end);

  if (/^ל(קו|גבול|זירת|כך|מותר|שיקולים)/.test(after)) return false;
  if (/^לו(?:[,.\s]|$)/.test(after)) return false;
  if (/^ל["״]/.test(after)) return false;
  if (/^אל\s/.test(after)) return false;
  if (/^(משלב|ממעמד|מדינה)/.test(after)) return false;
  if (/^חלקי\s+ל/.test(after)) return false;
  if (word === "המעבר" && /^ל["״]/.test(after)) return false;
  return true;
}

/** Bare הרג/ההרג/… — homograph; הרג אזרח(ים) is a separate catalog term. */
function isHargHomographPhrase(phrase) {
  const p = (phrase || "").trim();
  return p === "הרג" || p === "ההרג" || p === "בהרג" || p === "והרג" || p === "רג";
}

function isHargCivilianCompoundContext(text, start, end) {
  const after = text.slice(end).trimStart();
  return /^אזרח(?:ים)?(?:\b|[\s,.])/.test(after);
}

/** Bare סגר/הסגר/בסגר — homograph; only Gaza blockade senses link as the term. */
function isSegrHomographPhrase(phrase) {
  const p = (phrase || "").trim();
  return p === "סגר" || p === "הסגר" || p === "בסגר";
}

function getWordBounds(text, start, end) {
  let wordStart = start;
  while (wordStart > 0 && isWordChar(text[wordStart - 1])) wordStart--;
  let wordEnd = end;
  while (wordEnd < text.length && isWordChar(text[wordEnd])) wordEnd++;
  return { wordStart, wordEnd, word: text.slice(wordStart, wordEnd) };
}

/** Framing verb (למסגר, ממסגר, וממסגר…) — not the blockade term. */
function isSegrFramingVerbWord(word) {
  if (word === "סגר" || word === "הסגר" || word === "בסגר") return false;
  return /^(?:[ובכלהש]*)?(?:ל)?מ+סגר$/.test(word);
}

function isSegrBlockadeContext(text, start, end) {
  const { word } = getWordBounds(text, start, end);
  return !isSegrFramingVerbWord(word);
}

function findOccurrences(text, phrase) {
  if (!phrase || phrase.length < 1) return [];
  const positions = [];
  let start = 0;

  while (start <= text.length - phrase.length) {
    const idx = text.indexOf(phrase[0], start);
    if (idx === -1) break;
    const end = idx + phrase.length;
    if (
      compareAt(text, idx, phrase) &&
      isLeftBoundary(text, idx) &&
      isRightBoundary(text, end) &&
      !isMilhamaConstructBeforeTerm(text, idx, end) &&
      (!isMaavarHomographPhrase(phrase) || isMaavarPassagewayContext(text, idx, end)) &&
      (!isSegrHomographPhrase(phrase) || isSegrBlockadeContext(text, idx, end)) &&
      (!isHargHomographPhrase(phrase) || !isHargCivilianCompoundContext(text, idx, end))
    ) {
      positions.push({ start: peelHebrewPrefixes(text, idx), end });
    }
    start = idx + 1;
  }
  return positions;
}

export function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

/** Word-boundary phrase search (exported for mention-link building). */
export function findBoundedPhrases(text, phrase) {
  return findOccurrences(text, phrase);
}

/** Keyword types linked in the wiki (excludes generic single words). */
export const WIKI_LINK_TYPES = new Set(["מונח_ידוע", "ביטוי"]);

/** Phrases linked only via their first word — not as a whole phrase. */
const PREFIX_ONLY_PHRASES = new Set([
  "שמאל רדיקלי",
  "האצ״ל והלח״י",
  "בעשור האחרון",
  "בעשורים האחרונים",
  "העשור האחרון",
]);

function normalizePhrase(phrase) {
  return (phrase || "").trim().toLowerCase();
}

function isPrefixOnlyPhrase(phrase) {
  return PREFIX_ONLY_PHRASES.has(normalizePhrase(phrase));
}

/** Multi-word keywords link only as full phrases, not via single-word components. */
export function shouldLinkPhrase(phrase, keyword) {
  const p = (phrase || "").trim();
  if (!p || isPrefixOnlyPhrase(p)) return false;
  if (keyword.includes(" ") && !p.includes(" ")) return false;
  return true;
}

/**
 * @param {string} url
 * @param {{ types?: Set<string> }} [options]
 * @returns {Promise<{ entries: object[], patterns: object[] }>}
 */
/** Keyword + inflected variants only (excludes related multi-word compounds). */
export function collectDefinitionPhrases(row) {
  const keyword = (row["מילת_מפתח"] || "").trim();
  if (!keyword) return [];

  const variants = parseVariantCell(row["וариантים"]);
  return [...new Set([keyword, ...variants])].filter(
    (phrase) => (phrase || "").trim().length >= 1
  );
}

/** All variant phrases for mention-link matching (includes single-word inflections). */
export function collectMentionPhrases(row) {
  const keyword = (row["מילת_מפתח"] || "").trim();
  if (!keyword) return [];

  const variants = parseVariantCell(row["וариантים"]);
  const related = parseVariantCell(row["וариантים_קשורים"]);
  const matchSet = new Set([keyword, ...variants, ...related]);
  for (const phrase of [...matchSet]) {
    if (isPrefixOnlyPhrase(phrase)) matchSet.delete(phrase);
  }

  return [...matchSet].filter((phrase) => (phrase || "").trim().length >= 2);
}

/** All match phrases for one keyword-frequency row (מילת_מפתח + variants). */
export function collectKeywordPhrases(row) {
  const keyword = (row["מילת_מפתח"] || "").trim();
  if (!keyword) return [];

  const variants = parseVariantCell(row["וариантים"]);
  const related = parseVariantCell(row["וариантים_קשורים"]);
  const matchSet = new Set([keyword, ...variants, ...related]);
  for (const phrase of [...matchSet]) {
    if (isPrefixOnlyPhrase(phrase)) matchSet.delete(phrase);
  }

  return [...matchSet].filter(
    (phrase) => phrase.length >= 1 && shouldLinkPhrase(phrase, keyword)
  );
}

const DATA_DIR = new URL("../data/", import.meta.url);

export async function loadKeywordCsvRows(
  url = new URL("keyword-frequency.csv", DATA_DIR).href
) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load keywords: ${res.status}`);
  return parseCsv(await res.text());
}

export async function loadKeywordEntries(
  url = new URL("keyword-frequency.csv", DATA_DIR).href,
  options = {}
) {
  const allowedTypes = options.types ?? WIKI_LINK_TYPES;
  const rows = options.rows ?? (await loadKeywordCsvRows(url));

  const entries = [];
  const patterns = [];

  for (const row of rows) {
    const keyword = row["מילת_מפתח"];
    if (!keyword) continue;

    const type = row["סוג"] || "מילה";
    if (!allowedTypes.has(type)) continue;

    const variants = parseVariantCell(row["וариантים"]);
    const related = parseVariantCell(row["וариантים_קשורים"]);
    const matchSet = new Set([keyword, ...variants, ...related]);
    for (const phrase of [...matchSet]) {
      if (isPrefixOnlyPhrase(phrase)) matchSet.delete(phrase);
    }

    entries.push({
      keyword,
      type,
      count: parseInt(row["ספירה"], 10) || 0,
      conceptGroup: row["קבוצת_מושג"] || "",
      matchPhrases: [...matchSet],
    });

    for (const phrase of matchSet) {
      if (phrase.length >= 1 && shouldLinkPhrase(phrase, keyword)) {
        patterns.push({ phrase, keyword, type });
      }
    }
  }

  patterns.sort((a, b) => b.phrase.length - a.phrase.length);

  return { entries, patterns };
}

let occCounter = 0;

export function resetOccCounter() {
  occCounter = 0;
}

/**
 * Link keyword occurrences in plain text. Returns HTML string.
 * Each canonical keyword is linked at most once per article when linkedKeywords is provided.
 * @param {string} text
 * @param {object[]} patterns
 * @param {Set<string>} [linkedKeywords]
 */
export function linkText(text, patterns, linkedKeywords = null) {
  if (!text) return "";

  const occupied = [];
  const matches = [];
  const linkedInPass = new Set();

  for (const { phrase, keyword, type } of patterns) {
    if (linkedKeywords?.has(keyword) || linkedInPass.has(keyword)) continue;

    for (const { start, end } of findOccurrences(text, phrase)) {
      const range = { start, end };
      if (occupied.some((r) => rangesOverlap(r, range))) continue;
      occupied.push(range);
      matches.push({ ...range, phrase: text.slice(start, end), keyword, type });
      linkedInPass.add(keyword);
      break;
    }
  }

  matches.sort((a, b) => a.start - b.start);

  let html = "";
  let cursor = 0;

  for (const match of matches) {
    html += escapeHtml(text.slice(cursor, match.start));
    const occId = `occ-${++occCounter}`;
    const typeClass = `wiki-kw--${match.type.replace(/\s/g, "_")}`;
    html +=
      `<a href="#" class="wiki-kw ${typeClass}" ` +
      `data-kw="${escapeHtml(match.keyword)}" ` +
      `data-occ-id="${occId}">${escapeHtml(match.phrase)}</a>`;
    linkedKeywords?.add(match.keyword);
    cursor = match.end;
  }

  html += escapeHtml(text.slice(cursor));
  return html;
}

/**
 * Split text on blank lines and link each paragraph.
 * @param {Set<string>} [linkedKeywords]
 */
export function linkParagraphs(text, patterns, linkedKeywords = null) {
  if (!text?.trim()) return "";
  return text
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = applyBlockTypography(block.trim());
      if (!trimmed) return "";
      return `<p>${linkText(trimmed, patterns, linkedKeywords)}</p>`;
    })
    .filter(Boolean)
    .join("");
}

/**
 * Link catalog term occurrences in plain text. Returns HTML string.
 * Each term is linked at most once per article when linkedTermIds is provided.
 * @param {string} text
 * @param {{ phrase: string, termId: string }[]} termPatterns
 * @param {Set<string>} [linkedTermIds]
 * @param {string} [excludeTermId] — skip links to this term (same article)
 */
export function linkTextToTerms(text, termPatterns, linkedTermIds = null, excludeTermId = null) {
  if (!text) return "";

  const occupied = [];
  const matches = [];
  const linkedInPass = new Set();

  for (const { phrase, termId } of termPatterns) {
    if (termId === excludeTermId) continue;
    if (linkedTermIds?.has(termId) || linkedInPass.has(termId)) continue;

    for (const { start, end } of findOccurrences(text, phrase)) {
      const range = { start, end };
      if (occupied.some((r) => rangesOverlap(r, range))) continue;
      occupied.push(range);
      matches.push({ ...range, phrase: text.slice(start, end), termId });
      linkedInPass.add(termId);
      break;
    }
  }

  matches.sort((a, b) => a.start - b.start);

  let html = "";
  let cursor = 0;

  for (const match of matches) {
    html += escapeHtml(text.slice(cursor, match.start));
    html +=
      `<a href="#${escapeHtml(match.termId)}" class="wiki-kw wiki-kw--term" ` +
      `data-term-id="${escapeHtml(match.termId)}">${escapeHtml(match.phrase)}</a>`;
    linkedTermIds?.add(match.termId);
    cursor = match.end;
  }

  html += escapeHtml(text.slice(cursor));
  return html;
}

/**
 * Split text on blank lines and link each paragraph to catalog terms.
 * @param {Set<string>} [linkedTermIds]
 * @param {string} [excludeTermId]
 */
export function linkParagraphsToTerms(text, termPatterns, linkedTermIds = null, excludeTermId = null) {
  if (!text?.trim()) return "";
  return text
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = applyBlockTypography(block.trim());
      if (!trimmed) return "";
      return `<p>${linkTextToTerms(trimmed, termPatterns, linkedTermIds, excludeTermId)}</p>`;
    })
    .filter(Boolean)
    .join("");
}

/**
 * Mark catalog term mentions inside definition text.
 * Other same-object terms are censored; cross-object terms use Narkis Asaf + underline (styled in CSS).
 * The host term itself is left unstyled.
 * @param {string} text
 * @param {{ phrase: string, termId: string, objectId: string }[]} termPatterns
 * @param {string} hostObjectId
 * @param {string} hostTermId
 */
export function annotateDefinitionMentions(text, termPatterns, hostObjectId, hostTermId) {
  if (!text) return "";

  const occupied = [];
  const matches = [];

  for (const { phrase, termId, objectId } of termPatterns) {
    for (const { start, end } of findOccurrences(text, phrase)) {
      const range = { start, end };
      if (occupied.some((r) => rangesOverlap(r, range))) continue;
      occupied.push(range);
      if (termId === hostTermId) continue;
      matches.push({
        start,
        end,
        phrase: text.slice(start, end),
        termId,
        sameObject: objectId === hostObjectId,
      });
    }
  }

  matches.sort((a, b) => a.start - b.start);

  let html = "";
  let cursor = 0;

  for (const match of matches) {
    let { start, end } = match;
    if (match.sameObject) {
      ({ start, end } = expandRangeForWrappingQuotes(text, start, end, cursor));
    }
    html += escapeHtml(text.slice(cursor, start));
    const escaped = escapeHtml(text.slice(start, end));
    const cls = match.sameObject
      ? "sun-def-mention sun-def-mention--same-object"
      : "sun-def-mention sun-def-mention--external";
    html +=
      `<span class="${cls}" data-term-id="${escapeHtml(match.termId)}">${escaped}</span>`;
    cursor = end;
  }

  html += escapeHtml(text.slice(cursor));
  return html;
}
