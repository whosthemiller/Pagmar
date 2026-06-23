#!/usr/bin/env node
/**
 * בודק שכל המונחים כוללים לפחות תמונה אחת מתאימה ל-full bleed.
 * הרצה: node scripts/validate-term-images.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const JSON_PATH = path.join(ROOT, "data", "term-images.json");
const SHEET_PATH = path.join(ROOT, "data", "sheet-data.json");
const CSV_PATH = path.join(ROOT, "data", "insufficient-bleed-images.csv");

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

function escapeCsv(value) {
  const str = String(value ?? "");
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function main() {
  const sheet = JSON.parse(fs.readFileSync(SHEET_PATH, "utf8"));
  const allTerms = new Set(sheet.concepts.flatMap((c) => c.terms || []));
  const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

  const missingFiles = [];
  const noImages = [];
  const noBleed = [];

  for (const term of [...allTerms].sort((a, b) => a.localeCompare(b, "he"))) {
    const images = data.terms[term]?.images || [];
    if (!images.length) {
      noImages.push(term);
      continue;
    }

    let hasBleed = false;
    const fails = [];

    for (const image of images) {
      const absPath = path.join(ROOT, image.url);
      if (!fs.existsSync(absPath)) {
        missingFiles.push({ term, url: image.url });
        continue;
      }

      const size = getImagePixelSize(absPath);
      if (!size) {
        missingFiles.push({ term, url: image.url, reason: "no dimensions" });
        continue;
      }

      if (isBleedQuality(size)) {
        hasBleed = true;
      } else {
        fails.push({
          term,
          caption: image.caption || path.basename(image.url),
          url: image.url,
          width: size.width,
          height: size.height,
          scale: Number(getBleedCoverScale(size).toFixed(2)),
        });
      }
    }

    if (!hasBleed) {
      noBleed.push({ term, fails });
    }
  }

  const bleedOkCount = allTerms.size - noImages.length - noBleed.length;

  console.log("=== אימות תמונות מונחים ===");
  console.log(`מונחים בגיליון: ${allTerms.size}`);
  console.log(`מונחים עם לפחות תמונת bleed: ${bleedOkCount}`);
  console.log(`מונחים בלי תמונות: ${noImages.length}`);
  console.log(`מונחים בלי אף תמונת bleed: ${noBleed.length}`);
  console.log(`קבצים חסרים: ${missingFiles.length}`);

  if (noImages.length) {
    console.log("\nמונחים בלי תמונות:");
    for (const term of noImages) console.log(`  - ${term}`);
  }

  if (missingFiles.length) {
    console.log("\nקבצים חסרים:");
    for (const row of missingFiles) console.log(`  - ${row.term}: ${row.url}`);
  }

  if (noBleed.length) {
    console.log("\nמונחים בלי אף תמונת bleed:");
    for (const row of noBleed) {
      const best = [...row.fails].sort((a, b) => a.scale - b.scale)[0];
      console.log(
        `  - ${row.term} (הכי טוב: ${best.width}×${best.height}, ×${best.scale})`
      );
    }

    const csvRows = [
      [
        "שם_קובץ",
        "רוחב",
        "גובה",
        "ממדים",
        "מקדם_הגדלה",
        "כותרת",
        "מונח",
        "נתיב",
      ].join(","),
    ];

    const flatFails = noBleed.flatMap((row) => row.fails);
    flatFails.sort((a, b) => b.scale - a.scale || a.term.localeCompare(b.term, "he"));

    for (const row of flatFails) {
      csvRows.push(
        [
          escapeCsv(path.basename(row.url)),
          row.width,
          row.height,
          escapeCsv(`${row.width}×${row.height}`),
          row.scale,
          escapeCsv(row.caption),
          escapeCsv(row.term),
          escapeCsv(row.url),
        ].join(",")
      );
    }

    fs.writeFileSync(CSV_PATH, `\uFEFF${csvRows.join("\n")}\n`, "utf8");
    console.log(`\nנכתב: ${CSV_PATH} (${flatFails.length} שורות)`);
  } else if (fs.existsSync(CSV_PATH)) {
    fs.unlinkSync(CSV_PATH);
    console.log(`\nנמחק: ${CSV_PATH} (כל המונחים עוברים)`);
  }

  const ok =
    !noImages.length && !missingFiles.length && !noBleed.length;
  process.exit(ok ? 0 : 1);
}

main();
