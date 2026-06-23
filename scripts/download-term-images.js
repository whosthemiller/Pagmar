#!/usr/bin/env node
/**
 * מוריד תמונות מונחים מ-Wikimedia ושומר מקומית ב-assets/term-images/.
 * מעדכן data/term-images.json אחרי כל תמונה (ניתן להמשיך מאמצע).
 * הרצה: node scripts/download-term-images.js
 */

const crypto = require("crypto");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const JSON_PATH = path.join(ROOT, "data", "term-images.json");
const OUT_DIR = path.join(ROOT, "assets", "term-images");
const DELAY_MS = 12000;
const USER_AGENT = "SunMapProject/1.0 (educational; Bezalel Pagmar)";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashUrl(url) {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 12);
}

function extFromUrl(url) {
  const clean = url.split("?")[0].split("#")[0];
  const match = clean.match(/\.(jpe?g|png|gif|webp|svg)$/i);
  return match ? `.${match[1].toLowerCase().replace("jpeg", "jpg")}` : "";
}

function isRemoteUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

function getRemoteUrl(image) {
  if (typeof image === "string") return isRemoteUrl(image) ? image : "";
  if (isRemoteUrl(image?.url)) return image.url;
  if (isRemoteUrl(image?.remoteUrl)) return image.remoteUrl;
  return "";
}

function findExistingLocal(remoteUrl) {
  for (const ext of [extFromUrl(remoteUrl), ".jpg", ".png", ".gif", ".webp", ".svg"]) {
    const rel = `assets/term-images/${hashUrl(remoteUrl)}${ext}`;
    if (fs.existsSync(path.join(ROOT, rel))) return rel;
  }
  return null;
}

function localRelPath(url, ext) {
  return `assets/term-images/${hashUrl(url)}${ext}`;
}

function saveJson(data) {
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function applyLocalToImage(image, remoteUrl, localPath) {
  if (typeof image === "string") return;
  if (!image?.url) return;
  if (!image.remoteUrl && isRemoteUrl(image.url)) image.remoteUrl = image.url;
  if (image.url === remoteUrl || image.remoteUrl === remoteUrl) image.url = localPath;
}

function syncExistingFiles(data) {
  let synced = 0;
  for (const entry of Object.values(data.terms || {})) {
    for (const image of entry?.images || []) {
      const remote = getRemoteUrl(image);
      if (!remote) continue;
      const local = findExistingLocal(remote);
      if (local) {
        applyLocalToImage(image, remote, local);
        synced++;
      }
    }
  }
  return synced;
}

function collectPendingUrls(data) {
  const pending = new Set();
  for (const entry of Object.values(data.terms || {})) {
    for (const image of entry?.images || []) {
      const remote = getRemoteUrl(image);
      if (remote && !findExistingLocal(remote)) pending.add(remote);
    }
  }
  return [...pending];
}

function sniffExt(filePath) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  if (buf[0] === 0xff && buf[1] === 0xd8) return ".jpg";
  if (buf.toString("ascii", 0, 8) === "\x89PNG\r\n\x1a\n") return ".png";
  if (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a") {
    return ".gif";
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return ".webp";
  }
  return extFromUrl(filePath) || ".jpg";
}

function downloadWithCurl(remoteUrl, outAbs) {
  execFileSync(
    "curl",
    ["-sfL", "--http1.1", "-A", USER_AGENT, "--max-time", "90", "-o", outAbs, remoteUrl],
    { stdio: "pipe" }
  );
  if (!fs.existsSync(outAbs) || fs.statSync(outAbs).size < 200) {
    fs.unlinkSync(outAbs);
    throw new Error("empty response");
  }
}

async function downloadOne(data, remoteUrl) {
  const tmpAbs = path.join(OUT_DIR, `${hashUrl(remoteUrl)}.part`);
  downloadWithCurl(remoteUrl, tmpAbs);
  const ext = sniffExt(tmpAbs);
  const local = localRelPath(remoteUrl, ext);
  const finalAbs = path.join(ROOT, local);
  fs.renameSync(tmpAbs, finalAbs);

  for (const entry of Object.values(data.terms || {})) {
    for (const image of entry?.images || []) {
      applyLocalToImage(image, remoteUrl, local);
    }
  }

  data.meta = {
    ...(data.meta || {}),
    storage: "local",
    localDir: "assets/term-images",
    downloadedAt: new Date().toISOString(),
  };
  saveJson(data);
  return local;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

  const synced = syncExistingFiles(data);
  if (synced) {
    saveJson(data);
    console.log(`סונכרנו ${synced} הפניות לקבצים קיימים`);
  }

  const pending = collectPendingUrls(data);
  if (!pending.length) {
    console.log("כל התמונות כבר מקומיות.");
    return;
  }

  console.log(`נותרו ${pending.length} תמונות (${DELAY_MS / 1000}s בין בקשות)…`);

  const failed = [];
  for (let i = 0; i < pending.length; i++) {
    const url = pending[i];
    try {
      const local = await downloadOne(data, url);
      console.log(`[${i + 1}/${pending.length}] ${local}`);
    } catch (err) {
      console.error(`[${i + 1}/${pending.length}] FAILED: ${err.message}`);
      failed.push(url);
    }
    if (i < pending.length - 1) await sleep(DELAY_MS);
  }

  if (failed.length) {
    console.error(`\n${failed.length} תמונות נכשלו. הרץ שוב: node scripts/download-term-images.js`);
    process.exitCode = 1;
  } else {
    console.log("\nהושלם.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
