import { syncGridCssVars } from "./grid-metrics.js";

const LINE_HEIGHT = 20;
const FONT_SIZE = 14;
const TERM_COL_SPAN = 3;
const TERM_COL_START = 2;
const BLOCK_COL_SPAN = 4;
const BLOCK_COUNT = 6;
const DEFAULT_MARGIN_TOP = 170;
const MARGIN_BOTTOM = 92;
const MIN_LAYOUT_SCALE = 0.62;

/** @type {HTMLElement | null} */
let rootEl = null;
/** @type {HTMLElement | null} */
let viewportEl = null;
/** @type {() => { objectId: string, terms: { id: string, name: string }[] }[]} */
let getGroups = () => [];
/** @type {(termId: string) => void} */
let onTermSelect = () => {};
/** @type {{ objectId: string, terms: { id: string, name: string }[] }[]} */
let allGroups = [];
/** @type {ResizeObserver | null} */
let resizeObserver = null;
let isVisible = false;
/** Built lazily on first open — avoids blocking initial page load. */
let gridBuilt = false;
/** @type {Set<string>} */
let censoredTermIds = new Set();

/** @type {{ lineHeight: number, fontSize: number }} */
let currentLayoutMetrics = { lineHeight: LINE_HEIGHT, fontSize: FONT_SIZE };

const CENSOR_WRITE_MS_PER_PX = 1.35;
const CENSOR_WRITE_MIN_S = 0.21;
const CENSOR_WRITE_MAX_S = 1.35;
const CENSOR_WRITE_PX_PER_STEP = 8;
const CENSOR_WRITE_MIN_STEPS = 6;
const CENSOR_WRITE_MAX_STEPS = 40;
const GRID_SCRAMBLE_CHARSET =
  "אבגדהוזחטיכלמנסעפצקרשתABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?";
const GRID_SCRAMBLE_FRAME_MS = 18;
const GRID_SCRAMBLE_CYCLES = 4;
const GRID_SCRAMBLE_STAGGER_MS = 12;
const SCAN_VELOCITY_PX_S = 900;
const HOVER_CLEAR_MS = 64;

/** @type {WeakMap<HTMLElement, { original: string, frame: number, settleFrames: number[], timerId: number | null }>} */
const gridScrambleStates = new WeakMap();

/** @type {string | null} */
let activeHoverTermId = null;
/** @type {string | null} */
let activeHoverObjectId = null;
/** @type {number | null} */
let hoverClearTimer = null;
let pointerRafId = 0;
/** @type {{ x: number, y: number, t: number } | null} */
let pendingPointer = null;
/** @type {{ x: number, y: number, t: number }} */
let lastPointerSample = { x: 0, y: 0, t: 0 };
let pointerVelocity = 0;

function randomScrambleGlyph() {
  return GRID_SCRAMBLE_CHARSET[Math.floor(Math.random() * GRID_SCRAMBLE_CHARSET.length)];
}

function buildSettleFrames(charCount) {
  const order = Array.from({ length: charCount }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const spread = Math.max(
    1,
    Math.round((charCount * GRID_SCRAMBLE_STAGGER_MS) / GRID_SCRAMBLE_FRAME_MS)
  );
  const settleFrames = new Array(charCount);
  order.forEach((charIndex, rank) => {
    const jitter = Math.floor(Math.random() * Math.max(1, spread / Math.max(charCount, 3)));
    settleFrames[charIndex] = GRID_SCRAMBLE_CYCLES + Math.min(spread, rank + jitter);
  });
  return settleFrames;
}

function maxSettleFrame(settleFrames) {
  let max = GRID_SCRAMBLE_CYCLES;
  for (const frame of settleFrames) {
    if (frame > max) max = frame;
  }
  return max;
}

function glyphAtFrame(finalChar, index, frame, settleFrames) {
  if (frame >= settleFrames[index]) return finalChar;
  if (finalChar === " " || finalChar === "\u00a0") return finalChar;
  return randomScrambleGlyph();
}

/** @param {HTMLElement} labelEl */
function stopGridTermScramble(labelEl) {
  const state = gridScrambleStates.get(labelEl);
  if (!state) return;
  if (state.timerId != null) {
    clearTimeout(state.timerId);
  }
  labelEl.textContent = state.original;
  gridScrambleStates.delete(labelEl);
}

/** @param {HTMLElement} labelEl */
function tickGridTermScramble(labelEl) {
  const state = gridScrambleStates.get(labelEl);
  if (!state) return;
  const graphemes = [...state.original];
  labelEl.textContent = graphemes
    .map((finalChar, index) => glyphAtFrame(finalChar, index, state.frame, state.settleFrames))
    .join("");
  state.frame += 1;

  if (state.frame > maxSettleFrame(state.settleFrames)) {
    labelEl.textContent = state.original;
    state.timerId = null;
    return;
  }

  state.timerId = window.setTimeout(() => tickGridTermScramble(labelEl), GRID_SCRAMBLE_FRAME_MS);
}

function startGridTermScramble(labelEl) {
  stopGridTermScramble(labelEl);
  const original = labelEl.textContent ?? "";
  if (!original.trim()) return;
  const settleFrames = buildSettleFrames([...original].length);
  gridScrambleStates.set(labelEl, {
    original,
    frame: 0,
    settleFrames,
    timerId: null,
  });
  tickGridTermScramble(labelEl);
}

function getCensorWriteTiming(widthPx) {
  const width = Math.max(1, widthPx);
  const durationS = Math.min(
    CENSOR_WRITE_MAX_S,
    Math.max(CENSOR_WRITE_MIN_S, (width * CENSOR_WRITE_MS_PER_PX) / 1000)
  );
  const steps = Math.min(
    CENSOR_WRITE_MAX_STEPS,
    Math.max(CENSOR_WRITE_MIN_STEPS, Math.round(width / CENSOR_WRITE_PX_PER_STEP))
  );
  return { durationS, steps };
}

function applyCensorWriteTiming(el, widthPx) {
  const { durationS, steps } = getCensorWriteTiming(widthPx);
  el.style.setProperty("--sun-censor-write-duration", `${durationS}s`);
  el.style.setProperty("--sun-censor-write-steps", String(steps));
}

function cancelHoverClear() {
  if (hoverClearTimer != null) {
    clearTimeout(hoverClearTimer);
    hoverClearTimer = null;
  }
}

function cancelPointerTracking() {
  cancelHoverClear();
  if (pointerRafId) {
    cancelAnimationFrame(pointerRafId);
    pointerRafId = 0;
  }
  pendingPointer = null;
  pointerVelocity = 0;
}

function scheduleHoverClear() {
  cancelHoverClear();
  hoverClearTimer = window.setTimeout(() => {
    hoverClearTimer = null;
    rootEl?.querySelectorAll(".sun-terms-index__term-label").forEach((label) => {
      if (label instanceof HTMLElement) stopGridTermScramble(label);
    });
    clearTermHoverState();
  }, HOVER_CLEAR_MS);
}

function clearTermHoverState() {
  if (!rootEl) return;
  activeHoverTermId = null;
  activeHoverObjectId = null;
  rootEl.classList.remove("is-object-hover", "is-fast-scan");
  rootEl.querySelectorAll(".sun-terms-index__term").forEach((el) => {
    el.classList.remove("is-hovered", "is-sibling-censored", "is-instant");
    el.style.removeProperty("--sun-censor-write-duration");
    el.style.removeProperty("--sun-censor-write-steps");
  });
}

/**
 * @param {HTMLElement} el
 * @param {{ isHovered: boolean, isSibling: boolean, fastScan: boolean }} state
 */
function updateTermCensorClasses(el, { isHovered, isSibling, fastScan }) {
  const wasSiblingCensored = el.classList.contains("is-sibling-censored");
  el.classList.toggle("is-hovered", isHovered);
  el.classList.toggle("is-sibling-censored", isSibling);

  if (isSibling) {
    el.classList.toggle("is-instant", fastScan);
    if (!fastScan && !wasSiblingCensored) {
      el.classList.remove("is-instant");
      applyCensorWriteTiming(el, el.offsetWidth);
    }
    return;
  }

  el.classList.remove("is-instant", "is-sibling-censored");
  el.style.removeProperty("--sun-censor-write-duration");
  el.style.removeProperty("--sun-censor-write-steps");
}

/**
 * @param {HTMLElement} termEl
 * @param {{ fastScan?: boolean }} [options]
 */
function setTermHoverState(termEl, { fastScan = false } = {}) {
  if (!rootEl) return;
  const termId = termEl.dataset.termId;
  const objectId = termEl.dataset.objectId;
  if (!objectId || !termId) return;

  const sameTerm = activeHoverTermId === termId;
  const sameObject = activeHoverObjectId === objectId;

  if (sameTerm) {
    const wasFastScan = rootEl.classList.contains("is-fast-scan");
    rootEl.classList.toggle("is-fast-scan", fastScan);
    if (fastScan) {
      const label = termEl.querySelector(".sun-terms-index__term-label");
      if (label instanceof HTMLElement) stopGridTermScramble(label);
    } else if (wasFastScan) {
      const label = termEl.querySelector(".sun-terms-index__term-label");
      if (label instanceof HTMLElement) startGridTermScramble(label);
    }
    return;
  }

  const previousTermId = activeHoverTermId;
  activeHoverTermId = termId;
  activeHoverObjectId = objectId;

  rootEl.classList.add("is-object-hover");
  rootEl.classList.toggle("is-fast-scan", fastScan);

  if (!sameObject) {
    for (const el of rootEl.querySelectorAll(".sun-terms-index__term")) {
      const isHovered = el.dataset.termId === termId;
      const isSibling = el.dataset.objectId === objectId && !isHovered;
      updateTermCensorClasses(el, { isHovered, isSibling, fastScan });
    }
  } else if (previousTermId) {
    const previousTerm = rootEl.querySelector(
      `.sun-terms-index__term[data-term-id="${previousTermId}"]`
    );
    if (previousTerm instanceof HTMLElement) {
      updateTermCensorClasses(previousTerm, {
        isHovered: false,
        isSibling: true,
        fastScan,
      });
      const previousLabel = previousTerm.querySelector(".sun-terms-index__term-label");
      if (previousLabel instanceof HTMLElement) stopGridTermScramble(previousLabel);
    }
    updateTermCensorClasses(termEl, { isHovered: true, isSibling: false, fastScan });
  }

  const label = termEl.querySelector(".sun-terms-index__term-label");
  if (label instanceof HTMLElement) {
    if (fastScan) {
      stopGridTermScramble(label);
    } else {
      startGridTermScramble(label);
    }
  }
}

function isFastScanAt(x, y, t) {
  const dt = (t - lastPointerSample.t) / 1000;
  if (dt > 0 && dt < 0.25) {
    const speed = Math.hypot(x - lastPointerSample.x, y - lastPointerSample.y) / dt;
    pointerVelocity = pointerVelocity * 0.55 + speed * 0.45;
  } else {
    pointerVelocity = 0;
  }
  lastPointerSample = { x, y, t };
  return pointerVelocity > SCAN_VELOCITY_PX_S;
}

/** @param {number} x @param {number} y */
function termAtPoint(x, y) {
  const hit = document.elementFromPoint(x, y);
  if (!(hit instanceof Element)) return null;
  const termEl = hit.closest(".sun-terms-index__term");
  if (!(termEl instanceof HTMLElement) || !rootEl?.contains(termEl)) return null;
  return termEl;
}

/** @param {number} x @param {number} y @param {number} t */
function processPointerMove(x, y, t) {
  if (!isVisible || !rootEl) return;

  const fastScan = isFastScanAt(x, y, t);
  const termEl = termAtPoint(x, y);
  if (!termEl) {
    scheduleHoverClear();
    return;
  }

  cancelHoverClear();
  setTermHoverState(termEl, { fastScan });
}

function bindTermPointerHover() {
  if (!rootEl || rootEl.dataset.termPointerBound === "1") return;
  rootEl.dataset.termPointerBound = "1";

  rootEl.addEventListener("pointermove", (event) => {
    if (!isVisible) return;
    pendingPointer = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    if (pointerRafId) return;
    pointerRafId = requestAnimationFrame(() => {
      pointerRafId = 0;
      const sample = pendingPointer;
      pendingPointer = null;
      if (!sample) return;
      processPointerMove(sample.x, sample.y, sample.t);
    });
  });

  rootEl.addEventListener("pointerleave", () => {
    scheduleHoverClear();
  });
}

/** @type {() => boolean} */
let gridRebuildGuard = () => false;

/** @param {() => boolean} guard */
export function setSunOverviewTermsGridRebuildGuard(guard) {
  gridRebuildGuard = guard;
}

/** @returns {HTMLElement[]} */
export function getSunOverviewTermsGridScrambleTargets() {
  if (!rootEl) return [];
  return [...rootEl.querySelectorAll(".sun-terms-index__term-label")].filter(
    (el) => el instanceof HTMLElement
  );
}

function getMarginTop() {
  if (!rootEl) return DEFAULT_MARGIN_TOP;
  const paddingTop = parseFloat(getComputedStyle(rootEl).paddingTop);
  return Number.isFinite(paddingTop) ? paddingTop : DEFAULT_MARGIN_TOP;
}

function getMarginBottom() {
  if (!rootEl) return MARGIN_BOTTOM;
  const paddingBottom = parseFloat(getComputedStyle(rootEl).paddingBottom);
  return Number.isFinite(paddingBottom) ? paddingBottom : MARGIN_BOTTOM;
}

/** @param {{ terms: { id: string, name: string }[] }[]} groups */
function computeGroupBlockRows(groups) {
  if (!groups.length) return 0;
  let rows = 0;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    if (groupIndex > 0) rows += 2;
    rows += groups[groupIndex].terms.length;
  }
  return rows;
}

/** @param {{ terms: { id: string, name: string }[] }[]} groups @param {number} start @param {number} end */
function sliceGroupRows(groups, start, end) {
  return computeGroupBlockRows(groups.slice(start, end + 1));
}

function maxEndForGroupBlock(groups, start, maxRows, maxEnd) {
  let low = start;
  let high = maxEnd;
  let best = start;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (sliceGroupRows(groups, start, mid) <= maxRows) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/** @param {{ terms: { id: string, name: string }[] }[]} groups */
function packGroupsIntoBlocks(groups, maxRows, blockCount) {
  const totalGroups = groups.length;
  if (!totalGroups) return [];

  const blocks = [];
  let start = 0;

  for (let blockIndex = 0; blockIndex < blockCount && start < totalGroups; blockIndex++) {
    const blocksRemaining = blockCount - blockIndex;
    if (blocksRemaining === 1) {
      blocks.push(groups.slice(start));
      break;
    }

    const groupsRemaining = totalGroups - start;
    const maxEnd = totalGroups - blocksRemaining;
    const idealCount = Math.ceil(groupsRemaining / blocksRemaining);
    const preferredEnd = Math.min(start + idealCount - 1, maxEnd);
    let end = maxEndForGroupBlock(groups, start, maxRows, maxEnd);

    if (end < preferredEnd && sliceGroupRows(groups, start, preferredEnd) <= maxRows) {
      end = preferredEnd;
    }

    blocks.push(groups.slice(start, end + 1));
    start = end + 1;
  }

  return blocks.filter((block) => block.length);
}

function getAvailableGridHeight() {
  const viewportHeight =
    viewportEl?.clientHeight ?? rootEl?.clientHeight ?? window.innerHeight;
  return viewportHeight - getMarginTop() - getMarginBottom();
}

function gridBlocksOverflow() {
  const blocksWrap = rootEl?.querySelector(".sun-terms-index__blocks");
  if (!blocksWrap) return false;
  return blocksWrap.getBoundingClientRect().height > getAvailableGridHeight() + 1;
}

function resolveLayoutForScale(scale) {
  const viewportHeight =
    viewportEl?.clientHeight ?? rootEl?.clientHeight ?? window.innerHeight;
  const marginTop = getMarginTop();
  const marginBottom = getMarginBottom();
  const lineHeight = Math.max(14, Math.round(LINE_HEIGHT * scale));
  const fontSize = Math.max(12, Math.round(FONT_SIZE * scale));
  const maxRows = Math.max(
    1,
    Math.floor((viewportHeight - marginTop - marginBottom) / lineHeight)
  );
  const blockGroups = packGroupsIntoBlocks(allGroups, maxRows, BLOCK_COUNT);
  const allFit = blockGroups.every(
    (groupBlock) => computeGroupBlockRows(groupBlock) <= maxRows
  );

  return { blockGroups, lineHeight, fontSize, allFit };
}

/** @param {{ objectId: string, terms: { id: string, name: string }[] }[]} groups */
function buildGroupBlockLayout(groups) {
  const cells = [];
  let row = 1;

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    if (groupIndex > 0) row += 2;
    for (let i = 0; i < group.terms.length; i++) {
      cells.push({
        type: "term",
        term: group.terms[i],
        objectId: group.objectId,
        row: row + i,
        colStart: TERM_COL_START,
        colSpan: TERM_COL_SPAN,
      });
    }
    row += group.terms.length;
  }

  return { cells, totalRows: row - 1 };
}

function applyLayoutMetrics() {
  if (!rootEl) return;
  rootEl.style.setProperty(
    "--terms-index-line-height",
    `${currentLayoutMetrics.lineHeight}px`
  );
  rootEl.style.setProperty(
    "--terms-index-font-size",
    `${currentLayoutMetrics.fontSize}px`
  );
}

/** @param {ReturnType<typeof buildGroupBlockLayout>[]} blockLayouts */
function renderGrid(blockLayouts) {
  if (!rootEl) return;

  applyLayoutMetrics();
  rootEl.innerHTML = "";

  const blocksWrap = document.createElement("div");
  blocksWrap.className = "sun-terms-index__blocks";
  const rowHeight = `${currentLayoutMetrics.lineHeight}px`;

  for (let blockIndex = 0; blockIndex < blockLayouts.length; blockIndex++) {
    const layout = blockLayouts[blockIndex];
    const block = document.createElement("div");
    block.className = "sun-terms-index__block";
    const startCol = 1 + blockIndex * BLOCK_COL_SPAN;
    block.style.gridColumn = `${startCol} / span ${BLOCK_COL_SPAN}`;
    block.style.gridTemplateRows = `repeat(${layout.totalRows}, ${rowHeight})`;

    for (const cell of layout.cells) {
      const termEl = document.createElement("button");
      termEl.type = "button";
      termEl.className = "sun-terms-index__term";
      const label = document.createElement("span");
      label.className = "sun-terms-index__term-label";
      label.textContent = cell.term.name;
      termEl.appendChild(label);
      termEl.dataset.termId = cell.term.id;
      termEl.dataset.objectId = cell.objectId;
      termEl.style.gridRow = String(cell.row);
      termEl.style.gridColumn = `${cell.colStart} / span ${cell.colSpan}`;
      termEl.addEventListener("click", () => {
        onTermSelect(cell.term.id);
      });
      block.appendChild(termEl);
    }

    blocksWrap.appendChild(block);
  }

  rootEl.appendChild(blocksWrap);
  applyFilterCensorToGrid(censoredTermIds);
}

function ensureGridBuilt() {
  if (gridBuilt || !rootEl || !allGroups.length) return;
  rebuildGrid();
  gridBuilt = true;
}

function rebuildGrid() {
  if (!rootEl || !allGroups.length) return;
  clearTermHoverState();

  let scale = 1;
  let guard = 0;
  while (guard++ < 40) {
    const resolved = resolveLayoutForScale(scale);
    currentLayoutMetrics = {
      lineHeight: resolved.lineHeight,
      fontSize: resolved.fontSize,
    };

    const layouts = resolved.blockGroups.map((groupBlock) => buildGroupBlockLayout(groupBlock));
    renderGrid(layouts);

    if (!gridBlocksOverflow() || scale <= MIN_LAYOUT_SCALE) break;
    scale = Math.max(MIN_LAYOUT_SCALE, scale - 0.03);
  }
}

function setVisibleState(visible) {
  if (!rootEl) {
    isVisible = false;
    return;
  }

  rootEl.hidden = !visible;

  if (viewportEl) {
    viewportEl.classList.toggle("is-overview-grid-active", visible);
  }

  isVisible = visible;

  if (visible) {
    syncGridCssVars(viewportEl);
    rootEl.scrollTop = 0;
    rebuildGrid();
  }
}

export function isSunOverviewTermsGridVisible() {
  return isVisible;
}

export function showSunOverviewTermsGrid() {
  if (!rootEl) return;
  ensureGridBuilt();
  setVisibleState(true);
}

export function hideSunOverviewTermsGrid() {
  if (!rootEl) return;

  cancelPointerTracking();
  rootEl.querySelectorAll(".sun-terms-index__term-label").forEach((label) => {
    if (label instanceof HTMLElement) stopGridTermScramble(label);
  });
  clearTermHoverState();
  setVisibleState(false);
}

/**
 * @param {Set<string> | Iterable<string>} termIds
 */
export function applyFilterCensorToGrid(termIds) {
  censoredTermIds = termIds instanceof Set ? termIds : new Set(termIds);
  if (!rootEl) return;

  for (const termEl of rootEl.querySelectorAll(".sun-terms-index__term")) {
    const termId = termEl.getAttribute("data-term-id");
    const shouldCensor = termId != null && censoredTermIds.has(termId);
    const wasCensored = termEl.classList.contains("is-filter-censored");
    termEl.classList.toggle("is-filter-censored", shouldCensor);
    if (shouldCensor && !wasCensored) {
      applyCensorWriteTiming(termEl, termEl.offsetWidth);
    } else if (!shouldCensor) {
      termEl.style.removeProperty("--sun-censor-write-duration");
      termEl.style.removeProperty("--sun-censor-write-steps");
    }
  }
}

/**
 * @param {{
 *   getGroups: () => { objectId: string, terms: { id: string, name: string }[] }[],
 *   rootEl: HTMLElement | null,
 *   viewportEl?: HTMLElement | null,
 *   onTermSelect: (termId: string) => void,
 * }} options
 */
export function initSunOverviewTermsGrid({
  getGroups: getGroupsFn,
  rootEl: root,
  viewportEl: viewport,
  onTermSelect: onTermSelectFn,
}) {
  rootEl = root;
  viewportEl = viewport ?? root?.closest(".sun-viewport") ?? null;
  getGroups = getGroupsFn;
  onTermSelect = onTermSelectFn;

  if (!rootEl) return;

  allGroups = getGroups();
  gridBuilt = false;

  bindTermPointerHover();

  if (!resizeObserver && rootEl) {
    resizeObserver = new ResizeObserver(() => {
      if (isVisible && !gridRebuildGuard()) rebuildGrid();
    });
    resizeObserver.observe(rootEl);
  }
}

export function refreshSunOverviewTermsGrid() {
  allGroups = getGroups();
  gridBuilt = false;
  if (isVisible) {
    rebuildGrid();
    gridBuilt = true;
  }
}
