#!/usr/bin/env node
/**
 * ממיר קבצי .avif בתיקיית assets/img ל-.webp (האתר לא תומך ב-avif).
 * הרצה: node scripts/convert-avif-images.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const IMG_ROOT = path.join(ROOT, "assets", "img");
const WEBP_QUALITY = 85;

function findAvifFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAvifFiles(absPath));
    } else if (path.extname(entry.name).toLowerCase() === ".avif") {
      results.push(absPath);
    }
  }
  return results;
}

function convertAvifToWebp(avifPath) {
  const webpPath = avifPath.replace(/\.avif$/i, ".webp");
  if (fs.existsSync(webpPath)) {
    console.log(`דילוג (כבר קיים): ${path.relative(ROOT, webpPath)}`);
    fs.unlinkSync(avifPath);
    return "skipped";
  }

  execSync(
    `magick ${JSON.stringify(avifPath)} -quality ${WEBP_QUALITY} ${JSON.stringify(webpPath)}`,
    { stdio: "inherit" }
  );
  fs.unlinkSync(avifPath);
  console.log(`הומר: ${path.relative(ROOT, avifPath)} → ${path.relative(ROOT, webpPath)}`);
  return "converted";
}

function main() {
  const avifFiles = findAvifFiles(IMG_ROOT);
  if (!avifFiles.length) {
    console.log("לא נמצאו קבצי avif.");
    return;
  }

  let converted = 0;
  let skipped = 0;
  for (const avifPath of avifFiles) {
    const result = convertAvifToWebp(avifPath);
    if (result === "converted") converted++;
    else skipped++;
  }

  console.log(`\nסה"כ: ${converted} הומרו, ${skipped} דולגו.`);
}

main();
