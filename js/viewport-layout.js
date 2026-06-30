/** Reference viewport — MacBook 14" default logical resolution. */
export const VIEWPORT_DESIGN = {
  width: 1512,
  height: 982,
};

const WIDE_SCREEN_START_WIDTH = 2560;
/**
 * Large-desktop typography easing. Past the MacBook reference width the unified
 * grid scale grows a little too eagerly (the nav bar and the sun-wheel terms
 * read oversized on an iMac). Rather than scale text up by the full grid ratio,
 * keep only a fraction of that growth on big screens — a "moderate" setting that
 * stays noticeably larger than the MacBook reference without ballooning.
 */
const LARGE_DESKTOP_TYPOGRAPHY_TRIM_START_WIDTH = 1512;
const LARGE_DESKTOP_TYPOGRAPHY_TRIM_FULL_WIDTH = 2048;
/** Fraction of the above-reference growth retained at full ramp (0.5 = half). */
const LARGE_DESKTOP_GROWTH_KEEP = 0.5;
/** Legacy multiplicative trim, still used by the splash poster (vw-based). */
const LARGE_DESKTOP_TYPOGRAPHY_TRIM = 0.92;
/**
 * Above 2560px the typography cap is lifted toward the viewport-width ratio
 * rather than the (larger) column-width ratio. Fixed margins/gutters become
 * negligible on huge screens, so the column-width ratio (~3.05x at 4096px)
 * outruns the viewport-width ratio (~2.71x). Scaling text by the column ratio
 * makes a full-width element (e.g. the Secolo term title "מלחמת ה-7 באוקטובר")
 * grow faster than the screen and overflow. Capping at a safety-damped
 * viewport-width ratio guarantees anything that fit at the 1512px reference
 * still fits once both text and viewport scale by the same factor.
 */
const ULTRA_WIDE_TYPOGRAPHY_SAFETY = 0.92;
/** Vertical spacing keeps growing on tall 4K screens, but gently. */
const ULTRA_WIDE_HEIGHT_MAX_SCALE = 1.6;

export function clampScalar(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Mild multiplicative trim kept for the splash poster, whose type scales off
 * `vw` rather than the column grid. Eases in past the reference width.
 */
export function getLargeDesktopTypographyTrim(
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : VIEWPORT_DESIGN.width
) {
  const progress = clampScalar(
    (viewportWidth - LARGE_DESKTOP_TYPOGRAPHY_TRIM_START_WIDTH) /
      (LARGE_DESKTOP_TYPOGRAPHY_TRIM_FULL_WIDTH - LARGE_DESKTOP_TYPOGRAPHY_TRIM_START_WIDTH),
    0,
    1
  );
  return 1 - progress * (1 - LARGE_DESKTOP_TYPOGRAPHY_TRIM);
}

/**
 * Fraction of the above-reference grid growth to retain at the current width.
 * Returns 1 at/below the MacBook reference (no change) and ramps down toward
 * `LARGE_DESKTOP_GROWTH_KEEP` on iMac-sized screens, so nav + wheel text grow
 * only partway from the reference size instead of by the full grid ratio.
 */
export function getLargeDesktopGrowthKeep(
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : VIEWPORT_DESIGN.width
) {
  const progress = clampScalar(
    (viewportWidth - LARGE_DESKTOP_TYPOGRAPHY_TRIM_START_WIDTH) /
      (LARGE_DESKTOP_TYPOGRAPHY_TRIM_FULL_WIDTH - LARGE_DESKTOP_TYPOGRAPHY_TRIM_START_WIDTH),
    0,
    1
  );
  return 1 - progress * (1 - LARGE_DESKTOP_GROWTH_KEEP);
}

/** Ease a raw unified scale toward 1 on large screens (keeps part of growth). */
export function easeLargeDesktopScale(unifiedScale, viewportWidth) {
  return 1 + (unifiedScale - 1) * getLargeDesktopGrowthKeep(viewportWidth);
}

/**
 * Full-bleed 24-column grid: a small fixed edge margin with columns that stretch
 * to fill the viewport. The sun map and site nav are designed edge-to-edge, so
 * the grid anchor stays at the same proportional position across screen sizes
 * (matching how it looks on the MacBook reference, just larger).
 */
export function getResponsiveGridLayout(viewportWidth) {
  const columns = 24;
  const gutter = 10;
  const margin = 10;
  const gridWidth = Math.max(0, viewportWidth - 2 * margin);
  const colWidth =
    gridWidth > 0 ? (gridWidth - (columns - 1) * gutter) / columns : 0;

  return {
    viewportWidth,
    margin,
    gutter,
    columns,
    gridWidth,
    colWidth,
    gridLeft: margin,
  };
}

/**
 * Height-based scale for fixed layout offsets.
 * Keep the existing desktop cap through 2560px-wide screens, then let
 * 4K presentation layouts grow closer to the reference proportions.
 */
export function getViewportHeightScale(
  viewportHeight,
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : VIEWPORT_DESIGN.width
) {
  const rawScale = viewportHeight / VIEWPORT_DESIGN.height;
  const widthRatio = viewportWidth / VIEWPORT_DESIGN.width;
  // Ramp from the standard 1.18 desktop cap up to the wide cap, keyed to how
  // far past the 2560px reference width we are (full lift at ~2x width).
  const ultraWideProgress = clampScalar(widthRatio - WIDE_SCREEN_START_WIDTH / VIEWPORT_DESIGN.width, 0, 1);
  const maxScale = 1.18 + ultraWideProgress * (ULTRA_WIDE_HEIGHT_MAX_SCALE - 1.18);
  return clampScalar(rawScale, 0.88, maxScale);
}

/**
 * Unified typography scale derived from the grid's own column-width growth.
 *
 * The 24-column grid is full-bleed, so a column on a 2560px screen is ~1.83x
 * wider than on the 1512px MacBook reference. Tying every font size to this same
 * ratio keeps text wrapping (and how far it spreads across its columns)
 * consistent with the reference screen, just larger — and guarantees all fonts
 * grow together by one factor instead of each area scaling differently.
 */
export function getMapTypographyScale(
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : VIEWPORT_DESIGN.width
) {
  const designColWidth = getResponsiveGridLayout(VIEWPORT_DESIGN.width).colWidth;
  const currentColWidth = getResponsiveGridLayout(viewportWidth).colWidth;
  if (!designColWidth) return 1;
  const rawScale = currentColWidth / designColWidth;
  const widthRatio = viewportWidth / VIEWPORT_DESIGN.width;
  const ultraWideProgress = clampScalar(
    widthRatio - WIDE_SCREEN_START_WIDTH / VIEWPORT_DESIGN.width,
    0,
    1
  );
  // Through 2560px keep the original 1.6 cap (prevents clipping on common wide
  // monitors). Above it, lift the cap toward the viewport-width ratio — not the
  // larger column-width ratio — so full-width text grows no faster than the
  // screen itself and never overflows on true 4K canvases.
  const ultraWideCap = widthRatio * ULTRA_WIDE_TYPOGRAPHY_SAFETY;
  const maxScale = 1.6 + ultraWideProgress * Math.max(0, ultraWideCap - 1.6);
  const unified = clampScalar(rawScale, 1, maxScale);
  return easeLargeDesktopScale(unified, viewportWidth);
}

/** Smaller dimension of the reference viewport — the overview ring's design basis. */
const DESIGN_MIN_DIM = Math.min(VIEWPORT_DESIGN.width, VIEWPORT_DESIGN.height);
/**
 * Slight trim on the ring label growth so the text reads a touch smaller on big
 * screens (leaving more room for the circle). The clamp floor of 1 keeps the
 * reference screen unchanged — only larger screens are affected.
 */
const OVERVIEW_RING_FONT_TRIM = 1.05;

/**
 * Typography scale for the overview/timeline ring labels.
 *
 * The ring's radius is `min(viewportWidth, viewportHeight) * factor`, so it
 * grows with the *smaller* viewport dimension (height, on wide 16:9 screens).
 * If the labels used the width-based map scale instead, on a wide screen they'd
 * outgrow the ring — eating radial room and forcing the fit to shrink the
 * circle. Scaling the labels by the same min-dimension ratio as the radius
 * keeps the whole overview a uniform scale-up of the MacBook reference: the
 * ring fills the same fraction of the screen and the text stays proportional to
 * it. Never exceeds the general map scale, and never drops below 1.
 */
export function getOverviewTypographyScale(
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : VIEWPORT_DESIGN.width,
  viewportHeight = typeof window !== "undefined" ? window.innerHeight : VIEWPORT_DESIGN.height
) {
  const minDimRatio = Math.min(viewportWidth, viewportHeight) / DESIGN_MIN_DIM;
  const mapScale = getMapTypographyScale(viewportWidth);
  // The ring labels share the eased map cap, so they calm down on large screens
  // together with the rest of the wheel instead of outgrowing it.
  const eased = easeLargeDesktopScale(
    minDimRatio * OVERVIEW_RING_FONT_TRIM,
    viewportWidth
  );
  return clampScalar(eased, 1, mapScale);
}

/** Scale a design-time pixel constant for the current viewport height. */
export function scaleLayoutPx(value, viewportHeight) {
  return Math.round(value * getViewportHeightScale(viewportHeight));
}
