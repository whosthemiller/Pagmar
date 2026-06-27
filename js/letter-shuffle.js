const SVG_NS = "http://www.w3.org/2000/svg";

const SHUFFLE_CHARSET =
  "אבגדהוזחטיכלמנסעפצקרשתABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?";

const CONFIG = {
  cycles: 4,
  frameMs: 17,
  staggerMs: 12,
};

const FAST_LIGHT_CONFIG = {
  cycles: 2,
  frameMs: 8,
  staggerMs: 2,
  maxSpread: 18,
};

/** Index home page — slower than nav/hints, faster than map shuffle. */
const INDEX_LIGHT_CONFIG = {
  cycles: 3,
  frameMs: 11,
  staggerMs: 6,
  maxSpread: 20,
};

/** Page navigation settle — snappier than map hover shuffle. */
export const PAGE_NAV_SCRAMBLE_CONFIG = {
  cycles: 2,
  frameMs: 7,
  staggerMs: 3,
};

/** Term-page definition mentions — slightly slower than default light shuffle. */
const TERM_DEF_MENTION_CONFIG = {
  cycles: 4,
  frameMs: 22,
  staggerMs: 15,
  maxSpread: 24,
};

/** Term-page paragraphs + label panels — 2 chars per step typewriter scramble. */
const LABEL_PANEL_TYPEWRITER_CONFIG = {
  frameMs: 6,
  scrambleFrames: 2,
  tailLength: 6,
  charsPerStep: 2,
};

/** @type {WeakMap<Element, object>} */
const activeStates = new WeakMap();

/** Hover underline kept after shuffle finishes until pointer leaves. */
/** @type {WeakMap<Element, object>} */
const lingerStates = new WeakMap();

let reducedMotion = false;
/** @type {CanvasRenderingContext2D | null} */
let measureCtx = null;

function refreshReducedMotion() {
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getMeasureCtx() {
  if (measureCtx) return measureCtx;
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

function readFont(el) {
  const cs = getComputedStyle(el);
  return `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}

/** @param {string} text */
function measureGraphemeWidths(text, font) {
  const ctx = getMeasureCtx();
  if (!ctx) return [...text].map(() => 8);
  ctx.font = font;
  ctx.direction = "rtl";
  return [...text].map((ch) => Math.ceil(ctx.measureText(ch).width));
}

function randomGlyph() {
  return SHUFFLE_CHARSET[Math.floor(Math.random() * SHUFFLE_CHARSET.length)];
}

function isTermMetaShuffleEl(root) {
  return (
    root.classList.contains("sun-term-meta__tag") ||
    root.classList.contains("sun-term-meta__value") ||
    root.classList.contains("sun-term-meta__heading")
  );
}

function isInlineDefMention(root) {
  return root?.classList?.contains("sun-def-mention");
}

function isLightHoverShuffleEl(root) {
  return (
    root.classList.contains("sun-filter-bar__option") ||
    root.classList.contains("sun-filter-bar__label") ||
    root.classList.contains("sun-term-hover-caption__line") ||
    root.classList.contains("site-nav__label") ||
    root.classList.contains("splash__intro-link") ||
    root.classList.contains("sun-about__brand-link") ||
    root.classList.contains("sun-about__credit-link") ||
    root.classList.contains("sun-term-meta__tag") ||
    root.classList.contains("sun-term-meta__value")
  );
}

function isShuffleable(el) {
  if (!(el instanceof Element)) return false;
  if (el.closest("[data-letter-shuffle='off']")) return false;
  if (el.matches(".sun-filter-bar__option.is-disabled")) return false;
  if (el.matches(".sun-term-meta__value") && el.querySelector(":scope > *")) return false;
  const text = el.textContent ?? "";
  return text.trim().length > 0;
}

function isSvgText(el) {
  return el.namespaceURI === SVG_NS && el.localName === "text";
}

function createHtmlCharNode(root, ch, widthPx) {
  const span = document.createElement("span");
  span.className = "letter-shuffle-char";
  span.setAttribute("aria-hidden", "true");
  span.style.width = `${widthPx}px`;
  span.textContent = ch;
  root.appendChild(span);
  return span;
}

function parseLineHeightPx(cs) {
  const fontSize = parseFloat(cs.fontSize) || 16;
  const lh = cs.lineHeight;
  if (lh === "normal") return fontSize * 1.2;
  if (lh.endsWith("px")) return parseFloat(lh);
  const unitless = parseFloat(lh);
  return Number.isFinite(unitless) ? unitless * fontSize : fontSize * 1.2;
}

/** Snapshot layout before DOM mutation — underline position must stay fixed for the whole shuffle. */
function captureHtmlMetrics(root) {
  const cs = getComputedStyle(root);
  const rect = root.getBoundingClientRect();
  const fontSize = parseFloat(cs.fontSize) || 16;
  const lineHeightPx = parseLineHeightPx(cs);
  return {
    width: rect.width,
    height: rect.height,
    fontSize,
    lineHeightPx,
    underlineTop: lineHeightPx + fontSize * 0.12,
    underlineHeight: Math.max(1, fontSize * 0.08),
    display: cs.display,
  };
}

function lockHtmlLayout(root) {
  return {
    minWidth: root.style.minWidth,
    width: root.style.width,
    maxWidth: root.style.maxWidth,
    minHeight: root.style.minHeight,
    height: root.style.height,
    maxHeight: root.style.maxHeight,
    lineHeight: root.style.lineHeight,
    display: root.style.display,
    boxSizing: root.style.boxSizing,
    position: root.style.position,
    overflow: root.style.overflow,
    verticalAlign: root.style.verticalAlign,
  };
}

function restoreHtmlLayoutStyles(root, htmlStyles) {
  if (!htmlStyles) return;
  root.style.minWidth = htmlStyles.minWidth;
  root.style.width = htmlStyles.width;
  root.style.maxWidth = htmlStyles.maxWidth;
  root.style.minHeight = htmlStyles.minHeight;
  root.style.height = htmlStyles.height;
  root.style.maxHeight = htmlStyles.maxHeight;
  root.style.lineHeight = htmlStyles.lineHeight;
  root.style.display = htmlStyles.display;
  root.style.boxSizing = htmlStyles.boxSizing;
  root.style.position = htmlStyles.position;
  root.style.overflow = htmlStyles.overflow;
  root.style.verticalAlign = htmlStyles.verticalAlign;
}

const INLINE_MENTION_OVERLAY_CLASS = "letter-shuffle-inline-overlay";

function measureInlineMentionTextRect(root) {
  const range = document.createRange();
  let textNode = null;
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.length) {
      textNode = node;
      break;
    }
  }
  if (textNode) {
    range.selectNodeContents(textNode);
  } else {
    range.selectNodeContents(root);
  }

  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
  const textRect = rects[0] ?? range.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();

  return {
    top: textRect.top - rootRect.top,
    left: textRect.left - rootRect.left,
    width: textRect.width,
    height: textRect.height,
  };
}

function positionInlineMentionOverlay(root, overlay) {
  const { top, left, width, height } = measureInlineMentionTextRect(root);
  overlay.style.top = `${Math.round(top)}px`;
  overlay.style.left = `${Math.round(left)}px`;
  overlay.style.width = `${Math.ceil(width)}px`;
  overlay.style.height = `${Math.ceil(height)}px`;
}

function applyInlineMentionOverlay(root, original) {
  const htmlStyles = lockHtmlLayout(root);
  const cs = getComputedStyle(root);
  const overlay = document.createElement("span");
  overlay.className = INLINE_MENTION_OVERLAY_CLASS;
  overlay.setAttribute("aria-hidden", "true");
  overlay.textContent = original;

  const colorStyles =
    cs.color !== "transparent" && cs.webkitTextFillColor !== "transparent"
      ? {
          color: root.style.color,
          webkitTextFillColor: root.style.webkitTextFillColor,
        }
      : null;

  if (colorStyles) {
    root.style.color = "transparent";
    root.style.webkitTextFillColor = "transparent";
  }

  root.appendChild(overlay);
  positionInlineMentionOverlay(root, overlay);

  return { htmlStyles, overlay, colorStyles };
}

function releaseInlineMentionOverlay(root, htmlStyles, overlay, colorStyles, original) {
  overlay?.remove();
  root.textContent = original;
  restoreHtmlLayoutStyles(root, htmlStyles);
  if (colorStyles) {
    root.style.color = colorStyles.color;
    root.style.webkitTextFillColor = colorStyles.webkitTextFillColor;
  }
}

function finishInlineMentionState(state) {
  if (!isActiveShuffleState(state)) return;

  if (state.timerId != null) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }

  const { root, onComplete } = state;
  releaseInlineMentionOverlay(
    root,
    state.htmlStyles,
    state.overlay,
    state.colorStyles,
    state.original
  );

  lingerStates.set(root, {
    root,
    mode: "inline-mention",
  });

  activeStates.delete(root);
  delete root.dataset.letterShuffleActive;
  root.dataset.letterShuffleHover = "1";
  onComplete?.();
}

function startInlineMentionShuffle(root, onComplete) {
  const original = root.textContent ?? "";
  if (!original.trim()) {
    onComplete?.();
    return false;
  }

  const config = getShuffleConfig(root);
  const graphemes = [...original];
  const settleFrames = buildSettleFrames(graphemes.length, config);
  const { htmlStyles, overlay, colorStyles } = applyInlineMentionOverlay(root, original);

  const state = {
    root,
    overlay,
    colorStyles,
    original,
    mode: "inline-mention",
    config,
    graphemes,
    settleFrames,
    frame: 0,
    timerId: null,
    onComplete,
    htmlStyles,
  };

  const tick = () => {
    if (!isActiveShuffleState(state)) return;

    overlay.textContent = state.graphemes
      .map((ch, index) => glyphAtFrame(ch, index, state.frame, state.settleFrames))
      .join("");
    state.frame += 1;

    if (state.frame > maxSettleFrame(state.settleFrames, state.config)) {
      finishInlineMentionState(state);
      return;
    }

    if (!isActiveShuffleState(state)) return;
    state.timerId = window.setTimeout(tick, state.config.frameMs);
  };

  root.dataset.letterShuffleActive = "1";
  activeStates.set(root, state);
  tick();
  return true;
}

function isCompactShuffleLabel(root) {
  return (
    root.classList.contains("sun-terms-index__term-label") ||
    root.classList.contains("site-nav__label") ||
    root.classList.contains("splash__intro-link") ||
    root.classList.contains("sun-about__brand-link") ||
    root.classList.contains("sun-about__credit-link") ||
    root.classList.contains("sun-term-page__label-nav-text")
  );
}

/** Light-shuffle labels that must keep a fixed footprint so neighbouring inline text doesn't reflow. */
function isNoReflowLightShuffleEl(root) {
  return (
    root.classList.contains("splash__intro-link") ||
    root.classList.contains("sun-about__brand-link") ||
    root.classList.contains("sun-about__credit-link")
  );
}

/** Snapshot the rendered width and pin it so random glyphs of varying advance don't shift siblings. */
function lockLightShuffleWidth(root) {
  const rect = root.getBoundingClientRect();
  const saved = {
    display: root.style.display,
    width: root.style.width,
    boxSizing: root.style.boxSizing,
    whiteSpace: root.style.whiteSpace,
    clipPath: root.style.clipPath,
  };
  root.style.display = "inline-block";
  root.style.width = `${rect.width}px`;
  root.style.boxSizing = "border-box";
  root.style.whiteSpace = "nowrap";
  // Clip the wider random glyphs with clip-path rather than `overflow: hidden`:
  // on an inline-block, overflow != visible moves the baseline to the bottom
  // margin edge, which lifts the box above the text baseline and grows the line
  // box — making the bottom-anchored splash intro jump in height on hover.
  root.style.clipPath = "inset(0)";
  return saved;
}

function restoreLightShuffleWidth(root, saved) {
  if (!saved) return;
  root.style.display = saved.display;
  root.style.width = saved.width;
  root.style.boxSizing = saved.boxSizing;
  root.style.whiteSpace = saved.whiteSpace;
  root.style.clipPath = saved.clipPath;
}

function applyHtmlLayoutLock(root, widthPx, metrics) {
  const htmlStyles = lockHtmlLayout(root);
  const cs = getComputedStyle(root);
  const usedMinHeight = parseFloat(cs.minHeight) || 0;
  const compact = isCompactShuffleLabel(root);
  const inlineMention = isInlineDefMention(root);
  const lockVertical =
    (!compact || root.classList.contains("sun-term-page__label-nav-text")) &&
    !inlineMention;
  root.style.boxSizing = "border-box";
  root.style.minWidth = `${widthPx}px`;
  if (lockVertical) {
    root.style.lineHeight = `${metrics.lineHeightPx}px`;
  }
  if (metrics.display === "block") {
    root.style.display = "inline-block";
  }
  if (
    lockVertical &&
    (metrics.display === "inline-block" || metrics.display === "block")
  ) {
    root.style.minHeight = `${Math.ceil(Math.max(metrics.height, metrics.lineHeightPx, usedMinHeight))}px`;
  }
  if (!inlineMention && cs.position === "static") {
    root.style.position = "relative";
  }
  return htmlStyles;
}

function attachHtmlUnderline(root, metrics, options = {}) {
  const { animate = true } = options;
  root.querySelector(":scope > .letter-shuffle-underline")?.remove();
  const line = document.createElement("span");
  line.className = "letter-shuffle-underline";
  line.setAttribute("aria-hidden", "true");
  line.style.top = `${metrics.underlineTop}px`;
  line.style.height = `${metrics.underlineHeight}px`;
  root.appendChild(line);

  if (animate) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        line.classList.add("is-written");
      });
    });
  } else {
    line.classList.add("is-written");
  }

  return line;
}

function shouldAttachHtmlUnderline(root) {
  if (isCompactShuffleLabel(root)) return false;
  if (isInlineDefMention(root)) return false;
  if (root.classList.contains("sun-terms-index__legend")) return false;
  return root.dataset.letterShuffleUnderline !== "off";
}

/** @returns {object | null} */
function prepareState(root) {
  const original = root.textContent ?? "";
  if (!original) return null;

  if (isSvgText(root)) {
    const lockedWidth = root.getBBox().width;
    const graphemes = [...original];
    if (lockedWidth > 0.5) {
      root.setAttribute("textLength", String(lockedWidth));
      root.setAttribute("lengthAdjust", "spacing");
    }
    return {
      root,
      original,
      frame: 0,
      timerId: null,
      mode: "svg",
      graphemes,
      settleFrames: buildSettleFrames(graphemes.length),
      lockedWidth,
    };
  }

  const metrics = captureHtmlMetrics(root);
  const config = getShuffleConfig(root);
  const font = readFont(root);
  const graphemes = [...original];
  const rawWidths = measureGraphemeWidths(original, font);
  const rawTotal = rawWidths.reduce((sum, w) => sum + w, 0);
  const lockWidth = metrics.width > 0.5 ? metrics.width : rawTotal;
  const widths =
    rawTotal > 0
      ? rawWidths.map((w) => (w / rawTotal) * lockWidth)
      : rawWidths;
  const htmlStyles = applyHtmlLayoutLock(root, lockWidth, metrics);

  root.textContent = "";
  const chars = graphemes.map((final, index) => ({
    el: createHtmlCharNode(root, final, widths[index]),
    final,
  }));
  const htmlUnderline = shouldAttachHtmlUnderline(root)
    ? attachHtmlUnderline(root, metrics)
    : null;
  const layoutHeight = root.getBoundingClientRect().height;
  if (shouldAttachHtmlUnderline(root)) {
    root.style.minHeight = `${Math.ceil(layoutHeight)}px`;
  }

  return {
    root,
    original,
    chars,
    frame: 0,
    timerId: null,
    mode: "html",
    config,
    htmlStyles,
    htmlUnderline,
    metrics,
    lockWidth,
    layoutHeight,
    settleFrames: buildSettleFrames(graphemes.length, config),
  };
}

function isActiveShuffleState(state) {
  return activeStates.get(state.root) === state;
}

function clearLingerState(root) {
  const linger = lingerStates.get(root);
  if (!linger) return;

  if (linger.mode === "inline-mention") {
    lingerStates.delete(root);
    delete root.dataset.letterShuffleHover;
    return;
  }

  linger.htmlUnderline?.remove();
  restoreHtmlLayoutStyles(root, linger.htmlStyles);

  lingerStates.delete(root);
  delete root.dataset.letterShuffleHover;
}

function restoreHtmlShuffleText(root, original, htmlUnderline) {
  if (htmlUnderline?.parentNode === root) {
    root.insertBefore(document.createTextNode(original), htmlUnderline);
    return;
  }

  root.textContent = original;
  if (htmlUnderline && !htmlUnderline.isConnected) {
    root.appendChild(htmlUnderline);
  }
}

function finishShuffleState(state) {
  if (!isActiveShuffleState(state)) return;

  if (state.timerId != null) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }

  const { root } = state;
  const onComplete = state.onComplete;

  if (state.mode === "svg") {
    root.removeAttribute("textLength");
    root.removeAttribute("lengthAdjust");
    root.textContent = state.original;
    activeStates.delete(root);
    delete root.dataset.letterShuffleActive;
    onComplete?.();
    return;
  }

  const savedStyles = state.htmlStyles;

  for (const { el } of state.chars) {
    el.remove();
  }
  if (state.htmlUnderline) {
    restoreHtmlShuffleText(root, state.original, state.htmlUnderline);
  } else {
    root.textContent = state.original;
  }

  if (!isInlineDefMention(root)) {
    root.style.minWidth = `${state.lockWidth}px`;
  }
  if (
    !isInlineDefMention(root) &&
    (!isCompactShuffleLabel(root) ||
      state.htmlUnderline ||
      root.classList.contains("sun-term-page__label-nav-text"))
  ) {
    root.style.minHeight = `${Math.ceil(state.layoutHeight)}px`;
    root.style.lineHeight = `${state.metrics.lineHeightPx}px`;
  }
  root.style.display = savedStyles.display;
  root.style.boxSizing = savedStyles.boxSizing;
  root.style.position =
    state.htmlUnderline && savedStyles.position === "" ? "relative" : savedStyles.position;

  state.htmlUnderline?.classList.add("is-written");

  lingerStates.set(root, {
    root,
    mode: "html",
    htmlUnderline: state.htmlUnderline,
    htmlStyles: savedStyles,
  });

  activeStates.delete(root);
  delete root.dataset.letterShuffleActive;
  root.dataset.letterShuffleHover = "1";
  onComplete?.();
}

function abortState(state) {
  if (state.timerId != null) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }

  state.onComplete = null;
  const { root } = state;

  if (state.mode === "inline-mention") {
    releaseInlineMentionOverlay(
      root,
      state.htmlStyles,
      state.overlay,
      state.colorStyles,
      state.original
    );
  } else if (state.mode === "light" || state.mode === "light-typewriter") {
    root.textContent = state.original;
    restoreLightShuffleWidth(root, state.widthLock);
  } else if (state.mode === "annotated-typewriter") {
    root.innerHTML = state.original;
  } else if (state.mode === "svg") {
    root.removeAttribute("textLength");
    root.removeAttribute("lengthAdjust");
    root.textContent = state.original;
  } else if (state.htmlStyles) {
    for (const { el } of state.chars ?? []) {
      el.remove();
    }
    state.htmlUnderline?.remove();
    restoreHtmlLayoutStyles(root, state.htmlStyles);
    root.textContent = state.original;
  }

  activeStates.delete(root);
  delete root.dataset.letterShuffleActive;
  delete root.dataset.letterShuffleContinuous;
  delete root.dataset.letterShuffleHover;
}

function restoreState(state) {
  if (state.timerId != null) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }

  const { root } = state;

  if (state.mode === "inline-mention") {
    releaseInlineMentionOverlay(
      root,
      state.htmlStyles,
      state.overlay,
      state.colorStyles,
      state.original
    );
  } else if (state.mode === "annotated-typewriter") {
    root.innerHTML = state.original;
  } else if (state.mode === "svg") {
    root.removeAttribute("textLength");
    root.removeAttribute("lengthAdjust");
    root.textContent = state.original;
  } else if (state.htmlStyles) {
    restoreHtmlLayoutStyles(root, state.htmlStyles);
    state.htmlUnderline?.remove();
    root.textContent = state.original;
  } else {
    root.textContent = state.original;
    restoreLightShuffleWidth(root, state.widthLock);
  }

  activeStates.delete(root);
  delete root.dataset.letterShuffleActive;
  delete root.dataset.letterShuffleContinuous;
}

function shuffleIndices(count) {
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function getShuffleConfig(root) {
  if (root?.classList?.contains("sun-def-mention")) {
    return TERM_DEF_MENTION_CONFIG;
  }
  if (
    root?.classList?.contains("sun-terms-index__term-label") ||
    root?.classList?.contains("sun-terms-index__legend")
  ) {
    return INDEX_LIGHT_CONFIG;
  }
  if (
    root?.classList?.contains("sun-filter-dim-hint") ||
    root?.classList?.contains("sun-timeline-event-hint")
  ) {
    return FAST_LIGHT_CONFIG;
  }
  if (root?.classList?.contains("sun-term-page__label-nav-panel-text")) {
    return LABEL_PANEL_TYPEWRITER_CONFIG;
  }
  return CONFIG;
}

/** Per-character settle frame in random order (not a start→end wave). */
function buildSettleFrames(charCount, config = CONFIG) {
  const order = shuffleIndices(charCount);
  let spread = Math.max(1, Math.round((charCount * config.staggerMs) / config.frameMs));
  if (config.maxSpread) spread = Math.min(spread, config.maxSpread);
  const settleFrames = new Array(charCount);
  order.forEach((charIndex, rank) => {
    const jitter = Math.floor(Math.random() * Math.max(1, spread / Math.max(charCount, 3)));
    settleFrames[charIndex] = config.cycles + Math.min(spread, rank + jitter);
  });
  return settleFrames;
}

function maxSettleFrame(settleFrames, config = CONFIG) {
  let max = config.cycles;
  for (const frame of settleFrames) {
    if (frame > max) max = frame;
  }
  return max;
}

/** Estimated wall-clock duration for one shuffle (worst-case settle order). */
export function estimateLetterShuffleDurationMs(text) {
  const charCount = [...(text || "")].length;
  if (charCount === 0) return 0;
  const spread = Math.max(1, Math.round((charCount * CONFIG.staggerMs) / CONFIG.frameMs));
  const maxFrame = CONFIG.cycles + spread * 2;
  return (maxFrame + 1) * CONFIG.frameMs;
}

function glyphAtFrame(final, index, frame, settleFrames) {
  if (frame >= settleFrames[index]) return final;
  if (final === " " || final === "\u00a0") return final;
  return randomGlyph();
}

function isLightScrambleEl(root) {
  return (
    root.classList.contains("sun-terms-index__term-label") ||
    root.classList.contains("sun-terms-index__legend") ||
    root.classList.contains("sun-filter-dim-hint") ||
    root.classList.contains("sun-timeline-event-hint") ||
    root.classList.contains("site-nav__label") ||
    root.classList.contains("splash__intro-link") ||
    root.classList.contains("sun-about__brand-link") ||
    root.classList.contains("sun-about__credit-link") ||
    root.classList.contains("sun-term-page__label-nav-text") ||
    root.classList.contains("sun-term-page__label-nav-panel-text") ||
    root.classList.contains("sun-term-similar-label") ||
    isTermMetaShuffleEl(root)
  );
}

function tickContinuousLightState(state) {
  if (!isActiveShuffleState(state)) return;

  state.root.textContent = [...state.original]
    .map((ch) => (ch === " " || ch === "\u00a0" ? ch : randomGlyph()))
    .join("");
  if (!isActiveShuffleState(state)) return;
  state.timerId = window.setTimeout(
    () => tickContinuousLightState(state),
    state.config?.frameMs ?? CONFIG.frameMs
  );
}

/** @param {Element} root @param {string} targetText @param {() => void} [onComplete] @returns {boolean} */
function runLightSettleReveal(root, targetText, onComplete) {
  const original = targetText ?? "";
  if (!original.trim()) {
    root.textContent = "";
    onComplete?.();
    return false;
  }

  const config = getShuffleConfig(root);
  const graphemes = [...original];
  const settleFrames = buildSettleFrames(graphemes.length, config);
  const state = {
    root,
    original,
    mode: "light",
    config,
    timerId: null,
    onComplete,
    continuous: false,
    frame: 0,
    graphemes,
    settleFrames,
    widthLock: isNoReflowLightShuffleEl(root) ? lockLightShuffleWidth(root) : null,
  };

  const tick = () => {
    if (!isActiveShuffleState(state)) return;

    root.textContent = state.graphemes
      .map((ch, index) => glyphAtFrame(ch, index, state.frame, state.settleFrames))
      .join("");
    state.frame += 1;

    if (state.frame > maxSettleFrame(state.settleFrames, state.config)) {
      root.textContent = state.original;
      restoreLightShuffleWidth(root, state.widthLock);
      state.timerId = null;
      activeStates.delete(root);
      delete root.dataset.letterShuffleActive;
      state.onComplete?.();
      return;
    }

    if (!isActiveShuffleState(state)) return;
    state.timerId = window.setTimeout(tick, state.config.frameMs);
  };

  root.dataset.letterShuffleActive = "1";
  activeStates.set(root, state);
  tick();
  return true;
}

/** @param {Element} root @param {string} original @param {() => void} [onComplete] */
function settleLightReveal(root, original, onComplete) {
  runLightSettleReveal(root, original, onComplete);
}

/** One-shot text-only hover shuffle — keeps multi-line option layout stable. */
function startLightHoverShuffle(root, onComplete) {
  const target = root.textContent ?? "";
  if (!target.trim()) {
    onComplete?.();
    return false;
  }
  return runLightSettleReveal(root, target, onComplete);
}

/**
 * Scramble-settle `root` text to `targetText` (text-only, no layout lock).
 * @param {Element | null | undefined} root
 * @param {string} targetText
 * @param {() => void} [onComplete]
 * @returns {boolean}
 */
export function playLightLetterShuffleTo(root, targetText, onComplete) {
  if (!root) {
    onComplete?.();
    return false;
  }
  if (reducedMotion) {
    root.textContent = targetText ?? "";
    onComplete?.();
    return false;
  }
  abortLetterShuffle(root);
  return runLightSettleReveal(root, targetText ?? "", onComplete);
}

function renderTypewriterScrambleLine(graphemes, step, tailLength) {
  const tailEnd =
    tailLength > 0 ? Math.min(graphemes.length, step + tailLength) : graphemes.length;
  return graphemes
    .map((ch, index) => {
      if (index < step) return ch;
      if (index < tailEnd) {
        if (ch === " " || ch === "\u00a0") return ch;
        return randomGlyph();
      }
      return "";
    })
    .join("");
}

/**
 * Typewriter reveal: settled prefix + scrambling tail.
 * @param {Element | null | undefined} root
 * @param {string} targetText
 * @param {() => void} [onComplete]
 * @param {{ frameMs?: number, scrambleFrames?: number, tailLength?: number }} [options]
 * @returns {boolean}
 */
export function playLightTypewriterScrambleTo(root, targetText, onComplete, options = {}) {
  if (!root) {
    onComplete?.();
    return false;
  }
  const original = targetText ?? "";
  if (!original.trim()) {
    root.textContent = "";
    onComplete?.();
    return false;
  }
  if (reducedMotion) {
    root.textContent = original;
    onComplete?.();
    return false;
  }

  abortLetterShuffle(root);

  const graphemes = [...original];
  const frameMs = options.frameMs ?? LABEL_PANEL_TYPEWRITER_CONFIG.frameMs;
  const scrambleFrames = options.scrambleFrames ?? LABEL_PANEL_TYPEWRITER_CONFIG.scrambleFrames;
  const tailLength = options.tailLength ?? LABEL_PANEL_TYPEWRITER_CONFIG.tailLength;
  const state = {
    root,
    original,
    mode: "light-typewriter",
    graphemes,
    step: 0,
    frame: 0,
    timerId: null,
    onComplete,
    frameMs,
    scrambleFrames,
    tailLength,
  };

  const tick = () => {
    if (!isActiveShuffleState(state)) return;

    root.textContent = renderTypewriterScrambleLine(
      state.graphemes,
      state.step,
      state.tailLength
    );

    if (state.step >= state.graphemes.length) {
      root.textContent = state.original;
      state.timerId = null;
      activeStates.delete(root);
      delete root.dataset.letterShuffleActive;
      state.onComplete?.();
      return;
    }

    state.frame += 1;
    if (state.frame >= state.scrambleFrames) {
      state.frame = 0;
      state.step += 1;
    }
    state.timerId = window.setTimeout(tick, state.frameMs);
  };

  root.dataset.letterShuffleActive = "1";
  activeStates.set(root, state);
  tick();
  return true;
}

/** Ordered text nodes inside `root`, each with its grapheme list and global offset. */
function collectAnnotatedTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let total = 0;
  let node;
  while ((node = walker.nextNode())) {
    const graphemes = [...(node.textContent ?? "")];
    if (!graphemes.length) continue;
    nodes.push({ node, graphemes, start: total });
    total += graphemes.length;
    node.textContent = "";
  }
  return { nodes, total };
}

function renderAnnotatedTypewriterFrame(state) {
  const { nodes, step, tailLength, total } = state;
  const tailEnd = tailLength > 0 ? step + tailLength : total;
  for (const entry of nodes) {
    let out = "";
    for (let i = 0; i < entry.graphemes.length; i++) {
      const globalIndex = entry.start + i;
      if (globalIndex >= tailEnd) break;
      const ch = entry.graphemes[i];
      if (globalIndex < step) {
        out += ch;
      } else {
        out += ch === " " || ch === "\u00a0" ? ch : randomGlyph();
      }
    }
    entry.node.textContent = out;
  }
}

function finishAnnotatedTypewriter(state) {
  for (const entry of state.nodes) {
    entry.node.textContent = entry.graphemes.join("");
  }
  state.timerId = null;
  activeStates.delete(state.root);
  delete state.root.dataset.letterShuffleActive;
  state.onComplete?.();
}

/**
 * Annotation-aware typewriter reveal.
 *
 * Unlike {@link playLightTypewriterScrambleTo} (which writes flat text and only
 * swaps in styled markup once it finishes), this builds the annotated `html`
 * into `root` first — so mention spans exist from the very first frame. The
 * effect: words that live in FrankRuhl are written in FrankRuhl from their first
 * character, and a censored (same-object) word grows under its black rectangle
 * as it is typed, with no font/censor pop or reflow when the write completes.
 *
 * @param {Element | null | undefined} root
 * @param {string} html annotated markup (e.g. from renderAnnotatedTermText)
 * @param {() => void} [onComplete]
 * @param {{ frameMs?: number, scrambleFrames?: number, tailLength?: number, charsPerStep?: number }} [options]
 * @returns {boolean}
 */
export function playAnnotatedTypewriterScrambleTo(root, html, onComplete, options = {}) {
  if (!root) {
    onComplete?.();
    return false;
  }
  const source = html ?? "";
  if (!source.trim()) {
    root.innerHTML = "";
    onComplete?.();
    return false;
  }
  if (reducedMotion) {
    root.innerHTML = source;
    onComplete?.();
    return false;
  }

  abortLetterShuffle(root);

  root.innerHTML = source;
  const { nodes, total } = collectAnnotatedTextNodes(root);
  if (!total) {
    root.innerHTML = source;
    onComplete?.();
    return false;
  }

  const state = {
    root,
    original: source,
    mode: "annotated-typewriter",
    nodes,
    total,
    step: 0,
    frame: 0,
    timerId: null,
    onComplete,
    frameMs: options.frameMs ?? LABEL_PANEL_TYPEWRITER_CONFIG.frameMs,
    scrambleFrames: options.scrambleFrames ?? LABEL_PANEL_TYPEWRITER_CONFIG.scrambleFrames,
    tailLength: options.tailLength ?? LABEL_PANEL_TYPEWRITER_CONFIG.tailLength,
    charsPerStep: Math.max(1, options.charsPerStep ?? LABEL_PANEL_TYPEWRITER_CONFIG.charsPerStep ?? 1),
  };

  const tick = () => {
    if (!isActiveShuffleState(state)) return;

    renderAnnotatedTypewriterFrame(state);

    if (state.step >= state.total) {
      finishAnnotatedTypewriter(state);
      return;
    }

    state.frame += 1;
    if (state.frame >= state.scrambleFrames) {
      state.frame = 0;
      state.step += state.charsPerStep;
    }
    state.timerId = window.setTimeout(tick, state.frameMs);
  };

  root.dataset.letterShuffleActive = "1";
  activeStates.set(root, state);
  tick();
  return true;
}

/** @returns {boolean} */
function startContinuousScrambleLight(root) {
  if (!root || reducedMotion || !isShuffleable(root)) return false;

  abortLetterShuffle(root);

  const original = root.textContent ?? "";
  if (!original.trim()) return false;

  const state = {
    root,
    original,
    mode: "light",
    config: getShuffleConfig(root),
    continuous: true,
    timerId: null,
    onComplete: null,
  };

  root.dataset.letterShuffleActive = "1";
  root.dataset.letterShuffleContinuous = "1";
  activeStates.set(root, state);
  tickContinuousLightState(state);
  return true;
}

function tickContinuousState(state) {
  if (!isActiveShuffleState(state)) return;

  if (state.mode === "svg") {
    state.root.textContent = state.graphemes
      .map((ch) => (ch === " " || ch === "\u00a0" ? ch : randomGlyph()))
      .join("");
  } else {
    state.chars.forEach(({ el, final }) => {
      el.textContent = final === " " || final === "\u00a0" ? final : randomGlyph();
    });
  }

  if (!isActiveShuffleState(state)) return;
  state.timerId = window.setTimeout(() => tickContinuousState(state), CONFIG.frameMs);
}

function tickState(state) {
  if (!isActiveShuffleState(state)) return;

  if (state.continuous) {
    tickContinuousState(state);
    return;
  }

  const { frame, settleFrames } = state;
  const config = state.config ?? CONFIG;

  if (state.mode === "svg") {
    state.root.textContent = state.graphemes
      .map((final, index) => glyphAtFrame(final, index, frame, settleFrames))
      .join("");
  } else {
    state.chars.forEach(({ el, final }, index) => {
      el.textContent = glyphAtFrame(final, index, frame, settleFrames);
    });
  }

  state.frame += 1;

  if (state.frame > maxSettleFrame(settleFrames, config)) {
    finishShuffleState(state);
    return;
  }

  if (!isActiveShuffleState(state)) return;
  state.timerId = window.setTimeout(() => tickState(state), config.frameMs);
}

/**
 * Play a letter-shuffle reveal on `root` (HTML or SVG text).
 * @param {Element | null | undefined} root
 * @param {() => void} [onComplete]
 * @returns {boolean} Whether an animation was started.
 */
export function startLetterShuffle(root, onComplete) {
  if (!root || reducedMotion || !isShuffleable(root)) {
    onComplete?.();
    return false;
  }

  stopLetterShuffle(root);

  if (isLightHoverShuffleEl(root)) {
    return startLightHoverShuffle(root, onComplete);
  }

  if (isInlineDefMention(root)) {
    return startInlineMentionShuffle(root, onComplete);
  }

  const state = prepareState(root);
  if (!state) {
    onComplete?.();
    return false;
  }

  state.onComplete = onComplete;
  root.dataset.letterShuffleActive = "1";
  activeStates.set(root, state);
  tickState(state);
  return true;
}

/**
 * Scramble indefinitely — random glyphs only, never settles to the target word.
 * @param {Element | null | undefined} root
 * @returns {boolean}
 */
export function startContinuousScramble(root) {
  if (!root || reducedMotion || !isShuffleable(root)) return false;

  if (isLightScrambleEl(root)) {
    return startContinuousScrambleLight(root);
  }

  stopLetterShuffle(root);

  const state = prepareState(root);
  if (!state) return false;

  state.continuous = true;
  state.onComplete = null;
  root.dataset.letterShuffleActive = "1";
  root.dataset.letterShuffleContinuous = "1";
  activeStates.set(root, state);
  tickContinuousState(state);
  return true;
}

/**
 * Stop a continuous scramble.
 * @param {Element | null | undefined} root
 * @param {{ restore?: boolean }} [options]
 */
export function stopContinuousScramble(root, options = {}) {
  const restore = options.restore !== false;
  if (!root) return;
  const state = activeStates.get(root);
  if (!state?.continuous) return;

  if (state.timerId != null) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }

  state.continuous = false;
  delete root.dataset.letterShuffleContinuous;

  if (restore) restoreState(state);
  else abortState(state);
}

/**
 * Switch from continuous scramble into a normal settle reveal.
 * @param {Element | null | undefined} root
 * @param {() => void} [onComplete]
 * @param {{ config?: typeof CONFIG }} [options]
 * @returns {boolean}
 */
export function settleFromContinuousScramble(root, onComplete, options = {}) {
  if (!root || reducedMotion || !isShuffleable(root)) {
    return false;
  }

  const settleConfig = options.config ?? CONFIG;
  const state = activeStates.get(root);
  if (!state?.continuous) {
    return startLetterShuffle(root, onComplete);
  }

  if (state.timerId != null) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }

  state.continuous = false;
  delete root.dataset.letterShuffleContinuous;

  if (state.mode === "light") {
    const { original, root } = state;
    activeStates.delete(root);
    delete root.dataset.letterShuffleActive;
    root.textContent = original;
    settleLightReveal(root, original, onComplete);
    return true;
  }

  const charCount =
    state.mode === "svg" ? state.graphemes.length : state.chars.length;
  state.settleFrames = buildSettleFrames(charCount, settleConfig);
  state.config = settleConfig;
  state.frame = 0;
  state.onComplete = onComplete;
  tickState(state);
  return true;
}

export function isContinuousScrambleActive(root) {
  return Boolean(root && activeStates.get(root)?.continuous);
}

/**
 * Cancel shuffle without firing its completion callback.
 * @param {Element | null | undefined} root
 */
export function abortLetterShuffle(root) {
  if (!root) return;
  const state = activeStates.get(root);
  if (state) abortState(state);
  clearLingerState(root);
}

/**
 * Cancel shuffle and restore the original text on `root`.
 * @param {Element | null | undefined} root
 * @param {{ restore?: boolean }} [options]
 */
export function stopLetterShuffle(root, options = {}) {
  const restore = options.restore !== false;
  if (!root) return;
  const state = activeStates.get(root);
  if (state?.continuous) {
    stopContinuousScramble(root, { restore });
    return;
  }
  if (state) {
    if (restore) restoreState(state);
    else abortState(state);
    return;
  }
  if (restore) clearLingerState(root);
}

/**
 * Abort any in-flight shuffle and start a fresh one.
 * @param {Element | null | undefined} root
 * @param {() => void} [onComplete]
 * @returns {boolean}
 */
export function rescrambleElement(root, onComplete) {
  if (!root) {
    onComplete?.();
    return false;
  }
  abortLetterShuffle(root);
  return startLetterShuffle(root, onComplete);
}

/**
 * Original text for `root` while shuffle is active; otherwise current text.
 * @param {Element | null | undefined} root
 */
export function getLetterShuffleOriginal(root) {
  if (!root) return "";
  const state = activeStates.get(root);
  return state?.original ?? root.textContent ?? "";
}

/**
 * Event-delegated hover shuffle for HTML hover targets inside `root`.
 * @param {ParentNode} root
 * @param {string} selector
 */
export function bindLetterShuffleDelegation(root, selector) {
  if (!root) return;

  root.addEventListener("mouseover", (event) => {
    const el = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!el || !(root instanceof Node) || !root.contains(el)) return;
    const related = event.relatedTarget;
    if (related instanceof Node && el.contains(related)) return;
    startLetterShuffle(el);
  });

  root.addEventListener("mouseout", (event) => {
    const el = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!el || !(root instanceof Node) || !root.contains(el)) return;
    const related = event.relatedTarget;
    if (related instanceof Node && el.contains(related)) return;
    stopLetterShuffle(el);
  });
}

/** Wire global reduced-motion listener once. */
export function initLetterShuffle() {
  refreshReducedMotion();
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", refreshReducedMotion);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(refreshReducedMotion);
  }
}
