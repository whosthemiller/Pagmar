#!/usr/bin/env node
/**
 * מיישם ייצוא ממעבדת bleed-text-lab על קבצי הפרויקט.
 * הרצה: node scripts/apply-bleed-text-prefs.js data/bleed-text-lab-export.json
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PREFS_PATH = path.join(ROOT, "data", "bleed-text-prefs.json");
const TERM_IMAGES_PATH = path.join(ROOT, "data", "term-images.json");

const TEXT_MODES = new Set(["auto", "dark", "light"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeTextMode(value) {
  return TEXT_MODES.has(value) ? value : "auto";
}

function reorderTermImages(termImages, termName, imageUrl) {
  const entry = termImages.terms?.[termName];
  if (!entry?.images?.length) {
    return { updated: false, reason: "term-not-found" };
  }
  const index = entry.images.findIndex((image) => image?.url === imageUrl);
  if (index < 0) {
    return { updated: false, reason: "image-not-found" };
  }
  if (index === 0) {
    return { updated: false, reason: "already-first" };
  }
  const [picked] = entry.images.splice(index, 1);
  entry.images.unshift(picked);
  return { updated: true };
}

function main() {
  const exportPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.join(ROOT, "data", "bleed-text-lab-export.json");

  if (!fs.existsSync(exportPath)) {
    console.error(`לא נמצא קובץ ייצוא: ${exportPath}`);
    process.exit(1);
  }

  const exportData = readJson(exportPath);
  const prefs = fs.existsSync(PREFS_PATH)
    ? readJson(PREFS_PATH)
    : { meta: { version: 1 }, terms: {} };
  const termImages = readJson(TERM_IMAGES_PATH);

  prefs.meta = { version: 1, ...(prefs.meta || {}) };
  prefs.terms = prefs.terms || {};

  const summary = {
    textUpdated: 0,
    imageUpdated: 0,
    imageSkipped: [],
    termsMissing: [],
  };

  for (const [termName, entry] of Object.entries(exportData.terms || {})) {
    if (!entry || typeof entry !== "object") continue;

    prefs.terms[termName] = {
      navText: normalizeTextMode(entry.navText ?? prefs.terms[termName]?.navText),
      titleRowText: normalizeTextMode(
        entry.titleRowText ?? prefs.terms[termName]?.titleRowText
      ),
    };
    summary.textUpdated += 1;

    if (entry.imageUrl) {
      const result = reorderTermImages(termImages, termName, entry.imageUrl);
      if (result.updated) {
        summary.imageUpdated += 1;
      } else if (result.reason === "term-not-found") {
        summary.termsMissing.push(termName);
      } else if (result.reason === "image-not-found") {
        summary.imageSkipped.push(`${termName} (תמונה לא נמצאה)`);
      }
    }
  }

  writeJson(PREFS_PATH, prefs);
  writeJson(TERM_IMAGES_PATH, termImages);

  console.log("הוחל בהצלחה:");
  console.log(`  • ${summary.textUpdated} מונחים — bleed-text-prefs.json`);
  console.log(`  • ${summary.imageUpdated} מונחים — סידור מחדש ב-term-images.json`);
  if (summary.imageSkipped.length) {
    console.log("  • דילוג על תמונות:");
    summary.imageSkipped.forEach((line) => console.log(`    - ${line}`));
  }
  if (summary.termsMissing.length) {
    console.log("  • מונחים שלא נמצאו ב-term-images.json:");
    summary.termsMissing.forEach((name) => console.log(`    - ${name}`));
  }
}

main();
