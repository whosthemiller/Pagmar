/**
 * Home-view mouse-wheel scroll handling.
 *
 * The "between" (D) mode was chosen after A/B/C/D comparison:
 *   - Slow single notch (wheelDeltaY ±120) → discrete one-row step.
 *   - Accelerated burst (±240, ±360, …) → trackpad-like continuous momentum.
 */

export const HOME_SCROLL_MODE = {
  id: "between",
  mouseHandling: "between",
};

export function getActiveHomeScrollMode() {
  return HOME_SCROLL_MODE;
}
