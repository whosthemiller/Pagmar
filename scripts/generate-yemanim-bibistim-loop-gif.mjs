#!/usr/bin/env node
/**
 * 3s looping GIF: ימנים ↔ ביביסטים main bleed images with pixel transitions.
 *
 * Loop (750ms each):
 *   1. ימנים full → pixels
 *   2. swap at pixels → ביביסטים reveal to full
 *   3. ביביסטים full → pixels
 *   4. swap at pixels → ימנים reveal to full
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

const OUT_GIF = path.join(ROOT, "assets/gif/yemanim-bibistim-loop.gif");
const FRAMES_DIR = path.join(ROOT, "scripts/.gif-frames-yemanim-bibistim");

const WIDTH = 2048;
const HEIGHT = 1152;
const DURATION_MS = 3000;
const FPS = 30;
const MAX_FACTOR = 72;
const SWAP_MS = 150;

const FRAME_COUNT = Math.round((DURATION_MS / 1000) * FPS);
const FRAME_MS = DURATION_MS / FRAME_COUNT;
const PHASE_MS = DURATION_MS / 4;

function easeOut(t) {
  return t * (2 - t);
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

/** Matches sun-map.js getBleedPixelFactor — openProgress 1 = sharp, 0 = max blocks. */
function getBleedPixelFactor(openProgress, maxFactor = MAX_FACTOR) {
  if (openProgress >= 1) return 1;
  if (openProgress <= 0) {
    const extra = Math.abs(openProgress);
    return Math.max(1, Math.round(maxFactor + (maxFactor - 1) * extra));
  }
  const eased = clamp01(openProgress);
  return Math.max(1, Math.round(1 + (maxFactor - 1) * (1 - eased)));
}

function getFrameState(frameIndex) {
  const t = frameIndex * FRAME_MS;
  const phase = Math.floor(t / PHASE_MS);
  const phaseT = (t - phase * PHASE_MS) / PHASE_MS;

  if (phase === 0) {
    // ימנים full → pixels
    const openProgress = 1 - easeOut(phaseT);
    return { image: "yemanim", openProgress };
  }

  if (phase === 1) {
    const swapEnd = SWAP_MS / PHASE_MS;
    if (phaseT < swapEnd) {
      // Cut from ימנים pixels to ביביסטים pixels
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
    // ביביסטים full → pixels
    const openProgress = 1 - easeOut(phaseT);
    return { image: "bibistim", openProgress };
  }

  // phase 3: swap ביביסטים pixels → ימנים pixels, then reveal ימנים
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

const HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<canvas id="c"></canvas>
<script>
const WIDTH = ${WIDTH};
const HEIGHT = ${HEIGHT};
const MAX_FACTOR = ${MAX_FACTOR};
const images = {};

function getCoverSourceRect(img, boxWidth, boxHeight, posX = 0.5, posY = 0) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = boxWidth / boxHeight;
  if (imgRatio > boxRatio) {
    const sHeight = img.naturalHeight;
    const sWidth = img.naturalHeight * boxRatio;
    return {
      sx: (img.naturalWidth - sWidth) * posX,
      sy: 0,
      sWidth,
      sHeight,
    };
  }
  const sWidth = img.naturalWidth;
  const sHeight = img.naturalWidth / boxRatio;
  return {
    sx: 0,
    sy: (img.naturalHeight - sHeight) * posY,
    sWidth,
    sHeight,
  };
}

function drawPixelatedCover(ctx, img, destWidth, destHeight, pixelFactor, posX = 0.5, posY = 0) {
  const factor = Math.max(1, pixelFactor);
  const lowW = Math.max(1, Math.round(destWidth / factor));
  const lowH = Math.max(1, Math.round(destHeight / factor));
  const { sx, sy, sWidth, sHeight } = getCoverSourceRect(img, lowW, lowH, posX, posY);
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
  drawPixelatedCover(ctx, img, WIDTH, HEIGHT, factor, 0.5, 0);
  return canvas.toDataURL("image/png");
};

window.boot = async function boot(sources) {
  await Promise.all(Object.entries(sources).map(([key, src]) => loadImage(key, src)));
};
</script>
</body></html>`;

async function main() {
  mkdirSync(path.dirname(OUT_GIF), { recursive: true });
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });

  const htmlPath = path.join(FRAMES_DIR, "render.html");
  writeFileSync(htmlPath, HTML);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
  });

  await page.goto(`file://${htmlPath}`);
  const sources = {
    yemanim: `data:image/webp;base64,${readFileSync(IMAGES.yemanim).toString("base64")}`,
    bibistim: `data:image/webp;base64,${readFileSync(IMAGES.bibistim).toString("base64")}`,
  };
  await page.evaluate(async (src) => {
    await window.boot(src);
  }, sources);

  console.log(`Rendering ${FRAME_COUNT} frames (${FPS} fps, ${DURATION_MS}ms loop)...`);

  for (let i = 0; i < FRAME_COUNT; i++) {
    const { image, openProgress } = getFrameState(i);
    const dataUrl = await page.evaluate(
      ({ image, openProgress }) => window.renderFrame(image, openProgress),
      { image, openProgress }
    );
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const framePath = path.join(FRAMES_DIR, `frame-${String(i).padStart(4, "0")}.png`);
    writeFileSync(framePath, Buffer.from(base64, "base64"));
    if (i % 10 === 0) process.stdout.write(`  ${i}/${FRAME_COUNT}\r`);
  }

  await browser.close();
  console.log(`\nAssembling GIF → ${OUT_GIF}`);

  const delayCs = Math.round((100 / FPS) * 100) / 100;
  execFileSync(
    "magick",
    [
      "-delay",
      String(delayCs),
      "-loop",
      "0",
      path.join(FRAMES_DIR, "frame-*.png"),
      "-layers",
      "Optimize",
      OUT_GIF,
    ],
    { stdio: "inherit" }
  );

  rmSync(FRAMES_DIR, { recursive: true, force: true });
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
