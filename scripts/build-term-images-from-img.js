#!/usr/bin/env node
/**
 * בונה data/term-images.json מתיקיית assets/img (תיקייה לכל מונח, 3 תמונות).
 * הכותרת = שם הקובץ ללא סיומת.
 * הרצה: node scripts/build-term-images-from-img.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const IMG_ROOT = path.join(ROOT, "assets", "img");
const JSON_PATH = path.join(ROOT, "data", "term-images.json");
const SHEET_PATH = path.join(ROOT, "data", "sheet-data.json");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

/** תיקייה → שם מונח בגיליון */
const FOLDER_ALIASES = {
  "0שמלאנים": "0מאלנים",
  שמלאנים: "שמאלנים",
  "אזור החיץ": "אזור חיץ",
  "רצועת בטחון": "רצועת הבטחון",
  "אירוע ה-7 באוקטובר": "אירוע ה־7 באוקטובר",
  "טבח ה-7 באוקטובר": "טבח ה־7 באוקטובר",
  "מלחמת ה-7 באוקטובר": "מלחמת ה־7 באוקטובר",
  "מתקפת ה-7 באוקטובר": "מתקפת ה־7 באוקטובר",
  "מאורעות תרצ״ו - תרצ״ט": "מאורעות תרצ״ו–תרצ”ט",
};

function loadTerms() {
  const sheet = JSON.parse(fs.readFileSync(SHEET_PATH, "utf8"));
  return new Set(sheet.concepts.flatMap((c) => c.terms || []));
}

function toPosixRel(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join("/");
}

function captionFromFilename(filename) {
  return path.basename(filename, path.extname(filename));
}

const BLEED_VIEWPORT = { width: 1920, height: 1080 };
const BLEED_MAX_UPSCALE = 1.65;
const BLEED_MIN_SHORT_EDGE = 560;

function getImagePixelSize(filePath) {
  try {
    const out = execSync(
      `sips -g pixelWidth -g pixelHeight ${JSON.stringify(filePath)}`,
      { encoding: "utf8" }
    );
    const width = out.match(/pixelWidth: (\d+)/);
    const height = out.match(/pixelHeight: (\d+)/);
    if (width && height) {
      return { width: Number(width[1]), height: Number(height[1]) };
    }
  } catch {
    // fall through
  }
  return null;
}

function getBleedCoverScale(size) {
  return Math.max(
    BLEED_VIEWPORT.width / size.width,
    BLEED_VIEWPORT.height / size.height
  );
}

function isBleedQuality(size) {
  if (!size) return false;
  const shortEdge = Math.min(size.width, size.height);
  return (
    shortEdge >= BLEED_MIN_SHORT_EDGE &&
    getBleedCoverScale(size) <= BLEED_MAX_UPSCALE
  );
}

function isDisplayVariant(filename) {
  return /-display\.webp$/i.test(filename);
}

/** Prefer full-bleed assets, then largest short edge, then filename. Skips -display.webp variants. */
function pickImagesForTerm(dir, maxCount = 3, preferredBleedUrl = null) {
  const files = fs
    .readdirSync(dir)
    .filter(
      (name) =>
        IMAGE_EXTS.has(path.extname(name).toLowerCase()) && !isDisplayVariant(name)
    );

  const ranked = files
    .map((name) => {
      const absPath = path.join(dir, name);
      const size = getImagePixelSize(absPath);
      const bleedOk = isBleedQuality(size);
      const shortEdge = size ? Math.min(size.width, size.height) : 0;
      const coverScale = size ? getBleedCoverScale(size) : Infinity;
      const url = toPosixRel(absPath);
      return { name, url, bleedOk, shortEdge, coverScale };
    })
    .sort((a, b) => {
      if (a.bleedOk !== b.bleedOk) return a.bleedOk ? -1 : 1;
      if (b.shortEdge !== a.shortEdge) return b.shortEdge - a.shortEdge;
      if (a.coverScale !== b.coverScale) return a.coverScale - b.coverScale;
      return a.name.localeCompare(b.name, "he");
    });

  const picked = [];
  const seen = new Set();

  if (preferredBleedUrl) {
    const preferred = ranked.find((row) => row.url === preferredBleedUrl);
    if (preferred) {
      picked.push(preferred);
      seen.add(preferred.url);
    }
  }

  for (const row of ranked) {
    if (picked.length >= maxCount) break;
    if (seen.has(row.url)) continue;
    picked.push(row);
    seen.add(row.url);
  }

  return picked.slice(0, maxCount).map(({ url, name }) => ({
    url,
    source: "local",
    caption: captionFromFilename(name),
  }));
}

function loadExistingBleedChoices() {
  if (!fs.existsSync(JSON_PATH)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
    const map = new Map();
    for (const [termName, entry] of Object.entries(data.terms || {})) {
      const primary = entry?.images?.[0]?.url;
      if (primary) map.set(termName, primary);
    }
    return map;
  } catch {
    return new Map();
  }
}

function build() {
  const terms = loadTerms();
  const existingBleedChoices = loadExistingBleedChoices();
  const result = {
    meta: {
      generatedAt: new Date().toISOString(),
      imagesPerTerm: 3,
      source: "assets/img",
      note: "תמונות מקומיות לפי מונח; הכותרת = שם הקובץ. התמונה הראשונה ברשימה = פול בליד קבוע.",
    },
    terms: {},
  };

  const folders = fs
    .readdirSync(IMG_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, "he"));

  const mapped = [];
  const skipped = [];
  const missingTerms = [];

  for (const folder of folders) {
    const termName = FOLDER_ALIASES[folder] || folder;
    const dir = path.join(IMG_ROOT, folder);
    const images = pickImagesForTerm(dir, 3, existingBleedChoices.get(termName));

    if (!images.length) {
      skipped.push(folder);
      continue;
    }

    if (!terms.has(termName)) {
      missingTerms.push({ folder, termName, count: images.length });
      continue;
    }

    result.terms[termName] = { images };
    mapped.push({ folder, termName, count: images.length });
  }

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log(`נכתב: ${JSON_PATH}`);
  console.log(`מונחים עם תמונות: ${Object.keys(result.terms).length}`);
  console.log(`סה"כ תמונות: ${Object.values(result.terms).reduce((n, t) => n + t.images.length, 0)}`);

  const withoutImages = [...terms].filter((t) => !result.terms[t]).sort((a, b) => a.localeCompare(b, "he"));
  if (withoutImages.length) {
    console.log(`\nמונחים בלי תמונות (${withoutImages.length}):`);
    for (const t of withoutImages) console.log(`  - ${t}`);
  }

  if (missingTerms.length) {
    console.log(`\nתיקיות בלי מונח מתאים (${missingTerms.length}):`);
    for (const row of missingTerms) console.log(`  - ${row.folder} → ${row.termName}`);
  }

  if (skipped.length) {
    console.log(`\nתיקיות ריקות (${skipped.length}):`);
    for (const f of skipped) console.log(`  - ${f}`);
  }
}

build();
