#!/usr/bin/env node
/**
 * מושך מ-Google Sheets:
 *   אובייקטים + מונחים - מתוקן → data/sheet-data.json
 *   מונחים ציר זמן → data/term-years-new.csv
 *   אירועים מרכזיים → data/pagmar_timeline_events.csv
 *
 * הרצה: node scripts/sync-sheet.js
 * הגיליון חייב להיות נגיש לייצוא CSV (ציבורי או קישור לכל מי שיש לו).
 */

const fs = require("fs");
const path = require("path");

const SPREADSHEET_ID = "1QS5G0Q0a5kDT9xd3LSTBppMV6juoveS-P5lEG89moSU";
const DATA_DIR = path.join(__dirname, "..", "data");

const TABS = {
  objects: { gid: "971020560", description: "אובייקטים" },
  // "מונחים - מתוקן" (not the broken "מונחים" tab with #REF! ids)
  terms: { gid: "199861948", description: "מונחים - מתוקן" },
  termYears: { gid: "67862864", description: "מונחים ציר זמן" },
  timelineEvents: { gid: "502351555", description: "אירועים מרכזיים" },
};

const OUT_SHEET = path.join(DATA_DIR, "sheet-data.json");
const OUT_YEARS = path.join(DATA_DIR, "term-years-new.csv");
const OUT_EVENTS = path.join(DATA_DIR, "pagmar_timeline_events.csv");

function buildCsvUrl(sheetId, gid) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((currentRow) =>
    currentRow.some((currentCell) => currentCell.trim().length > 0)
  );
}

/** ASCII/curly quotes → Hebrew geresh (׳) / gershayim (״). */
function normalizeHebrewPunctuation(text) {
  return String(text ?? "")
    .replace(/[\u0027\u2018\u2019\u201B\u2032]/g, "\u05F3")
    .replace(/[\u0022\u201C\u201D\u201E\u201F\u00AB\u00BB\u2033]/g, "\u05F4");
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((values) => {
    const record = {};
    for (let i = 0; i < header.length; i++) {
      record[header[i]] = normalizeHebrewPunctuation(values[i] || "");
    }
    return record;
  });
}

function toCsvLine(cols) {
  return cols
    .map((c) => {
      const s = String(c ?? "");
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    })
    .join(",");
}

function buildConcepts(objectsRows, termsRows) {
  const objectIdKey = "מזהה אובייקט";
  const objectNameKey = "שם אובייקט נייטרלי";
  const termObjectIdKey = "מזהה אובייקט משויך";
  const termNameKey = "שם מונח";

  const termsByObject = new Map();
  for (const termRecord of termsRows) {
    const objectId = (termRecord[termObjectIdKey] || "").trim();
    const termName = (termRecord[termNameKey] || "").trim();
    if (!objectId || !termName) continue;
    if (!termsByObject.has(objectId)) termsByObject.set(objectId, []);
    termsByObject.get(objectId).push(termName);
  }

  return objectsRows
    .map((objectRecord) => {
      const id = (objectRecord[objectIdKey] || "").trim();
      const name = (objectRecord[objectNameKey] || "").trim();
      if (!id) return null;
      return {
        id,
        name,
        terms: termsByObject.get(id) || [],
      };
    })
    .filter(Boolean);
}

/** Sheet headers use spaces; app CSV uses underscores + פרסור_שנים. */
function writeTermYearsCsv(rows) {
  const lines = [
    "מזהה_קבוצה,שם_קבוצה,מזהה_מונח,שם_מונח,שנת_התחלה,שנת_סיום,פרסור_שנים",
  ];
  for (const row of rows) {
    const id = (row["מזהה מונח"] || "").trim();
    const start = (row["שנת התחלה"] || "").trim();
    const end = (row["שנת סיום"] || "").trim();
    if (!id || !start || !end) continue;
    lines.push(
      toCsvLine([
        (row["מזהה קבוצה"] || "").trim(),
        (row["שם קבוצה"] || "").trim(),
        id,
        (row["שם מונח"] || "").trim(),
        start,
        end,
        "כן",
      ])
    );
  }
  fs.writeFileSync(OUT_YEARS, lines.join("\n") + "\n", "utf8");
  return lines.length - 1;
}

function writeTimelineEventsCsv(rows) {
  const lines = ["תאריך,שם אירוע"];
  for (const row of rows) {
    const date = (row["תאריך"] || "").trim();
    const title = (row["שם אירוע"] || "").trim();
    if (!date || !title) continue;
    lines.push(toCsvLine([date, title]));
  }
  fs.writeFileSync(OUT_EVENTS, lines.join("\n") + "\n", "utf8");
  return lines.length - 1;
}

async function fetchTab(tab) {
  const res = await fetch(buildCsvUrl(SPREADSHEET_ID, tab.gid));
  if (!res.ok) {
    throw new Error(`Fetch failed for ${tab.description} (gid ${tab.gid}): ${res.status}`);
  }
  return res.text();
}

async function main() {
  const [objectsCsv, termsCsv, yearsCsv, eventsCsv] = await Promise.all([
    fetchTab(TABS.objects),
    fetchTab(TABS.terms),
    fetchTab(TABS.termYears),
    fetchTab(TABS.timelineEvents),
  ]);

  const objectsRows = rowsToObjects(parseCsv(objectsCsv));
  const termsRows = rowsToObjects(parseCsv(termsCsv));
  const yearRows = rowsToObjects(parseCsv(yearsCsv));
  const eventRows = rowsToObjects(parseCsv(eventsCsv));
  const concepts = buildConcepts(objectsRows, termsRows);

  const output = {
    meta: {
      exportedAt: new Date().toISOString(),
      spreadsheetId: SPREADSHEET_ID,
      tabs: TABS,
      notes:
        "עדכן קבצים אלה כשהגיליונות משתנים, או הרץ: node scripts/sync-sheet.js",
    },
    concepts,
    sheets: {
      objects: objectsRows,
      terms: termsRows,
    },
  };

  fs.writeFileSync(OUT_SHEET, JSON.stringify(output, null, 2) + "\n", "utf8");
  const yearCount = writeTermYearsCsv(yearRows);
  const eventCount = writeTimelineEventsCsv(eventRows);

  const termCount = concepts.reduce((n, c) => n + c.terms.length, 0);
  console.log(`Synced ${concepts.length} objects, ${termCount} terms -> ${OUT_SHEET}`);
  console.log(`Synced ${yearCount} term-year ranges -> ${OUT_YEARS}`);
  console.log(`Synced ${eventCount} timeline events -> ${OUT_EVENTS}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
