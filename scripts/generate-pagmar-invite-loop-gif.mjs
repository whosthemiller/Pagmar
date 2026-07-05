#!/usr/bin/env node
/**
 * Pagmar presentation invite — typewriter scramble in, hold, reverse out.
 *
 * Presets:
 *   story       — 1080×1920 vertical GIF (~4s loop)
 *   story mp4   — 1080×1920 MP4 (~10s loop)
 *   1920x1080   — landscape GIF
 */

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FONT_PATH = path.join(ROOT, "assets/fonts/RoobertHebrewCollectionVF-TRIAL.ttf");

const LINES = ["מגישה פגמ״ר", "כיתה 128", "מחר ב\u05be12:00", "תבואו (:"];
const FULL_TEXT = LINES.join("\n");

const SHUFFLE_CHARSET =
  "אבגדהוזחטיכלמנסעפצקרשתABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?";

const TYPEWRITER = {
  frameMs: 20,
  fps: 50,
  scrambleFrames: 2,
  tailLength: 6,
  gifHoldMs: 900,
  mp4LoopMs: 10000,
};

const PRESETS = {
  story: {
    width: 1080,
    height: 1920,
    fontSize: 58,
    lineHeight: 1.35,
    outGif: path.join(ROOT, "assets/gif/pagmar-invite-loop-1080x1920.gif"),
    outMp4: path.join(ROOT, "assets/gif/pagmar-invite-loop-1080x1920-10s.mp4"),
    framesDir: path.join(ROOT, "scripts/.gif-frames-pagmar-invite-story"),
  },
  "1920x1080": {
    width: 1920,
    height: 1080,
    fontSize: 52,
    lineHeight: 1.35,
    outGif: path.join(ROOT, "assets/gif/pagmar-invite-loop-1920x1080.gif"),
    framesDir: path.join(ROOT, "scripts/.gif-frames-pagmar-invite-landscape"),
  },
};

const args = process.argv.slice(2);
const exportMp4 = args.includes("mp4");
const presetName =
  args.includes("1920x1080") || args.includes("landscape") || args.includes("1080p")
    ? "1920x1080"
    : "story";
const CFG = PRESETS[presetName];

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomGlyph(seed) {
  const rand = mulberry32(seed);
  return SHUFFLE_CHARSET[Math.floor(rand() * SHUFFLE_CHARSET.length)];
}

function renderTypewriterEnter(graphemes, step, tailLength, frameSeed) {
  const tailEnd =
    tailLength > 0 ? Math.min(graphemes.length, step + tailLength) : graphemes.length;
  return graphemes
    .map((ch, index) => {
      if (index < step) return ch;
      if (index < tailEnd) {
        if (ch === " " || ch === "\u00a0" || ch === "\n") return ch;
        return randomGlyph(frameSeed + index * 9973);
      }
      return "";
    })
    .join("");
}

function renderTypewriterExit(graphemes, step, tailLength, frameSeed) {
  const tailStart = Math.max(0, step - tailLength);
  return graphemes
    .map((ch, index) => {
      if (index >= step) return "";
      if (index >= tailStart) {
        if (ch === " " || ch === "\u00a0" || ch === "\n") return ch;
        return randomGlyph(frameSeed + index * 7919);
      }
      return ch;
    })
    .join("");
}

function animationFrameCount(graphemeCount, scrambleFrames) {
  return graphemeCount * scrambleFrames + 1 + (graphemeCount * scrambleFrames + 1);
}

function holdMsForTargetLoop(graphemeCount, targetLoopMs) {
  const { frameMs, scrambleFrames } = TYPEWRITER;
  const animFrames = animationFrameCount(graphemeCount, scrambleFrames);
  const targetFrames = Math.round(targetLoopMs / frameMs);
  const holdFrames = Math.max(1, targetFrames - animFrames);
  return holdFrames * frameMs;
}

function buildTimeline(graphemes, holdMs) {
  const { frameMs, scrambleFrames } = TYPEWRITER;
  const n = graphemes.length;
  /** @type {{ phase: "enter" | "hold" | "exit"; step: number; subFrame: number }[]} */
  const frames = [];

  for (let step = 0; step < n; step++) {
    for (let subFrame = 0; subFrame < scrambleFrames; subFrame++) {
      frames.push({ phase: "enter", step, subFrame });
    }
  }
  frames.push({ phase: "enter", step: n, subFrame: 0 });

  const holdCount = Math.round(holdMs / frameMs);
  for (let i = 0; i < holdCount; i++) {
    frames.push({ phase: "hold", step: n, subFrame: i });
  }

  for (let step = n; step > 0; step--) {
    for (let subFrame = 0; subFrame < scrambleFrames; subFrame++) {
      frames.push({ phase: "exit", step, subFrame });
    }
  }
  frames.push({ phase: "exit", step: 0, subFrame: 0 });

  return { frames, frameMs, durationMs: frames.length * frameMs };
}

function buildHtml(fontBase64) {
  const escaped = FULL_TEXT.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
@font-face {
  font-family: "RoobertVF";
  src: url("data:font/ttf;base64,${fontBase64}") format("truetype");
  font-weight: 300 900;
  font-style: normal;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  width: ${CFG.width}px;
  height: ${CFG.height}px;
  background: #f9f7f5;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.invite {
  margin: 0;
  padding: 0 1.5em;
  font-family: "RoobertVF", monospace;
  font-variation-settings: "MONO" 100, "slnt" 0;
  font-weight: 500;
  font-size: ${CFG.fontSize}px;
  line-height: ${CFG.lineHeight};
  text-align: center;
  white-space: pre-line;
  color: #111111;
}
</style>
</head><body>
<p class="invite" id="text"></p>
<script>
const FULL_TEXT = \`${escaped}\`;
const GRAPHEMES = [...FULL_TEXT];
const SHUFFLE_CHARSET = ${JSON.stringify(SHUFFLE_CHARSET)};

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomGlyph(seed) {
  const rand = mulberry32(seed);
  return SHUFFLE_CHARSET[Math.floor(rand() * SHUFFLE_CHARSET.length)];
}

function renderEnter(step, tailLength, frameSeed) {
  const tailEnd = tailLength > 0 ? Math.min(GRAPHEMES.length, step + tailLength) : GRAPHEMES.length;
  return GRAPHEMES.map((ch, index) => {
    if (index < step) return ch;
    if (index < tailEnd) {
      if (ch === " " || ch === "\\u00a0" || ch === "\\n") return ch;
      return randomGlyph(frameSeed + index * 9973);
    }
    return "";
  }).join("");
}

function renderExit(step, tailLength, frameSeed) {
  const tailStart = Math.max(0, step - tailLength);
  return GRAPHEMES.map((ch, index) => {
    if (index >= step) return "";
    if (index >= tailStart) {
      if (ch === " " || ch === "\\u00a0" || ch === "\\n") return ch;
      return randomGlyph(frameSeed + index * 7919);
    }
    return ch;
  }).join("");
}

window.setFrame = function setFrame(phase, step, subFrame, tailLength, frameIndex) {
  const el = document.getElementById("text");
  const seed = frameIndex * 313 + subFrame * 17 + step * 131;
  if (phase === "hold" || (phase === "enter" && step >= GRAPHEMES.length)) {
    el.textContent = FULL_TEXT;
    return;
  }
  if (phase === "enter") {
    el.textContent = renderEnter(step, tailLength, seed);
    return;
  }
  if (phase === "exit" && step <= 0) {
    el.textContent = "";
    return;
  }
  el.textContent = renderExit(step, tailLength, seed);
};

document.fonts.ready.then(() => { window.fontsReady = true; });
</script>
</body></html>`;
}

async function main() {
  const fontBase64 = readFileSync(FONT_PATH).toString("base64");
  const graphemes = [...FULL_TEXT];
  const holdMs = exportMp4
    ? holdMsForTargetLoop(graphemes.length, TYPEWRITER.mp4LoopMs)
    : TYPEWRITER.gifHoldMs;
  const { frames, frameMs, durationMs } = buildTimeline(graphemes, holdMs);

  mkdirSync(path.dirname(CFG.outGif), { recursive: true });
  rmSync(CFG.framesDir, { recursive: true, force: true });
  mkdirSync(CFG.framesDir, { recursive: true });

  const htmlPath = path.join(CFG.framesDir, "render.html");
  writeFileSync(htmlPath, buildHtml(fontBase64));

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: CFG.width, height: CFG.height },
    deviceScaleFactor: 1,
  });

  await page.goto(`file://${htmlPath}`);
  await page.waitForFunction(() => window.fontsReady === true);

  console.log(
    `[${presetName}${exportMp4 ? " mp4" : ""}] ${CFG.width}×${CFG.height} — ${frames.length} frames, ${(durationMs / 1000).toFixed(1)}s loop (hold ${(holdMs / 1000).toFixed(1)}s)`
  );

  for (let i = 0; i < frames.length; i++) {
    const { phase, step, subFrame } = frames[i];
    await page.evaluate(
      ({ phase, step, subFrame, tailLength, frameIndex }) =>
        window.setFrame(phase, step, subFrame, tailLength, frameIndex),
      {
        phase,
        step,
        subFrame,
        tailLength: TYPEWRITER.tailLength,
        frameIndex: i,
      }
    );
    const framePath = path.join(CFG.framesDir, `frame-${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path: framePath, type: "png" });
    if (i % 20 === 0) process.stdout.write(`  ${i}/${frames.length}\r`);
  }

  await browser.close();

  if (exportMp4 && CFG.outMp4) {
    console.log(`\nAssembling MP4 → ${CFG.outMp4}`);
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-framerate",
        String(TYPEWRITER.fps),
        "-i",
        path.join(CFG.framesDir, "frame-%04d.png"),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        CFG.outMp4,
      ],
      { stdio: "inherit" }
    );
  } else {
    console.log(`\nAssembling GIF → ${CFG.outGif}`);
    execFileSync(
      "magick",
      [
        "-delay",
        String(frameMs / 10),
        "-loop",
        "0",
        path.join(CFG.framesDir, "frame-*.png"),
        "-layers",
        "Optimize",
        CFG.outGif,
      ],
      { stdio: "inherit" }
    );
  }

  rmSync(CFG.framesDir, { recursive: true, force: true });
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
