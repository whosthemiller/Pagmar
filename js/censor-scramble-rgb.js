/** Uncensor-out runs faster than the forward censor write. */
export const CENSOR_UNCENSOR_SPEED_FACTOR = 0.4;

/**
 * Restart expand animation on a single censor rect.
 * @param {Element | null | undefined} censorEl
 */
export function restartCensorExpand(censorEl) {
  if (!censorEl) return;
  censorEl.classList.remove("is-censor-scramble");
  void censorEl.getBoundingClientRect();
  censorEl.classList.add("is-censor-scramble");
}

/**
 * @param {number} durationS
 */
export function getCensorUncensorDurationS(durationS) {
  return durationS * CENSOR_UNCENSOR_SPEED_FACTOR;
}

/**
 * @param {number} durationS
 */
export function getCensorUncensorDurationMs(durationS) {
  return getCensorUncensorDurationS(durationS) * 1000;
}

/**
 * @param {Element} el
 * @param {number} durationS
 * @param {number} steps
 */
export function applyCensorUncensorTiming(el, durationS, steps) {
  el.style.setProperty("--sun-censor-write-duration", `${getCensorUncensorDurationS(durationS)}s`);
  el.style.setProperty("--sun-censor-write-steps", String(steps));
}

/**
 * Play the reverse censor animation on `el`.
 * @param {Element} el
 * @param {number} durationS forward-write duration in seconds
 * @param {number} steps
 * @returns {number} uncensor duration in ms
 */
export function beginCensorUncensor(el, durationS, steps) {
  applyCensorUncensorTiming(el, durationS, steps);
  el.classList.remove("is-censor-uncensoring", "is-censor-write-in-return");
  void el.getBoundingClientRect();
  el.classList.add("is-censor-uncensoring");
  return getCensorUncensorDurationMs(durationS);
}

/**
 * Smooth write-in for a title censor returning after same-object hover reveal.
 * @param {Element} el
 * @param {number} durationS
 * @returns {number}
 */
export function beginCensorWriteInReturn(el, durationS) {
  const duration = getCensorUncensorDurationS(durationS);
  el.classList.remove("is-censor-uncensoring", "is-censor-write-in-return");
  el.style.removeProperty("opacity");
  el.style.removeProperty("transform");
  el.style.setProperty("--sun-censor-write-duration", `${duration}s`);
  void el.getBoundingClientRect();
  el.classList.add("is-censor-write-in-return");
  return getCensorUncensorDurationMs(durationS);
}

/**
 * @param {Element} el
 */
export function finishCensorWriteInReturn(el) {
  el.classList.remove("is-censor-write-in-return");
  el.style.removeProperty("--sun-censor-write-duration");
  if (el.classList.contains("sun-term-censor")) {
    el.style.setProperty("animation", "none");
    el.style.setProperty("opacity", "1");
    el.style.setProperty("transform", "scaleX(1)");
  }
}

/**
 * @param {Element} el
 */
export function finishCensorUncensor(el) {
  el.classList.remove("is-censor-uncensoring");
  el.style.removeProperty("--sun-censor-write-duration");
  el.style.removeProperty("--sun-censor-write-steps");
  el.style.removeProperty("animation");
  if (el.classList.contains("sun-page-censor-line")) {
    el.style.transform = "scaleX(0)";
    return;
  }
  if (el.classList.contains("sun-term-censor")) {
    el.style.removeProperty("opacity");
    el.style.removeProperty("transform");
  }
}
