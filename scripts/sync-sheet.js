#!/usr/bin/env node
/**
 * מושך את גיליונות "אובייקטים" ו"מונחים" מ-Google Sheets וכותב sheet-data.json.
 * הרצה: node scripts/sync-sheet.js
 * הגיליון חייב להיות נגיש לייצוא CSV (ציבורי או קישור לכל מי שיש לו).
 */

const fs = require("fs");
const path = require("path");

const SPREADSHEET_ID = "1QS5G0Q0a5kDT9xd3LSTBppMV6juoveS-P5lEG89moSU";
const TABS = {
  objects: { gid: "971020560", description: "אובייקטים" },
  terms: { gid: "618101576", description: "מונחים" },
};
const OUT_PATH = path.join(__dirname, "..", "data", "sheet-data.json");

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

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((values) => {
    const record = {};
    for (let i = 0; i < header.length; i++) {
      record[header[i]] = values[i] || "";
    }
    return record;
  });
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

async function main() {
  const [objectsRes, termsRes] = await Promise.all([
    fetch(buildCsvUrl(SPREADSHEET_ID, TABS.objects.gid)),
    fetch(buildCsvUrl(SPREADSHEET_ID, TABS.terms.gid)),
  ]);

  if (!objectsRes.ok || !termsRes.ok) {
    console.error("Fetch failed:", objectsRes.status, termsRes.status);
    process.exit(1);
  }

  const [objectsCsv, termsCsv] = await Promise.all([
    objectsRes.text(),
    termsRes.text(),
  ]);

  const objectsRows = rowsToObjects(parseCsv(objectsCsv));
  const termsRows = rowsToObjects(parseCsv(termsCsv));
  const concepts = buildConcepts(objectsRows, termsRows);

  const output = {
    meta: {
      exportedAt: new Date().toISOString(),
      spreadsheetId: SPREADSHEET_ID,
      tabs: TABS,
      notes:
        "עדכן קובץ זה כשהגיליונות משתנים, או הרץ: node sync-sheet.js",
    },
    concepts,
    sheets: {
      objects: objectsRows,
      terms: termsRows,
    },
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

  const termCount = concepts.reduce((n, c) => n + c.terms.length, 0);
  console.log(`Synced ${concepts.length} objects, ${termCount} terms -> ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
