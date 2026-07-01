#!/usr/bin/env node
/**
 * מכווץ תמונות bleed כבדות (>800KB או >3072px) בלי לפגוע באיכות נראית.
 * 3072px מספיק ל-full bleed במחשב ההגשה (2048×1152 @2x).
 *
 *   node scripts/optimize-heavy-bleed-images.js --dry-run
 *   node scripts/optimize-heavy-bleed-images.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const IMG_ROOT = path.join(ROOT, "assets", "img");
const BLEED_MAX_EDGE = 3072;
const QUALITY = 84;
const MIN_BYTES = 800 * 1024;

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
  const out = execSync(
    `sips -g pixelWidth -g pixelHeight ${JSON.stringify(filePath)}`,
    { encoding: "utf8" }
  );
  const width = Number(out.match(/pixelWidth: (\d+)/)?.[1] || 0);
  const height = Number(out.match(/pixelHeight: (\d+)/)?.[1] || 0);
  return { width, height, bytes: fs.statSync(filePath).st_size };
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function needsOptimize(info) {
  const longEdge = Math.max(info.width, info.height);
  return info.bytes > MIN_BYTES || longEdge > BLEED_MAX_EDGE;
}

function optimizeFile(srcPath, { dryRun }) {
  const rel = path.relative(ROOT, srcPath);
  const info = getImageInfo(srcPath);
  if (!needsOptimize(info)) {
    return { status: "skipped", rel };
  }

  const longEdge = Math.max(info.width, info.height);
  const resize =
    longEdge > BLEED_MAX_EDGE
      ? `-resize ${BLEED_MAX_EDGE}x${BLEED_MAX_EDGE}`
      : "";

  if (dryRun) {
    return {
      status: "would-optimize",
      rel,
      from: `${info.width}×${info.height}`,
      bytes: info.bytes,
    };
  }

  const tmpPath = srcPath + ".tmp.webp";
  execSync(
    [
      "magick",
      JSON.stringify(srcPath),
      resize,
      "-strip",
      "-quality",
      String(QUALITY),
      "-define",
      "webp:method=6",
      JSON.stringify(tmpPath),
    ]
      .filter(Boolean)
      .join(" "),
    { stdio: "pipe" }
  );

  const newBytes = fs.statSync(tmpPath).size;
  if (newBytes >= info.bytes * 0.97 && longEdge <= BLEED_MAX_EDGE) {
    fs.unlinkSync(tmpPath);
    return { status: "skipped", rel, reason: "כבר מותאם" };
  }

  fs.renameSync(tmpPath, srcPath);
  const newInfo = getImageInfo(srcPath);
  return {
    status: "optimized",
    rel,
    from: `${info.width}×${info.height}`,
    to: `${newInfo.width}×${newInfo.height}`,
    bytesBefore: info.bytes,
    bytesAfter: newBytes,
  };
}

function regenerateDisplay(srcPath) {
  const displayPath = srcPath.replace(/\.webp$/i, "-display.webp");
  const info = getImageInfo(srcPath);
  const displayMax = 2048;
  const longEdge = Math.max(info.width, info.height);
  const resize =
    longEdge > displayMax ? `-resize ${displayMax}x${displayMax}` : "";
  const tmpPath = displayPath + ".tmp.webp";
  execSync(
    [
      "magick",
      JSON.stringify(srcPath),
      resize,
      "-strip",
      "-quality",
      "82",
      "-define",
      "webp:method=6",
      JSON.stringify(tmpPath),
    ]
      .filter(Boolean)
      .join(" "),
    { stdio: "pipe" }
  );
  fs.renameSync(tmpPath, displayPath);
}

function main() {
  const opts = parseArgs();
  const files = findSourceWebpFiles(IMG_ROOT);
  let optimized = 0;
  let saved = 0;

  console.log(
    `סריקת ${files.length} תמונות. bleed max-edge=${BLEED_MAX_EDGE}, quality=${QUALITY}, מעל ${formatBytes(MIN_BYTES)}`
  );
  if (opts.dryRun) console.log("מצב dry-run.\n");

  for (const filePath of files) {
    const result = optimizeFile(filePath, opts);
    if (result.status === "optimized") {
      optimized++;
      saved += result.bytesBefore - result.bytesAfter;
      regenerateDisplay(filePath);
      console.log(
        `✓ ${result.rel} ${result.from} → ${result.to}: ${formatBytes(result.bytesBefore)} → ${formatBytes(result.bytesAfter)}`
      );
    } else if (result.status === "would-optimize") {
      console.log(
        `○ ${result.rel} ${result.from} (${formatBytes(result.bytes)})`
      );
    }
  }

  console.log("\n--- סיכום ---");
  if (opts.dryRun) {
    console.log("להרצה: node scripts/optimize-heavy-bleed-images.js");
  } else {
    console.log(`${optimized} עודכנו, חיסכון ~${formatBytes(saved)}`);
  }
}

main();
