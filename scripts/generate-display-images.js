#!/usr/bin/env node
/**
 * יוצר גרסאות תצוגה קלות (-display.webp) ליד כל תמונת מקור.
 * משמש לתמונות inline / thumbnails; bleed נשאר על הקובץ המלא.
 *
 *   node scripts/generate-display-images.js
 *   node scripts/generate-display-images.js --dry-run
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const IMG_ROOT = path.join(ROOT, "assets", "img");
const DISPLAY_MAX_EDGE = 2048;
const DISPLAY_QUALITY = 82;

function parseArgs() {
  return { dryRun: process.argv.includes("--dry-run") };
}

function findSourceWebpFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSourceWebpFiles(absPath));
    } else if (
      entry.name.toLowerCase().endsWith(".webp") &&
      !entry.name.toLowerCase().endsWith("-display.webp")
    ) {
      results.push(absPath);
    }
  }
  return results;
}

function getImageInfo(filePath) {
  try {
    const out = execSync(
      `sips -g pixelWidth -g pixelHeight ${JSON.stringify(filePath)}`,
      { encoding: "utf8" }
    );
    const width = Number(out.match(/pixelWidth: (\d+)/)?.[1] || 0);
    const height = Number(out.match(/pixelHeight: (\d+)/)?.[1] || 0);
    return { width, height, bytes: fs.statSync(filePath).size };
  } catch {
    return null;
  }
}

function buildResizeArgs(width, height) {
  const longEdge = Math.max(width, height);
  if (longEdge <= DISPLAY_MAX_EDGE) return "";
  const scale = DISPLAY_MAX_EDGE / longEdge;
  const newW = Math.max(1, Math.round(width * scale));
  const newH = Math.max(1, Math.round(height * scale));
  return `-resize ${newW}x${newH}`;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function generateDisplayVariant(srcPath, { dryRun }) {
  const rel = path.relative(ROOT, srcPath);
  const displayPath = srcPath.replace(/\.webp$/i, "-display.webp");
  const displayRel = path.relative(ROOT, displayPath);
  const info = getImageInfo(srcPath);
  if (!info) return { status: "error", rel, reason: "לא ניתן לקרוא" };

  const resizeArgs = buildResizeArgs(info.width, info.height);
  const needsResize = Boolean(resizeArgs);
  const displayExists = fs.existsSync(displayPath);

  if (displayExists && !needsResize) {
    const displayBytes = fs.statSync(displayPath).size;
    if (displayBytes <= info.bytes * 0.95) {
      return { status: "skipped", rel, bytes: displayBytes };
    }
  }

  if (dryRun) {
    return {
      status: "would-generate",
      rel,
      displayRel,
      from: `${info.width}×${info.height}`,
      bytes: info.bytes,
    };
  }

  const tmpPath = displayPath + ".tmp.webp";
  const magickCmd = [
    "magick",
    JSON.stringify(srcPath),
    resizeArgs,
    "-strip",
    "-quality",
    String(DISPLAY_QUALITY),
    JSON.stringify(tmpPath),
  ]
    .filter(Boolean)
    .join(" ");

  execSync(magickCmd, { stdio: "pipe" });
  const newBytes = fs.statSync(tmpPath).size;

  if (displayExists && newBytes >= fs.statSync(displayPath).size * 0.98) {
    fs.unlinkSync(tmpPath);
    return { status: "skipped", rel, bytes: fs.statSync(displayPath).size };
  }

  fs.renameSync(tmpPath, displayPath);
  return {
    status: "generated",
    rel,
    displayRel,
    bytesBefore: info.bytes,
    bytesAfter: newBytes,
  };
}

function main() {
  const opts = parseArgs();
  const files = findSourceWebpFiles(IMG_ROOT);
  console.log(
    `נמצאו ${files.length} תמונות מקור. display: max-edge=${DISPLAY_MAX_EDGE}, quality=${DISPLAY_QUALITY}`
  );
  if (opts.dryRun) console.log("מצב dry-run.\n");

  let generated = 0;
  let skipped = 0;
  let savedBytes = 0;

  for (const filePath of files) {
    const result = generateDisplayVariant(filePath, opts);
    if (result.status === "generated") {
      generated++;
      savedBytes += result.bytesBefore - result.bytesAfter;
      console.log(
        `✓ ${result.rel} → ${result.displayRel}: ${formatBytes(result.bytesBefore)} → ${formatBytes(result.bytesAfter)}`
      );
    } else if (result.status === "would-generate") {
      console.log(`○ ${result.rel} → ${result.displayRel} (${formatBytes(result.bytes)})`);
    } else if (result.status === "skipped") {
      skipped++;
    } else {
      console.warn(`✗ ${result.rel}: ${result.reason}`);
    }
  }

  console.log("\n--- סיכום ---");
  if (opts.dryRun) {
    console.log("להרצה: node scripts/generate-display-images.js");
  } else {
    console.log(`${generated} נוצרו/עודכנו, ${skipped} דולגו`);
    if (savedBytes > 0) console.log(`חיסכון לעומת מקור: ~${formatBytes(savedBytes)}`);
  }
}

main();
