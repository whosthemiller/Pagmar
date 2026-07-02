#!/usr/bin/env node
/**
 * Looping GIF: loading censor bar + default pointer cursor.
 * Cursor enters from outside the top-right corner, hovers to trigger censor,
 * then exits back out — with subtle randomness in path and timing.
 */

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FONT_PATH = path.join(ROOT, "assets/fonts/RoobertHebrewCollectionVF-TRIAL.ttf");
const OUT_GIF = path.join(ROOT, "assets/gif/loading-censor-loop.gif");
const FRAMES_DIR = path.join(ROOT, "scripts/.gif-frames-loading-censor");

const WIDTH = 2048;
const HEIGHT = 1152;
const FPS = 30;
const LABEL = "טרמינולוגיה פוליטית";
const FONT_SIZE = 108;
const DURATION_MS = 3000;
const FRAME_MS = 30;
const FRAME_COUNT = DURATION_MS / FRAME_MS;

/** Classic default arrow pointer (hotspot at tip). */
const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="M1 1 L1 27 L9.5 20.5 L13.5 29.5 L17 28 L13 19.5 L23.5 19.5 Z"
    fill="#fff" stroke="#000" stroke-width="1.25" stroke-linejoin="round"/>
</svg>`;
const CURSOR_DATA_URL = `data:image/svg+xml,${encodeURIComponent(CURSOR_SVG)}`;
const CURSOR_SIZE = 52;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function easeOut(t) {
  return t * (2 - t);
}

function easeIn(t) {
  return t * t;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function cubicPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/** Slight speed wobble along a segment — feels less robotic. */
function warpedProgress(t, duration, wobble, phase) {
  const base = clamp01(t / duration);
  const w =
    Math.sin(base * Math.PI * phase.freq) * wobble * base * (1 - base) +
    Math.sin(base * Math.PI * phase.freq2) * wobble * 0.35 * base;
  return easeInOut(clamp01(base + w));
}

function pathJitter(t, amp, seeds) {
  return {
    x: Math.sin(t * seeds.fx + seeds.ox) * amp + Math.cos(t * seeds.fy * 0.7) * amp * 0.45,
    y: Math.cos(t * seeds.fy + seeds.oy) * amp * 0.8 + Math.sin(t * seeds.fx * 0.6) * amp * 0.35,
  };
}

function leaveEase(t) {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function cursorHotspot(pos) {
  const tip = (1 / 32) * CURSOR_SIZE;
  return { x: pos.x + tip, y: pos.y + tip };
}

function isOutsideTerm(hotspot, bounds, pad = 10) {
  return (
    hotspot.x < bounds.left - pad ||
    hotspot.x > bounds.right + pad ||
    hotspot.y < bounds.top - pad ||
    hotspot.y > bounds.bottom + pad
  );
}

function createMotionConfig(width, height, baseHover) {
  const start = {
    x: width + rand(70, 160),
    y: rand(-120, -35),
  };
  const hover = {
    x: baseHover.x + rand(-22, 22),
    y: baseHover.y + rand(-14, 14),
  };

  const approachMs = rand(620, 760);
  const riseMs = rand(400, 520);
  const holdMs = rand(120, 220);
  const leaveMs = DURATION_MS - approachMs - riseMs - holdMs;
  const fallMs = rand(200, 260);

  const riseStart = approachMs;
  const riseEnd = approachMs + riseMs;
  const leaveStart = riseEnd + holdMs;

  return {
    start,
    hover,
    termBounds: baseHover.termBounds,
    approachMs,
    riseMs,
    holdMs,
    leaveMs,
    fallMs,
    riseStart,
    riseEnd,
    leaveStart,
    leaveEnd: DURATION_MS,
    durationMs: DURATION_MS,
    approachCp1: { x: width * rand(0.68, 0.86), y: rand(40, 170) },
    approachCp2: { x: hover.x + rand(90, 240), y: hover.y - rand(70, 170) },
    leaveCp1: { x: hover.x + rand(200, 340), y: hover.y - rand(50, 130) },
    leaveCp2: { x: width * rand(0.78, 0.98), y: rand(60, 200) },
    wobbleAmp: rand(4.5, 8),
    speedWobble: rand(0.028, 0.055),
    phaseFreq: rand(2.6, 4.4),
    phaseFreq2: rand(5.5, 8.5),
    jitterSeeds: {
      fx: rand(0.004, 0.007),
      fy: rand(0.0035, 0.0065),
      ox: rand(0, Math.PI * 2),
      oy: rand(0, Math.PI * 2),
    },
    holdWobbleX: rand(0.0048, 0.0062),
    holdWobbleY: rand(0.0038, 0.0055),
  };
}

function findFallTriggerTime(m, frameMs, frameCount) {
  for (let i = 0; i < frameCount; i++) {
    const t = i * frameMs;
    if (t < m.leaveStart) continue;
    const tip = cursorHotspot(getCursorPos(t, m));
    if (isOutsideTerm(tip, m.termBounds)) return t;
  }
  return m.leaveStart + 120;
}

function getBarWidthPct(t, m, fallTriggerTime) {
  if (t < m.riseStart) return 0;
  if (t < m.riseEnd) return easeOut((t - m.riseStart) / m.riseMs) * 100;
  if (t < fallTriggerTime) return 100;
  const fallElapsed = t - fallTriggerTime;
  if (fallElapsed < m.fallMs) return (1 - fallElapsed / m.fallMs) * 100;
  return 0;
}

function getCursorPos(t, m) {
  const { start, hover } = m;
  const phase = { freq: m.phaseFreq, freq2: m.phaseFreq2 };

  if (t <= m.approachMs) {
    const raw = warpedProgress(t, m.approachMs, m.speedWobble, phase);
    const pt = cubicPoint(raw, start, m.approachCp1, m.approachCp2, hover);
    const jit = pathJitter(t, m.wobbleAmp * (1 - raw * 0.6), m.jitterSeeds);
    return { x: pt.x + jit.x, y: pt.y + jit.y };
  }

  if (t < m.leaveStart) {
    const holdT = t - m.approachMs;
    const jit = pathJitter(holdT, m.wobbleAmp * 0.55, m.jitterSeeds);
    return {
      x: hover.x + Math.sin(holdT * m.holdWobbleX) * 5 + jit.x * 0.4,
      y: hover.y + Math.cos(holdT * m.holdWobbleY) * 3.5 + jit.y * 0.4,
    };
  }

  if (t <= m.leaveEnd) {
    const raw = clamp01((t - m.leaveStart) / m.leaveMs);
    const eased = leaveEase(raw);
    const pt = cubicPoint(eased, hover, m.leaveCp1, m.leaveCp2, start);
    const jit = pathJitter(t, m.wobbleAmp * raw * 0.35, m.jitterSeeds);
    return { x: pt.x + jit.x, y: pt.y + jit.y };
  }

  return start;
}

const fontBase64 = readFileSync(FONT_PATH).toString("base64");

const HTML = `<!DOCTYPE html>
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
  width: ${WIDTH}px;
  height: ${HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9f7f5;
  overflow: hidden;
}
.sun-loading__censor-wrap {
  position: relative;
  display: inline-block;
  padding-inline: 1em;
}
.sun-loading__label {
  margin: 0;
  font-family: "RoobertVF", monospace;
  font-variation-settings: "MONO" 100, "slnt" 0;
  font-weight: 400;
  font-size: ${FONT_SIZE}px;
  line-height: 1.2;
  white-space: nowrap;
  color: #111111;
}
.sun-loading__censor {
  position: absolute;
  top: -0.12em;
  bottom: -0.12em;
  right: 0;
  width: var(--bar-width, 0%);
  background: #111111;
}
#cursor {
  position: fixed;
  left: 0;
  top: 0;
  width: ${CURSOR_SIZE}px;
  height: ${CURSOR_SIZE}px;
  pointer-events: none;
  z-index: 10;
  image-rendering: pixelated;
}
</style>
</head><body>
<div class="sun-loading__censor-wrap">
  <p class="sun-loading__label" id="label">${LABEL}</p>
  <div class="sun-loading__censor" id="bar" aria-hidden="true"></div>
</div>
<img id="cursor" src="${CURSOR_DATA_URL}" alt="" aria-hidden="true" />
<script>
window.setFrame = function setFrame(barPct, x, y) {
  document.getElementById("bar").style.setProperty("--bar-width", barPct + "%");
  document.getElementById("cursor").style.transform = "translate(" + x + "px, " + y + "px)";
};
window.measureHover = function measureHover() {
  const label = document.getElementById("label");
  const labelRect = label.getBoundingClientRect();
  return {
    x: labelRect.left + labelRect.width * (0.64 + Math.random() * 0.08),
    y: labelRect.top + labelRect.height * (0.56 + Math.random() * 0.1),
    termBounds: {
      left: labelRect.left,
      top: labelRect.top,
      right: labelRect.right,
      bottom: labelRect.bottom,
    },
  };
};
document.fonts.ready.then(() => {
  window.fontsReady = true;
});
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
    deviceScaleFactor: 1,
  });

  await page.goto(`file://${htmlPath}`);
  await page.waitForFunction(() => window.fontsReady === true);

  const baseHover = await page.evaluate(() => window.measureHover());
  const motion = createMotionConfig(WIDTH, HEIGHT, baseHover);

  const frameCount = FRAME_COUNT;
  const frameMs = FRAME_MS;
  const fallTriggerTime = findFallTriggerTime(motion, frameMs, frameCount);

  console.log(
    `Rendering ${frameCount} frames (${FPS} fps, ${DURATION_MS}ms loop, fall @${Math.round(fallTriggerTime)}ms)...`
  );

  for (let i = 0; i < frameCount; i++) {
    const t = i * frameMs;
    const pos = getCursorPos(t, motion);
    const barPct = getBarWidthPct(t, motion, fallTriggerTime);
    await page.evaluate(
      ({ barPct, x, y }) => window.setFrame(barPct, x, y),
      { barPct, x: pos.x, y: pos.y }
    );
    const framePath = path.join(FRAMES_DIR, `frame-${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path: framePath, type: "png" });
    if (i % 10 === 0) process.stdout.write(`  ${i}/${frameCount}\r`);
  }

  await browser.close();
  console.log(`\nAssembling GIF → ${OUT_GIF}`);

  const delayCs = String(FRAME_MS / 10);
  execFileSync(
    "magick",
    [
      "-delay",
      delayCs,
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
