#!/usr/bin/env node
/**
 * ממיר ומכווץ תמונות ב-assets/img לפורמט WebP מותאם לרשת.
 *
 * הערה: 72 DPI הוא מטא-דאטה בלבד — בדפדפן מה שקובע הוא מספר הפיקסלים והדחיסה.
 * הסקריפט מגדיר DPI=72 ומקטין תמונות שגדולות מדי לרזולוציית מסך (4096px על הצלע
 * הארוכה = מספיק ל-full bleed במחשב ההגשה 2048×1152 @2x).
 *
 * שימוש:
 *   node scripts/optimize-images-for-web.js --dry-run   # תצוגה מקדימה
 *   node scripts/optimize-images-for-web.js             # המרה בפועל
 *   node scripts/optimize-images-for-web.js --max-edge 2048  # יותר אגרסיבי
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const IMG_ROOT = path.join(ROOT, "assets", "img");
const JSON_PATHS = [
  path.join(ROOT, "data", "term-images.json"),
  path.join(ROOT, "data", "splash-images.json"),
];

const WEBP_QUALITY = 85;
const TARGET_DPI = 72;
/** מחשב ההגשה 2048 CSS px × DPR 2 */
const DEFAULT_MAX_EDGE = 4096;

const SOURCE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const maxEdgeIdx = args.indexOf("--max-edge");
  const maxEdge =
    maxEdgeIdx >= 0 && args[maxEdgeIdx + 1]
      ? Number(args[maxEdgeIdx + 1])
      : DEFAULT_MAX_EDGE;
  if (!Number.isFinite(maxEdge) || maxEdge < 512) {
    console.error("ערך --max-edge לא תקין");
    process.exit(1);
  }
  return { dryRun, maxEdge };
}

function findImageFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findImageFiles(absPath));
    } else if (SOURCE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(absPath);
    }
  }
  return results;
}

function getImageInfo(filePath) {
  try {
    const out = execSync(
      `sips -g pixelWidth -g pixelHeight -g format ${JSON.stringify(filePath)}`,
      { encoding: "utf8" }
    );
    const width = Number(out.match(/pixelWidth: (\d+)/)?.[1] || 0);
    const height = Number(out.match(/pixelHeight: (\d+)/)?.[1] || 0);
    const format = out.match(/format: (\w+)/)?.[1] || "";
    return { width, height, format, bytes: fs.statSync(filePath).size };
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function buildResizeArgs(width, height, maxEdge) {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return "";
  const scale = maxEdge / longEdge;
  const newW = Math.max(1, Math.round(width * scale));
  const newH = Math.max(1, Math.round(height * scale));
  return `-resize ${newW}x${newH}`;
}

function optimizeImage(srcPath, { dryRun, maxEdge }) {
  const ext = path.extname(srcPath).toLowerCase();
  const rel = path.relative(ROOT, srcPath);
  const info = getImageInfo(srcPath);
  if (!info || !info.width || !info.height) {
    return { status: "error", rel, reason: "לא ניתן לקרוא מידע" };
  }

  const resizeArgs = buildResizeArgs(info.width, info.height, maxEdge);
  const targetPath =
    ext === ".webp"
      ? srcPath
      : srcPath.slice(0, -ext.length) + ".webp";
  const targetRel = path.relative(ROOT, targetPath);
  const willReplace = ext !== ".webp";
  const needsWork = willReplace || resizeArgs || info.bytes > 400 * 1024;

  if (!needsWork) {
    return { status: "skipped", rel, bytes: info.bytes };
  }

  const newW = resizeArgs
    ? Math.round(info.width * (maxEdge / Math.max(info.width, info.height)))
    : info.width;
  const newH = resizeArgs
    ? Math.round(info.height * (maxEdge / Math.max(info.width, info.height)))
    : info.height;

  if (dryRun) {
    return {
      status: "would-convert",
      rel,
      targetRel: targetRel !== rel ? targetRel : null,
      from: `${info.width}×${info.height}`,
      to: `${newW}×${newH}`,
      bytes: info.bytes,
    };
  }

  const tmpPath = targetPath + ".tmp.webp";
  const magickCmd = [
    "magick",
    JSON.stringify(srcPath),
    resizeArgs,
    "-strip",
    "-units PixelsPerInch",
    `-density ${TARGET_DPI}`,
    "-quality",
    String(WEBP_QUALITY),
    JSON.stringify(tmpPath),
  ]
    .filter(Boolean)
    .join(" ");

  execSync(magickCmd, { stdio: "pipe" });
  const newBytes = fs.statSync(tmpPath).size;

  if (targetPath === srcPath && newBytes >= info.bytes * 0.95) {
    fs.unlinkSync(tmpPath);
    return { status: "skipped", rel, bytes: info.bytes, reason: "כבר מותאם" };
  }

  fs.renameSync(tmpPath, targetPath);
  if (willReplace && fs.existsSync(srcPath)) {
    fs.unlinkSync(srcPath);
  }

  return {
    status: "converted",
    rel,
    targetRel: targetRel !== rel ? targetRel : null,
    from: `${info.width}×${info.height}`,
    to: `${newW}×${newH}`,
    bytesBefore: info.bytes,
    bytesAfter: newBytes,
  };
}

function updateJsonPaths() {
  for (const jsonPath of JSON_PATHS) {
    if (!fs.existsSync(jsonPath)) continue;
    let text = fs.readFileSync(jsonPath, "utf8");
    const before = text;
    text = text.replace(/\.(jpe?g|png|gif)(?=\\?")/gi, ".webp");
    if (text !== before) {
      fs.writeFileSync(jsonPath, text, "utf8");
      console.log(`עודכן: ${path.relative(ROOT, jsonPath)}`);
    }
  }
}

function main() {
  const opts = parseArgs();
  const files = findImageFiles(IMG_ROOT);
  console.log(
    `נמצאו ${files.length} תמונות. max-edge=${opts.maxEdge}px, quality=${WEBP_QUALITY}, DPI=${TARGET_DPI}`
  );
  if (opts.dryRun) console.log("מצב dry-run — לא נכתב כלום לדיסק.\n");

  let converted = 0;
  let skipped = 0;
  let wouldConvert = 0;
  let savedBytes = 0;
  let totalBefore = 0;

  for (const filePath of files) {
    const result = optimizeImage(filePath, opts);
    if (result.status === "converted") {
      converted++;
      savedBytes += result.bytesBefore - result.bytesAfter;
      totalBefore += result.bytesBefore;
      const resizeNote =
        result.from !== result.to ? ` ${result.from} → ${result.to}` : "";
      const renameNote = result.targetRel ? ` → ${result.targetRel}` : "";
      console.log(
        `✓ ${result.rel}${renameNote}${resizeNote}: ${formatBytes(result.bytesBefore)} → ${formatBytes(result.bytesAfter)}`
      );
    } else if (result.status === "would-convert") {
      wouldConvert++;
      totalBefore += result.bytes;
      const resizeNote =
        result.from !== result.to ? ` ${result.from} → ${result.to}` : "";
      const renameNote = result.targetRel ? ` → ${result.targetRel}` : "";
      console.log(
        `○ ${result.rel}${renameNote}${resizeNote} (${formatBytes(result.bytes)})`
      );
    } else if (result.status === "skipped") {
      skipped++;
    } else {
      console.warn(`✗ ${result.rel}: ${result.reason}`);
    }
  }

  if (!opts.dryRun && converted > 0) {
    updateJsonPaths();
  }

  console.log("\n--- סיכום ---");
  if (opts.dryRun) {
    console.log(`${wouldConvert} יומרו/יוקטנו, ${skipped} כבר מותאמות`);
    console.log(`גודל נוכחי של קבצים שיושפעו: ~${formatBytes(totalBefore)}`);
    console.log('\nלהרצה בפועל: node scripts/optimize-images-for-web.js');
  } else {
    console.log(`${converted} הומרו, ${skipped} דולגו`);
    if (savedBytes > 0) {
      console.log(`חיסכון: ~${formatBytes(savedBytes)}`);
    }
    if (converted > 0) {
      console.log(
        '\nמומלץ: node scripts/build-term-images-from-img.js && node scripts/validate-term-images.js'
      );
    }
  }
}

main();
