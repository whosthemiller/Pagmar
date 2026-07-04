/**
 * Timeline historical events — load pagmar_timeline_events.csv and index by year.
 */

import { parsePeriodYears } from "./term-year-index.js";
import { parseCsv } from "./wiki-keywords.js";

const DATA_DIR = new URL("../data/", import.meta.url);

function dataUrl(filename) {
  return new URL(filename, DATA_DIR).href;
}

/** @type {Map<number, string[]>} */
let eventsByYear = new Map();

/**
 * @param {{ תאריך?: string, "שם אירוע"?: string }[]} rows
 * @returns {Map<number, string[]>}
 */
export function buildTimelineEventsIndex(rows) {
  const index = new Map();

  for (const row of rows) {
    const date = (row["תאריך"] || "").trim();
    const title = (row["שם אירוע"] || "").trim();
    if (!date || !title) continue;

    const parsed = parsePeriodYears(date);
    if (!parsed) continue;

    for (let year = parsed.startYear; year <= parsed.endYear; year += 1) {
      const list = index.get(year);
      if (list) {
        if (!list.includes(title)) list.push(title);
      } else {
        index.set(year, [title]);
      }
    }
  }

  return index;
}

/**
 * @param {string} [url]
 * @returns {Promise<Map<number, string[]>>}
 */
export async function loadTimelineEvents(url = dataUrl("pagmar_timeline_events.csv")) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      eventsByYear = new Map();
      return eventsByYear;
    }
    const rows = parseCsv(await res.text());
    eventsByYear = buildTimelineEventsIndex(rows);
    return eventsByYear;
  } catch {
    eventsByYear = new Map();
    return eventsByYear;
  }
}

/**
 * @param {string[]} titles
 * @returns {string}
 */
function formatTimelineEventTitles(titles) {
  if (titles.length <= 1) return titles[0] ?? "";
  if (titles.length === 2) return `${titles[0]} ו${titles[1]}`;
  // 3+: "אירוע, אירוע הבא ואירוע אחרון"
  return `${titles.slice(0, -1).join(", ")} ו${titles[titles.length - 1]}`;
}

/** Keep short titles on one line (≈14em at 18px). */
const TIMELINE_EVENT_ONE_LINE_MAX_CHARS = 28;

/**
 * Split into two lines of similar length; prefer a longer second line.
 * @param {string} text
 * @returns {string}
 */
function balanceTimelineEventLines(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return text;

  const totalChars =
    words.reduce((sum, word) => sum + word.length, 0) + (words.length - 1);
  if (totalChars <= TIMELINE_EVENT_ONE_LINE_MAX_CHARS) return text;

  const tolerance = Math.max(2, Math.ceil(totalChars / 7.5));
  let best = null;

  for (let i = 1; i < words.length; i += 1) {
    const line1 = words.slice(0, i).join(" ");
    const line2 = words.slice(i).join(" ");
    const len1 = line1.length;
    const len2 = line2.length;

    let rank = 0;
    if (len2 >= len1) rank = 2;
    else if (len2 >= len1 - 1) rank = 2;
    else if (len2 >= len1 - tolerance) rank = 1;

    const imbalance = (len1 - len2) ** 2;
    if (
      !best ||
      rank > best.rank ||
      (rank === best.rank && imbalance < best.imbalance)
    ) {
      best = { line1, line2, rank, imbalance };
    }
  }

  if (!best) return text;
  return `${best.line1}\n${best.line2}`;
}

/**
 * @param {number} year
 * @returns {string | null}
 */
export function getTimelineEventText(year) {
  const titles = eventsByYear.get(year);
  if (!titles?.length) return null;
  return balanceTimelineEventLines(formatTimelineEventTitles(titles));
}
