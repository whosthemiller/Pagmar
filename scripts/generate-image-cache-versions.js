#!/usr/bin/env node
/**
 * Writes data/image-cache-versions.json — MD5 fingerprints for every WebP under assets/img.
 * Run after replacing any term / splash image so browsers fetch the new bytes:
 *
 *   node scripts/generate-image-cache-versions.js
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const IMG_ROOT = path.join(ROOT, "assets", "img");
const OUT_PATH = path.join(ROOT, "data", "image-cache-versions.json");

function walkWebpFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkWebpFiles(absPath));
    } else if (entry.name.toLowerCase().endsWith(".webp")) {
      results.push(absPath);
    }
  }
  return results;
}

function fileCacheVersion(absPath) {
  const hash = crypto.createHash("md5").update(fs.readFileSync(absPath)).digest("hex");
  return hash.slice(0, 8);
}

function main() {
  if (!fs.existsSync(IMG_ROOT)) {
    console.error(`Missing ${IMG_ROOT}`);
    process.exit(1);
  }

  const versions = {};
  const files = walkWebpFiles(IMG_ROOT).sort();
  for (const absPath of files) {
    const rel = path.relative(ROOT, absPath).replace(/\\/g, "/");
    versions[rel] = fileCacheVersion(absPath);
  }

  const buildId = crypto
    .createHash("md5")
    .update(JSON.stringify(versions))
    .digest("hex")
    .slice(0, 8);

  const payload = {
    meta: {
      version: 1,
      generatedAt: new Date().toISOString(),
      buildId,
      note: "Auto-generated. Run after replacing images; copy to submission PC with assets/.",
    },
    versions,
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${Object.keys(versions).length} entries to ${path.relative(ROOT, OUT_PATH)}`);
}

main();
