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
 * @param {number} year
 * @returns {string | null}
 */
export function getTimelineEventText(year) {
  const titles = eventsByYear.get(year);
  if (!titles?.length) return null;
  return titles.join("\n");
}
