import { syncGridCssVars } from "./grid-metrics.js";

const LINE_HEIGHT = 20;
const FONT_SIZE = 14;
const TERM_COL_SPAN = 3;
const TERM_COL_START = 2;
const BLOCK_COL_SPAN = 4;
const BLOCK_COUNT = 6;
const INDEX_MARGIN_TOP = 170;
const INDEX_MARGIN_BOTTOM = 92;
const MIN_LAYOUT_SCALE = 0.62;

/** @type {HTMLElement | null} */
let rootEl = null;
/** @type {HTMLElement | null} */
let viewportEl = null;
/** @type {() => { terms: { id: string, name: string }[] }[]} */
let getGroups = () => [];
/** @type {(termId: string) => void} */
let onTermSelect = () => {};
/** @type {{ id: string, name: string }[]} */
let allTerms = [];
/** @type {ResizeObserver | null} */
let resizeObserver = null;
let isVisible = false;

/** @type {{ lineHeight: number, fontSize: number }} */
let currentLayoutMetrics = { lineHeight: LINE_HEIGHT, fontSize: FONT_SIZE };

const CENSOR_WRITE_MS_PER_PX = 1.75;
const CENSOR_WRITE_MIN_S = 0.27;
const CENSOR_WRITE_MAX_S = 1.75;
const CENSOR_WRITE_PX_PER_STEP = 8;
const CENSOR_WRITE_MIN_STEPS = 6;
const CENSOR_WRITE_MAX_STEPS = 40;
const INDEX_SCRAMBLE_CHARSET =
  "אבגדהוזחטיכלמנסעפצקרשתABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?";
const INDEX_SCRAMBLE_FRAME_MS = 20;
const INDEX_SCRAMBLE_CYCLES = 5;
const INDEX_SCRAMBLE_STAGGER_MS = 14;
const SCAN_VELOCITY_PX_S = 900;
const HOVER_CLEAR_MS = 64;

/** @type {WeakMap<HTMLElement, { original: string, frame: number, settleFrames: number[], timerId: number | null }>} */
const indexScrambleStates = new WeakMap();

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
  return INDEX_SCRAMBLE_CHARSET[Math.floor(Math.random() * INDEX_SCRAMBLE_CHARSET.length)];
}

function buildSettleFrames(charCount) {
  const order = Array.from({ length: charCount }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const spread = Math.max(
    1,
    Math.round((charCount * INDEX_SCRAMBLE_STAGGER_MS) / INDEX_SCRAMBLE_FRAME_MS)
  );
  const settleFrames = new Array(charCount);
  order.forEach((charIndex, rank) => {
    const jitter = Math.floor(Math.random() * Math.max(1, spread / Math.max(charCount, 3)));
    settleFrames[charIndex] = INDEX_SCRAMBLE_CYCLES + Math.min(spread, rank + jitter);
  });
  return settleFrames;
}

function maxSettleFrame(settleFrames) {
  let max = INDEX_SCRAMBLE_CYCLES;
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
function stopIndexTermScramble(labelEl) {
  const state = indexScrambleStates.get(labelEl);
  if (!state) return;
  if (state.timerId != null) {
    clearTimeout(state.timerId);
  }
  labelEl.textContent = state.original;
  indexScrambleStates.delete(labelEl);
}

/** @param {HTMLElement} labelEl */
function tickIndexTermScramble(labelEl) {
  const state = indexScrambleStates.get(labelEl);
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

  state.timerId = window.setTimeout(() => tickIndexTermScramble(labelEl), INDEX_SCRAMBLE_FRAME_MS);
}

function startIndexTermScramble(labelEl) {
  stopIndexTermScramble(labelEl);
  const original = labelEl.textContent ?? "";
  if (!original.trim()) return;
  const settleFrames = buildSettleFrames([...original].length);
  indexScrambleStates.set(labelEl, {
    original,
    frame: 0,
    settleFrames,
    timerId: null,
  });
  tickIndexTermScramble(labelEl);
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
      if (label instanceof HTMLElement) stopIndexTermScramble(label);
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
      if (label instanceof HTMLElement) stopIndexTermScramble(label);
    } else if (wasFastScan) {
      const label = termEl.querySelector(".sun-terms-index__term-label");
      if (label instanceof HTMLElement) startIndexTermScramble(label);
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
      if (previousLabel instanceof HTMLElement) stopIndexTermScramble(previousLabel);
    }
    updateTermCensorClasses(termEl, { isHovered: true, isSibling: false, fastScan });
  }

  const label = termEl.querySelector(".sun-terms-index__term-label");
  if (label instanceof HTMLElement) {
    if (fastScan) {
      stopIndexTermScramble(label);
    } else {
      startIndexTermScramble(label);
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
export function setSunTermsIndexGridRebuildGuard(guard) {
  gridRebuildGuard = guard;
}

/** @returns {HTMLElement[]} */
export function getSunTermsIndexScrambleTargets() {
  if (!rootEl) return [];
  return [
    ...rootEl.querySelectorAll(".sun-terms-index__term-label"),
    ...rootEl.querySelectorAll(".sun-terms-index__legend"),
  ].filter((el) => el instanceof HTMLElement);
}

function getLegendLetter(name) {
  return /^[0-9]/.test(name[0]) ? "#" : name[0];
}

/** @param {{ terms: { id: string, name: string }[] }[]} groups */
function getAllTermsSorted(groups) {
  return groups
    .flatMap((g) => g.terms)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

function groupByLetter(terms) {
  const groups = [];
  let current = null;
  for (const term of terms) {
    const letter = getLegendLetter(term.name);
    if (letter !== current) {
      groups.push({ letter, terms: [] });
      current = letter;
    }
    groups[groups.length - 1].terms.push(term);
  }
  return groups;
}

function computeBlockRows(terms, skipFirstLegend = false) {
  if (!terms.length) return 0;
  const letterGroups = groupByLetter(terms);
  let rows = 0;
  for (let groupIndex = 0; groupIndex < letterGroups.length; groupIndex++) {
    if (groupIndex > 0) rows += 2;
    if (!(groupIndex === 0 && skipFirstLegend)) rows += 1;
    rows += letterGroups[groupIndex].terms.length;
  }
  return rows;
}

function getSkipFirstLegend(blockTerms, blockIndex) {
  if (blockIndex <= 0) return false;
  const previousBlock = blockTerms[blockIndex - 1];
  const currentBlock = blockTerms[blockIndex];
  if (!previousBlock?.length || !currentBlock?.length) return false;
  return (
    getLegendLetter(previousBlock[previousBlock.length - 1].name) ===
    getLegendLetter(currentBlock[0].name)
  );
}

function sliceRows(allTermsList, start, end, skipFirstLegend) {
  return computeBlockRows(allTermsList.slice(start, end + 1), skipFirstLegend);
}

function maxEndForBlock(allTermsList, start, maxRows, skipFirstLegend, maxEnd) {
  let low = start;
  let high = maxEnd;
  let best = start;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (sliceRows(allTermsList, start, mid, skipFirstLegend) <= maxRows) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function packIntoBlocks(allTermsList, maxRows, blockCount) {
  const totalTerms = allTermsList.length;
  if (!totalTerms) return [];

  const blocks = [];
  let start = 0;

  for (let blockIndex = 0; blockIndex < blockCount && start < totalTerms; blockIndex++) {
    const blocksRemaining = blockCount - blockIndex;
    if (blocksRemaining === 1) {
      blocks.push(allTermsList.slice(start));
      break;
    }

    const termsRemaining = totalTerms - start;
    const previousLetter =
      blocks.length > 0
        ? getLegendLetter(blocks[blocks.length - 1].at(-1).name)
        : null;
    const skipFirstLegend =
      previousLetter !== null &&
      getLegendLetter(allTermsList[start].name) === previousLetter;

    const maxEnd = totalTerms - blocksRemaining;
    const idealCount = Math.ceil(termsRemaining / blocksRemaining);
    const preferredEnd = Math.min(start + idealCount - 1, maxEnd);
    let end = maxEndForBlock(allTermsList, start, maxRows, skipFirstLegend, maxEnd);

    if (
      end < preferredEnd &&
      sliceRows(allTermsList, start, preferredEnd, skipFirstLegend) <= maxRows
    ) {
      end = preferredEnd;
    }

    blocks.push(allTermsList.slice(start, end + 1));
    start = end + 1;
  }

  return blocks.filter((block) => block.length);
}

function getAvailableIndexHeight() {
  const viewportHeight =
    viewportEl?.clientHeight ?? rootEl?.clientHeight ?? window.innerHeight;
  return viewportHeight - INDEX_MARGIN_TOP - INDEX_MARGIN_BOTTOM;
}

function indexBlocksOverflow() {
  const blocksWrap = rootEl?.querySelector(".sun-terms-index__blocks");
  if (!blocksWrap) return false;
  return blocksWrap.getBoundingClientRect().height > getAvailableIndexHeight() + 1;
}

function resolveLayoutForScale(scale) {
  const viewportHeight =
    viewportEl?.clientHeight ?? rootEl?.clientHeight ?? window.innerHeight;
  const lineHeight = Math.max(14, Math.round(LINE_HEIGHT * scale));
  const fontSize = Math.max(12, Math.round(FONT_SIZE * scale));
  const maxRows = Math.max(
    1,
    Math.floor((viewportHeight - INDEX_MARGIN_TOP - INDEX_MARGIN_BOTTOM) / lineHeight)
  );
  const blockTerms = packIntoBlocks(allTerms, maxRows, BLOCK_COUNT);
  const allFit = blockTerms.every((terms, blockIndex) => {
    const skipFirstLegend = getSkipFirstLegend(blockTerms, blockIndex);
    return computeBlockRows(terms, skipFirstLegend) <= maxRows;
  });

  return { blockTerms, lineHeight, fontSize, allFit };
}

function resolveLayout() {
  for (let scale = 1; scale >= MIN_LAYOUT_SCALE; scale -= 0.03) {
    const resolved = resolveLayoutForScale(scale);
    if (resolved.allFit) {
      return resolved;
    }
  }

  return resolveLayoutForScale(MIN_LAYOUT_SCALE);
}

function buildBlockLayout(terms, skipFirstLegend = false) {
  const letterGroups = groupByLetter(terms);
  const cells = [];
  let row = 1;

  for (let groupIndex = 0; groupIndex < letterGroups.length; groupIndex++) {
    const letterGroup = letterGroups[groupIndex];
    const skipLegend = groupIndex === 0 && skipFirstLegend;
    if (groupIndex > 0) row += 2;
    if (!skipLegend) {
      cells.push({ type: "legend", letter: letterGroup.letter, row, col: 1 });
      row += 1;
    }
    for (let i = 0; i < letterGroup.terms.length; i++) {
      cells.push({
        type: "term",
        term: letterGroup.terms[i],
        row: row + i,
        colStart: TERM_COL_START,
        colSpan: TERM_COL_SPAN,
      });
    }
    row += letterGroup.terms.length;
  }

  return { cells, totalRows: row - 1 };
}

function buildLayout() {
  const resolved = resolveLayout();
  currentLayoutMetrics = {
    lineHeight: resolved.lineHeight,
    fontSize: resolved.fontSize,
  };

  const layouts = [];
  for (let blockIndex = 0; blockIndex < resolved.blockTerms.length; blockIndex++) {
    const terms = resolved.blockTerms[blockIndex];
    layouts.push(
      buildBlockLayout(terms, getSkipFirstLegend(resolved.blockTerms, blockIndex))
    );
  }
  return layouts;
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

/** @param {ReturnType<typeof buildLayout>} blockLayouts */
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
      if (cell.type === "legend") {
        const legend = document.createElement("span");
        legend.className = "sun-terms-index__legend";
        legend.dataset.letterShuffleUnderline = "off";
        legend.textContent = cell.letter;
        legend.style.gridRow = String(cell.row);
        legend.style.gridColumn = String(cell.col);
        block.appendChild(legend);
      } else {
        const termEl = document.createElement("button");
        termEl.type = "button";
        termEl.className = "sun-terms-index__term";
        const label = document.createElement("span");
        label.className = "sun-terms-index__term-label";
        label.textContent = cell.term.name;
        termEl.appendChild(label);
        termEl.dataset.termId = cell.term.id;
        termEl.dataset.objectId = cell.term.objectId || "";
        termEl.style.gridRow = String(cell.row);
        termEl.style.gridColumn = `${cell.colStart} / span ${cell.colSpan}`;
        termEl.addEventListener("click", () => {
          onTermSelect(cell.term.id);
        });
        block.appendChild(termEl);
      }
    }

    blocksWrap.appendChild(block);
  }

  rootEl.appendChild(blocksWrap);
}

function rebuildGrid() {
  if (!rootEl || !allTerms.length) return;
  clearTermHoverState();

  let scale = 1;
  while (true) {
    const resolved = resolveLayoutForScale(scale);
    currentLayoutMetrics = {
      lineHeight: resolved.lineHeight,
      fontSize: resolved.fontSize,
    };

    const layouts = [];
    for (let blockIndex = 0; blockIndex < resolved.blockTerms.length; blockIndex++) {
      const terms = resolved.blockTerms[blockIndex];
      layouts.push(
        buildBlockLayout(terms, getSkipFirstLegend(resolved.blockTerms, blockIndex))
      );
    }

    renderGrid(layouts);

    if (!indexBlocksOverflow() || scale <= MIN_LAYOUT_SCALE) break;
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
    viewportEl.classList.toggle("is-terms-index-active", visible);
    viewportEl.closest(".sun-app")?.classList.toggle("is-terms-index-active", visible);
  }

  isVisible = visible;

  if (visible) {
    syncGridCssVars(viewportEl);
    rootEl.scrollTop = 0;
    rebuildGrid();
  }
}

export function isSunTermsIndexVisible() {
  return isVisible;
}

export function showSunTermsIndex() {
  if (!rootEl) return;
  setVisibleState(true);
}

export function hideSunTermsIndex() {
  if (!rootEl) return;

  cancelPointerTracking();
  rootEl.querySelectorAll(".sun-terms-index__term-label").forEach((label) => {
    if (label instanceof HTMLElement) stopIndexTermScramble(label);
  });
  clearTermHoverState();
  setVisibleState(false);
}

/**
 * @param {{
 *   getGroups: () => { terms: { id: string, name: string }[] }[],
 *   rootEl: HTMLElement | null,
 *   viewportEl?: HTMLElement | null,
 *   onTermSelect: (termId: string) => void,
 * }} options
 */
export function initSunTermsIndex({
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

  allTerms = getAllTermsSorted(getGroups());
  rebuildGrid();

  bindTermPointerHover();

  if (!resizeObserver && rootEl) {
    resizeObserver = new ResizeObserver(() => {
      if (isVisible && !gridRebuildGuard()) rebuildGrid();
    });
    resizeObserver.observe(rootEl);
  }
}

export function refreshSunTermsIndex() {
  allTerms = getAllTermsSorted(getGroups());
  if (isVisible) rebuildGrid();
}
