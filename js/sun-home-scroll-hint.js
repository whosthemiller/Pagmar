/**
 * Entrance scroll hint — bottom-left "↓ גללו כדי לחקור". On the home map it is
 * shown the first time a visitor lands (persisted in localStorage). On a term
 * page it is shown every time the page is entered (not persisted). A short beat
 * after the user starts scrolling it exits with a letter-scramble.
 */

import {
  abortLetterShuffle,
  playLightLetterShuffleTo,
  playLightTypewriterScrambleTo,
  startContinuousScramble,
} from "./letter-shuffle.js";

const HINT_TEXT = "גללו כדי לחקור";
const STORAGE_KEY = "pp-home-scroll-hint-seen-v2";

/** Grace window so the splash-dismiss scroll fling doesn't dismiss it at once. */
const ARM_DELAY_MS = 700;
/** Term pages have no splash fling, so they arm almost immediately. */
const TERM_ARM_DELAY_MS = 150;
/** Beat between "started scrolling" and the scramble-out. */
const DISMISS_DELAY_MS = 450;
/** How long the scramble plays before the hint is removed. */
const SCRAMBLE_OUT_MS = 240;

let hintEl = null;
let textEl = null;
let armed = false;
let dismissing = false;
let shown = false;
let armTimer = null;
let dismissTimer = null;
let scrambleTimer = null;
let forcedHomeHintShownThisLoad = false;
/** Whether the current showing should persist a "seen" flag once dismissed. */
let persistOnDismiss = false;
/** If true, a scroll during the arm grace is remembered and dismisses on arm. */
let deferScrollDismiss = false;
let pendingScrollDismiss = false;

function hasSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* Private mode / blocked storage — fall back to once-per-load. */
  }
}

export function initHomeScrollHint() {
  if (hintEl) return;

  const existing = document.getElementById("sun-home-scroll-hint");
  if (existing) {
    hintEl = existing;
    textEl = existing.querySelector(".sun-home-scroll-hint__text");
    return;
  }

  const el = document.createElement("div");
  el.id = "sun-home-scroll-hint";
  el.className = "sun-home-scroll-hint";
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");

  const arrow = document.createElement("span");
  arrow.className = "sun-home-scroll-hint__arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↓";

  const text = document.createElement("span");
  text.className = "sun-home-scroll-hint__text";
  text.dataset.letterShuffleUnderline = "off";
  text.textContent = HINT_TEXT;

  el.append(arrow, text);
  document.body.appendChild(el);
  hintEl = el;
  textEl = text;
}

function clearHintTimers() {
  clearTimeout(armTimer);
  clearTimeout(dismissTimer);
  clearTimeout(scrambleTimer);
  armTimer = null;
  dismissTimer = null;
  scrambleTimer = null;
}

function scheduleDismiss() {
  if (!hintEl || !shown || dismissing) return;
  dismissing = true;
  armed = false;
  pendingScrollDismiss = false;
  clearTimeout(dismissTimer);
  dismissTimer = window.setTimeout(runScrambleOut, DISMISS_DELAY_MS);
}

function showScrollHint({
  persist,
  armDelay = ARM_DELAY_MS,
  deferDismiss = false,
  ignoreSeen = false,
  typewriter = false,
}) {
  if (!hintEl) return;
  if (persist && !ignoreSeen && hasSeen()) return;
  // Already on-screen and not exiting — nothing to do.
  if (shown && !dismissing) return;

  clearHintTimers();
  abortLetterShuffle(textEl);
  armed = false;
  dismissing = false;
  shown = true;
  persistOnDismiss = persist;
  deferScrollDismiss = deferDismiss;
  pendingScrollDismiss = false;

  hintEl.hidden = false;
  // Force a reflow so the opacity transition runs from 0.
  void hintEl.offsetWidth;
  hintEl.classList.add("is-visible");
  // Term pages reveal their content with a typewriter-scramble; match it so the
  // scroll hint writes in the same way. The home map keeps the settle reveal.
  if (typewriter) {
    playLightTypewriterScrambleTo(textEl, HINT_TEXT);
  } else {
    playLightLetterShuffleTo(textEl, HINT_TEXT);
  }

  armTimer = window.setTimeout(() => {
    armed = true;
    armTimer = null;
    // A scroll that happened during the grace window dismisses now.
    if (pendingScrollDismiss) scheduleDismiss();
  }, armDelay);
}

function notifyScroll() {
  if (!hintEl || !shown || dismissing) return;
  if (!armed) {
    // Remember the scroll so it can dismiss the moment the hint arms (term
    // pages); the home variant ignores scrolls until armed (splash fling).
    if (deferScrollDismiss) pendingScrollDismiss = true;
    return;
  }
  scheduleDismiss();
}

export function showHomeScrollHint(options = {}) {
  const ignoreSeen = Boolean(options.ignoreSeen);
  if (ignoreSeen) {
    if (forcedHomeHintShownThisLoad) return;
    forcedHomeHintShownThisLoad = true;
  }
  showScrollHint({ persist: true, ignoreSeen });
}

/** User started scrolling the home map — schedule the scramble-out. */
export function notifyHomeScroll() {
  notifyScroll();
}

/** Shown every time a term page is entered (no persistence). */
export function showTermScrollHint() {
  showScrollHint({
    persist: false,
    armDelay: TERM_ARM_DELAY_MS,
    deferDismiss: true,
    typewriter: true,
  });
}

/** User started scrolling the term page — schedule the scramble-out. */
export function notifyTermScroll() {
  notifyScroll();
}

/** Force-hide the hint immediately (e.g. when leaving a term page). */
export function hideScrollHint() {
  if (!hintEl) return;
  clearHintTimers();
  abortLetterShuffle(textEl);
  hintEl.classList.remove("is-visible");
  hintEl.hidden = true;
  armed = false;
  dismissing = false;
  shown = false;
  pendingScrollDismiss = false;
}

function runScrambleOut() {
  dismissTimer = null;
  if (!hintEl) return;
  if (persistOnDismiss) markSeen();
  startContinuousScramble(textEl);
  hintEl.classList.remove("is-visible");
  clearTimeout(scrambleTimer);
  scrambleTimer = window.setTimeout(() => {
    scrambleTimer = null;
    abortLetterShuffle(textEl);
    if (hintEl) hintEl.hidden = true;
    shown = false;
    dismissing = false;
  }, SCRAMBLE_OUT_MS);
}
