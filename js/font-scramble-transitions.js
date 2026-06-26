const SHUFFLE_CHARSET =
  "אבגדהוזחטיכלמנסעפצקרשתABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?";

/** @typedef {"roobert" | "secolo"} FontKind */

/** @typedef {"exit-enter" | "cross-scramble" | "typewriter-erase" | "typewriter-overlap" | "wave-settle" | "blink-swap" | "char-flip"} FontScrambleMode */

/**
 * @typedef {object} FontSpec
 * @property {FontKind} id
 * @property {string} family
 * @property {number} size
 * @property {number | string} weight
 * @property {string} variation
 */

/** @type {Record<FontKind, FontSpec>} */
export const FONT_SPECS = {
  roobert: {
    id: "roobert",
    family: '"RoobertVF", monospace',
    size: 30,
    weight: 500,
    variation: '"MONO" 100, "slnt" 0',
  },
  secolo: {
    id: "secolo",
    family: '"Secolo", serif',
    size: 144,
    weight: "normal",
    variation: "normal",
  },
};

export const TRANSITION_MODES = [
  {
    id: "exit-enter",
    title: "יציאה → כניסה",
    badge: "נוכחי באתר",
    current: true,
    desc: "סקרמבל רציף ב-Roobert, החלפת גופן ל-Secolo, ואז settle — כמו בעמוד המונח.",
  },
  {
    id: "cross-scramble",
    title: "סקרמבל מעבר",
    badge: "מוצע",
    desc: "סקרמבל רציף; באמצע מחליפים גופן וממשיכים עד settle ב-Secolo.",
  },
  {
    id: "typewriter-erase",
    title: "מחיקה + כתיבה",
    badge: "typewriter",
    desc: "מוחקים תו-תו (עם רעש סקרמבל), ואז כותבים מחדש ב-Secolo מאותה כיוון.",
  },
  {
    id: "typewriter-overlap",
    title: "מחיקה + כתיבה חופפת",
    badge: "typewriter",
    desc: "בזמן שתווים נמחקים מ-Roobert, תווים חדשים נכתבים ב-Secolo — מעבר חופף.",
  },
  {
    id: "wave-settle",
    title: "גל settle",
    badge: "מוצע",
    desc: "סקרמבל קצר ב-Secolo ואז כל תו מתייצב בסדר אקראי.",
  },
  {
    id: "blink-swap",
    title: "החלפה מהירה",
    badge: "מהיר",
    desc: "סקרמבל קצר מאוד, החלפת גופן מיידית, settle מהיר.",
  },
  {
    id: "char-flip",
    title: "היפוך תו-תו",
    badge: "מוצע",
    desc: "כל תו: סקרמבל קצר → החלפת גופן → settle — עם stagger בין תווים.",
  },
];

const TIMING = {
  frameMs: 12,
  cycles: 3,
  staggerMs: 5,
  exitMs: 150,
  crossSwapAt: 0.45,
  blinkScrambleMs: 75,
  charStepMs: 18,
  charFlipScrambleFrames: 2,
  charFlipGapMs: 3,
};

/** @type {WeakMap<Element, object>} */
const activeStates = new WeakMap();

/** @type {Map<FontKind, { ascent: number, descent: number, height: number }>} */
const fontMetricsCache = new Map();

/** @type {Map<FontKind, number>} */
const baselineInsetCache = new Map();

/** @type {number | null} */
let roobertScrambleMinCellWidth = null;

let reducedMotion = false;
/** @type {CanvasRenderingContext2D | null} */
let measureCtx = null;

/**
 * Viewport-driven typography scale applied to every glyph (Roobert + Secolo) so
 * the animation runs at the same size as the settled title for the current
 * screen, eliminating the size jump at the handoff on wide screens.
 */
let fontScale = 1;

/** Effective rendered px size for a font spec at the current viewport scale. */
function scaledSize(spec) {
  return spec.size * fontScale;
}

/**
 * Set the typography scale used by the font-scramble overlay. Cached metrics
 * depend on the rendered size, so they are cleared whenever the scale changes.
 * @param {number} scale
 */
export function setFontScrambleScale(scale) {
  const next = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (next === fontScale) return;
  fontScale = next;
  clearFontScrambleMetricsCache();
}

function refreshReducedMotion() {
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getMeasureCtx() {
  if (measureCtx) return measureCtx;
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

function randomGlyph() {
  return SHUFFLE_CHARSET[Math.floor(Math.random() * SHUFFLE_CHARSET.length)];
}

function shuffleIndices(count) {
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function buildSettleFrames(charCount) {
  const order = shuffleIndices(charCount);
  const spread = Math.max(1, Math.round((charCount * TIMING.staggerMs) / TIMING.frameMs));
  const settleFrames = new Array(charCount);
  order.forEach((charIndex, rank) => {
    settleFrames[charIndex] = TIMING.cycles + Math.min(spread, rank);
  });
  return settleFrames;
}

function maxSettleFrame(settleFrames) {
  let max = TIMING.cycles;
  for (const frame of settleFrames) {
    if (frame > max) max = frame;
  }
  return max;
}

function fontCss(spec) {
  return `${spec.weight} ${scaledSize(spec)}px ${spec.family}`;
}

/** @param {HTMLElement} el @param {FontSpec} spec */
function applyGlyphFont(el, spec) {
  el.style.fontFamily = spec.family;
  el.style.fontSize = `${scaledSize(spec)}px`;
  el.style.fontWeight = String(spec.weight);
  el.style.fontVariationSettings = spec.variation;
}

/** Lift each char so every font's baseline meets the shared red line. */
function getFontBaselineInset(spec) {
  const cached = baselineInsetCache.get(spec.id);
  if (cached != null) return cached;

  const measured = measureBaselineInsetFromBottom(spec);
  const inset = measured != null ? measured : getFontMetrics(spec).descent;
  baselineInsetCache.set(spec.id, inset);
  return inset;
}

function getBaselineLift(spec) {
  return Math.max(0, getBaselineInset() - getFontBaselineInset(spec));
}

function applyCharBaseline(cell, spec) {
  applyGlyphFont(cell, spec);
  cell.style.marginBottom = `${getBaselineLift(spec)}px`;
}

/** Distance from bottom-anchored term box to alphabetic baseline (layout probe). */
function measureBaselineInsetFromBottom(spec) {
  if (typeof document === "undefined" || !document.body) return null;

  let probe = document.getElementById("font-scramble-baseline-probe");
  if (!probe) {
    probe = document.createElement("div");
    probe.id = "font-scramble-baseline-probe";
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;white-space:nowrap";
    document.body.appendChild(probe);
  }

  const stage = document.createElement("div");
  stage.style.cssText = `position:relative;width:160px;height:${Math.ceil(scaledSize(spec) * 3)}px`;

  const root = document.createElement("span");
  root.style.cssText =
    "position:absolute;right:0;bottom:0;display:inline-block;line-height:1;direction:rtl;white-space:nowrap";

  const cell = document.createElement("span");
  cell.style.display = "inline-block";
  cell.style.lineHeight = "1";
  cell.style.verticalAlign = "baseline";
  applyGlyphFont(cell, spec);
  cell.textContent = "אקטגפ";
  root.appendChild(cell);
  stage.appendChild(root);
  probe.replaceChildren(stage);

  const rootRect = root.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  if (!rootRect.height || !cellRect.height) return null;

  const ctx = getMeasureCtx();
  if (!ctx) return null;
  ctx.font = fontCss(spec);
  ctx.direction = "rtl";
  const m = ctx.measureText("אקטגפ");
  const descent =
    m.fontBoundingBoxDescent ??
    m.actualBoundingBoxDescent ??
    scaledSize(spec) * 0.25;

  return Math.max(0, rootRect.bottom - (cellRect.bottom - descent));
}

/** Per-font ascent/descent — DOM when available, else canvas. */
function getFontMetrics(spec) {
  const cached = fontMetricsCache.get(spec.id);
  if (cached) return cached;

  const size = scaledSize(spec);
  const fallback = {
    ascent: size * 0.75,
    descent: size * 0.25,
    height: size,
  };

  const dom = measureFontMetricsDom(spec);
  if (dom) {
    fontMetricsCache.set(spec.id, dom);
    return dom;
  }

  const ctx = getMeasureCtx();
  if (!ctx) {
    fontMetricsCache.set(spec.id, fallback);
    return fallback;
  }

  ctx.font = fontCss(spec);
  ctx.direction = "rtl";
  const m = ctx.measureText("אקטגפ");
  const ascent =
    m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? fallback.ascent;
  const descent =
    m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? fallback.descent;
  const metrics = { ascent, descent, height: ascent + descent };
  fontMetricsCache.set(spec.id, metrics);
  return metrics;
}

function measureFontMetricsDom(spec) {
  if (typeof document === "undefined" || !document.body) return null;

  let probe = document.getElementById("font-scramble-metrics-probe");
  if (!probe) {
    probe = document.createElement("div");
    probe.id = "font-scramble-metrics-probe";
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;white-space:nowrap";
    document.body.appendChild(probe);
  }

  const body = document.createElement("span");
  body.style.display = "inline-block";
  body.style.lineHeight = "1";
  applyGlyphFont(body, spec);
  body.textContent = "אקטגפ";
  probe.replaceChildren(body);
  const bodyRect = body.getBoundingClientRect();
  const height = bodyRect.height || scaledSize(spec);

  const withNun = document.createElement("span");
  withNun.style.display = "inline-block";
  withNun.style.lineHeight = "1";
  applyGlyphFont(withNun, spec);
  withNun.textContent = "אקטגפן";
  probe.replaceChildren(withNun);
  const nunRect = withNun.getBoundingClientRect();
  const descent = Math.max(0, nunRect.bottom - bodyRect.bottom);

  return { ascent: height, descent, height };
}

/** Line box height — tallest font wins. */
function getAnchorHeight() {
  const roobert = getFontMetrics(FONT_SPECS.roobert);
  const secolo = getFontMetrics(FONT_SPECS.secolo);
  return Math.ceil(Math.max(roobert.height, secolo.height));
}

/** Distance from line-box bottom to shared alphabetic baseline. */
function getBaselineInset() {
  const roobert = getFontBaselineInset(FONT_SPECS.roobert);
  const secolo = getFontBaselineInset(FONT_SPECS.secolo);
  return Math.ceil(Math.max(roobert, secolo));
}

/** @param {string} text @param {FontSpec} spec */
function measureGraphemeWidthsDom(text, spec) {
  if (typeof document === "undefined" || !document.body) return null;

  let probe = document.getElementById("font-scramble-width-probe");
  if (!probe) {
    probe = document.createElement("div");
    probe.id = "font-scramble-width-probe";
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;white-space:nowrap";
    document.body.appendChild(probe);
  }

  return [...text].map((ch) => {
    const span = document.createElement("span");
    span.style.display = "inline-block";
    span.style.lineHeight = "1";
    applyGlyphFont(span, spec);
    span.textContent = ch;
    probe.replaceChildren(span);
    return Math.max(4, Math.ceil(span.getBoundingClientRect().width));
  });
}

/** @param {string} text @param {FontSpec} spec */
function measureGraphemeWidths(text, spec) {
  const dom = measureGraphemeWidthsDom(text, spec);
  if (dom) return dom;

  const ctx = getMeasureCtx();
  if (!ctx) return [...text].map(() => 8);
  ctx.font = fontCss(spec);
  ctx.direction = "rtl";
  return [...text].map((ch) => Math.max(4, Math.ceil(ctx.measureText(ch).width)));
}

function buildTermWidthSets(text) {
  return {
    roobertWidths: measureGraphemeWidths(text, FONT_SPECS.roobert),
    secoloWidths: measureGraphemeWidths(text, FONT_SPECS.secolo),
  };
}

/** @param {{ roobertWidths: number[], secoloWidths: number[] }} widthSets @param {FontKind} fontKind @param {number} index */
function widthAt(widthSets, fontKind, index) {
  const widths =
    fontKind === "secolo" ? widthSets.secoloWidths : widthSets.roobertWidths;
  return widths[index] ?? 4;
}

/** Widest Roobert scramble glyph — cells never shrink below this during scramble. */
function getRoobertScrambleMinCellWidth() {
  if (roobertScrambleMinCellWidth != null) return roobertScrambleMinCellWidth;
  roobertScrambleMinCellWidth = Math.max(
    4,
    ...[...SHUFFLE_CHARSET].map(
      (ch) => measureGraphemeWidths(ch, FONT_SPECS.roobert)[0]
    )
  );
  return roobertScrambleMinCellWidth;
}

/** @param {{ roobertWidths: number[], secoloWidths: number[] }} widthSets @param {FontKind} fontKind @param {number} index */
function widthAtScramble(widthSets, fontKind, index) {
  const base = widthAt(widthSets, fontKind, index);
  return fontKind === "roobert"
    ? Math.max(base, getRoobertScrambleMinCellWidth())
    : base;
}

function applyCharLayout(cell, spec, widthPx) {
  applyCharBaseline(cell, spec);
  cell.style.width = `${widthPx}px`;
}

/** @param {{ roobertWidths: number[], secoloWidths: number[] }} widthSets @param {FontKind} fontKind @param {number} index @param {boolean} [scrambling] */
function applyCharForFont(cell, fontKind, widthSets, index, scrambling = false) {
  const width = scrambling
    ? widthAtScramble(widthSets, fontKind, index)
    : widthAt(widthSets, fontKind, index);
  applyCharLayout(cell, FONT_SPECS[fontKind], width);
}

function syncTermLockWidth(root, chars) {
  const total = chars.reduce((sum, { cell }) => {
    const w = parseFloat(cell.style.width);
    return sum + (Number.isFinite(w) ? w : 0);
  }, 0);
  if (total > 0) {
    root.style.minWidth = `${total}px`;
    root.style.maxWidth = `${total}px`;
  } else {
    root.style.minWidth = "";
    root.style.maxWidth = "";
  }
}

function layoutTermRoot(root, lockWidth) {
  root.style.boxSizing = "border-box";
  root.style.display = "inline-block";
  root.style.whiteSpace = "nowrap";
  root.style.lineHeight = "1";
  root.style.direction = "rtl";
  root.style.position = "absolute";
  root.style.right = "0";
  root.style.bottom = "0";
  root.style.overflow = "hidden";
  if (lockWidth > 0) {
    root.style.minWidth = `${lockWidth}px`;
    root.style.maxWidth = `${lockWidth}px`;
  } else {
    root.style.maxWidth = "";
  }
}

/** @returns {{ cell: HTMLSpanElement, glyph: HTMLSpanElement }} */
function createCharCell(ch, widthPx, spec) {
  const cell = document.createElement("span");
  cell.className = "font-scramble-char";
  cell.setAttribute("aria-hidden", "true");
  cell.style.display = "inline-block";
  cell.style.textAlign = "center";
  cell.style.verticalAlign = "baseline";
  cell.style.lineHeight = "1";
  cell.style.overflow = "hidden";
  applyCharLayout(cell, spec, widthPx);
  cell.textContent = ch;
  return { cell, glyph: cell };
}

/** @param {Element} root @param {string} text @param {FontKind} fontKind @param {{ roobertWidths: number[], secoloWidths: number[] }} [widthSets] @param {{ scrambling?: boolean }} [options] */
function mountTermChars(
  root,
  text,
  fontKind,
  widthSets = buildTermWidthSets(text),
  options = {}
) {
  const { scrambling = false } = options;
  const graphemes = [...text];
  const spec = FONT_SPECS[fontKind];
  const anchorHeight = getAnchorHeight();

  layoutTermRoot(root, 0);
  root.replaceChildren();

  const chars = graphemes.map((final, index) => {
    const width =
      scrambling && fontKind === "roobert"
        ? widthAtScramble(widthSets, fontKind, index)
        : widthAt(widthSets, fontKind, index);
    const { cell, glyph } = createCharCell(final, width, spec);
    root.appendChild(cell);
    return { cell, glyph, final, width };
  });

  syncTermLockWidth(root, chars);

  return { graphemes, chars, anchorHeight, widthSets, spec };
}

function isActiveState(state) {
  return activeStates.get(state.root) === state;
}

function clearTimer(state) {
  if (state.timerId != null) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }
  if (state.intervalId != null) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

function restoreElement(state) {
  const { root, originalText, savedStyles } = state;
  for (const { cell } of state.chars) {
    cell.remove();
  }
  root.textContent = originalText;
  root.style.minWidth = savedStyles.minWidth;
  root.style.minHeight = savedStyles.minHeight;
  root.style.height = savedStyles.height;
  root.style.display = savedStyles.display;
  root.style.position = savedStyles.position;
  root.style.boxSizing = savedStyles.boxSizing;
  root.style.lineHeight = savedStyles.lineHeight;
  root.style.alignItems = savedStyles.alignItems;
  root.style.verticalAlign = savedStyles.verticalAlign;
  root.style.direction = savedStyles.direction;
  delete root.dataset.fontScrambleActive;
}

function finishState(state, targetFont) {
  if (!isActiveState(state)) return;
  clearTimer(state);
  state.chars.forEach(({ glyph, cell }, index) => {
    applyCharForFont(glyph, targetFont, state.widthSets, index);
    glyph.textContent = state.graphemes[index];
    cell.style.opacity = "1";
  });
  syncTermLockWidth(state.root, state.chars);
  state.onComplete?.();
  activeStates.delete(state.root);
  delete state.root.dataset.fontScrambleActive;
}

/** @param {Element} root @param {string} text @param {FontKind} fromFont @param {FontKind} toFont */
function prepareState(root, text, fromFont, toFont) {
  const savedStyles = {
    minWidth: root.style.minWidth,
    minHeight: root.style.minHeight,
    height: root.style.height,
    display: root.style.display,
    position: root.style.position,
    boxSizing: root.style.boxSizing,
    lineHeight: root.style.lineHeight,
    alignItems: root.style.alignItems,
    verticalAlign: root.style.verticalAlign,
    direction: root.style.direction,
  };

  const mounted = mountTermChars(root, text, fromFont, undefined, {
    scrambling: fromFont === "roobert",
  });

  return {
    root,
    originalText: text,
    graphemes: mounted.graphemes,
    chars: mounted.chars,
    fromFont,
    toFont,
    fromSpec: FONT_SPECS[fromFont],
    toSpec: FONT_SPECS[toFont],
    savedStyles,
    widthSets: mounted.widthSets,
    anchorHeight: mounted.anchorHeight,
    timerId: null,
    intervalId: null,
    onComplete: null,
  };
}

function setCharsScramble(state, fontKind) {
  const scrambling = true;
  state.chars.forEach(({ glyph, cell, final }, index) => {
    applyCharForFont(glyph, fontKind, state.widthSets, index, scrambling);
    glyph.textContent = final === " " || final === "\u00a0" ? final : randomGlyph();
    cell.style.opacity = "1";
  });
  syncTermLockWidth(state.root, state.chars);
}

function runContinuousScramble(state, fontKind, durationMs) {
  return new Promise((resolve) => {
    if (!isActiveState(state)) {
      resolve();
      return;
    }
    const start = performance.now();
    const tick = () => {
      if (!isActiveState(state)) {
        resolve();
        return;
      }
      setCharsScramble(state, fontKind);
      if (performance.now() - start >= durationMs) {
        clearTimer(state);
        resolve();
        return;
      }
      state.timerId = window.setTimeout(tick, TIMING.frameMs);
    };
    tick();
  });
}

function runSettleReveal(state, fontKind) {
  return new Promise((resolve) => {
    if (!isActiveState(state)) {
      resolve();
      return;
    }
    const settleFrames = buildSettleFrames(state.graphemes.length);
    let frame = 0;

    const tick = () => {
      if (!isActiveState(state)) {
        resolve();
        return;
      }
      state.chars.forEach(({ glyph, cell, final }, index) => {
        const scrambling = frame < settleFrames[index];
        applyCharForFont(glyph, fontKind, state.widthSets, index, scrambling);
        if (frame >= settleFrames[index] || final === " " || final === "\u00a0") {
          glyph.textContent = final;
        } else {
          glyph.textContent = randomGlyph();
        }
        cell.style.opacity = "1";
      });
      syncTermLockWidth(state.root, state.chars);
      frame += 1;
      if (frame > maxSettleFrame(settleFrames)) {
        finishState(state, fontKind);
        resolve();
        return;
      }
      state.timerId = window.setTimeout(tick, TIMING.frameMs);
    };
    tick();
  });
}

/** @param {object} state @param {FontScrambleMode} mode */
async function runMode(state, mode) {
  const { fromFont, toFont } = state;

  switch (mode) {
    case "exit-enter":
      await runContinuousScramble(state, fromFont, TIMING.exitMs);
      if (!isActiveState(state)) return;
      await runSettleReveal(state, toFont);
      return;

    case "cross-scramble": {
      const totalMs = TIMING.exitMs + 120;
      const swapAt = totalMs * TIMING.crossSwapAt;
      let swapped = false;
      await new Promise((resolve) => {
        const start = performance.now();
        const tick = () => {
          if (!isActiveState(state)) {
            resolve();
            return;
          }
          const elapsed = performance.now() - start;
          if (!swapped && elapsed >= swapAt) swapped = true;
          setCharsScramble(state, swapped ? toFont : fromFont);
          if (elapsed >= totalMs) {
            clearTimer(state);
            resolve();
            return;
          }
          state.timerId = window.setTimeout(tick, TIMING.frameMs);
        };
        tick();
      });
      if (!isActiveState(state)) return;
      await runSettleReveal(state, toFont);
      return;
    }

    case "typewriter-erase": {
      const n = state.graphemes.length;
      for (let step = n; step >= 0; step--) {
        if (!isActiveState(state)) return;
        state.chars.forEach(({ glyph, cell, final }, index) => {
          applyCharForFont(glyph, state.fromFont, state.widthSets, index);
          if (index < step) {
            glyph.textContent = final === " " || final === "\u00a0" ? final : randomGlyph();
            cell.style.opacity = "1";
          } else if (index >= step) {
            glyph.textContent = final;
            cell.style.opacity = "0";
          }
        });
        syncTermLockWidth(state.root, state.chars);
        await new Promise((r) => {
          state.timerId = window.setTimeout(r, TIMING.charStepMs);
        });
      }
      for (let step = 0; step <= n; step++) {
        if (!isActiveState(state)) return;
        state.chars.forEach(({ glyph, cell, final }, index) => {
          applyCharForFont(glyph, state.toFont, state.widthSets, index);
          if (index < step) {
            glyph.textContent = final;
            cell.style.opacity = "1";
          } else {
            glyph.textContent = final === " " || final === "\u00a0" ? final : randomGlyph();
            cell.style.opacity = index === step ? "1" : "0";
          }
        });
        syncTermLockWidth(state.root, state.chars);
        await new Promise((r) => {
          state.timerId = window.setTimeout(r, TIMING.charStepMs);
        });
      }
      if (isActiveState(state)) finishState(state, toFont);
      return;
    }

    case "typewriter-overlap": {
      const n = state.graphemes.length;
      for (let step = 0; step <= n; step++) {
        if (!isActiveState(state)) return;
        state.chars.forEach(({ glyph, cell, final }, index) => {
          const written = index < step;
          const remaining = index >= n - step;
          if (written) {
            applyCharForFont(glyph, state.toFont, state.widthSets, index);
            glyph.textContent = final;
            cell.style.opacity = "1";
          } else if (remaining) {
            applyCharForFont(glyph, state.fromFont, state.widthSets, index);
            glyph.textContent = final === " " || final === "\u00a0" ? final : randomGlyph();
            cell.style.opacity = "1";
          } else {
            cell.style.opacity = "0";
          }
        });
        syncTermLockWidth(state.root, state.chars);
        await new Promise((r) => {
          state.timerId = window.setTimeout(r, TIMING.charStepMs);
        });
      }
      if (isActiveState(state)) finishState(state, toFont);
      return;
    }

    case "wave-settle":
      setCharsScramble(state, toFont);
      await new Promise((r) => {
        state.timerId = window.setTimeout(r, TIMING.blinkScrambleMs);
      });
      if (!isActiveState(state)) return;
      await runSettleReveal(state, toFont);
      return;

    case "blink-swap":
      await runContinuousScramble(state, fromFont, TIMING.blinkScrambleMs);
      if (!isActiveState(state)) return;
      setCharsScramble(state, toFont);
      await new Promise((r) => {
        state.timerId = window.setTimeout(r, 40);
      });
      if (!isActiveState(state)) return;
      await runSettleReveal(state, toFont);
      return;

    case "char-flip": {
      const order = shuffleIndices(state.graphemes.length);
      for (const charIndex of order) {
        if (!isActiveState(state)) return;
        const { glyph, cell, final } = state.chars[charIndex];
        for (let f = 0; f < TIMING.charFlipScrambleFrames; f++) {
          applyCharForFont(glyph, state.fromFont, state.widthSets, charIndex);
          glyph.textContent = final === " " || final === "\u00a0" ? final : randomGlyph();
          cell.style.opacity = "1";
          await new Promise((r) => {
            state.timerId = window.setTimeout(r, TIMING.frameMs);
          });
          if (!isActiveState(state)) return;
        }
        applyCharForFont(glyph, state.toFont, state.widthSets, charIndex);
        glyph.textContent = final === " " || final === "\u00a0" ? final : randomGlyph();
        syncTermLockWidth(state.root, state.chars);
        await new Promise((r) => {
          state.timerId = window.setTimeout(r, TIMING.frameMs);
        });
        glyph.textContent = final;
        await new Promise((r) => {
          state.timerId = window.setTimeout(r, TIMING.charFlipGapMs);
        });
      }
      if (isActiveState(state)) finishState(state, toFont);
      return;
    }

    default:
      await runSettleReveal(state, toFont);
  }
}

/**
 * @param {Element | null | undefined} root
 * @param {{
 *   mode?: FontScrambleMode,
 *   text?: string,
 *   fromFont?: FontKind,
 *   toFont?: FontKind,
 *   onComplete?: () => void,
 * }} [options]
 * @returns {boolean}
 */
/** @param {Element} root @param {string} text @param {FontKind} fontKind */
function prepareTextSwitchState(root, text, fontKind) {
  const savedStyles = {
    minWidth: root.style.minWidth,
    minHeight: root.style.minHeight,
    height: root.style.height,
    display: root.style.display,
    position: root.style.position,
    boxSizing: root.style.boxSizing,
    lineHeight: root.style.lineHeight,
    alignItems: root.style.alignItems,
    verticalAlign: root.style.verticalAlign,
    direction: root.style.direction,
  };

  const mounted = mountTermChars(root, text, fontKind);

  return {
    root,
    originalText: text,
    graphemes: mounted.graphemes,
    chars: mounted.chars,
    fontKind,
    widthSets: mounted.widthSets,
    savedStyles,
    timerId: null,
    intervalId: null,
    onComplete: null,
    mode: "text-switch",
  };
}

function finishTextSwitchState(state, fontKind) {
  if (!isActiveState(state)) return;
  clearTimer(state);
  state.chars.forEach(({ glyph, cell }, index) => {
    applyCharForFont(glyph, fontKind, state.widthSets, index);
    glyph.textContent = state.graphemes[index];
    cell.style.opacity = "1";
  });
  syncTermLockWidth(state.root, state.chars);
  state.onComplete?.();
  activeStates.delete(state.root);
  delete state.root.dataset.fontScrambleActive;
}

/** @param {object} state @param {string} fromText @param {FontKind} fontKind */
async function runTextSwitchErase(state, fromText, fontKind) {
  const n = [...fromText].length;
  if (!n) return;

  const mounted = mountTermChars(state.root, fromText, fontKind);
  state.graphemes = mounted.graphemes;
  state.chars = mounted.chars;
  state.widthSets = mounted.widthSets;
  state.originalText = fromText;

  for (let step = n; step >= 0; step--) {
    if (!isActiveState(state)) return;
    state.chars.forEach(({ glyph, cell, final }, index) => {
      applyCharForFont(glyph, fontKind, state.widthSets, index);
      if (index < step) {
        glyph.textContent = final === " " || final === "\u00a0" ? final : randomGlyph();
        cell.style.opacity = "1";
      } else {
        glyph.textContent = final;
        cell.style.opacity = "0";
      }
    });
    syncTermLockWidth(state.root, state.chars);
    await new Promise((resolve) => {
      state.timerId = window.setTimeout(resolve, TIMING.charStepMs);
    });
  }
}

/** @param {object} state @param {string} toText @param {FontKind} fontKind */
async function runTextSwitchWrite(state, toText, fontKind) {
  const graphemes = [...toText];
  const n = graphemes.length;
  if (!n) {
    finishTextSwitchState(state, fontKind);
    return;
  }

  const mounted = mountTermChars(state.root, toText, fontKind);
  state.graphemes = mounted.graphemes;
  state.chars = mounted.chars;
  state.widthSets = mounted.widthSets;
  state.originalText = toText;

  for (let step = 0; step <= n; step++) {
    if (!isActiveState(state)) return;
    state.chars.forEach(({ glyph, cell, final }, index) => {
      applyCharForFont(glyph, fontKind, state.widthSets, index);
      if (index < step) {
        glyph.textContent = final;
        cell.style.opacity = "1";
      } else {
        glyph.textContent = final === " " || final === "\u00a0" ? final : randomGlyph();
        cell.style.opacity = index === step ? "1" : "0";
      }
    });
    syncTermLockWidth(state.root, state.chars);
    await new Promise((resolve) => {
      state.timerId = window.setTimeout(resolve, TIMING.charStepMs);
    });
  }

  if (isActiveState(state)) finishTextSwitchState(state, fontKind);
}

/** @param {object} state @param {string} fromText @param {string} toText @param {FontKind} fontKind */
async function runTextSwitchMode(state, fromText, toText, fontKind) {
  await runTextSwitchErase(state, fromText, fontKind);
  if (!isActiveState(state)) return;
  await runTextSwitchWrite(state, toText, fontKind);
}

/**
 * Secolo→Secolo (or same-font) heading switch: erase `fromText`, then type `toText`.
 * @param {Element | null | undefined} root
 * @param {{
 *   fromText?: string,
 *   toText?: string,
 *   font?: FontKind,
 *   onComplete?: () => void,
 * }} [options]
 * @returns {boolean}
 */
export function playFontScrambleTextSwitch(root, options = {}) {
  if (!root) {
    options.onComplete?.();
    return false;
  }

  const {
    fromText = "",
    toText = "",
    font = "secolo",
    onComplete,
  } = options;

  if (!fromText.trim() && !toText.trim()) {
    onComplete?.();
    return false;
  }

  abortFontScrambleTransition(root);

  if (reducedMotion) {
    if (toText.trim()) mountFontScrambleTerm(root, toText, font);
    onComplete?.();
    return false;
  }

  const initialText = fromText.trim() ? fromText : toText;
  const state = prepareTextSwitchState(root, initialText, font);
  state.onComplete = onComplete ?? null;
  root.dataset.fontScrambleActive = "1";
  activeStates.set(root, state);

  runTextSwitchMode(state, fromText, toText, font);

  return true;
}

export function playFontScrambleTransition(root, options = {}) {
  if (!root) {
    options.onComplete?.();
    return false;
  }

  const {
    mode = "exit-enter",
    text = root.textContent ?? "",
    fromFont = "roobert",
    toFont = "secolo",
    onComplete,
  } = options;

  if (!text.trim()) {
    onComplete?.();
    return false;
  }

  abortFontScrambleTransition(root);

  if (reducedMotion) {
    mountFontScrambleTerm(root, text, toFont);
    onComplete?.();
    return false;
  }

  const state = prepareState(root, text, fromFont, toFont);
  state.onComplete = onComplete ?? null;
  root.dataset.fontScrambleActive = "1";
  activeStates.set(root, state);

  runMode(state, mode).then(() => {
    if (isActiveState(state)) {
      finishState(state, toFont);
    }
  });

  return true;
}

/** @param {Element | null | undefined} root */
export function abortFontScrambleTransition(root) {
  if (!root) return;
  const state = activeStates.get(root);
  if (!state) return;
  clearTimer(state);
  activeStates.delete(root);
  restoreElement(state);
}

/** Mount a static term at rest (same DOM as animation — no height jump). */
export function mountFontScrambleTerm(root, text, fontKind, options = {}) {
  if (!root || !text.trim()) return;
  abortFontScrambleTransition(root);
  mountTermChars(root, text, fontKind, undefined, options);
  root.dataset.fontKind = fontKind;
}

/** Fixed stage height for bottom-anchored Roobert/Secolo pairs. */
export function getFontScrambleAnchorHeight() {
  return getAnchorHeight();
}

/** Baseline distance from the bottom of the line box (for debug ruler). */
export function getFontScrambleBaselineInset() {
  return getBaselineInset();
}

/** Screen Y of the shared alphabetic baseline on a bottom-anchored mounted term. */
export function getMountedTermScreenBaselineY(rootEl) {
  if (!rootEl?.getBoundingClientRect) return null;
  const bottom = rootEl.getBoundingClientRect().bottom;
  if (!Number.isFinite(bottom)) return null;
  return bottom - getBaselineInset();
}

export function clearFontScrambleMetricsCache() {
  fontMetricsCache.clear();
  baselineInsetCache.clear();
  roobertScrambleMinCellWidth = null;
}

/** @param {FontKind} kind @param {number} [labScale=0.65] */
export function getLabFontSize(kind, labScale = 0.65) {
  return Math.round(FONT_SPECS[kind].size * labScale);
}

/** @param {FontScrambleMode} mode @param {string} text */
/** Elapsed ms before the scramble switches from Roobert to Secolo. */
export function estimateFontScrambleSecoloStartMs(mode, text) {
  const n = [...text].length;
  if (!n) return 0;

  switch (mode) {
    case "typewriter-erase":
      return n * TIMING.charStepMs;
    case "typewriter-overlap":
      return 0;
    case "exit-enter":
      return TIMING.exitMs;
    case "cross-scramble":
      return (TIMING.exitMs + 120) * TIMING.crossSwapAt;
    case "blink-swap":
      return TIMING.blinkScrambleMs;
    case "wave-settle":
      return TIMING.blinkScrambleMs;
    case "char-flip":
      return TIMING.charFlipScrambleFrames * TIMING.frameMs + TIMING.frameMs;
    default:
      return 0;
  }
}

export function estimateFontScrambleDuration(mode, text) {
  const n = [...text].length;
  if (!n) return 0;

  switch (mode) {
    case "typewriter-erase":
      return 2 * n * TIMING.charStepMs;
    case "typewriter-overlap":
      return n * TIMING.charStepMs;
    case "exit-enter":
      return TIMING.exitMs + TIMING.cycles * TIMING.frameMs + n * TIMING.staggerMs;
    case "cross-scramble":
      return TIMING.exitMs + 120 + TIMING.cycles * TIMING.frameMs + n * TIMING.staggerMs;
    case "blink-swap":
      return TIMING.blinkScrambleMs + 40 + TIMING.cycles * TIMING.frameMs + n * TIMING.staggerMs;
    case "wave-settle":
      return TIMING.blinkScrambleMs + TIMING.cycles * TIMING.frameMs + n * TIMING.staggerMs;
    case "char-flip":
      return (
        n *
        (TIMING.charFlipScrambleFrames * TIMING.frameMs +
          TIMING.frameMs +
          TIMING.charFlipGapMs)
      );
    default:
      return TIMING.cycles * TIMING.frameMs + n * TIMING.staggerMs;
  }
}

export function initFontScrambleTransitions() {
  refreshReducedMotion();
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", refreshReducedMotion);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(refreshReducedMotion);
  }
  const warmMetrics = () => {
    fontMetricsCache.clear();
    baselineInsetCache.clear();
    getAnchorHeight();
    getBaselineInset();
  };
  if (document.fonts?.ready) {
    document.fonts.ready.then(warmMetrics);
  } else {
    warmMetrics();
  }
}
