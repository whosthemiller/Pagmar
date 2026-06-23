/**
 * Timeline event hint — bottom-right title display during year scroll.
 */

import {
  abortLetterShuffle,
  playLightLetterShuffleTo,
  startContinuousScramble,
} from "./letter-shuffle.js";
import { getGridSpanBounds } from "./grid-metrics.js";
import { getTimelineEventText } from "./timeline-events.js";

const TIMELINE_HINT_COLUMNS = 6;
const TIMELINE_HINT_HIDE_MS = 120;
/** Set to true to restore letter-scramble on show/hide. */
const TIMELINE_HINT_SCRAMBLE_ENABLED = false;

let isInOverview = () => false;
let getOverviewSubMode = () => "filter";
let hintEl = null;
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

function positionTimelineHint() {
  if (!hintEl) return;
  const viewportEl = document.getElementById("sun-viewport");
  const span = getGridSpanBounds(TIMELINE_HINT_COLUMNS, 1, viewportEl || undefined);
  hintEl.style.left = `${span.left}px`;
  hintEl.style.width = `${span.width}px`;
  hintEl.style.maxWidth = `${span.width}px`;
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
    return;
  }
  startContinuousScramble(hintEl);
  hintHideTimer = window.setTimeout(() => {
    if (!hintEl) return;
    abortLetterShuffle(hintEl);
    hintEl.hidden = true;
    hintEl.textContent = "";
    hintHideTimer = null;
  }, TIMELINE_HINT_HIDE_MS);
}

function bindHintResize() {
  if (hintResizeBound) return;
  hintResizeBound = true;
  window.addEventListener("resize", () => {
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

  const text = getTimelineEventText(year);
  if (!text) {
    hideTimelineEventHint();
    return;
  }

  clearHintHideTimer();
  positionTimelineHint();

  if (text === lastShownText && !hintEl.hidden) return;

  lastShownText = text;
  hintEl.hidden = false;
  if (TIMELINE_HINT_SCRAMBLE_ENABLED) {
    playLightLetterShuffleTo(hintEl, text);
  } else {
    abortLetterShuffle(hintEl);
    hintEl.textContent = text;
  }
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
}) {
  if (document.getElementById("sun-timeline-event-hint")) return;

  isInOverview = isInOverviewFn || (() => false);
  getOverviewSubMode = getOverviewSubModeFn || (() => "filter");

  const hint = document.createElement("p");
  hint.id = "sun-timeline-event-hint";
  hint.className = "sun-timeline-event-hint";
  hint.hidden = true;
  hint.setAttribute("aria-hidden", "true");

  document.body.appendChild(hint);
  hintEl = hint;
  bindHintResize();
  positionTimelineHint();
}

export { hideTimelineEventHint };
