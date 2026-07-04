#!/usr/bin/env node
/**
 * Looping GIF: loading censor bar + default pointer cursor.
 *
 * Presets:
 *   default — 2048×1152, 3s, top-right corner entry, centered text
 *   story   — 1080×1920, 5s, vertical story, right-midline entry, upper third text
 */

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FONT_PATH = path.join(ROOT, "assets/fonts/RoobertHebrewCollectionVF-TRIAL.ttf");
const LABEL = "טרמינולוגיה פוליטית";
const SUBTITLE = "מגישה את הפגמ״ר שלי ביום רביעי בכיתה 128";
const SUBTITLE_INVITE = "מוזמנות ומוזמנים (:";

const PRESETS = {
  default: {
    width: 2048,
    height: 1152,
    durationMs: 3000,
    frameMs: 30,
    fontSize: 108,
    cursorSize: 52,
    layout: "center",
    entry: "topRight",
    outGif: path.join(ROOT, "assets/gif/loading-censor-loop.gif"),
    framesDir: path.join(ROOT, "scripts/.gif-frames-loading-censor"),
  },
  story: {
    width: 1080,
    height: 1920,
    durationMs: 5000,
    frameMs: 20,
    fontSize: 66,
    subtitleFontSize: 36,
    cursorSize: 46,
    layout: "upperThird",
    entry: "storyArc",
    outGif: path.join(ROOT, "assets/gif/loading-censor-loop-1080x1920.gif"),
    framesDir: path.join(ROOT, "scripts/.gif-frames-loading-censor-story"),
  },
};

const arg = process.argv[2];
const presetName = arg === "story" || arg === "1080p" ? "story" : "default";
const CFG = PRESETS[presetName];

/** Classic default arrow pointer (hotspot at tip). */
const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="M1 1 L1 27 L9.5 20.5 L13.5 29.5 L17 28 L13 19.5 L23.5 19.5 Z"
    fill="#fff" stroke="#000" stroke-width="1.25" stroke-linejoin="round"/>
</svg>`;
const CURSOR_DATA_URL = `data:image/svg+xml,${encodeURIComponent(CURSOR_SVG)}`;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function easeOut(t) {
  return t * (2 - t);
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
  const tip = (1 / 32) * CFG.cursorSize;
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

function createEntryPoints(width, height, hover) {
  if (CFG.entry === "storyArc") {
    const midY = height / 2 + rand(-8, 8);
    return {
      start: { x: width + rand(85, 145), y: midY },
      approachCp1: { x: width * rand(0.82, 0.94), y: midY - rand(70, 130) },
      approachCp2: { x: hover.x + rand(90, 170), y: hover.y + rand(55, 105) },
      leaveCp1: { x: hover.x + rand(110, 190), y: hover.y + rand(45, 95) },
      leaveCp2: { x: width * rand(0.84, 0.95), y: midY - rand(50, 110) },
    };
  }

  if (CFG.entry === "rightMidline") {
    const midY = height / 2 + rand(-6, 6);
    const transit = {
      x: width * rand(0.58, 0.74),
      y: midY + rand(-5, 5),
    };
    return {
      start: { x: width + rand(90, 170), y: midY },
      transit,
      approachCp1: { x: width * rand(0.9, 0.98), y: midY },
      approachCp2: { x: transit.x + rand(40, 110), y: midY },
      approachRiseCp1: { x: transit.x - rand(70, 150), y: midY - rand(30, 70) },
      approachRiseCp2: { x: hover.x + rand(50, 120), y: hover.y + rand(35, 75) },
      leaveDropCp1: { x: hover.x + rand(60, 140), y: hover.y + rand(30, 65) },
      leaveDropCp2: { x: transit.x - rand(60, 130), y: midY - rand(20, 55) },
      leaveCp2: { x: transit.x + rand(50, 120), y: midY },
      leaveCp3: { x: width * rand(0.92, 0.99), y: midY },
    };
  }

  return {
    start: { x: width + rand(70, 160), y: rand(-120, -35) },
    approachCp1: { x: width * rand(0.68, 0.86), y: rand(40, 170) },
    approachCp2: { x: hover.x + rand(90, 240), y: hover.y - rand(70, 170) },
    leaveCp1: { x: hover.x + rand(200, 340), y: hover.y - rand(50, 130) },
    leaveCp2: { x: width * rand(0.78, 0.98), y: rand(60, 200) },
  };
}

function createMotionConfig(width, height, baseHover) {
  const hover = {
    x: baseHover.x + rand(-22, 22),
    y: baseHover.y + rand(-14, 14),
  };
  const entry = createEntryPoints(width, height, hover);

  const approachMs =
    CFG.durationMs === 5000 ? rand(1050, 1350) : rand(620, 760);
  const riseMs = CFG.durationMs === 5000 ? rand(680, 900) : rand(400, 520);
  const holdMs = CFG.durationMs === 5000 ? rand(220, 360) : rand(120, 220);
  const leaveMs = CFG.durationMs - approachMs - riseMs - holdMs;
  const fallMs = CFG.durationMs === 5000 ? rand(220, 300) : rand(200, 260);

  const riseStart = approachMs;
  const riseEnd = approachMs + riseMs;
  const leaveStart = riseEnd + holdMs;

  return {
    ...entry,
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
    leaveEnd: CFG.durationMs,
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
    const raw = warpedProgress(
      t,
      m.approachMs,
      m.speedWobble * (CFG.entry === "storyArc" ? 0.35 : 0.65),
      phase
    );

    if (CFG.entry === "rightMidline" && m.transit) {
      let pt;
      if (raw < 0.58) {
        const seg = raw / 0.58;
        pt = cubicPoint(seg, start, m.approachCp1, m.approachCp2, m.transit);
      } else {
        const seg = (raw - 0.58) / 0.42;
        pt = cubicPoint(seg, m.transit, m.approachRiseCp1, m.approachRiseCp2, hover);
      }
      const jit = pathJitter(t, m.wobbleAmp * 0.35 * (1 - raw * 0.5), m.jitterSeeds);
      return { x: pt.x + jit.x, y: pt.y + jit.y * 0.35 };
    }

    const pt = cubicPoint(raw, start, m.approachCp1, m.approachCp2, hover);
    const jitAmp = CFG.entry === "storyArc" ? m.wobbleAmp * 0.25 : m.wobbleAmp * (1 - raw * 0.6);
    const jit = pathJitter(t, jitAmp, m.jitterSeeds);
    const yScale = CFG.entry === "storyArc" ? 0.5 : 1;
    return { x: pt.x + jit.x, y: pt.y + jit.y * yScale };
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

    if (CFG.entry === "rightMidline" && m.transit) {
      let pt;
      if (eased < 0.42) {
        const seg = eased / 0.42;
        pt = cubicPoint(seg, hover, m.leaveDropCp1, m.leaveDropCp2, m.transit);
      } else {
        const seg = (eased - 0.42) / 0.58;
        pt = cubicPoint(seg, m.transit, m.leaveCp2, m.leaveCp3, start);
      }
      const jit = pathJitter(t, m.wobbleAmp * eased * 0.25, m.jitterSeeds);
      return { x: pt.x + jit.x, y: pt.y + jit.y * 0.35 };
    }

    const pt = cubicPoint(eased, hover, m.leaveCp1, m.leaveCp2, start);
    const jitAmp = CFG.entry === "storyArc" ? m.wobbleAmp * eased * 0.18 : m.wobbleAmp * raw * 0.35;
    const jit = pathJitter(t, jitAmp, m.jitterSeeds);
    const yScale = CFG.entry === "storyArc" ? 0.5 : 1;
    return { x: pt.x + jit.x, y: pt.y + jit.y * yScale };
  }

  return start;
}

function buildHtml(fontBase64) {
  const stageLayout =
    CFG.layout === "upperThird"
      ? `
.stage {
  position: absolute;
  left: 50%;
  top: calc(100% / 3);
  transform: translate(-50%, -50%);
  text-align: center;
}`
      : `
body {
  display: flex;
  align-items: center;
  justify-content: center;
}
.stage {}`;

  const subtitleBlock =
    CFG.subtitleFontSize != null
      ? `
.sun-loading__subtitle {
  margin: 2.45em 0 0;
  font-family: "RoobertVF", sans-serif;
  font-weight: 400;
  font-size: ${CFG.subtitleFontSize}px;
  line-height: 1.25;
  white-space: nowrap;
  color: #111111;
}
.sun-loading__subtitle--invite {
  margin-top: 0.4em;
}
`
      : "";

  const subtitleHtml =
    CFG.subtitleFontSize != null
      ? `<p class="sun-loading__subtitle" id="subtitle">${SUBTITLE}</p>
    <p class="sun-loading__subtitle sun-loading__subtitle--invite">${SUBTITLE_INVITE}</p>`
      : "";

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
  position: relative;
}
${stageLayout}
.sun-loading__censor-wrap {
  position: relative;
  display: inline-block;
  padding-inline: 1em;
}
.sun-loading__label {
  margin: 0;
  font-family: "RoobertVF", monospace;
  font-variation-settings: "MONO" 100, "slnt" 0;
  font-weight: 500;
  font-size: ${CFG.fontSize}px;
  line-height: 1.2;
  white-space: nowrap;
  color: #111111;
}
${subtitleBlock}
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
  width: ${CFG.cursorSize}px;
  height: ${CFG.cursorSize}px;
  pointer-events: none;
  z-index: 10;
  image-rendering: pixelated;
}
</style>
</head><body>
<div class="stage">
  <div class="sun-loading__text-block">
    <div class="sun-loading__censor-wrap">
      <p class="sun-loading__label" id="label">${LABEL}</p>
      <div class="sun-loading__censor" id="bar" aria-hidden="true"></div>
    </div>
    ${subtitleHtml}
  </div>
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
document.fonts.ready.then(() => { window.fontsReady = true; });
</script>
</body></html>`;
}

async function main() {
  const fontBase64 = readFileSync(FONT_PATH).toString("base64");
  const frameCount = CFG.durationMs / CFG.frameMs;

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

  const baseHover = await page.evaluate(() => window.measureHover());
  const motion = createMotionConfig(CFG.width, CFG.height, baseHover);
  const fallTriggerTime = findFallTriggerTime(motion, CFG.frameMs, frameCount);

  console.log(
    `[${presetName}] ${CFG.width}×${CFG.height} — ${frameCount} frames, ${CFG.durationMs}ms, fall @${Math.round(fallTriggerTime)}ms`
  );

  for (let i = 0; i < frameCount; i++) {
    const t = i * CFG.frameMs;
    const pos = getCursorPos(t, motion);
    const barPct = getBarWidthPct(t, motion, fallTriggerTime);
    await page.evaluate(
      ({ barPct, x, y }) => window.setFrame(barPct, x, y),
      { barPct, x: pos.x, y: pos.y }
    );
    const framePath = path.join(CFG.framesDir, `frame-${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path: framePath, type: "png" });
    if (i % 20 === 0) process.stdout.write(`  ${i}/${frameCount}\r`);
  }

  await browser.close();
  console.log(`\nAssembling GIF → ${CFG.outGif}`);

  execFileSync(
    "magick",
    [
      "-delay",
      String(CFG.frameMs / 10),
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
