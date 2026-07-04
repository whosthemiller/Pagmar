#!/usr/bin/env node
/**
 * 3s looping GIF: ימנים ↔ ביביסטים main bleed images with pixel transitions.
 *
 * Loop (750ms each):
 *   1. ימנים full → pixels
 *   2. swap at pixels → ביביסטים reveal to full
 *   3. ביביסטים full → pixels
 *   4. swap at pixels → ימנים reveal to full
 *
 * Presets:
 *   default     — 2048×1152 (submission computer)
 *   1920x1080   — 1080p landscape
 *   1080x1920   — 1080p vertical (story)
 */

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const IMAGES = {
  yemanim: path.join(ROOT, "assets/img/ימנים/מנחם בגין.webp"),
  bibistim: path.join(ROOT, "assets/img/ביביסטים/חולצת I Love BIBIZIM.webp"),
};

/** Per-preset crop: x/y = object-position; focal + zoom center the shirt text in frame. */
const OBJECT_POSITION_BY_PRESET = {
  default: {
    yemanim: { x: 0.5, y: 0 },
    bibistim: { x: 0.5, y: 0.55 },
  },
  "1920x1080": {
    yemanim: { x: 0.5, y: 0 },
    bibistim: { x: 0.5, y: 0.55 },
  },
  "1080x1920": {
    yemanim: { x: 0.5, y: 0 },
    bibistim: { x: 0.63, y: 0 },
  },
};

const PRESETS = {
  default: {
    width: 2048,
    height: 1152,
    maxFactor: 72,
    outGif: path.join(ROOT, "assets/gif/yemanim-bibistim-loop.gif"),
    framesDir: path.join(ROOT, "scripts/.gif-frames-yemanim-bibistim"),
  },
  "1920x1080": {
    width: 1920,
    height: 1080,
    maxFactor: 68,
    outGif: path.join(ROOT, "assets/gif/yemanim-bibistim-loop-1920x1080.gif"),
    framesDir: path.join(ROOT, "scripts/.gif-frames-yemanim-bibistim-1920x1080"),
  },
  "1080x1920": {
    width: 1080,
    height: 1920,
    maxFactor: 38,
    outGif: path.join(ROOT, "assets/gif/yemanim-bibistim-loop-1080x1920.gif"),
    framesDir: path.join(ROOT, "scripts/.gif-frames-yemanim-bibistim-1080x1920"),
  },
};

const arg = process.argv[2];
const presetName =
  arg === "1080x1920" || arg === "story" || arg === "vertical"
    ? "1080x1920"
    : arg === "1920x1080" || arg === "1080p" || arg === "landscape"
      ? "1920x1080"
      : "default";
const CFG = PRESETS[presetName];
const OBJECT_POSITION = OBJECT_POSITION_BY_PRESET[presetName];

const DURATION_MS = 3000;
const FPS = 30;
const SWAP_MS = 150;

const FRAME_COUNT = Math.round((DURATION_MS / 1000) * FPS);
const FRAME_MS = DURATION_MS / FRAME_COUNT;
const PHASE_MS = DURATION_MS / 4;

function easeOut(t) {
  return t * (2 - t);
}

function getFrameState(frameIndex) {
  const t = frameIndex * FRAME_MS;
  const phase = Math.floor(t / PHASE_MS);
  const phaseT = (t - phase * PHASE_MS) / PHASE_MS;

  if (phase === 0) {
    const openProgress = 1 - easeOut(phaseT);
    return { image: "yemanim", openProgress };
  }

  if (phase === 1) {
    const swapEnd = SWAP_MS / PHASE_MS;
    if (phaseT < swapEnd) {
      const swapT = phaseT / swapEnd;
      return {
        image: swapT < 0.5 ? "yemanim" : "bibistim",
        openProgress: 0,
      };
    }
    const revealT = (phaseT - swapEnd) / (1 - swapEnd);
    return { image: "bibistim", openProgress: easeOut(revealT) };
  }

  if (phase === 2) {
    const openProgress = 1 - easeOut(phaseT);
    return { image: "bibistim", openProgress };
  }

  const swapEnd = SWAP_MS / PHASE_MS;
  if (phaseT < swapEnd) {
    const swapT = phaseT / swapEnd;
    return {
      image: swapT < 0.5 ? "bibistim" : "yemanim",
      openProgress: 0,
    };
  }
  const revealT = (phaseT - swapEnd) / (1 - swapEnd);
  return { image: "yemanim", openProgress: easeOut(revealT) };
}

function buildHtml() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<canvas id="c"></canvas>
<script>
const WIDTH = ${CFG.width};
const HEIGHT = ${CFG.height};
const MAX_FACTOR = ${CFG.maxFactor};
const images = {};

function getCoverSourceRect(img, boxWidth, boxHeight, pos = {}) {
  const posX = pos.x ?? 0.5;
  const posY = pos.y ?? 0;
  const zoom = pos.zoom ?? 1;
  const focal = pos.focal ?? null;
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = boxWidth / boxHeight;

  let sWidth;
  let sHeight;
  if (imgRatio > boxRatio) {
    sHeight = img.naturalHeight * zoom;
    sWidth = sHeight * boxRatio;
  } else {
    sWidth = img.naturalWidth * zoom;
    sHeight = sWidth / boxRatio;
  }
  sWidth = Math.min(sWidth, img.naturalWidth);
  sHeight = Math.min(sHeight, img.naturalHeight);

  if (focal) {
    let sx = focal.x * img.naturalWidth - sWidth * posX;
    let sy = focal.y * img.naturalHeight - sHeight * posY;
    sx = Math.max(0, Math.min(img.naturalWidth - sWidth, sx));
    sy = Math.max(0, Math.min(img.naturalHeight - sHeight, sy));
    return { sx, sy, sWidth, sHeight };
  }

  if (imgRatio > boxRatio) {
    return {
      sx: (img.naturalWidth - sWidth) * posX,
      sy: 0,
      sWidth,
      sHeight,
    };
  }
  return {
    sx: 0,
    sy: (img.naturalHeight - sHeight) * posY,
    sWidth,
    sHeight,
  };
}

function drawPixelatedCover(ctx, img, destWidth, destHeight, pixelFactor, pos = {}) {
  const factor = Math.max(1, pixelFactor);
  const lowW = Math.max(1, Math.round(destWidth / factor));
  const lowH = Math.max(1, Math.round(destHeight / factor));
  const { sx, sy, sWidth, sHeight } = getCoverSourceRect(img, lowW, lowH, pos);
  const offscreen = document.createElement("canvas");
  offscreen.width = lowW;
  offscreen.height = lowH;
  const offCtx = offscreen.getContext("2d");
  offCtx.imageSmoothingEnabled = false;
  offCtx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, lowW, lowH);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, destWidth, destHeight);
  ctx.drawImage(offscreen, 0, 0, lowW, lowH, 0, 0, destWidth, destHeight);
}

function loadImage(key, src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      images[key] = img;
      resolve();
    };
    img.onerror = reject;
    img.src = src;
  });
}

const OBJECT_POSITION = ${JSON.stringify(OBJECT_POSITION)};

window.renderFrame = function renderFrame(imageKey, openProgress) {
  const canvas = document.getElementById("c");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  const img = images[imageKey];
  if (!img) return null;
  let factor = 1;
  if (openProgress >= 1) {
    factor = 1;
  } else if (openProgress <= 0) {
    const extra = Math.abs(openProgress);
    factor = Math.max(1, Math.round(MAX_FACTOR + (MAX_FACTOR - 1) * extra));
  } else {
    const eased = Math.max(0, Math.min(1, openProgress));
    factor = Math.max(1, Math.round(1 + (MAX_FACTOR - 1) * (1 - eased)));
  }
  const pos = OBJECT_POSITION[imageKey] || { x: 0.5, y: 0 };
  drawPixelatedCover(ctx, img, WIDTH, HEIGHT, factor, pos);
  return canvas.toDataURL("image/png");
};

window.boot = async function boot(sources) {
  await Promise.all(Object.entries(sources).map(([key, src]) => loadImage(key, src)));
};
</script>
</body></html>`;
}

async function main() {
  mkdirSync(path.dirname(CFG.outGif), { recursive: true });
  rmSync(CFG.framesDir, { recursive: true, force: true });
  mkdirSync(CFG.framesDir, { recursive: true });

  const htmlPath = path.join(CFG.framesDir, "render.html");
  writeFileSync(htmlPath, buildHtml());

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: CFG.width, height: CFG.height },
  });

  await page.goto(`file://${htmlPath}`);
  const sources = {
    yemanim: `data:image/webp;base64,${readFileSync(IMAGES.yemanim).toString("base64")}`,
    bibistim: `data:image/webp;base64,${readFileSync(IMAGES.bibistim).toString("base64")}`,
  };
  await page.evaluate(async (src) => {
    await window.boot(src);
  }, sources);

  console.log(
    `[${presetName}] ${CFG.width}×${CFG.height} — ${FRAME_COUNT} frames (${FPS} fps, ${DURATION_MS}ms loop)...`
  );

  for (let i = 0; i < FRAME_COUNT; i++) {
    const { image, openProgress } = getFrameState(i);
    const dataUrl = await page.evaluate(
      ({ image, openProgress }) => window.renderFrame(image, openProgress),
      { image, openProgress }
    );
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const framePath = path.join(CFG.framesDir, `frame-${String(i).padStart(4, "0")}.png`);
    writeFileSync(framePath, Buffer.from(base64, "base64"));
    if (i % 10 === 0) process.stdout.write(`  ${i}/${FRAME_COUNT}\r`);
  }

  await browser.close();
  console.log(`\nAssembling GIF → ${CFG.outGif}`);

  const delayCs = Math.round((100 / FPS) * 100) / 100;
  execFileSync(
    "magick",
    [
      "-delay",
      String(delayCs),
      "-loop",
      "0",
      path.join(CFG.framesDir, "frame-*.png"),
      "-layers",
      "Optimize",
      CFG.outGif,
    ],
    { stdio: "inherit" }
  );

  rmSync(CFG.framesDir, { recursive: true, force: true });
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
