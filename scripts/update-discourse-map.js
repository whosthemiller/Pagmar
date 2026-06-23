#!/usr/bin/env node
/**
 * מייצר מחדש את TERM_DISCOURSE_GROUP מעמודת "מי משתמש במונח" ב-sheet-data.json.
 * הרצה: node scripts/update-discourse-map.js
 */

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "sheet-data.json");
const MAP_PATH = path.join(__dirname, "..", "js", "term-discourse-map.js");

function escapeJsString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatTermMap(entries) {
  const lines = entries.map(
    ([name, group]) => `  "${escapeJsString(name)}": "${group}"`
  );
  return `export const TERM_DISCOURSE_GROUP = {\n${lines.join(",\n")},\n};`;
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`Missing ${DATA_PATH}. Run: node scripts/sync-sheet.js`);
    process.exit(1);
  }

  const { deriveDiscourseGroup } = await import(
    new URL("../js/term-discourse-map.js", `file://${__dirname}/`)
  );

  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const entries = [];
  const counts = {};

  for (const row of data.sheets?.terms || []) {
    const name = (row["שם מונח"] || "").trim().replace(/\n/g, "");
    const usedBy = (row["מי משתמש במונח"] || "").trim();
    if (!name) continue;

    const group = deriveDiscourseGroup(usedBy);
    if (!group) {
      console.warn(`No discourse group for: ${name}`);
      continue;
    }

    entries.push([name, group]);
    counts[group] = (counts[group] || 0) + 1;
  }

  entries.sort((a, b) => a[0].localeCompare(b[0], "he"));

  const source = fs.readFileSync(MAP_PATH, "utf8");
  const replacement = formatTermMap(entries);
  const updated = source.replace(
    /export const TERM_DISCOURSE_GROUP = \{[\s\S]*?\};/,
    replacement
  );

  if (updated === source) {
    console.error("Failed to update TERM_DISCOURSE_GROUP block");
    process.exit(1);
  }

  fs.writeFileSync(MAP_PATH, updated, "utf8");

  console.log(`Updated ${entries.length} terms in ${MAP_PATH}`);
  for (const group of [
    "ממשלה",
    "ימין",
    "שמאל",
    "זכויות אדם",
    "פלסטיני",
    "בינלאומי",
    "אקדמיה",
  ]) {
    console.log(`  ${group}: ${counts[group] || 0}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
