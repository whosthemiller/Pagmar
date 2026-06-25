/** Responsive metrics and column tiers for the scrollable term page. */

export const TERM_PAGE_RESPONSIVE = {
  compactMaxWidth: 640,
  narrowMaxWidth: 900,
  titleBand: { min: 180, ratio: 0.255, max: 280 },
  titleBaseline: { min: 152, ratio: 0.22, max: 240 },
  /** How far the bleed image extends below the title baseline into the band (px). */
  bleedImageBandOverlap: { min: 32, ratio: 0.048, max: 64 },
  /** Gap between definition and inline image (fold 2). */
  scrollDefinitionImageGap: { min: 56, ratio: 0.128, max: 132 },
  /** Gap before fold 3 (details image + labels). */
  scrollBlockGap: { min: 112, ratio: 0.213, max: 220 },
  scrollContentOffsetY: { min: 12, ratio: 0.022, max: 28 },
  groupPinExtraRise: { min: 28, ratio: 0.044, max: 52 },
  scrollPaddingBottom: { min: 100, ratio: 0.155, max: 160 },
  metaBelowImageGap: { min: 20, ratio: 0.032, max: 36 },
  fold2ChapterMinRatio: 0.48,
  /** Minimum fold-3 chapter height as a fraction of viewport height. */
  fold3ChapterMinRatio: 0.48,
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
  return scaleFromViewport(TERM_PAGE_RESPONSIVE.titleBand, viewportHeight);
}

export function getBleedImageBandOverlapPx(viewportHeight) {
  return scaleFromViewport(TERM_PAGE_RESPONSIVE.bleedImageBandOverlap, viewportHeight);
}

export function getTermPageTitleBaselineInsetPx(viewportHeight) {
  return scaleFromViewport(TERM_PAGE_RESPONSIVE.titleBaseline, viewportHeight);
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

export function getTermPageFold2ChapterMinPx(viewportHeight) {
  return Math.round(viewportHeight * TERM_PAGE_RESPONSIVE.fold2ChapterMinRatio);
}

export function getTermPageFold3ChapterMinPx(viewportHeight) {
  return Math.round(viewportHeight * TERM_PAGE_RESPONSIVE.fold3ChapterMinRatio);
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
      labelPanelColumns: 5,
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
    labelPanelColumns: 4,
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
