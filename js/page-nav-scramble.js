import {
  PAGE_NAV_SCRAMBLE_CONFIG,
  settleFromContinuousScramble,
  startContinuousScramble,
  stopContinuousScramble,
  playLightTypewriterScrambleTo,
  getLetterShuffleOriginal,
  abortLetterShuffle,
} from "./letter-shuffle.js";
import { clearSiteNavShuffleUnderlines } from "./site-nav.js";
import { getSunTermsIndexScrambleTargets } from "./sun-terms-index.js";
import { getSunAboutScrambleTargets } from "./sun-about.js";
import {
  getSunOverviewTermsGridScrambleTargets,
  isSunOverviewTermsGridVisible,
} from "./sun-overview-terms-grid.js";

const NAV_LABELS = "#site-nav .site-nav__label";
/** Loading overlay label — quick beat before the app reveals. */
const LOADING_SCRAMBLE_MS = 75;
/** Standard exit/enter beat for page-to-page navigation (non-term). */
export const PAGE_ROUTE_TIMING = {
  exitMs: 95,
  enterMs: 95,
};
/** Timeline ring is sparse (most terms year-faded at the latest year), so its
 * scramble leg gets a longer beat than the standard 95ms to read as a deliberate
 * scramble rather than a quick flicker. Only the timeline side is slowed — the
 * other page in the transition keeps the standard beat. */
const PAGE_TIMELINE_LEG_MS = 150;
/** Transition entering the timeline: only the enter (timeline) leg is slowed. */
export const PAGE_TIMELINE_ENTER_TIMING = {
  exitMs: PAGE_ROUTE_TIMING.exitMs,
  enterMs: PAGE_TIMELINE_LEG_MS,
};
/** Transition leaving the timeline: only the exit (timeline) leg is slowed. */
export const PAGE_TIMELINE_EXIT_TIMING = {
  exitMs: PAGE_TIMELINE_LEG_MS,
  enterMs: PAGE_ROUTE_TIMING.enterMs,
};

/** @type {Record<string, string[]>} */
const VIEW_SELECTORS = {
  index: [".sun-terms-index__term-label", ".sun-terms-index__legend"],
  map: [".sun-svg text.sun-term"],
  overview: [
    ".sun-overview-terms-grid .sun-terms-index__term-label",
    ".sun-svg text.sun-term",
  ],
  termFocus: [
    ".sun-svg text.sun-term",
    ".sun-term-meta__heading",
    ".sun-term-meta__value",
    ".sun-term-meta__tag",
    ".sun-term-page__side-heading",
    ".sun-term-page__label-row-heading",
    ".sun-term-page__label-nav-text",
    ".sun-term-page__caption",
    ".sun-term-page__definition",
    ".sun-term-page__side-text",
    ".sun-term-page__label-row-text",
  ],
  about: [
    ".sun-about__intro",
    ".sun-about__project",
    ".sun-about__credit-heading",
    ".sun-about__credit-value",
  ],
};

/**
 * @typedef {"index" | "map" | "overview" | "termFocus" | "about"} PageScrambleView
 */

let pageNavTransitionActive = false;
let indexEnterScrambleActive = false;
/** @type {number | null} */
let exitTimerId = null;
/** @type {number | null} */
let enterTimerId = null;
/** @type {Element[]} */
let exitContentElements = [];
/** @type {Set<Element>} */
const activeContinuousElements = new Set();

export function isPageNavTransitionActive() {
  return pageNavTransitionActive;
}

export function isIndexEnterScrambleActive() {
  return indexEnterScrambleActive;
}

function collectNavElements() {
  return [...document.querySelectorAll(NAV_LABELS)];
}

/** @param {ParentNode} scope @param {string[]} selectors */
function collectElementsIn(scope, selectors) {
  const seen = new Set();
  const elements = [];
  for (const selector of selectors) {
    for (const el of scope.querySelectorAll(selector)) {
      if (seen.has(el)) continue;
      seen.add(el);
      elements.push(el);
    }
  }
  return elements;
}

/** @param {string[]} selectors */
function collectElements(selectors) {
  return collectElementsIn(document, selectors);
}

/** @param {PageScrambleView} view */
function collectContentElements(view) {
  if (view === "index") {
    return getSunTermsIndexScrambleTargets();
  }
  if (view === "about") {
    return getSunAboutScrambleTargets();
  }
  if (view === "overview" && isSunOverviewTermsGridVisible()) {
    return getSunOverviewTermsGridScrambleTargets();
  }
  return collectElements(VIEW_SELECTORS[view] ?? []);
}

function clearExitTimer() {
  if (exitTimerId != null) {
    clearTimeout(exitTimerId);
    exitTimerId = null;
  }
}

function clearEnterTimer() {
  if (enterTimerId != null) {
    clearTimeout(enterTimerId);
    enterTimerId = null;
  }
}

/** @param {Element[]} elements */
function trackContinuousStart(elements) {
  for (const el of elements) {
    if (startContinuousScramble(el)) {
      activeContinuousElements.add(el);
    }
  }
}

function resetNavExitScramble() {
  for (const el of collectNavElements()) {
    stopContinuousScramble(el, { restore: false });
    activeContinuousElements.delete(el);
  }
}

function startEnterNavScramble() {
  for (const el of collectNavElements()) {
    trackContinuousStart([el]);
  }
}

function abortExitContentContinuous() {
  for (const el of exitContentElements) {
    stopContinuousScramble(el, { restore: false });
    activeContinuousElements.delete(el);
  }
  exitContentElements = [];
}

function cleanupPageScramble() {
  clearExitTimer();
  clearEnterTimer();
  abortExitContentContinuous();
  for (const el of [...activeContinuousElements]) {
    stopContinuousScramble(el, { restore: false });
  }
  activeContinuousElements.clear();
}

/** @param {() => void} [onComplete] */
function settleAllContinuous(onComplete) {
  const elements = [...activeContinuousElements];
  activeContinuousElements.clear();

  if (!elements.length) {
    onComplete?.();
    return;
  }

  let pending = 0;
  const done = () => {
    pending -= 1;
    if (pending <= 0) onComplete?.();
  };

  for (const el of elements) {
    if (settleFromContinuousScramble(el, done, { config: PAGE_NAV_SCRAMBLE_CONFIG })) {
      pending += 1;
    }
  }

  if (pending === 0) onComplete?.();
}

/** @param {() => void} [onComplete] @param {number} [enterMs] */
function scheduleEnterSettle(onComplete, enterMs = PAGE_ROUTE_TIMING.enterMs) {
  clearEnterTimer();
  enterTimerId = window.setTimeout(() => {
    enterTimerId = null;
    settleAllContinuous(() => {
      clearSiteNavShuffleUnderlines();
      onComplete?.();
    });
  }, enterMs);
}

/**
 * Index enter: scramble all term labels + legends immediately after grid build.
 * @param {() => void} [onComplete]
 * @param {number} [enterMs]
 */
export function scrambleIndexContentEnter(onComplete, enterMs = PAGE_ROUTE_TIMING.enterMs) {
  clearEnterTimer();
  indexEnterScrambleActive = true;
  resetNavExitScramble();
  startEnterNavScramble();
  trackContinuousStart(collectContentElements("index"));
  scheduleEnterSettle(() => {
    indexEnterScrambleActive = false;
    onComplete?.();
  }, enterMs);
}

/**
 * Exit: continuous scramble for a fixed duration, never settling.
 * @param {PageScrambleView} view
 * @param {() => void} [onComplete]
 * @param {number} [exitMs]
 */
export function scrambleExitView(view, onComplete, exitMs = PAGE_ROUTE_TIMING.exitMs) {
  clearExitTimer();
  clearEnterTimer();
  abortExitContentContinuous();
  for (const el of [...activeContinuousElements]) {
    stopContinuousScramble(el, { restore: false });
  }
  activeContinuousElements.clear();

  exitContentElements = collectContentElements(view);
  trackContinuousStart(collectNavElements());
  trackContinuousStart(exitContentElements);

  exitTimerId = window.setTimeout(() => {
    exitTimerId = null;
    onComplete?.();
  }, exitMs);
}

/** @param {PageScrambleView} view @param {() => void} [onComplete] @param {number} [enterMs] */
function scrambleEnterView(view, onComplete, enterMs = PAGE_ROUTE_TIMING.enterMs) {
  if (view === "index") {
    scrambleIndexContentEnter(onComplete, enterMs);
    return;
  }

  clearEnterTimer();
  startEnterNavScramble();
  trackContinuousStart(collectContentElements(view));
  scheduleEnterSettle(onComplete, enterMs);
}

/**
 * Keep an in-progress enter scramble alive across DOM rebuilds. The SVG ring is
 * re-rendered (svg.innerHTML replaced) every frame during the overview zoom,
 * which orphans the continuous scramble {@link scrambleEnterView} started on its
 * term labels. Calling this after each render re-scrambles the freshly rendered
 * nodes and prunes the detached ones, so the ring scrambles for the same beat as
 * the rest of the transition regardless of route (zoom vs. snap). No-op outside
 * the enter-scramble window (enterTimerId set, pre-settle).
 * @param {Element[]} elements
 */
export function maintainEnterScramble(elements) {
  if (enterTimerId == null || !elements.length) return;
  for (const el of [...activeContinuousElements]) {
    if (!el.isConnected) {
      stopContinuousScramble(el, { restore: false });
      activeContinuousElements.delete(el);
    }
  }
  for (const el of elements) {
    if (activeContinuousElements.has(el)) continue;
    if (startContinuousScramble(el)) activeContinuousElements.add(el);
  }
}

/** @param {PageScrambleView} view @param {() => void} [onComplete] */
export function scheduleEnterPageScramble(view, onComplete) {
  pageNavTransitionActive = true;
  scrambleEnterView(view, () => {
    pageNavTransitionActive = false;
    onComplete?.();
  });
}

/**
 * @param {PageScrambleView} exitView
 * @param {() => void} then
 * @param {{ exitMs?: number, enterMs?: number }} [timing]
 * @returns {boolean}
 */
export function runExitScrambleThen(exitView, then, timing = PAGE_ROUTE_TIMING) {
  if (pageNavTransitionActive) return false;
  pageNavTransitionActive = true;
  const exitMs = timing.exitMs;
  const enterMs = timing.enterMs;
  scrambleExitView(exitView, () => {
    then(enterMs);
    abortExitContentContinuous();
  }, exitMs);
  return true;
}

/**
 * @param {PageScrambleView} exitView
 * @param {() => void} performSwitch
 * @param {PageScrambleView} enterView
 * @param {() => void} [onEnterComplete]
 * @param {{ exitMs?: number, enterMs?: number }} [timing]
 * @returns {boolean}
 */
export function runPageNavScrambleTransition(
  exitView,
  performSwitch,
  enterView,
  onEnterComplete,
  timing = PAGE_ROUTE_TIMING
) {
  const enterMs = timing.enterMs;
  return runExitScrambleThen(
    exitView,
    () => {
      performSwitch();
      if (enterView === "index") {
        // Index enter scrambles 100+ labels — unblock navigation as soon as the view switches.
        scrambleIndexContentEnter(undefined, enterMs);
        pageNavTransitionActive = false;
        onEnterComplete?.();
        return;
      }
      const finish = () => {
        pageNavTransitionActive = false;
        onEnterComplete?.();
      };
      scrambleEnterView(enterView, finish, enterMs);
    },
    timing
  );
}

/** @param {PageScrambleView} view @param {() => void} [onComplete] */
export function scramblePageView(view, onComplete) {
  if (pageNavTransitionActive) return;
  pageNavTransitionActive = true;
  scrambleExitView(view, () => {
    onComplete?.();
    pageNavTransitionActive = false;
  });
}

export function cancelPageNavScramble() {
  pageNavTransitionActive = false;
  indexEnterScrambleActive = false;
  cleanupPageScramble();
}

/**
 * Initial load: scramble the loading label, then settle before revealing the app.
 * @param {Element | null | undefined} loadingLabel
 * @param {() => void} [onComplete]
 */
export function runLoadingBarExitScramble(loadingLabel, onComplete) {
  if (!loadingLabel) {
    onComplete?.();
    return;
  }

  if (!startContinuousScramble(loadingLabel)) {
    onComplete?.();
    return;
  }

  window.setTimeout(() => {
    if (!settleFromContinuousScramble(loadingLabel, onComplete, { config: PAGE_NAV_SCRAMBLE_CONFIG })) {
      onComplete?.();
    }
  }, LOADING_SCRAMBLE_MS);
}

/**
 * Nav-only enter scramble after the loading overlay is dismissed.
 * @param {() => void} [onComplete]
 */
export function runNavEnterScramble(onComplete) {
  clearEnterTimer();
  startEnterNavScramble();
  scheduleEnterSettle(onComplete);
}

/** Home entrance — typewriter scramble timing for nav labels. */
const NAV_TYPEWRITER_CONFIG = {
  frameMs: 26,
  scrambleFrames: 2,
  tailLength: 5,
};
/** Per-label start offset so labels write in sequence, not all at once. */
const NAV_TYPEWRITER_STAGGER_MS = 90;

/**
 * Home entrance: every nav label writes itself in with a typewriter scramble
 * (settled prefix + scrambling tail), staggered label-by-label. Used after the
 * splash overlay is dismissed.
 * @param {() => void} [onComplete]
 */
export function runNavTypewriterEnter(onComplete) {
  clearEnterTimer();
  const labels = collectNavElements();
  if (!labels.length) {
    onComplete?.();
    return;
  }

  let pending = labels.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) {
      clearSiteNavShuffleUnderlines();
      onComplete?.();
    }
  };

  labels.forEach((el, index) => {
    const target = getLetterShuffleOriginal(el);
    abortLetterShuffle(el);
    // Blank the label until its turn so it visibly writes itself in.
    el.textContent = "";
    window.setTimeout(() => {
      playLightTypewriterScrambleTo(el, target, done, NAV_TYPEWRITER_CONFIG);
    }, index * NAV_TYPEWRITER_STAGGER_MS);
  });
}
