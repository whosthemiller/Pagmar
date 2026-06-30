/**
 * Term year ranges for the timeline — loaded from term-years-new.csv;
 * parsePeriodYears remains for timeline event dates.
 */

import { parseCsv } from "./wiki-keywords.js";

const DATA_DIR = new URL("../data/", import.meta.url);

const CURRENT_YEAR = new Date().getFullYear();

function dataUrl(filename) {
  return new URL(filename, DATA_DIR).href;
}

const PRESENT_MARKERS =
  /(?:ועד\s+)?(?:ה)?יום|היום|כיום|נוכחי|עד\s+עכשיו|עד\s+היום|ממשיך|נמשך|נותר|ממשיכים/i;

const CENTURY_PHRASES = [
  { pattern: /(?:תחילת|ראשית|מראשית)\s+המאה\s+ה[-־]?\s*(\d{1,2})/gi, offset: 0 },
  { pattern: /(?:מאמצע|אמצע)\s+המאה\s+ה[-־]?\s*(\d{1,2})/gi, offset: 50 },
  { pattern: /(?:סוף|מסוף|לקראת\s+סוף)\s+המאה\s+ה[-־]?\s*(\d{1,2})/gi, offset: 90 },
  { pattern: /מסוף\s+המאה\s+ה[-־]?\s*(\d{1,2})/gi, offset: 90 },
];

function centuryBase(centuryDigits) {
  const n = parseInt(centuryDigits, 10);
  if (n >= 10) return (n - 1) * 100;
  if (n >= 1 && n <= 2) return 1900 + (n - 1) * 100;
  return (19 + n) * 100;
}

function normalizePeriodText(text) {
  return (text || "")
    .replace(/\u05F4/g, '"')
    .replace(/[\u2013\u2014–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function centuryStartYear(centuryDigits) {
  const n = parseInt(centuryDigits, 10);
  if (n >= 10) return (n - 1) * 100;
  if (n >= 1 && n <= 2) return 1900 + (n - 1) * 100;
  return (19 + n) * 100;
}

function expandDecade(twoDigit, centuryHint = null) {
  const n = parseInt(twoDigit, 10);
  if (Number.isNaN(n)) return null;
  if (n >= 100) return { start: n, end: Math.min(n + 9, CURRENT_YEAR) };

  let start;
  if (centuryHint !== null) {
    start = centuryStartYear(centuryHint) + n;
  } else if (n >= 30) {
    start = 1900 + n;
  } else if (n <= 9) {
    start = 2000 + n;
  } else {
    // 10–29 without century context: historical texts usually mean 19xx.
    start = 1900 + n;
  }

  return { start, end: Math.min(start + 9, CURRENT_YEAR) };
}

function clampYearRange(startYear, endYear) {
  const start = Math.min(startYear, endYear);
  let end = Math.max(startYear, endYear);
  end = Math.min(end, CURRENT_YEAR);
  return { startYear: start, endYear: Math.max(start, end) };
}

function collectYearMentions(text) {
  const years = new Set();
  const ranges = [];

  const fourDigit = /\b(1[89]\d{2}|20\d{2})\b/g;
  let match;
  while ((match = fourDigit.exec(text)) !== null) {
    years.add(parseInt(match[1], 10));
  }

  const centuryDecadePattern =
    /שנות\s+ה[-־]?\s*(\d{2})\s+של\s+המאה\s+ה[-־]?\s*(\d{1,2})/gi;
  while ((match = centuryDecadePattern.exec(text)) !== null) {
    const decade = expandDecade(match[1], parseInt(match[2], 10));
    if (decade) ranges.push(decade);
  }

  const decadePattern =
    /(?:מ)?(?:תחילת|סוף|אמצע|מאמצע|ראשית|ב|מ)?\s*שנות\s+ה[-־]?\s*(\d{2,4})/gi;
  while ((match = decadePattern.exec(text)) !== null) {
    const raw = match[1];
    const matchIndex = match.index;
    if (
      /שנות\s+ה[-־]?\s*\d{2}\s+של\s+המאה/i.test(
        text.slice(Math.max(0, matchIndex - 5), matchIndex + match[0].length + 20)
      )
    ) {
      continue;
    }
    if (raw.length === 4) {
      const start = parseInt(raw, 10);
      ranges.push({ start, end: Math.min(start + 9, CURRENT_YEAR) });
    } else {
      const decade = expandDecade(raw);
      if (decade) ranges.push(decade);
    }
  }

  const decadeShort = /(?:ב)?עשור\s+(?:ה[-־]?\s*)?(\d{2})/gi;
  while ((match = decadeShort.exec(text)) !== null) {
    const decade = expandDecade(match[1]);
    if (decade) ranges.push(decade);
  }

  for (const { pattern, offset } of CENTURY_PHRASES) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const base = centuryBase(match[1]);
      ranges.push({ start: base + offset, end: base + offset + 9 });
    }
  }

  const bareCentury = /המאה\s+ה[-־]?\s*(\d{1,2})/gi;
  while ((match = bareCentury.exec(text)) !== null) {
    const base = centuryBase(match[1]);
    ranges.push({ start: base, end: base + 99 });
  }

  const rangePattern =
    /(1[89]\d{2}|20\d{2})\s*-\s*(1[89]\d{2}|20\d{2}|היום)/gi;
  while ((match = rangePattern.exec(text)) !== null) {
    const start = parseInt(match[1], 10);
    const endRaw = match[2];
    const end = /יום/i.test(endRaw) ? CURRENT_YEAR : parseInt(endRaw, 10);
    ranges.push({ start, end });
  }

  return { years: [...years], ranges };
}

/**
 * @param {string} periodText
 * @returns {{ startYear: number, endYear: number } | null}
 */
export function parsePeriodYears(periodText) {
  const text = normalizePeriodText(periodText);
  if (!text) return null;

  const { years, ranges } = collectYearMentions(text);
  const hasPresent = PRESENT_MARKERS.test(text);

  let startCandidates = [...years];
  let endCandidates = [...years];

  for (const range of ranges) {
    startCandidates.push(range.start);
    endCandidates.push(range.end);
  }

  if (/מאז\s+קום\s+המדינה|מאז\s+הקמת\s+המדינה|מאז\s+1948/i.test(text)) {
    startCandidates.push(1948);
  }
  if (/מאז\s+1967|אחרי\s+1967|מאז\s+כיבוש/i.test(text)) {
    startCandidates.push(1967);
  }

  if (!startCandidates.length && !endCandidates.length) {
    if (hasPresent) {
      return { startYear: CURRENT_YEAR - 5, endYear: CURRENT_YEAR };
    }
    return null;
  }

  const startYear = startCandidates.length ? Math.min(...startCandidates) : Math.min(...endCandidates);
  let endYear = endCandidates.length ? Math.max(...endCandidates) : Math.max(...startCandidates);

  if (
    hasPresent ||
    /ואילך|ומאז|ממשיך|נמשך|נותר/i.test(text) ||
    /-\s*$/.test(text)
  ) {
    endYear = Math.max(endYear, CURRENT_YEAR);
  }

  return clampYearRange(startYear, endYear);
}

function parseYearCell(value) {
  const text = (value || "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * @param {{ מזהה_מונח?: string, שנת_התחלה?: string, שנת_סיום?: string, פרסור_שנים?: string }[]} rows
 * @returns {Map<string, { startYear: number, endYear: number }>}
 */
export function buildTermYearIndexFromCsv(rows) {
  const index = new Map();
  for (const row of rows) {
    const termId = (row["מזהה_מונח"] || "").trim();
    if (!termId) continue;
    if ((row["פרסור_שנים"] || "").trim() === "לא") continue;

    const startYear = parseYearCell(row["שנת_התחלה"]);
    const endYear = parseYearCell(row["שנת_סיום"]);
    if (startYear === null || endYear === null) continue;

    index.set(termId, clampYearRange(startYear, endYear));
  }
  return index;
}

/**
 * @param {string} [url]
 * @returns {Promise<Map<string, { startYear: number, endYear: number }>>}
 */
export async function loadTermYears(url = dataUrl("term-years-new.csv")) {
  try {
    const res = await fetch(url);
    if (!res.ok) return new Map();
    return buildTermYearIndexFromCsv(parseCsv(await res.text()));
  } catch {
    return new Map();
  }
}

/**
 * @param {{ id: string, period?: string }[]} terms
 * @returns {Map<string, { startYear: number, endYear: number }>}
 */
export function buildTermYearIndex(terms) {
  const index = new Map();
  for (const term of terms) {
    const parsed = parsePeriodYears(term.period);
    if (parsed) {
      index.set(term.id, parsed);
    }
  }
  return index;
}

/**
 * @param {Map<string, { startYear: number, endYear: number }>} index
 */
export function getTimelineBounds(index) {
  let minYear = Infinity;
  let maxYear = -Infinity;

  for (const { startYear, endYear } of index.values()) {
    minYear = Math.min(minYear, startYear);
    maxYear = Math.max(maxYear, endYear);
  }

  if (!Number.isFinite(minYear)) {
    return { minYear: 1948, maxYear: CURRENT_YEAR };
  }

  return { minYear, maxYear: Math.min(maxYear, CURRENT_YEAR) };
}

function opacityForYear(startYear, endYear, year) {
  if (year < startYear || year > endYear) return 0;
  return 1;
}

/**
 * @param {Map<string, { startYear: number, endYear: number }>} index
 * @param {string} termId
 * @param {number} fromYear
 * @param {number} toYear
 * @param {number} blend 0 = fromYear, 1 = toYear
 */
export function getTermOpacity(index, termId, fromYear, toYear, blend) {
  const range = index.get(termId);
  if (!range) return 0;

  const yearA = fromYear + (toYear - fromYear) * blend;
  const opacityA = opacityForYear(range.startYear, range.endYear, Math.round(fromYear));
  const opacityB = opacityForYear(range.startYear, range.endYear, Math.round(toYear));

  if (fromYear === toYear) {
    return opacityForYear(range.startYear, range.endYear, fromYear);
  }

  return opacityA * (1 - blend) + opacityB * blend;
}

/**
 * @param {{ id: string, period?: string }[]} allTerms
 * @param {Map<string, { startYear: number, endYear: number }>} index
 */
export function logYearIndexStats(allTerms, index) {
  const missing = allTerms.filter((t) => !index.has(t.id));
  if (missing.length) {
    console.warn(
      `[sun-timeline] ${missing.length}/${allTerms.length} terms without parseable period years`
    );
  }
  const bounds = getTimelineBounds(index);
  console.info(
    `[sun-timeline] year range ${bounds.minYear}–${bounds.maxYear}, ${index.size} terms indexed`
  );
}
