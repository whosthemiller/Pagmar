/**
 * Timeline event hint — top-right title display during year scroll.
 */

import {
  abortLetterShuffle,
  playLightLetterShuffleTo,
  startContinuousScramble,
} from "./letter-shuffle.js";
import { getGridSpanBounds } from "./grid-metrics.js";
import { getTimelineEventText } from "./timeline-events.js";
import { applyBlockTypography, applyTypographyRules } from "./typography.js";

const TIMELINE_HINT_COLUMNS = 10;
const TIMELINE_SCROLL_HINT_COLUMNS = 5;
const TIMELINE_SCROLL_HINT_ALIGN_FROM_RIGHT = 2;
const TIMELINE_HINT_LINE_HEIGHT = 80;
const TIMELINE_HINT_COLLISION_PAD = 8;
const TIMELINE_HINT_HIDE_MS = 120;
const TIMELINE_SCROLL_HINT_TEXT = "גללו לאורך ציר הזמן וצפו במונחים המשתנים עם השנים";
const TIMELINE_SCROLL_HINT_DISMISS_MS = 350;
/** Set to true to restore letter-scramble on show/hide. */
const TIMELINE_HINT_SCRAMBLE_ENABLED = false;

let isInOverview = () => false;
let getOverviewSubMode = () => "filter";
let getSunCircle = () => null;
let hintEl = null;
let scrollHintEl = null;
let scrollHintTextEl = null;
let scrollHintRevealed = false;
let hintHideTimer = null;
let hintResizeBound = false;
let lastShownText = "";

function isTimelineMode() {
  return isInOverview() && getOverviewSubMode() === "timeline";
}

function clearHintHideTimer() {
  if (hintHideTimer == null) return;
  clearTimeout(hintHideTimer);
  hintHideTimer = null;
}

function getHintBaseTop() {
  const root = document.documentElement;
  const navHeight =
    parseFloat(getComputedStyle(root).getPropertyValue("--site-nav-height")) || 42;
  const margin = parseFloat(getComputedStyle(root).getPropertyValue("--grid-margin")) || 10;
  return navHeight + margin;
}

/**
 * @param {DOMRect} rect
 * @param {{ cx: number, cy: number, r: number }} circle
 * @param {number} [pad]
 */
function rectIntersectsCircle(rect, circle, pad = 0) {
  const r = circle.r + pad;
  const closestX = Math.max(rect.left, Math.min(circle.cx, rect.right));
  const closestY = Math.max(rect.top, Math.min(circle.cy, rect.bottom));
  const dx = circle.cx - closestX;
  const dy = circle.cy - closestY;
  return dx * dx + dy * dy < r * r;
}

function avoidSunCollision() {
  if (!hintEl || hintEl.hidden) return;

  const baseTop = getHintBaseTop();
  hintEl.style.top = `${baseTop}px`;

  const sun = getSunCircle?.();
  if (!sun) return;

  const rect = hintEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  if (!rectIntersectsCircle(rect, sun, TIMELINE_HINT_COLLISION_PAD)) return;

  // Stay anchored to the top: only drop lines while the title can remain
  // entirely above the sun's vertical center. Pushing past that point would
  // move the title down into / below the sun, so we keep it at the top instead.
  const height = rect.height;
  const maxTop = sun.cy - sun.r - TIMELINE_HINT_COLLISION_PAD - height;

  let top = baseTop;
  while (top + TIMELINE_HINT_LINE_HEIGHT <= maxTop) {
    top += TIMELINE_HINT_LINE_HEIGHT;
    hintEl.style.top = `${top}px`;
    const next = hintEl.getBoundingClientRect();
    if (!rectIntersectsCircle(next, sun, TIMELINE_HINT_COLLISION_PAD)) return;
  }

  // Could not clear the sun while staying near the top — keep it pinned to the top.
  hintEl.style.top = `${baseTop}px`;
}

function positionTimelineHint() {
  if (!hintEl) return;
  const viewportEl = document.getElementById("sun-viewport");
  const span = getGridSpanBounds(TIMELINE_HINT_COLUMNS, 1, viewportEl || undefined);
  const viewportLeft = viewportEl?.getBoundingClientRect().left ?? 0;
  hintEl.style.left = `${viewportLeft + span.left}px`;
  hintEl.style.width = `${span.width}px`;
  hintEl.style.maxWidth = `${span.width}px`;
  avoidSunCollision();
}

export function repositionTimelineEventHint() {
  if (!hintEl || hintEl.hidden || !isTimelineMode()) return;
  positionTimelineHint();
}

let scrollHintDismissedForSession = false;
let scrollHintDismissTimer = null;

function clearScrollHintDismissTimer() {
  if (scrollHintDismissTimer == null) return;
  clearTimeout(scrollHintDismissTimer);
  scrollHintDismissTimer = null;
}

function getScrollHintTypographyText() {
  return applyBlockTypography(TIMELINE_SCROLL_HINT_TEXT, {
    ensurePeriod: false,
  });
}

function hideTimelineScrollHint() {
  if (!scrollHintEl) return;
  clearScrollHintDismissTimer();
  scrollHintRevealed = false;
  if (scrollHintTextEl) {
    abortLetterShuffle(scrollHintTextEl);
    scrollHintTextEl.textContent = "";
  }
  scrollHintEl.hidden = true;
  scrollHintDismissedForSession = false;
}

export function resetTimelineScrollHint() {
  clearScrollHintDismissTimer();
  scrollHintDismissedForSession = false;
  scrollHintRevealed = false;
  if (scrollHintTextEl) {
    abortLetterShuffle(scrollHintTextEl);
    scrollHintTextEl.textContent = "";
  }
  if (scrollHintEl) scrollHintEl.hidden = true;
  syncTimelineScrollHint();
}

export function dismissTimelineScrollHint() {
  // Scroll hint stays visible in timeline mode — not dismissed on scroll.
}

export function revealTimelineScrollHint({ reducedMotion = false } = {}) {
  if (!scrollHintEl || !scrollHintTextEl) return;
  if (!isTimelineMode() || scrollHintDismissedForSession || scrollHintRevealed) return;

  scrollHintRevealed = true;
  positionScrollHint();
  scrollHintEl.hidden = false;

  const text = getScrollHintTypographyText();
  abortLetterShuffle(scrollHintTextEl);
  if (reducedMotion) {
    scrollHintTextEl.textContent = text;
  } else {
    playLightLetterShuffleTo(scrollHintTextEl, text);
  }
}

export function syncTimelineScrollHint() {
  if (!scrollHintEl) return;
  if (!isTimelineMode() || scrollHintDismissedForSession) {
    if (!scrollHintRevealed) scrollHintEl.hidden = true;
    return;
  }
  positionScrollHint();
  scrollHintEl.hidden = !scrollHintRevealed;
}

function positionScrollHint() {
  if (!scrollHintEl) return;
  const viewportEl = document.getElementById("sun-viewport");
  const span = getGridSpanBounds(
    TIMELINE_SCROLL_HINT_COLUMNS,
    TIMELINE_SCROLL_HINT_ALIGN_FROM_RIGHT,
    viewportEl || undefined
  );
  const viewportLeft = viewportEl?.getBoundingClientRect().left ?? 0;
  scrollHintEl.style.left = `${viewportLeft + span.left}px`;
  scrollHintEl.style.width = `${span.width}px`;
  scrollHintEl.style.maxWidth = `${span.width}px`;
  scrollHintEl.style.transform = "";
}

export function repositionTimelineScrollHint() {
  if (!scrollHintEl || scrollHintEl.hidden || !isTimelineMode()) return;
  positionScrollHint();
}

function hideTimelineEventHint({ immediate = false } = {}) {
  if (!hintEl) return;
  clearHintHideTimer();
  lastShownText = "";
  if (hintEl.hidden) return;
  if (immediate || !TIMELINE_HINT_SCRAMBLE_ENABLED) {
    abortLetterShuffle(hintEl);
    hintEl.hidden = true;
    hintEl.textContent = "";
    hintEl.style.top = "";
    return;
  }
  startContinuousScramble(hintEl);
  hintHideTimer = window.setTimeout(() => {
    if (!hintEl) return;
    abortLetterShuffle(hintEl);
    hintEl.hidden = true;
    hintEl.textContent = "";
    hintEl.style.top = "";
    hintHideTimer = null;
  }, TIMELINE_HINT_HIDE_MS);
}

function bindHintResize() {
  if (hintResizeBound) return;
  hintResizeBound = true;
  window.addEventListener("resize", () => {
    repositionTimelineEventHint();
    repositionTimelineScrollHint();
  });
}

function applyHintText(text) {
  if (TIMELINE_HINT_SCRAMBLE_ENABLED) {
    playLightLetterShuffleTo(hintEl, text);
  } else {
    abortLetterShuffle(hintEl);
    hintEl.textContent = text;
  }
  requestAnimationFrame(() => {
    positionTimelineHint();
  });
}

/**
 * @param {number} year
 */
export function updateTimelineEventHint(year) {
  if (!hintEl) return;
  if (!isTimelineMode()) {
    hideTimelineEventHint({ immediate: true });
    return;
  }

  const rawText = getTimelineEventText(year);
  if (!rawText) {
    hideTimelineEventHint();
    return;
  }
  const text = applyTypographyRules(rawText);

  clearHintHideTimer();
  positionTimelineHint();

  if (text === lastShownText && !hintEl.hidden) {
    avoidSunCollision();
    return;
  }

  lastShownText = text;
  hintEl.hidden = false;
  applyHintText(text);
}

export function syncTimelineEventHint(year) {
  if (!isTimelineMode()) {
    hideTimelineEventHint({ immediate: true });
    return;
  }
  updateTimelineEventHint(year);
}

export function initSunTimelineHint({
  isInOverview: isInOverviewFn,
  getOverviewSubMode: getOverviewSubModeFn,
  getSunCircle: getSunCircleFn,
}) {
  isInOverview = isInOverviewFn || (() => false);
  getOverviewSubMode = getOverviewSubModeFn || (() => "filter");
  getSunCircle = getSunCircleFn || (() => null);

  const existingHint = document.getElementById("sun-timeline-event-hint");
  if (existingHint) {
    hintEl = existingHint;
  } else {
    const hint = document.createElement("p");
    hint.id = "sun-timeline-event-hint";
    hint.className = "sun-timeline-event-hint";
    hint.hidden = true;
    hint.setAttribute("aria-hidden", "true");
    document.body.appendChild(hint);
    hintEl = hint;
  }

  const existingScrollHint = document.getElementById("sun-timeline-scroll-hint");
  if (existingScrollHint) {
    scrollHintEl = existingScrollHint;
    scrollHintTextEl = existingScrollHint.querySelector(".sun-timeline-scroll-hint__text");
  } else {
    const scrollHint = document.createElement("p");
    scrollHint.id = "sun-timeline-scroll-hint";
    scrollHint.className = "sun-timeline-scroll-hint";
    scrollHint.hidden = true;
    scrollHint.setAttribute("aria-hidden", "true");

    const scrollHintArrow = document.createElement("span");
    scrollHintArrow.className = "sun-timeline-scroll-hint__arrow";
    scrollHintArrow.setAttribute("aria-hidden", "true");
    scrollHintArrow.textContent = "↓";

    const scrollHintText = document.createElement("span");
    scrollHintText.className = "sun-timeline-scroll-hint__text";
    scrollHintText.dataset.letterShuffleUnderline = "off";

    scrollHint.append(scrollHintArrow, scrollHintText);
    document.body.appendChild(scrollHint);
    scrollHintEl = scrollHint;
    scrollHintTextEl = scrollHintText;
  }

  bindHintResize();
  positionTimelineHint();
  syncTimelineScrollHint();
}

export { hideTimelineEventHint, hideTimelineScrollHint };
