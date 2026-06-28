/** Responsive metrics and column tiers for the scrollable term page. */

import { getMapTypographyScale, getViewportHeightScale } from "./viewport-layout.js";

/**
 * The selected term title scales by the (width-based) map typography scale,
 * while the title-band metrics below scale by viewport height and plateau at
 * their max on tall screens. On true 4K canvases the title therefore outgrows
 * its band and creeps up into the bleed image, swallowing the small gap above
 * it. Grow the band height, baseline inset and image overlap in lockstep with
 * the title once it passes the 2560px-era 1.6x cap, so the header is a uniform
 * scale-up of the (correct) 2560px look at every size.
 */
const TITLE_BAND_BASE_TYPOGRAPHY_SCALE = 1.6;

/**
 * Selected-term title metrics, used to guarantee the bleed image never overlaps
 * the title. Mirrors `LAYOUT.termPageSelectedFontSize` in sun-map.js — the title
 * is rendered at this size times the (width-based) map typography scale.
 */
const SELECTED_TITLE_FONT_SIZE = 144;
/**
 * Conservative upper bound for how far the title glyphs rise above their
 * baseline, as a fraction of the font size (Secolo Hebrew display). Erring high
 * keeps the no-overlap guarantee even for the tallest letters.
 */
const SELECTED_TITLE_ASCENT_RATIO = 0.78;
/** Minimum guaranteed gap between the bleed image bottom and the title top (px, base). */
const TITLE_IMAGE_CLEARANCE_BASE = 6;

function getWideTitleBandFactor() {
  return Math.max(1, getMapTypographyScale() / TITLE_BAND_BASE_TYPOGRAPHY_SCALE);
}

/** How far the rendered title glyphs rise above their baseline (screen px). */
function getSelectedTitleAscentPx() {
  return Math.round(
    SELECTED_TITLE_FONT_SIZE * getMapTypographyScale() * SELECTED_TITLE_ASCENT_RATIO
  );
}

/**
 * The largest bleed-image / title-band overlap that still keeps the image's
 * bottom edge above the title's topmost glyph. The image bottom sits `overlap`
 * px below the band top, while the title top sits `baselineInset - ascent` px
 * below it; capping the overlap below that (minus a small gap) guarantees the
 * title group can never overlap or rise over the bleed image at any size.
 */
function getMaxBleedImageBandOverlapPx(viewportHeight) {
  const baselineInset = getTermPageTitleBaselineInsetPx(viewportHeight);
  const ascent = getSelectedTitleAscentPx();
  const margin = Math.round(TITLE_IMAGE_CLEARANCE_BASE * getWideTitleBandFactor());
  return Math.max(0, baselineInset - ascent - margin);
}

export const TERM_PAGE_RESPONSIVE = {
  compactMaxWidth: 640,
  narrowMaxWidth: 900,
  titleBand: { min: 180, ratio: 0.255, max: 280 },
  titleBaseline: { min: 152, ratio: 0.22, max: 240 },
  /** How far the bleed image extends below the title baseline into the band (px). */
  bleedImageBandOverlap: { min: 32, ratio: 0.048, max: 64 },
  /** Gap between definition and inline image (fold 2). */
  scrollDefinitionImageGap: { min: 44, ratio: 0.1, max: 108 },
  /**
   * Floor the fold-2 inline image may shrink to (fraction of viewport height).
   * Stacked tiers go lower because the meta sits below the image and needs room.
   */
  scrollImageMinFactor: { wide: 0.3, narrow: 0.25, compact: 0.25 },
  /** Gap before fold 3 (details image + labels). */
  scrollBlockGap: { min: 112, ratio: 0.213, max: 220 },
  scrollContentOffsetY: { min: 12, ratio: 0.022, max: 28 },
  groupPinExtraRise: { min: 28, ratio: 0.044, max: 52 },
  scrollPaddingBottom: { min: 100, ratio: 0.155, max: 160 },
  metaBelowImageGap: { min: 20, ratio: 0.032, max: 36 },
  /** Desktop reference width — wide tier applies above narrowMaxWidth. */
  wideDesktopMinWidth: 1512,
  fold2ChapterMinRatio: 0.6,
  /** Minimum fold-3 chapter height as a fraction of viewport height. */
  fold3ChapterMinRatio: 0.6,
  imageHeightFactor: { wide: 0.43, narrow: 0.4, compact: 0.37 },
};

function clampScalar(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scaleFromViewport({ min, ratio, max }, viewportHeight) {
  return Math.round(clampScalar(viewportHeight * ratio, min, max));
}

/** @typedef {'wide'|'narrow'|'compact'} TermPageLayoutTier */

export function getTermPageLayoutTier(viewportWidth) {
  if (viewportWidth < TERM_PAGE_RESPONSIVE.compactMaxWidth) return "compact";
  if (viewportWidth < TERM_PAGE_RESPONSIVE.narrowMaxWidth) return "narrow";
  return "wide";
}

export function getTermPageTitleBandHeightPx(viewportHeight) {
  return Math.round(
    scaleFromViewport(TERM_PAGE_RESPONSIVE.titleBand, viewportHeight) *
      getWideTitleBandFactor()
  );
}

export function getBleedImageBandOverlapPx(viewportHeight) {
  const overlap = Math.round(
    scaleFromViewport(TERM_PAGE_RESPONSIVE.bleedImageBandOverlap, viewportHeight) *
      getWideTitleBandFactor()
  );
  // Never let the image bleed so far down that it reaches the title glyphs.
  return Math.min(overlap, getMaxBleedImageBandOverlapPx(viewportHeight));
}

export function getTermPageTitleBaselineInsetPx(viewportHeight) {
  return Math.round(
    scaleFromViewport(TERM_PAGE_RESPONSIVE.titleBaseline, viewportHeight) *
      getWideTitleBandFactor()
  );
}

export function getTermPageScrollDefinitionImageGapPx(viewportHeight) {
  return scaleFromViewport(TERM_PAGE_RESPONSIVE.scrollDefinitionImageGap, viewportHeight);
}

export function getTermPageScrollBlockGapPx(viewportHeight) {
  return scaleFromViewport(TERM_PAGE_RESPONSIVE.scrollBlockGap, viewportHeight);
}

export function getTermPageScrollContentOffsetYpx(viewportHeight) {
  return scaleFromViewport(TERM_PAGE_RESPONSIVE.scrollContentOffsetY, viewportHeight);
}

export function getTermPageGroupPinExtraRisePx(viewportHeight) {
  return scaleFromViewport(TERM_PAGE_RESPONSIVE.groupPinExtraRise, viewportHeight);
}

export function getTermPageScrollPaddingBottomPx(viewportHeight) {
  return scaleFromViewport(TERM_PAGE_RESPONSIVE.scrollPaddingBottom, viewportHeight);
}

export function getTermPageMetaBelowImageGapPx(viewportHeight) {
  return scaleFromViewport(TERM_PAGE_RESPONSIVE.metaBelowImageGap, viewportHeight);
}

/**
 * Minimum height a fold "chapter" reserves so that snapping to the next fold
 * scrolls the previous one mostly out of view (as a fraction of viewport height).
 */
export function getTermPageFold2ChapterMinPx(viewportHeight) {
  return Math.round(viewportHeight * TERM_PAGE_RESPONSIVE.fold2ChapterMinRatio);
}

export function getTermPageFold3ChapterMinPx(viewportHeight) {
  return Math.round(viewportHeight * TERM_PAGE_RESPONSIVE.fold3ChapterMinRatio);
}

export function getTermPageScrollImageMinHeightPx(viewportHeight, tier = "wide") {
  const factor =
    TERM_PAGE_RESPONSIVE.scrollImageMinFactor[tier] ??
    TERM_PAGE_RESPONSIVE.scrollImageMinFactor.wide;
  return Math.round(viewportHeight * factor);
}

export function getTermPageScrollImageHeightFactor(tier) {
  return (
    TERM_PAGE_RESPONSIVE.imageHeightFactor[tier] ??
    TERM_PAGE_RESPONSIVE.imageHeightFactor.wide
  );
}

/**
 * @param {number} viewportWidth
 * @returns {{
 *   tier: TermPageLayoutTier,
 *   metaBelowImage: boolean,
 *   labelNavStacked: boolean,
 *   definitionColumns: number,
 *   definitionColumnFromRight: number,
 *   imageColumns: number,
 *   imageColumnFromRight: number,
 *   detailsImageColumns: number,
 *   detailsImageColumnFromRight: number,
 *   scrollDetailsHeadingColumns: number,
 *   scrollDetailsValueColumns: number,
 *   scrollDetailsValueColumnFromRight: number,
 *   metaHeadingColumns: number,
 *   metaValueColumns: number,
 *   metaGapColumns: number,
 *   labelPanelColumns: number,
 * }}
 */
export function getTermPageScrollLayoutConfig(viewportWidth) {
  const tier = getTermPageLayoutTier(viewportWidth);
  if (tier === "compact") {
    return {
      tier,
      metaBelowImage: true,
      labelNavStacked: true,
      definitionColumns: 20,
      definitionColumnFromRight: 3,
      imageColumns: 18,
      imageColumnFromRight: 4,
      detailsImageColumns: 18,
      detailsImageColumnFromRight: 4,
      scrollDetailsHeadingColumns: 3,
      scrollDetailsValueColumns: 14,
      scrollDetailsValueColumnFromRight: 7,
      metaHeadingColumns: 3,
      metaValueColumns: 14,
      metaGapColumns: 0,
      labelPanelColumns: 6,
    };
  }
  if (tier === "narrow") {
    return {
      tier,
      metaBelowImage: true,
      labelNavStacked: false,
      definitionColumns: 16,
      definitionColumnFromRight: 5,
      imageColumns: 12,
      imageColumnFromRight: 4,
      detailsImageColumns: 12,
      detailsImageColumnFromRight: 4,
      scrollDetailsHeadingColumns: 2,
      scrollDetailsValueColumns: 8,
      scrollDetailsValueColumnFromRight: 6,
      metaHeadingColumns: 2,
      metaValueColumns: 10,
      metaGapColumns: 0,
      labelPanelColumns: 6,
    };
  }
  return {
    tier: "wide",
    metaBelowImage: false,
    labelNavStacked: false,
    definitionColumns: 14,
    definitionColumnFromRight: 6,
    imageColumns: 11,
    imageColumnFromRight: 4,
    detailsImageColumns: 9,
    detailsImageColumnFromRight: 13,
    scrollDetailsHeadingColumns: 2,
    scrollDetailsValueColumns: 6,
    scrollDetailsValueColumnFromRight: 6,
    metaHeadingColumns: 2,
    metaValueColumns: 14,
    metaGapColumns: 2,
    labelPanelColumns: 5,
  };
}

export function syncTermPageResponsiveVars(viewportEl, viewportWidth, viewportHeight) {
  const tier = getTermPageLayoutTier(viewportWidth);
  const root = document.documentElement;
  const band = getTermPageTitleBandHeightPx(viewportHeight);
  const baseline = getTermPageTitleBaselineInsetPx(viewportHeight);
  const blockGap = getTermPageScrollBlockGapPx(viewportHeight);

  root.style.setProperty("--term-page-title-band-height", `${band}px`);
  root.style.setProperty("--term-page-title-baseline-inset", `${baseline}px`);
  root.style.setProperty("--term-page-scroll-block-gap", `${blockGap}px`);
  root.style.setProperty(
    "--term-page-scroll-image-height-factor",
    String(getTermPageScrollImageHeightFactor(tier))
  );
  root.style.setProperty(
    "--term-page-block-gap",
    `${Math.round(36 * getViewportHeightScale(viewportHeight))}px`
  );

  viewportEl?.classList.toggle("is-term-scroll-compact", tier === "compact");
  viewportEl?.classList.toggle("is-term-scroll-narrow", tier === "narrow");
  viewportEl?.classList.toggle("is-term-scroll-wide", tier === "wide");
}

export function resolveTermPageScrollTopAfterResize({
  scrollTop,
  prevHeight,
  nextHeight,
  getPinSnap,
}) {
  if (scrollTop <= 0.5) return 0;

  const prevPin = getPinSnap(prevHeight);
  const nextPin = getPinSnap(nextHeight);

  if (scrollTop <= prevPin + 0.5) {
    if (prevPin <= 0.5) return 0;
    return Math.round((scrollTop / prevPin) * nextPin);
  }

  return Math.round(nextPin + (scrollTop - prevPin));
}
