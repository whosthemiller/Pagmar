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
