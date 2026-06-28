import {
  buildDefinitionMentionPatterns,
  collectTermImageUrls,
  enqueueTermImagePreload,
  boostTermImagePreloadPriority,
  getPreloadedTermImage,
  groupTermsByObject,
  swapGroupsByObjectId,
  loadSemanticData,
  loadTermImages,
  registerPreloadedTermImage,
} from "./data-model.js";
import {
  getTermTextPrefs,
  loadBleedTextPrefs,
  resolveTextInvert,
} from "./bleed-text-prefs.js";
import { applyBlockTypography, applyTypographyRules } from "./typography.js";
import { annotateDefinitionMentions } from "./wiki-keywords.js";
import {
  initSunFilterTest,
  applySunFilterTestOpacity,
  applyCensorFilterDimension,
  setOverviewSubMode,
} from "./sun-filter-test.js";
import { createOverviewGeometry, computeOverviewSpinOffset } from "./sun-overview-geometry.js";
import { buildTermYearIndex, getTimelineBounds, getTermOpacity } from "./term-year-index.js";
import { createYearScrollController, isWheelNotch } from "./sun-year-scroll.js";
import { loadTimelineEvents } from "./timeline-events.js";
import {
  dismissTimelineScrollHint,
  hideTimelineEventHint,
  hideTimelineScrollHint,
  initSunTimelineHint,
  repositionTimelineEventHint,
  resetTimelineScrollHint,
  syncTimelineEventHint,
  syncTimelineScrollHint,
} from "./sun-timeline-hint.js";
import {
  bindLetterShuffleDelegation,
  getLetterShuffleOriginal,
  initLetterShuffle,
  playAnnotatedTypewriterScrambleTo,
  playLightLetterShuffleTo,
  playLightTypewriterScrambleTo,
  settleFromContinuousScramble,
  startContinuousScramble,
  startLetterShuffle,
  stopContinuousScramble,
  stopLetterShuffle,
} from "./letter-shuffle.js";
import {
  initSunTermsIndex,
  showSunTermsIndex,
  hideSunTermsIndex,
  isSunTermsIndexVisible,
  setSunTermsIndexGridRebuildGuard,
} from "./sun-terms-index.js";
import {
  initSunAbout,
  showSunAbout,
  hideSunAbout,
  isSunAboutVisible,
  playSunAboutExitScramble,
} from "./sun-about.js";
import {
  initSunOverviewTermsGrid,
  showSunOverviewTermsGrid,
  hideSunOverviewTermsGrid,
  setSunOverviewTermsGridRebuildGuard,
} from "./sun-overview-terms-grid.js";
import {
  runPageNavScrambleTransition,
  isPageNavTransitionActive,
  isIndexEnterScrambleActive,
  cancelPageNavScramble,
  runNavEnterScramble,
  runNavTypewriterEnter,
  maintainEnterScramble,
  PAGE_ROUTE_TIMING,
  PAGE_TIMELINE_ENTER_TIMING,
  PAGE_TIMELINE_EXIT_TIMING,
} from "./page-nav-scramble.js";
import {
  initSiteNav,
  revealSiteNav,
  NAV_STORAGE_KEY,
  syncSiteNavFromMap,
  TERM_STORAGE_KEY,
} from "./site-nav.js";
import {
  abortFontScrambleTransition,
  estimateFontScrambleDuration,
  estimateFontScrambleSecoloStartMs,
  getFontScrambleAnchorHeight,
  getFontScrambleBaselineInset,
  getMountedTermScreenBaselineY,
  initFontScrambleTransitions,
  mountFontScrambleTerm,
  playFontScrambleTextSwitch,
  playFontScrambleTransition,
  setFontScrambleScale,
} from "./font-scramble-transitions.js";
import {
  GRID,
  getGridColumnLeft,
  getGridColumnRight,
  getGridAlignAnchorX,
  getGridMetrics,
  getGridSpanBounds,
  getGridSpanFromLeft,
  measureGridCssColumnSpan,
  syncGridCssVars,
} from "./grid-metrics.js";
import {
  getTermPageFold2ChapterMinPx,
  getTermPageFold3ChapterMinPx,
  getTermPageGroupPinExtraRisePx,
  getTermPageMetaBelowImageGapPx,
  getTermPageScrollBlockGapPx,
  getTermPageScrollDefinitionImageGapPx,
  getTermPageScrollContentOffsetYpx,
  getTermPageScrollImageHeightFactor,
  getTermPageScrollImageMinHeightPx,
  getTermPageScrollLayoutConfig,
  getTermPageScrollPaddingBottomPx,
  getTermPageTitleBandHeightPx,
  getTermPageTitleBaselineInsetPx,
  getBleedImageBandOverlapPx,
  resolveTermPageScrollTopAfterResize,
  syncTermPageResponsiveVars,
} from "./term-page-responsive.js";
import {
  VIEWPORT_DESIGN,
  getMapTypographyScale,
  getOverviewTypographyScale,
  getResponsiveGridLayout,
  scaleLayoutPx,
} from "./viewport-layout.js";

const APP_ROOT = new URL("../", import.meta.url);

/** Set to true to restore definition, images, meta, and label rows on the term page. */
const TERM_PAGE_LEGACY_CONTENT_ENABLED = false;
/** Scrollable full-screen background on the bleed term page (covers the fixed image). */
const TERM_PAGE_SCROLL_BG_ENABLED = true;
/** Set to true to restore the mini sun back-circle on the term page. */
const TERM_PAGE_BACK_MINI_SUN_ENABLED = false;
/** Typewriter delete + rewrite for Roobert → Secolo on the term page. */
const TERM_FONT_SCRAMBLE_MODE = "typewriter-erase";
const TERM_SIMILAR_LABEL_TEXT = "מונחים דומים:";

/** Relative weights for the unified loading work counter (not displayed to the user). */
const LOADING_WORK_WEIGHT = {
  dataFetch: 4,
  setup: 6,
  image: 1,
  rebuild: 40,
  titleRow: 8,
  warmImage: 8,
  finish: 6,
};

/** Millisecond estimates mirrored from init() — used only to derive a constant bar rate. */
const LOADING_ESTIMATE_MS = {
  dataFetch: 2000,
  setup: [1400, 900],
  rebuild: 5000,
  titleRow: 500,
  warmImage: 800,
  buffer: 1500,
};

const LOADING_BAR_CAP_BEFORE_DONE = 0.94;
/** Minimum time the censor intro stays visible before revealing the splash. */
const LOADING_MIN_VISIBLE_MS = 2200;

const loadingWork = {
  total: 1,
  done: 0,
  display: 0,
  displayRate: 0.94 / 10000,
  label: "טוען נתונים…",
  raf: 0,
  rafLastTime: 0,
  startedAt: 0,
};

function computeLoadingEstimatedMs(setupSteps = 2) {
  const setupMs = LOADING_ESTIMATE_MS.setup
    .slice(0, setupSteps)
    .reduce((sum, ms) => sum + ms, 0);
  return (
    LOADING_ESTIMATE_MS.dataFetch +
    setupMs +
    LOADING_ESTIMATE_MS.rebuild +
    LOADING_ESTIMATE_MS.titleRow +
    LOADING_ESTIMATE_MS.warmImage +
    LOADING_ESTIMATE_MS.buffer
  );
}

function resetLoadingWork(setupSteps = 2) {
  loadingWork.total =
    LOADING_WORK_WEIGHT.dataFetch * 2 +
    LOADING_WORK_WEIGHT.setup * setupSteps +
    LOADING_WORK_WEIGHT.rebuild +
    LOADING_WORK_WEIGHT.titleRow +
    LOADING_WORK_WEIGHT.warmImage +
    LOADING_WORK_WEIGHT.finish;
  loadingWork.done = 0;
  const estimatedMs = computeLoadingEstimatedMs(setupSteps);
  loadingWork.displayRate = LOADING_BAR_CAP_BEFORE_DONE / estimatedMs;
}

function setLoadingWorkLabel(label) {
  if (label) loadingWork.label = label;
  ensureLoadingDisplayTick();
}

function advanceLoadingWork(weight, label) {
  loadingWork.done = Math.min(loadingWork.done + weight, loadingWork.total);
  setLoadingWorkLabel(label);
}

function yieldToMain() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function beginLoadingSegment(label, weight) {
  const startDone = loadingWork.done;
  if (label) loadingWork.label = label;
  ensureLoadingDisplayTick();

  return () => {
    loadingWork.done = Math.min(startDone + weight, loadingWork.total);
    setLoadingWorkLabel(label);
  };
}

function runLoadingSegment(label, weight, _estimateMs, fn) {
  const finish = beginLoadingSegment(label, weight);
  try {
    return fn();
  } finally {
    finish();
  }
}

async function runLoadingSegmentAsync(label, weight, _estimateMs, fn) {
  const finish = beginLoadingSegment(label, weight);
  try {
    return await fn();
  } finally {
    finish();
  }
}

function stopLoadingDisplayTick() {
  if (!loadingWork.raf) return;
  cancelAnimationFrame(loadingWork.raf);
  loadingWork.raf = 0;
  loadingWork.rafLastTime = 0;
}

/** Keep the censor intro visible for at least LOADING_MIN_VISIBLE_MS. */
function waitForLoadingMinimum() {
  const start = loadingWork.startedAt || performance.now();
  stopLoadingDisplayTick();

  return new Promise((resolve) => {
    const step = (now) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / LOADING_MIN_VISIBLE_MS);
      loadingWork.display = t;
      updateLoadingProgress(t);

      if (elapsed < LOADING_MIN_VISIBLE_MS) {
        requestAnimationFrame(step);
      } else {
        loadingWork.display = 1;
        updateLoadingProgress(1);
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

function ensureLoadingDisplayTick() {
  if (loadingWork.raf) return;

  const tick = (now) => {
    if (!loadingWork.rafLastTime) loadingWork.rafLastTime = now;
    const dt = now - loadingWork.rafLastTime;
    loadingWork.rafLastTime = now;

    const maxDisplay =
      loadingWork.done >= loadingWork.total ? 1 : LOADING_BAR_CAP_BEFORE_DONE;
    if (loadingWork.display < maxDisplay) {
      loadingWork.display = Math.min(
        maxDisplay,
        loadingWork.display + loadingWork.displayRate * dt
      );
    }
    updateLoadingProgress(loadingWork.display, loadingWork.label);

    const stillLoading = loadingWork.done < loadingWork.total;
    if (stillLoading || loadingWork.display < 1) {
      loadingWork.raf = requestAnimationFrame(tick);
    } else {
      loadingWork.raf = 0;
      loadingWork.rafLastTime = 0;
    }
  };

  loadingWork.raf = requestAnimationFrame(tick);
}

const LETTER_SHUFFLE_DELEGATION_SELECTOR = [
  ".sun-def-mention--external",
  ".sun-term-meta__tag",
  ".sun-term-meta__value[data-meta-filter-key]",
  ".sun-term-page__label-nav-text",
].join(", ");

function getLetterShuffleTarget(el) {
  if (!(el instanceof Element)) return null;
  if (el.matches(".sun-term, .sun-def-mention, .sun-term-meta__tag, .sun-term-meta__value")) {
    return el;
  }
  return el.querySelector(".sun-term");
}


const LAYOUT = {
  arcRadiusScale: 1.245,
  rayCount: 0, // set after load — used for fixed arc spacing
  termGap: 22,
  fontSize: 30,
  charWidth: 20,
  scrollSensitivity: 0.014,
  scrollFineThresholdPx: 45,
  scrollAccelFactor: 0.000022,
  scrollMaxAccel: 12,
  scrollBurstWindowMs: 85,
  scrollBurstBoost: 2,
  /** Viscous drag (1/s) — higher = heavier roulette, slows sooner. */
  scrollDragLinear: 13,
  /** Speed-proportional drag — extra braking while still spinning fast. */
  scrollDragQuadratic: 4.5,
  scrollMomentumMinVelocity: 0.00065,
  scrollMomentumMaxVelocity: 1.4,
  scrollMomentumBlend: 0.72,
  /** Dead band around midpoint — prevents flip-flop between two snap rows. */
  scrollSnapTieBand: 0.06,
  /** Hand off to easeRoulette snap once coast speed drops below this. */
  scrollMomentumHandoffVelocity: 0.018,
  scrollCoastDelayMs: 22,
  scrollCoastStartMs: 10,
  /** Very gentle home-view sun drift (scrollOffset units per second). */
  idleRotateSpeed: 0.05,
  /** Delay before idle drift resumes after mouse/scroll activity stops. */
  idleRotateRestartDelayMs: 1200,
  snapDurationMs: 1050,
  snapDebounceMs: 140,
  snapOvershoot: 5.8,
  overviewHitRadiusNormal: 0.86,
  overviewHitRadiusOverview: 0.58,
  /**
   * Duration (ms) of the overview/timeline zoom. Driven by an ease-in-out tween
   * (gentle start + gentle stop) instead of a frame-based lerp, so the larger
   * timeline ring doesn't whip its labels around on entry. Lower = snappier.
   */
  overviewTweenMs: 600,
  overviewRadiusFactor: 0.38,
  overviewRadiusScale: 0.92,
  /** Vertical nudge for tags overview (makes room for the terms grid). */
  overviewCyOffset: 44,
  /** Horizontal nudge for tags overview; negative = left. */
  overviewCxOffset: -120,
  /** Timeline overview — centered, slightly lower, larger circle. */
  timelineCxOffset: 0,
  timelineCyOffset: 28,
  timelineRadiusScale: 1.18,
  /** Extra clockwise rotation for overview layout (degrees). */
  overviewSpinExtraDeg: 60,
  overviewMinRayArcPx: 19,
  overviewMargin: 12,
  overviewFontSize: 20,
  overviewMinContentScale: 0.72,
  overviewOverflowStep: 0.04,
  timelineStartYear: 1900,
  focusRowTopRefPx: 80,
  focusRowTopRefHeight: 900,
  /** Empty band below the term-page bleed image (px). */
  termPageTitleBandHeight: 230,
  /** Distance from the top of the title band to the shared term baseline (px). */
  termPageTitleBaselineInset: 198,
  /** Small downward nudge for the whole Secolo title row (animation + settled). */
  termPageTitleBaselineNudgePx: 0,
  /**
   * Downward nudge applied ONLY to the Secolo title glyphs (animation + settled),
   * without moving the censored sibling bars / similar-terms label. Positive = down.
   */
  termPageSecoloTitleNudgePx: 12,
  /** Extra height below pinned title + nav backdrop (px). */
  termPageHeaderBackdropBottomExtra: 20,
  /** Extra downward offset when the title group pins below site nav (px). */
  termPageGroupPinBelowNavExtra: 0,
  /** Extra smooth scroll rise after the bleed image is fully covered (px). */
  termPageGroupPinExtraRisePx: 40,
  /** Debounce before settling term-page scroll to pinned / unpinned. */
  termPagePinSnapDebounceMs: 150,
  /** Animated settle duration for term-page pin snap (ms). */
  termPagePinSnapDurationMs: 280,
  /** Past this fraction of the pin span, settle to the sticky header position. */
  termPagePinSnapCommitFrac: 0.32,
  /** Fold-1 (definition) commit threshold — higher = less eager snap. */
  termPageFold1SnapCommitFrac: 0.5,
  /** Fold-1 settle duration — longer than other snaps for a softer landing. */
  termPageFold1SnapDurationMs: 440,
  /** Below this scroll distance (px), pin snap applies instantly. */
  termPagePinSnapInstantPx: 36,
  termPageSelectedFontSize: 144,
  termPageSimilarLabelGap: 8,
  /** Viewport X of censored row right edge: Z (Secolo bbox min-x) minus this value. */
  termPageCensoredRightFromZ: 30,
  /** Extra clearance (px) while the title grows during font scramble. */
  termPageCensoredPushSlack: 28,
  /** Duration for censored-row push during the Secolo phase of font scramble (ms). */
  termPageCensoredPushMs: 480,
  /** Width of the censored-sibling band — same grid span as the title-row image columns. */
  termPageCensoredRowColumns: 2,
  /** Vertical gap between wrapped censored-sibling rows (px). */
  termPageCensoredWrapRowGap: 8,
  focusRiseMs: 600,
  focusExitMs: 800,
  /** Re-pack the title row back to even arc spacing before the rise starts (ms). */
  focusUnfocusReflowMs: 300,
  focusReorderMs: 720,
  focusReorderMsFew: 520,
  focusReorderMsMultiFew: 400,
  focusReorderMsMulti: 500,
  /** Per-extra-term speed-up for many-term carousels (> 3 terms). */
  focusReorderMultiSpeedStep: 0.05,
  /** Floor for the many-term carousel speed-up factor. */
  focusReorderMultiSpeedMin: 0.75,
  focusExitExtraFactor: 0.65,
  focusGatePad: 12,
  focusCarouselExitEnd: 0.5,
  focusCarouselEnterStart: 0.5,
  focusCarouselStrokePad: 6,
  focusExitMagnitude: 4.5,
  /** Stronger scatter for mini sun so rays fully leave the viewport on exit. */
  backMiniExitMagnitude: 14.5,
  focusExitFadeMargin: 48,
  /** Longest mini-ray reaches the left edge of this column (counting from the right). */
  backCircleAlignColumnFromRight: 1,
  backCircleFadeMs: 1180,
  backCircleHitInset: 4,
  termPageColumns: 12,
  /** Scroll-content definition — 14 cols, 2 cols left of the title column. */
  termPageScrollDefinitionColumns: 14,
  termPageScrollDefinitionColumnFromRight: 6,
  /** Scroll-content inline image — 11 cols in the title column. */
  termPageScrollImageColumns: 11,
  termPageScrollImageColumnFromRight: 4,
  /** Scroll-content inline image height as a fraction of viewport height. */
  termPageScrollImageHeightFactor: 0.40,
  /** Vertical gap between scroll-content blocks (definition→image2/meta, image2→details). */
  termPageScrollBlockGap: 192,
  termPageScrollDetailsRowGap: 22,
  /** מדגיש / מטשטש heading width in grid columns (aligned to image column). */
  termPageScrollDetailsHeadingColumns: 2,
  /** מדגיש / מטשטש body width in grid columns (left of heading). */
  termPageScrollDetailsValueColumns: 6,
  /** Unused image beside מדגיש — cols 13–21 (shifted 3 cols left, same left edge as before). */
  termPageDetailsImageColumns: 9,
  termPageDetailsImageColumnFromRight: 13,
  /** Gap below the third image before the label-nav headings row (px). */
  termPageLabelNavGapBelowImage: 40,
  /** Horizontal gap between label-nav heading items (px). */
  termPageLabelNavItemGap: 10,
  /** Label-nav inline panel width (grid columns). */
  termPageLabelPanelColumns: 4,
  /** Gap between a label heading and its panel (px). */
  termPageLabelPanelGap: 10,
  /** Nudge the scroll-content block (definition, image, meta) downward. */
  termPageScrollContentOffsetY: 30,
  /** Empty grid columns between the inline image and the meta block. */
  termPageScrollMetaGapColumns: 2,
  termPageScrollMetaHeadingColumns: 2,
  /** Meta value content — up to 14 cols, anchored right of the heading block. */
  termPageScrollMetaValueColumns: 14,
  termPageDefinitionColumnFromRight: 5,
  termPageSideColumns: 5,
  termPageEmphasizesColumnFromRight: 15,
  termPageObscuresColumnFromRight: 9,
  termPageGapBelowTitle: 16,
  termPageLabelHeadingColumnFromRight: 9,
  termPageLabelHeadingColumns: 1,
  termPageLabelContentColumnFromRight: 11,
  termPageLabelContentColumns: 9,
  /** Term-page bleed caption — CSS cols 19–24 (6 columns). */
  termPageBleedCaptionStartCssColumn: 24,
  termPageBleedCaptionEndCssColumn: 19,
  /** Extra width slack so glyph edges are not clipped by overflow rounding. */
  termHoverCaptionWidthSlack: 2,
  termPageImagesColumnFromRight: 4,
  termPageImagesColumns: 4,
  termPageImageCaptionColumns: 6,
  termPageImageCaptionColumnFromRight: 6,
  termPageImageCount: 3,
  termPageImageHeight: 155,
  termPageBlockGap: 36,
  termPageBottomMargin: 24,
  termPageScrollPaddingBottom: 140,
  termMetaHeadingColumnFromLeft: 5,
  termMetaValueColumnFromLeft: 3,
  termMetaHeadingColumns: 2,
  termMetaValueColumns: 3,
  termMetaRowGap: 22,
  titleRowImageColumns: 2,
  /** Active-row fixed thumbnail width in grid columns (slightly larger than inline hover). */
  titleRowFixedImageColumns: 3,
  titleRowInlineGap: 32,
  titleRowInlinePushMs: 350,
  /** Max downscale factor at the start of inline title-row image reveal (1 = full quality). */
  titleRowInlinePixelMaxFactor: 20,
  /** Full-bleed only when cover upscale stays relatively low (higher source quality). */
  titleRowBleedMaxUpscale: 1.65,
  /** Reject small thumbnails for full-bleed surfaces. */
  titleRowBleedMinShortEdge: 560,
  /** Per-pixel effective luminance below this counts as dark. */
  titleRowBleedDarkLuminanceThreshold: 0.37,
  /** Share of sampled pixels that must be dark to invert UI text. */
  titleRowBleedDarkPixelRatio: 0.5,
  /** Mean effective luminance must stay below this (guards medium-bright images). */
  titleRowBleedDarkMeanThreshold: 0.41,
  /** Vertical padding around the active title-row text band when sampling. */
  titleRowBleedDarkSamplePadY: 12,
  /** Downsample size for bleed darkness sampling (cover crop of the viewport). */
  titleRowBleedDarkSampleSize: 48,
  /** Require at least one full-bleed term in every adjacent 2-row block. */
  titleRowBleedRowsPerBlock: 2,
  /** One fixed row thumbnail about every N rays (typically 5–7). */
  titleRowFixedRayInterval: 6,
  /** Pixel block size for the active-row fixed thumbnail (higher = larger pixels). */
  titleRowFixedPixelMaxFactor: 24,
  /** Hover-gallery experiment: interval between idle background slides. */
  idleGalleryIntervalMs: 3000,
  /** Hover-gallery experiment: slide transition duration. */
  idleGalleryTransitionMs: 380,
  /** Hover-gallery experiment: resting-state pixel block size (higher = larger pixels). */
  idleGalleryPixelMaxFactor: 24,
  /** Max reveal during idle slide transition (0–1); kept low so full quality never shows. */
  idleGalleryPixelTransitionPeak: 0.38,
  /** Hover-gallery experiment: hover image-change pixel block size at start. */
  idleGalleryHoverPixelMaxFactor: 40,
  /** Hover-gallery experiment: hover image-change transition duration. */
  idleGalleryHoverTransitionMs: 380,
  /** Fixed thumbnail hide — reverse pixel transition; faster than bleed reveal. */
  titleRowFixedHideTransitionMs: 180,
  /** Active-row image swap — fast pixel glitch (ms). */
  titleRowImageSwapTransitionMs: 150,
  /** Peak pixel block size during active-row image glitch. */
  titleRowImageSwapPixelMaxFactor: 38,
  /** Hold beat at max glitch (0–1 of transition) before resolving. */
  titleRowImageSwapGlitchHold: 0.38,
  /** Term-page entry bleed reveal — slower smooth resolve (not the hover glitch hold). */
  termPageBleedRevealTransitionMs: 450,
};

/** Ray position swaps — [objectIdA, objectIdB] exchange slots on the sun. */
const SUN_GROUP_POSITION_SWAPS = [
  ["OBJ-14", "OBJ-41"], // גירוש/התנתקות ↔ עיירות פריפריה/פיתוח
  ["OBJ-8", "OBJ-37"], // המגזר הערבי ↔ סיוע הומניטרי
  ["OBJ-4", "OBJ-21"], // מאחזים בלתי חוקיים ↔ פרעות תרפ״ט
  ["OBJ-3", "OBJ-44"], // פלסטין/יהודה ושומרון ↔ סגר/מצור
  ["OBJ-30", "OBJ-40"], // שמאלנים… ↔ הקו הירוק…
];

/** Compressed timings for term-page → home unfocus. */
const UNFOCUS_TIMING = {
  reflowMs: 140,
  riseMs: 380,
  exitMs: 480,
  backCircleFadeMs: 520,
};

/** Compressed timings for in-page term-to-term navigation. */
const TERM_NAV_TIMING = {
  exitRiseMs: 280,
  exitFadeMs: 320,
  backCircleFadeMs: 360,
  /** Min snap duration when the target row is adjacent (1 row away). */
  snapMsMin: 420,
  /** Extra snap time per scroll row beyond the first. */
  snapMsPerRow: 88,
  /** Upper bound for cross-row term navigation snap. */
  snapMsMax: 1380,
  focusExitMs: 300,
  focusRiseMs: 320,
  reorderScale: 0.55,
  /** Same-object title-row carousel speed multiplier (< 1 = faster). */
  sameGroupSwitchScale: 0.75,
  /** Scroll term page to top before same-group term switch. */
  scrollResetMs: 320,
};

const viewport = document.getElementById("sun-viewport");
const scrollSpacerEl = document.getElementById("sun-scroll-spacer");
const termScrollBgEl = document.getElementById("sun-term-scroll-bg");
const svgEl = document.getElementById("sun-svg");
const backFixedEl = document.getElementById("sun-back-fixed");
const loadingEl = document.getElementById("sun-loading");
const loadingLabelEl = loadingEl?.querySelector(".sun-loading__label");
const loadingBarFillEl = document.getElementById("sun-loading-bar-fill");
const loadingProgressEl = document.getElementById("sun-loading-progress");
const errorEl = document.getElementById("sun-error");
const gridEl = document.getElementById("sun-grid");
const termPageEl = document.getElementById("sun-term-page");
const termDefinitionEl = termPageEl?.querySelector(".sun-term-page__definition");
const termDetailsEl = termPageEl?.querySelector(".sun-term-page__details");
const termEmphasizesEl = termPageEl?.querySelector(".sun-term-page__emphasizes");
const termEmphasizesTextEl = termPageEl?.querySelector(".sun-term-page__emphasizes-text");
const termObscuresEl = termPageEl?.querySelector(".sun-term-page__obscures");
const termObscuresTextEl = termPageEl?.querySelector(".sun-term-page__obscures-text");
const termUsersEl = termPageEl?.querySelector(".sun-term-page__users");
const termContextsEl = termPageEl?.querySelector(".sun-term-page__contexts");
const termPeriodEl = termPageEl?.querySelector(".sun-term-page__period");
const termImagesEl = termPageEl?.querySelector(".sun-term-page__images");
const termDetailsImageEl = document.getElementById("sun-term-details-image");
const termLabelNavEl = document.getElementById("sun-term-label-nav");
const termMetaEl = document.getElementById("sun-term-meta");
const termSimilarLabelWrapEl = document.getElementById("sun-term-similar-label-wrap");
const termHeaderBackdropEl = document.getElementById("sun-term-header-backdrop");
const termSimilarLabelEl = document.getElementById("sun-term-similar-label");

const termFontOverlayEl = document.getElementById("sun-term-font-overlay");
const termFontOverlayTermEl = document.getElementById("sun-term-font-overlay-term");
const termBleedCaptionEl = document.getElementById("sun-term-bleed-caption");
const termMetaTypeEl = termMetaEl?.querySelector(".sun-term-meta__type");
const termMetaFramingEl = termMetaEl?.querySelector(".sun-term-meta__framing");
const termMetaConnotationEl = termMetaEl?.querySelector(".sun-term-meta__connotation");
const titleRowImageEl = document.getElementById("sun-title-row-image");
const titleRowImageImgEl = titleRowImageEl?.querySelector(".sun-title-row-image__img");
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
/** @type {HTMLCanvasElement | null} */
let titleRowImagePixelCanvasEl = null;
/** @type {HTMLCanvasElement | null} */
let bleedBackdropPixelCanvasEl = null;
/** @type {HTMLCanvasElement | null} */
let imagePixelOffscreenEl = null;
/** @type {Map<string, string>} */
const pixelatedFixedImageCache = new Map();
/** @type {Set<string>} */
const pixelatedFixedImagePending = new Set();
/** @type {HTMLImageElement | null} */
let fixedRowImageLoaderEl = null;
/** @type {number | null} */
let bleedPixelAnimFrame = null;
/** @type {number | null} */
let fixedThumbHideAnimFrame = null;
/** @type {{ key: string, start: number } | null} */
let activeRowImageGlitch = null;
/** @type {string | null} */
let activeRowFixedImageKey = null;
let titleRowBleedRevealPending = false;
let titleRowBleedRevealPendingSession = -1;
/** @type {string | null} */
let pendingTitleRowBleedImageUrl = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let idleGalleryTimer = null;
let idleGalleryIndex = 0;
/** @type {string[]} */
let idleGalleryUrls = [];
let idleGalleryPaused = false;
let idleGalleryActive = false;
let idleGalleryGroupIndex = -1;
const bleedBackdropEl = document.getElementById("sun-bleed-backdrop");
const bleedBackdropImgEl = bleedBackdropEl?.querySelector(".sun-bleed-backdrop__img");
let groups = [];
/** @type {Map<string, string[]>} */
let termImagesByName = new Map();
/** @type {{ phrase: string, termId: string, objectId: string }[]} */
let termMentionPatterns = [];
let activeIndex = 0;
let scrollOffset = 0;
let overviewSpinOffset = 0;
let wheelBound = false;
/** Wheel delta from splash dismiss, applied once the arc scroll handler is ready. */
let pendingSplashWheelDelta = null;
let currentLayout = null;
// Fraction of the free space below the pinned header used as the top gap when
// resting fold 3: 0.5 = dead centre, smaller = image higher. Live-tunable via
// the `?foldTune` overlay (arrow keys), then baked in here.
let termPageFold3CentreFrac = 0.39;
let isSnapping = false;
let snapAnimFrame = null;
let snapDebounceTimer = null;
let scrollVelocity = 0;
let momentumFrame = null;
let lastWheelAt = 0;
let wheelBurstEnergy = 0;
let lastWheelWasNotch = false;
/** Locked snap row for coast/settle — avoids oscillation between two adjacent rows. */
let settleSnapIndex = null;
/** Snap row locked for the easeRoulette settle animation. */
let snapAnimTargetIndex = null;
let overviewProgress = 0;

function resolveLayoutOverview(layout = currentLayout) {
  return layout?.overview ?? overviewProgress ?? 0;
}

function refreshMapLayoutFromViewport() {
  if (!viewport) return;
  currentLayout = computeLayout(viewport.clientWidth, viewport.clientHeight);
}
let overviewTarget = 0;
let overviewAnimFrame = null;
/** Time-based overview zoom tween state (eased start/stop, set on each retarget). */
let overviewAnimStartTime = 0;
let overviewAnimFromProgress = 0;
/** @type {{ key: string, value: string } | null} */
let pendingOverviewCensorFilter = null;
/** @type {"filter" | "timeline" | null} */
let pendingOverviewMode = null;
let pendingTermsIndex = false;
let pendingAbout = false;
/** @type {(() => void) | null} */
let pendingAfterHome = null;
/** @type {"filter" | "timeline"} */
let overviewSubMode = "filter";
/** @type {Map<string, { startYear: number, endYear: number }>} */
let termYearIndex = new Map();
let timelineMinYear = 1900;
let timelineMaxYear = new Date().getFullYear();
/** @type {ReturnType<typeof createYearScrollController> | null} */
let yearScroll = null;
let lastPointer = { x: 0, y: 0, known: false };
let idleRotateFrame = null;
let idleRotateBound = false;
let idleRotateLastFrameAt = 0;
let lastUserActivityAt = 0;
let hoveredRay = null;
let hoveredWrap = null;
/**
 * Term hover stays disarmed until the pointer genuinely moves. When the map
 * first appears under a stationary cursor, the browser fires `mouseover` over
 * whatever term sits beneath the pointer (without any `mousemove`), which would
 * reveal a censored term the user never intentionally pointed at. We only honor
 * hover after a real pointer movement, and re-disarm on each home entrance.
 */
let termHoverArmed = false;
/** @type {null | {
 *   phase: 'animating' | 'locked' | 'switch-exiting' | 'switching' | 'switch-entering' | 'unfocusing',
 *   direction: 'in' | 'out',
 *   activeIndex: number,
 *   clickedIndex: number,
 *   switchTargetIndex?: number,
 *   switchCarouselSteps?: number,
 *   switchFromSlots?: number[],
 *   startTime: number,
 *   riseT: number,
 *   exitT: number,
 *   backCircleT: number,
 *   backMiniExitT: number,
 *   backCircleStartTime: number,
 *   riseStartY: number,
 *   termStartXs: number[],
 *   termEndXs: number[],
 *   termWidths: number[],
 *   termGap: number,
 *   exitX: number,
 *   enterX: number,
 *   exitGateX: number,
 *   entryGateX: number,
 *   outwardSign: number,
 *   textAnchor: string,
 * }} */
let focusState = null;
/** Preserves focus term layout on the arc after unfocus completes. */
let arcTermLayout = null;
let focusAnimFrame = null;
let backCircleAnimFrame = null;
/** @type {(() => void) | null} */
let backCircleOutComplete = null;
let termScrollResetFrame = null;
let termPagePinSnapFrame = null;
let termPagePinSnapDebounceTimer = null;
/** Last scroll direction in the pin zone: -1 up, 1 down, 0 unknown. */
let termPagePinScrollDir = 0;
/** Fine trackpad deltas apply directly; mouse notches smooth via rAF. */
const TERM_PAGE_WHEEL_FINE_MAX = 40;
/** Ignore opposing trackpad noise while a pin snap is settling. */
const TERM_PAGE_PIN_SNAP_INTERRUPT_MIN = 14;
let termPageWheelPending = 0;
let termPageWheelSmoothFrame = null;
let termPagePrevScrollTop = 0;
/** Locked settle target while `termPagePinSnapFrame` is active. */
let termPagePinSnapLockedTarget = null;

/** @type {Map<string, { groupIndex: number, termIndex: number }>} */
let termLocationById = new Map();

const isBleedTextLabMode = () => Boolean(globalThis.__SUN_BLEED_LAB__);

/** Live preview overrides from bleed-text-lab (term name → prefs + image). */
/** @type {null | { termName: string, imageUrl: string | null, navText: string, titleRowText: string }} */
let bleedTextLabPreview = null;
/** @type {null | { phase: 'exiting' | 'snapping' | 'entering', sourceGroupIndex: number, targetGroupIndex: number, targetTermIndex: number }} */
let termNavState = null;
/** Measured mini back-circle term widths — avoids post-animation position jump. */
/** @type {Map<number, number[]> | null} */
let backMiniWidthCache = null;
let backMiniWidthCacheKey = "";
let termPageSelectedFontSettled = false;
let termPageBleedTermId = null;
/** Hover bleed image carried into term-page focus (same asset, bottom clip only). */
let termPageBleedCarryImage = null;
/** Primary bleed image for the active term page (shared with backdrop + first image slot). */
let termPageBleedImage = null;
let termPageFontScrambleToken = 0;
let termSimilarLabelScrambleStarted = false;
/** @type {number | null} */
let termSimilarLabelScrambleTimer = null;
/** When push begins during font scramble (ms from animation start). */
let termPageCensoredPushSecoloStartMs = 0;
/** Carousel-settled sibling positions — frozen until Secolo font settles. */
/** @type {number[] | null} */
let termPageSiblingFrozenXs = null;
/** Roobert widths captured at lock — siblings never resize on term page. */
/** @type {number[] | null} */
let termPageSiblingFrozenWidths = null;
let termPageSiblingLayoutApplied = false;
/** @type {string | null} */
let termLabelNavTermId = null;
/** @type {{ users: boolean, contexts: boolean, period: boolean }} */
let termLabelPanelOpen = { users: false, contexts: false, period: false };
/** Label panel key queued for a typewriter scramble on next layout. */
let termLabelPanelAnimateKey = null;

function getLiveViewportHeight() {
  return viewport?.clientHeight ?? currentLayout?.viewportHeight ?? window.innerHeight;
}

function getLiveViewportWidth() {
  return viewport?.clientWidth ?? currentLayout?.viewportWidth ?? window.innerWidth;
}

function getTermPageImageHeightPx(viewportHeight = getLiveViewportHeight()) {
  return scaleLayoutPx(LAYOUT.termPageImageHeight, viewportHeight);
}

function getTermPageBlockGapPx(viewportHeight = getLiveViewportHeight()) {
  return scaleLayoutPx(LAYOUT.termPageBlockGap, viewportHeight);
}

function getOverviewOffsetPx(value, viewportHeight = getLiveViewportHeight()) {
  return scaleLayoutPx(value, viewportHeight);
}

function getTermPageSelectedFontSizePx(viewportWidth = getLiveViewportWidth()) {
  return Math.round(LAYOUT.termPageSelectedFontSize * getMapTypographyScale(viewportWidth));
}

/** Cached scroll-layout column tiers — refreshed on resize / term-page layout. */
let termPageScrollLayout = getTermPageScrollLayoutConfig(
  typeof window !== "undefined" ? window.innerWidth : 1200
);

function refreshTermPageScrollLayout(viewportWidth = getLiveViewportWidth()) {
  termPageScrollLayout = getTermPageScrollLayoutConfig(viewportWidth);
}

function syncTermPageResponsiveState(
  viewportWidth = getLiveViewportWidth(),
  viewportHeight = getLiveViewportHeight()
) {
  refreshTermPageScrollLayout(viewportWidth);
  syncTermPageResponsiveVars(viewport, viewportWidth, viewportHeight);
}

/** Screen Y → `top` for `position: fixed` inside the scrolling sun-viewport. */
function getScrollportLocalTopPx(screenY) {
  const scrollportTop = viewport?.getBoundingClientRect().top ?? 0;
  return screenY - scrollportTop;
}

function getTermPageScrollRisePx(
  scrollTop = viewport?.scrollTop ?? 0,
  viewportHeight = getLiveViewportHeight()
) {
  const maxRise = getTermPageMaxScrollRisePx(viewportHeight);
  return Math.min(Math.max(0, scrollTop), maxRise);
}

/** Secolo title bbox min viewport X (Z). */
let termPageScreenZ = null;
/** Similar-label top (screen) captured at scrollTop = 0. */
let termSimilarLabelRestTop = null;
/** Cleared after switch — forces similar-label rest anchor to remeasure. */
let termPageSimilarLabelAnchorStale = false;

/** Vertical screen shift for censored siblings + similar label during scroll. */
let termPageCensoredScrollShiftY = 0;
/** Whether the similar label is clamped at its pinned floor. */
let termSimilarLabelIsPinned = false;
/** Ray-local translate applied to censored siblings for viewport Z alignment. */
let termPageCensoredRayOffset = null;
/** Frozen screen anchor + precomputed local deltas for censored-row scroll (no live reads). */
let termPageCensoredLayoutRef = null;
/** @deprecated retained for capture helpers — use termPageCensoredLayoutRef */
let termPageCensoredScrollRef = null;
/** Precomputed Z + offset targets for lead push during Roobert → Secolo scramble. */
let termPageCensoredPushTarget = null;
/** 0–1 progress for censored-row push during font scramble. */
let termPageCensoredPushProgress = 0;
/** Timing for the sibling censor middle→baseline vertical ramp during scramble. */
let termPageSiblingBaselineRampStartMs = null;
let termPageSiblingBaselineRampDurationMs = 0;
/** Per-sibling screen deltas for column-wrap repack (term index → { screenDx, screenDy }). */
/** @type {Map<number, { screenDx: number, screenDy: number }> | null} */
let termPageCensoredWrapOffsets = null;
/** Extra page rise when censored siblings wrap to a second row (screen px). */
let termPageCensoredWrapExtraPx = 0;
/** Skip column-wrap repack for one settle — preserves scramble end positions. */
let termPageDeferCensoredWrapRepack = false;
/** Censored-row screen align frozen at scramble end — reapplied after render. */
let termPageCensoredFrozenScreenAlign = null;
/** Skip sibling censor barY refresh for one frame after scramble handoff. */
let termPageCensoredPreserveBarsAfterHandoff = false;
/** Secolo baseline (screen Y) frozen at scramble handoff — matches overlay ink. */
let termPageFrozenSecoloBaselineScreenY = null;
/** @type {SVGSVGElement | null} */
let termDisplayMeasureSvg = null;
let termPageLayoutAnimFrame = null;
let termPageLayoutAnimActive = false;
/** Layout + censored push run in reverse during Secolo → Roobert exit before carousel. */
let termPageLayoutReverse = false;
/** When true, layout animation only runs censored push — not term X lerp. */
let termPageLayoutAnimCensorOnly = false;
/** @type {(() => void) | null} */
let termPageLayoutAnimOnComplete = null;
/** Frozen screen Y for alphabetic baseline — keeps overlay from jumping during font swap. */
let termFontOverlayBaselineY = null;
/** Frozen overlay top (px) — locked for the whole scramble after first sync. */
let termFontOverlayFrozenTop = null;
/** Frozen selected-term min screen Y at scrollTop = 0 (for pin threshold). */
let termPageHeaderRowRestTop = null;

const overviewGeo = createOverviewGeometry({
  layout: LAYOUT,
  grid: GRID,
  getGridContainer: () => viewport,
  getGroups: () => groups,
  getRayCount: () => LAYOUT.rayCount || groups.length || 1,
  getScrollOffset: () => scrollOffset,
  getOverviewProgress: () => overviewProgress,
  getOverviewSpinOffset: () => overviewSpinOffset,
  getOverviewCxOffset: () => {
    const viewportHeight = getLiveViewportHeight();
    const base =
      overviewSubMode === "timeline"
        ? LAYOUT.timelineCxOffset
        : LAYOUT.overviewCxOffset;
    return getOverviewOffsetPx(base, viewportHeight);
  },
  getOverviewCyOffset: () => {
    const viewportHeight = getLiveViewportHeight();
    const base =
      overviewSubMode === "timeline"
        ? LAYOUT.timelineCyOffset
        : LAYOUT.overviewCyOffset;
    return getOverviewOffsetPx(base, viewportHeight);
  },
  getOverviewRadiusScale: () =>
    overviewSubMode === "timeline"
      ? LAYOUT.timelineRadiusScale
      : LAYOUT.overviewRadiusScale,
  getOverviewRotationLocked: () => overviewSubMode === "timeline",
  // The timeline ring is sized once against the full term set (the densest
  // possible layout) so the font/radius stays uniform across years. If the fit
  // tracked the per-year visible subset, scrolling would resize the type as the
  // term count changed year to year, producing visible size jumps.
  getOverviewFitKey: () => overviewSubMode,
  getOverviewTermVisible: () => true,
  getTypographyScale: (viewportWidth) => getMapTypographyScale(viewportWidth),
  getOverviewTypographyScale: (viewportWidth, viewportHeight) =>
    getOverviewTypographyScale(viewportWidth, viewportHeight),
});

const {
  computeOverviewFit,
  getGeometryEndpoints,
  computeArcGeometry,
  overviewGroupAngle,
  layoutTermsOnRay,
  getOverviewFontSize,
  getOverviewTermGap,
  estimateTermWidth,
  pointOnArc,
  rayFrame,
  getOverviewHitRadius,
  resetFitCache: resetOverviewFitCache,
} = overviewGeo;

/** Fractional offset so horizontalSlot sits exactly at angle π. */
function snapFract(arc) {
  const step = arcRayStep(arc);
  if (step === 0) return 0;
  const horizontalSlot = (arc.angleTop - arc.angleCenter) / step;
  return horizontalSlot - Math.round(horizontalSlot);
}

/** Continuous arc coordinate for a group; wraps seamlessly across scroll cycles. */
function bestArcU(groupIndex) {
  const count = LAYOUT.rayCount || 1;
  const u = groupIndex - scrollOffset;
  const center = (count - 1) / 2;
  return u - count * Math.round((u - center) / count);
}

function isGroupOnArc(groupIndex) {
  const count = LAYOUT.rayCount || 1;
  const u = bestArcU(groupIndex);
  return u >= -0.5 && u <= count - 0.5;
}

function horizontalArcU(arc) {
  const step = arcRayStep(arc);
  if (step === 0) return 0;
  return (arc.angleTop - arc.angleCenter) / step;
}

function snapIndex(arc) {
  return resolveSnapIndex(arc);
}

/** Stable nearest snap row; uses velocity to break ties at the midpoint. */
function resolveSnapIndex(arc, velocity = 0) {
  const raw = scrollOffset - snapFract(arc);
  const base = Math.floor(raw);
  const frac = raw - base;
  const tie = LAYOUT.scrollSnapTieBand;
  if (frac < 0.5 - tie) return base;
  if (frac > 0.5 + tie) return base + 1;
  if (Math.abs(velocity) > 1e-6) return velocity > 0 ? base : base + 1;
  return frac <= 0.5 ? base : base + 1;
}

function activeIndexForSnapIndex(snapK, arc) {
  const count = LAYOUT.rayCount || 1;
  const delta = getSnapActiveDelta(arc);
  return ((snapK + delta) % count + count) % count;
}

function scrollOffsetForSnapIndex(k, arc) {
  return k + snapFract(arc);
}

/** activeIndex offset from snap index — places group G horizontal when snapIndex = (G - delta) mod count. */
function getSnapActiveDelta(arc) {
  return Math.round(snapFract(arc) + horizontalArcU(arc));
}

function snapIndexForGroup(groupIndex, arc) {
  const count = LAYOUT.rayCount || groups.length || 1;
  const delta = getSnapActiveDelta(arc);
  return ((groupIndex - delta) % count + count) % count;
}

function scrollOffsetForGroup(groupIndex, arc) {
  return scrollOffsetForSnapIndex(snapIndexForGroup(groupIndex, arc), arc);
}

function isScrollAlignedToActive(arc) {
  const targetSnap = snapIndexForGroup(activeIndex, arc);
  const targetOffset = scrollOffsetForSnapIndex(targetSnap, arc);
  return Math.abs(scrollOffset - targetOffset) < 0.001;
}

/** Snap scroll so the active row sits on the horizontal anchor. */
function ensureActiveRowSnapped(arc) {
  if (!arc || isScrollAlignedToActive(arc)) return;
  scrollOffset = scrollOffsetForSnapIndex(snapIndexForGroup(activeIndex, arc), arc);
  updateActiveFromScroll(arc);
}

/** Animate the highlighted row to center when idle drift left the arc slightly misaligned. */
function snapActiveRowToCenterIfNeeded() {
  if (!currentLayout || !groups.length) return;
  if (!isAtHomeView()) return;
  if (isSplashAwaitingEntrance()) return;
  if (isArcScrollMotionActive()) return;

  const nearestSnap = resolveSnapIndex(currentLayout, 0);
  const targetOffset = scrollOffsetForSnapIndex(nearestSnap, currentLayout);
  if (Math.abs(scrollOffset - targetOffset) < 0.001) return;

  markUserActivity();
  clearTimeout(snapDebounceTimer);
  scrollVelocity = 0;
  settleSnapIndex = null;
  animateSnapTo(nearestSnap, currentLayout, { startVelocity: 0 });
}

function randomSnapIndex() {
  const count = LAYOUT.rayCount || groups.length || 1;
  return Math.floor(Math.random() * count);
}

function arcRayStep(arc) {
  const count = LAYOUT.rayCount || 1;
  if (count <= 1) return 0;
  return (arc.angleTop - arc.angleBottom) / (count - 1);
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

let overviewOverflowPasses = 0;

function measureOverviewRenderedFits(layout) {
  if (!viewport || !svgEl) return true;

  const margin = LAYOUT.overviewMargin;
  const { viewportWidth, viewportHeight } = layout;
  const viewportRect = viewport.getBoundingClientRect();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const el of svgEl.querySelectorAll(".sun-term")) {
    const opacity = parseFloat(el.getAttribute("opacity") ?? "1");
    if (opacity < 0.01) continue;

    const rect = el.getBoundingClientRect();
    minX = Math.min(minX, rect.left - viewportRect.left);
    maxX = Math.max(maxX, rect.right - viewportRect.left);
    minY = Math.min(minY, rect.top - viewportRect.top);
    maxY = Math.max(maxY, rect.bottom - viewportRect.top);
  }

  if (!Number.isFinite(minX)) return true;

  return (
    minX >= margin &&
    maxX <= viewportWidth - margin &&
    minY >= margin &&
    maxY <= viewportHeight - margin
  );
}

function correctOverviewOverflow(layout) {
  if (isOverviewTagsMode()) return;
  const overview = resolveLayoutOverview(layout);
  if (overview < 0.98 || !groups.length) return;
  if (measureOverviewRenderedFits(layout)) {
    overviewOverflowPasses = 0;
    return;
  }
  if (overviewOverflowPasses >= 8) return;

  const fitCache = overviewGeo.getFitCache();
  const currentScale = fitCache.contentScale ?? 1;
  const nextScale = Math.max(
    LAYOUT.overviewMinContentScale,
    currentScale - LAYOUT.overviewOverflowStep
  );
  if (nextScale >= currentScale - 0.001) return;

  overviewOverflowPasses += 1;
  overviewGeo.setFitCacheContentScale(nextScale);
  currentLayout = computeLayout(layout.viewportWidth, layout.viewportHeight);
  render(currentLayout);
}

function getExitArcU(groupIndex, arc, exitT) {
  const u = bestArcU(groupIndex);
  const hU = horizontalArcU(arc);
  const dir = u >= hU ? 1 : -1;
  const magnitude = LAYOUT.focusExitMagnitude * easeInCubic(exitT);
  return u + dir * magnitude;
}

function getRayExitOpacity(anchor, layout) {
  const margin = LAYOUT.focusExitFadeMargin;
  const { viewportWidth, viewportHeight } = layout;
  const distances = [
    anchor.x + margin,
    viewportWidth + margin - anchor.x,
    anchor.y + margin,
    viewportHeight + margin - anchor.y,
  ];
  const minDist = Math.min(...distances);
  if (minDist <= 0) return 0;
  if (minDist >= margin) return 1;
  return minDist / margin;
}

function isRayOnScreen(groupIndex, layout) {
  const transform = getGroupTransform(groupIndex, layout);
  return getRayExitOpacity(transform.anchor, layout) > 0.02;
}

/** Interpolate anchor in screen space so rays travel smooth paths during overview. */
function getGroupTransform(groupIndex, layout, options = {}) {
  const t = resolveLayoutOverview(layout);
  const { viewportWidth, viewportHeight } = layout;
  const { normal, overview } = getGeometryEndpoints(viewportWidth, viewportHeight);
  const arc = {
    angleTop: normal.angleTop,
    angleBottom: normal.angleBottom,
    angleCenter: normal.angleCenter,
  };

  let arcU = bestArcU(groupIndex);
  if (focusState && !options.skipFocusModifiers && groupIndex !== focusState.activeIndex) {
    arcU = getExitArcU(groupIndex, arc, focusState.exitT);
  }

  const normalAngle = arc.angleTop - arcU * arcRayStep(arc);
  const overviewAngle = overviewGroupAngle(groupIndex, layout);
  const na = pointOnArc(normal.cx, normal.cy, normal.radius, normalAngle);
  const oa = pointOnArc(overview.cx, overview.cy, overview.radius, overviewAngle);

  let anchor;
  let radialAngle;
  if (t <= 0) {
    anchor = { ...na };
    radialAngle = normalAngle;
  } else if (t >= 1) {
    anchor = { ...oa };
    radialAngle = overviewAngle;
  } else {
    anchor = { x: lerp(na.x, oa.x, t), y: lerp(na.y, oa.y, t) };
    radialAngle = lerpAngle(normalAngle, overviewAngle, t);
  }

  if (
    focusState &&
    !options.skipFocusModifiers &&
    groupIndex === focusState.activeIndex &&
    t <= 0
  ) {
    const targetY = getFocusRowRiseTargetPx(viewportHeight);
    anchor.y = lerp(focusState.riseStartY, targetY, easeOutCubic(focusState.riseT));
  }

  const { rotation, outwardSign } = rayFrame(radialAngle);
  return { anchor, rotation, outwardSign, radialAngle };
}

function isGroupVisible(groupIndex, layout) {
  if ((layout?.overview ?? 0) > 0.01) return true;
  if (focusState) {
    if (groupIndex === focusState.activeIndex) return true;
    if (focusState.phase === "locked") return false;
    return isRayOnScreen(groupIndex, layout);
  }
  return isGroupOnArc(groupIndex);
}

function updateActiveFromScroll(arc) {
  const lockedSnap = snapAnimTargetIndex ?? settleSnapIndex;
  if (lockedSnap !== null) {
    activeIndex = activeIndexForSnapIndex(lockedSnap, arc);
    scheduleTermImagePreloadBoost();
    return;
  }
  const count = LAYOUT.rayCount || 1;
  const hU = horizontalArcU(arc);
  const prevIndex = activeIndex;
  activeIndex = ((Math.round(scrollOffset + hU) % count) + count) % count;
  if (prevIndex !== activeIndex) scheduleTermImagePreloadBoost();
}

/** Active ray index — while focused, the locked group can differ from wheel scroll. */
function getDisplayActiveIndex() {
  if (focusState && (currentLayout?.overview ?? 0) <= 0.02) {
    return focusState.activeIndex;
  }
  return activeIndex;
}

function measureTermWidths(groupIndex) {
  const rayGroup = svgEl.querySelector(`[data-group="${groupIndex}"]`);
  const wraps = rayGroup ? [...rayGroup.querySelectorAll(".sun-term-wrap")] : [];
  let widths = wraps.map((wrap) => wrap.querySelector(".sun-term")?.getBBox().width ?? 0);
  if (!widths.length || widths.every((w) => w <= 0)) {
    widths = groups[groupIndex]?.terms.map((t) => estimateTermWidth(t.name)) ?? [];
  }
  return widths;
}

function cancelSnapAnimation() {
  if (snapAnimFrame) {
    cancelAnimationFrame(snapAnimFrame);
    snapAnimFrame = null;
  }
  isSnapping = false;
  snapAnimTargetIndex = null;
}

function cancelMomentum() {
  if (momentumFrame) {
    cancelAnimationFrame(momentumFrame);
    momentumFrame = null;
  }
}

function cancelScrollMotion() {
  cancelSnapAnimation();
  cancelMomentum();
  scrollVelocity = 0;
  wheelBurstEnergy = 0;
  settleSnapIndex = null;
}

function isArcScrollMotionActive() {
  return isSnapping || momentumFrame !== null;
}

function clearOverviewTermHover() {
  if (hoveredRay) hoveredRay.classList.remove("is-term-hover");
  if (hoveredWrap) hoveredWrap.classList.remove("is-hovered");
  clearTermHover();
  clearTitleRowTermHover();
}

function getFixedImageTermId(el) {
  if (!(el instanceof Element)) return null;
  return el.getAttribute("data-term-id") || el.dataset.termId || null;
}

function setFixedImageTermId(el, termId) {
  if (!(el instanceof Element) || !termId) return;
  el.setAttribute("data-term-id", termId);
}

function findOverviewHoverTargetAtPointer(clientX, clientY) {
  const elements = elementsAtPointer(clientX, clientY);

  for (const el of elements) {
    if (!(el instanceof Element) || !svgEl?.contains(el)) continue;

    const fixedImage = el.closest(".sun-ray-fixed-image, .sun-ray-fixed-image-hit");
    if (fixedImage) {
      const termId = getFixedImageTermId(fixedImage);
      const ray = fixedImage.closest(".sun-ray.is-active");
      const wrap = termId && ray ? getHoveredTermWrap(ray, termId) : null;
      if (termId && ray) {
        if (wrap) return { wrap, ray, termId };
      }
    }

    const hit = el.closest(".sun-term-hit");
    if (hit) {
      const wrap = hit.closest(".sun-term-wrap");
      const ray = hit.closest(".sun-ray.is-active");
      if (wrap && ray) {
        return { wrap, ray, termId: wrap.dataset.termId || null };
      }
    }
  }
  return null;
}

function applyOverviewHoverAtPointer(clientX, clientY, { maintainOnMiss = false } = {}) {
  if (isFocusActive() || overviewProgress > 0.02) return;

  snapActiveRowToCenterIfNeeded();
  if (isArcScrollMotionActive()) return;

  const target = findOverviewHoverTargetAtPointer(clientX, clientY);
  if (target?.wrap && target?.ray) {
    setTermHover(target.ray, target.wrap);
    if (target.termId) setTitleRowTermHover(target.termId);
    return;
  }

  if (maintainOnMiss && hoveredTitleRowTermId) {
    restoreOverviewTermHoverFromState();
    refreshTitleRowTermHoverVisuals();
    return;
  }

  clearOverviewTermHover();
}

function syncTitleRowHoverAtPointer(clientX, clientY) {
  applyOverviewHoverAtPointer(clientX, clientY, { maintainOnMiss: true });
}

function onArcScrollSettled() {
  if (lastPointer.known) {
    syncTitleRowHoverAtPointer(lastPointer.x, lastPointer.y);
  }
  if (currentLayout) {
    applyAllRowFixedPushes(currentLayout);
    syncRayFixedImages(currentLayout);
    updateTitleRowImage(currentLayout);
  }
}

function applyWheelScroll(deltaY, now = performance.now()) {
  const abs = Math.abs(deltaY);
  const sign = Math.sign(deltaY) || 1;

  let accelMult = 1;
  if (abs > LAYOUT.scrollFineThresholdPx) {
    const excess = abs - LAYOUT.scrollFineThresholdPx;
    accelMult =
      1 +
      Math.min(
        LAYOUT.scrollMaxAccel - 1,
        (excess * LAYOUT.scrollAccelFactor) ** 1.1 * abs
      );
  }

  const dt = lastWheelAt > 0 ? now - lastWheelAt : 100;
  if (dt > 0 && dt < LAYOUT.scrollBurstWindowMs) {
    wheelBurstEnergy = Math.min(1, wheelBurstEnergy + 0.22);
  } else {
    wheelBurstEnergy *= 0.42;
  }

  const burstMult = 1 + wheelBurstEnergy * (LAYOUT.scrollBurstBoost - 1);
  const delta = sign * abs * LAYOUT.scrollSensitivity * accelMult * burstMult;

  const instantVel = (delta / Math.max(8, dt)) * 16.67;
  scrollVelocity =
    scrollVelocity * (1 - LAYOUT.scrollMomentumBlend) +
    instantVel * LAYOUT.scrollMomentumBlend;
  scrollVelocity = clamp(
    scrollVelocity,
    -LAYOUT.scrollMomentumMaxVelocity,
    LAYOUT.scrollMomentumMaxVelocity
  );

  lastWheelAt = now;
  return delta;
}

function getSnapDurationMs(arc, startVelocity = 0) {
  const distance = Math.abs(scrollOffsetForSnapIndex(snapIndex(arc), arc) - scrollOffset);
  const speedFactor = clamp(
    Math.abs(startVelocity) / LAYOUT.scrollMomentumMaxVelocity,
    0,
    1
  );
  return clamp(
    LAYOUT.snapDurationMs * (0.72 + speedFactor * 0.55) + Math.log1p(distance) * 80,
    480,
    LAYOUT.snapDurationMs * 1.25
  );
}

function getTermNavRowScrollDistance(sourceGroupIndex, targetGroupIndex, arc) {
  const start = scrollOffsetForGroup(sourceGroupIndex, arc);
  const end = scrollOffsetForGroup(targetGroupIndex, arc);
  return Math.abs(end - start);
}

/** Snap duration scales with row distance — nearby rows stay gentle, far jumps accelerate per row. */
function getTermNavSnapDurationMs(sourceGroupIndex, targetGroupIndex, arc) {
  const distance = getTermNavRowScrollDistance(sourceGroupIndex, targetGroupIndex, arc);
  if (distance < 0.001) return TERM_NAV_TIMING.snapMsMin;
  return clamp(
    TERM_NAV_TIMING.snapMsMin + distance * TERM_NAV_TIMING.snapMsPerRow,
    TERM_NAV_TIMING.snapMsMin,
    TERM_NAV_TIMING.snapMsMax
  );
}

function applyScrollDrag(velocity, dtMs) {
  const dtSec = dtMs / 1000;
  const speed = Math.abs(velocity);
  if (speed < 1e-8) return 0;
  const decayRate = LAYOUT.scrollDragLinear + LAYOUT.scrollDragQuadratic * speed;
  return velocity * Math.exp(-decayRate * dtSec);
}

function ensureMomentumLoop() {
  if (momentumFrame || !currentLayout) return;

  let lastFrameAt = performance.now();

  function frame(now) {
    if (!currentLayout || isFocusActive() || isTermNavigating()) {
      cancelMomentum();
      return;
    }

    const arc = currentLayout;
    const dt = Math.min(48, now - lastFrameAt);
    lastFrameAt = now;
    const frameScale = dt / 16.67;
    const timeSinceWheel = now - lastWheelAt;

    if (timeSinceWheel >= LAYOUT.scrollCoastStartMs || lastWheelWasNotch) {
      if (timeSinceWheel >= LAYOUT.scrollCoastDelayMs && settleSnapIndex === null) {
        settleSnapIndex = resolveSnapIndex(arc, scrollVelocity);
      }

      if (timeSinceWheel >= LAYOUT.scrollCoastDelayMs) {
        scrollVelocity = applyScrollDrag(scrollVelocity, dt);
      }

      scrollOffset -= scrollVelocity * frameScale;
      updateActiveFromScroll(arc);
      render(arc);

      if (
        timeSinceWheel >= LAYOUT.scrollCoastDelayMs &&
        settleSnapIndex !== null &&
        Math.abs(scrollVelocity) < LAYOUT.scrollMomentumHandoffVelocity
      ) {
        const idx = settleSnapIndex;
        const handoffVelocity = scrollVelocity;
        settleSnapIndex = null;
        scrollVelocity = 0;
        momentumFrame = null;
        animateSnapTo(idx, arc, { startVelocity: handoffVelocity });
        return;
      }

      if (
        timeSinceWheel >= LAYOUT.scrollCoastDelayMs &&
        Math.abs(scrollVelocity) < LAYOUT.scrollMomentumMinVelocity
      ) {
        momentumFrame = null;
        snapToNearest(arc);
        return;
      }
    }

    momentumFrame = requestAnimationFrame(frame);
  }

  momentumFrame = requestAnimationFrame(frame);
}

function scheduleSnapEnd(arc) {
  if (isFocusActive() || isTermNavigating()) return;
  if (overviewProgress > 0.02 || overviewTarget > 0) return;
  clearTimeout(snapDebounceTimer);
  snapDebounceTimer = setTimeout(() => {
    snapToNearest(currentLayout ?? arc);
  }, LAYOUT.snapDebounceMs);
}

function snapToNearest(arc) {
  if (!arc) return;
  if (isFocusActive() || isTermNavigating()) return;
  if (overviewProgress > 0.02 || overviewTarget > 0) return;
  const velocity = scrollVelocity;
  const idx = settleSnapIndex ?? resolveSnapIndex(arc, velocity);
  settleSnapIndex = null;
  scrollVelocity = 0;
  animateSnapTo(idx, arc, { startVelocity: velocity });
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeOutQuart(t) {
  return 1 - (1 - t) ** 4;
}

function easeInCubic(t) {
  return t ** 3;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function isTermPageScrollBgMode() {
  return TERM_PAGE_SCROLL_BG_ENABLED && !TERM_PAGE_LEGACY_CONTENT_ENABLED;
}

function isTermPageScrollContentMode() {
  return isTermPageScrollBgMode();
}

/**
 * Vertical room reserved below the fold-2 inline image so it lands inside one
 * fold: the image caption + a little breathing space, plus (in stacked tiers)
 * the meta block that sits beneath the image.
 */
function getTermPageFold2BottomReservePx(viewportHeight) {
  // Room below the inline image for its caption plus a small bottom margin.
  let reserve = scaleLayoutPx(40, viewportHeight);
  if (termPageScrollLayout?.metaBelowImage) {
    // The meta is laid out after the image is sized, so its live height can be
    // stale here. Never reserve less than a full three-row estimate.
    const liveMeta = termMetaEl && !termMetaEl.hidden ? termMetaEl.offsetHeight : 0;
    const metaHeight = Math.max(liveMeta, scaleLayoutPx(160, viewportHeight));
    reserve += getTermPageMetaBelowImageGapPx(viewportHeight) + metaHeight;
  }
  return reserve;
}

/**
 * Pinned header band bottom as seen in fold 2 (definition tucked under the
 * header). The live header projection is unusable while the page sits at the
 * title view (scroll 0): every source reads the large unpinned title and
 * reports ~290px, whereas the real pinned band measures ~153px on a short
 * viewport up to ~173px on a tall one. This calibrated estimate tracks that
 * measured band and stays a touch conservative (never over-reserves), so the
 * inline image fills the fold instead of leaving dead space below it.
 */
function getTermPageFold2PinnedHeaderBottomPx(viewportHeight) {
  return Math.min(185, Math.max(150, Math.round(viewportHeight * 0.155)));
}

/**
 * Gap kept between the bottom of the fold-2 content (image caption / meta) and
 * the viewport bottom when the block is anchored to the foot of the fold — i.e.
 * "slightly above the bottom edge", scaling gently with viewport height.
 */
function getTermPageFold2BottomAnchorMarginPx(viewportHeight) {
  return scaleLayoutPx(108, viewportHeight);
}

/**
 * On tall screens the fold-2 block (definition + inline image + meta) is sized to
 * a fixed proportion of the viewport, so it clusters near the top of the fold and
 * leaves a large empty band at the bottom. Rather than resize the image (its
 * proportion is owned by getTermPageScrollImageHeightPx), push the image+meta
 * block straight down so its bottom lands a small margin above the viewport
 * bottom, keeping the whole composition inside one fold.
 *
 * At the fold-2 snap a page offset Y appears at screen y = headerBottom + Y, so
 * the target page-space content bottom is `viewportHeight - margin - headerBottom`.
 * The pinned header routinely rests shorter than this projection, which only
 * lifts the block further from the edge — never below it — so the estimate stays
 * safe. Returns the extra downward offset for the image block (>= 0).
 *
 * @param {number} viewportHeight
 * @param {number} naturalContentBottomInPage fold-2 content bottom (page px) before any drop.
 */
function getTermPageFold2BottomAnchorDropPx(
  viewportHeight,
  naturalContentBottomInPage,
  pageTop
) {
  const headerBottom = getTermPageFold2PinnedHeaderBottomPx(viewportHeight);
  // Screen-top of the definition once it settles at the fold-2 snap. The snap is
  // `max(headerPinSnap, pageTop - headerBottom)`, so the definition rests at
  // `min(headerBottom, pageTop - headerPinSnap)` below the viewport top — when
  // the pin floor dominates, the whole block rides higher and would reopen the
  // gap unless we account for it. Use the calibrated header estimate (stable
  // during layout, unlike the live projection which swings while hidden).
  const headerPinSnap = getTermHeaderPinSnapScrollTop(viewportHeight);
  const defTopRest = Math.min(headerBottom, Math.max(0, pageTop - headerPinSnap));
  const margin = getTermPageFold2BottomAnchorMarginPx(viewportHeight);
  // At that snap a page offset Y renders at screen y = Y + defTopRest, so anchor
  // the content bottom `margin` above the viewport bottom.
  const targetBottomInPage = viewportHeight - margin - defTopRest;
  return Math.max(0, Math.round(targetBottomInPage - naturalContentBottomInPage));
}

/**
 * Page-relative top of the fold-2 inline-image block. Reads the live position
 * (which already includes the bottom-anchor drop applied at layout time) so the
 * snap getters stay in lockstep with the rendered layout, and falls back to the
 * natural definition-stacked position before the first layout pass.
 */
function getTermPageFold2ImageBlockTopInPagePx(viewportHeight = getLiveViewportHeight()) {
  const natural =
    (termDefinitionEl?.offsetHeight ?? 0) +
    getTermPageScrollDefinitionImageGapPx(viewportHeight);
  const actual = parseFloat(termImagesEl?.style.top ?? "");
  return Number.isFinite(actual) && actual > 0 ? actual : natural;
}

/**
 * Height of the fold-2 inline image. Starts from the tier factor, but shrinks
 * (down to a floor) when the definition is tall so the definition, gap, image
 * and the meta hanging off it all stay within a single fold.
 */
function getTermPageScrollImageHeightPx(
  viewportHeight,
  definitionHeight = termDefinitionEl?.offsetHeight ?? 0
) {
  const factor = getTermPageScrollImageHeightFactor(termPageScrollLayout.tier);
  const baseHeight = Math.round(viewportHeight * factor);
  if (!(definitionHeight > 0)) return baseHeight;

  const headerBottom = getTermPageFold2PinnedHeaderBottomPx(viewportHeight);
  const gap = getTermPageScrollDefinitionImageGapPx(viewportHeight);
  const bottomReserve = getTermPageFold2BottomReservePx(viewportHeight);
  const available =
    viewportHeight - headerBottom - definitionHeight - gap - bottomReserve;
  if (!Number.isFinite(available) || available >= baseHeight) return baseHeight;

  const minHeight = getTermPageScrollImageMinHeightPx(
    viewportHeight,
    termPageScrollLayout.tier
  );
  return Math.max(minHeight, Math.round(available));
}

function getTermPageScrollContentTopPx(viewportHeight) {
  return (
    getFocusRowTopPx(viewportHeight) +
    getTermPageSelectedFontSizePx() * 0.12 +
    LAYOUT.termPageGapBelowTitle +
    getTermPageScrollContentOffsetYpx(viewportHeight) +
    termPageCensoredWrapExtraPx
  );
}

function getSiteNavHeightPx() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--site-nav-height"
  );
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 42;
}

function isTermHeaderPinned() {
  return viewport?.classList.contains("is-term-header-pinned") ?? false;
}

/** Scroll-linked lift applied to the header group (px, capped at pin target). */
function getTermHeaderPinScrollLiftPx(
  scrollTop = viewport?.scrollTop ?? 0,
  viewportHeight = getLiveViewportHeight()
) {
  const rise = getTermPageScrollRisePx(scrollTop, viewportHeight);
  const desiredThreshold = getTermHeaderPinThresholdPx(viewportHeight);
  return Math.min(rise, desiredThreshold);
}

/** True once the similar-label + censored row has reached its pinned floor. */
function isTermCensoredGroupPinned(
  scrollTop = viewport?.scrollTop ?? 0,
  viewportHeight = getLiveViewportHeight()
) {
  const desiredThreshold = getTermHeaderPinThresholdPx(viewportHeight);
  const maxRise = getTermPageMaxScrollRisePx(viewportHeight);
  const ceiling = Math.min(desiredThreshold, maxRise);
  if (ceiling <= 0) return false;
  return getTermPageScrollRisePx(scrollTop, viewportHeight) >= ceiling - 0.5;
}

/** Shared screen Y shift for the censored row + similar label (1:1 with bg rise). */
function getTermCensoredGroupScreenShiftY(
  scrollTop = viewport?.scrollTop ?? 0,
  viewportHeight = getLiveViewportHeight()
) {
  return -getTermHeaderPinScrollLiftPx(scrollTop, viewportHeight);
}

function getPinnedFocusRowTopPx(viewportHeight = getLiveViewportHeight()) {
  return (
    getSiteNavHeightPx() +
    getTermPageTitleBaselineInsetPx(viewportHeight) +
    LAYOUT.termPageGroupPinBelowNavExtra
  );
}

function getPinnedSelectedMinTopPx() {
  return getSiteNavHeightPx() + LAYOUT.termPageGroupPinBelowNavExtra;
}

function captureTermPageHeaderRowRestTopIfNeeded() {
  if (termPageHeaderRowRestTop != null) return;
  const scrollTop = viewport?.scrollTop ?? 0;
  if (scrollTop > 0.5) return;
  if (
    !termPageSelectedFontSettled ||
    !isTermPageFocusVisual() ||
    viewport?.classList.contains("is-term-font-scrambling")
  ) {
    return;
  }
  const rayGroup = getFocusRayGroup();
  const selectedText = getSelectedTermTextEl();
  if (!rayGroup || !selectedText) return;
  const bounds = getTermTextScreenBounds(rayGroup, selectedText);
  if (!bounds) return;
  termPageHeaderRowRestTop = bounds.minY;
}

/** Derive scroll=0 header Y from the live selected-term screen position (term switch while scrolled). */
function captureTermPageHeaderRowRestTopFromScroll() {
  if (
    !termPageSelectedFontSettled ||
    !isTermPageFocusVisual() ||
    viewport?.classList.contains("is-term-font-scrambling")
  ) {
    return;
  }
  const rayGroup = getFocusRayGroup();
  const selectedText = getSelectedTermTextEl();
  if (!rayGroup || !selectedText) return;
  const bounds = getTermTextScreenBounds(rayGroup, selectedText);
  if (!bounds) return;
  const scrollTop = viewport?.scrollTop ?? 0;
  if (scrollTop <= 0.5) {
    termPageHeaderRowRestTop = bounds.minY;
    return;
  }
  const viewportHeight = getLiveViewportHeight();
  const rise = getTermPageScrollRisePx(scrollTop, viewportHeight);
  const pinnedMinY = getPinnedSelectedMinTopPx();
  const provisionalThreshold = Math.max(0, bounds.minY + rise - pinnedMinY);
  const lift = Math.min(rise, provisionalThreshold);
  termPageHeaderRowRestTop = bounds.minY + lift;
}

function resyncTermPageScrollHeaderAfterSwitch(layout = currentLayout) {
  if (
    !layout ||
    !Number.isFinite(layout.viewportWidth) ||
    !Number.isFinite(layout.viewportHeight)
  ) {
    refreshMapLayoutFromViewport();
    layout = currentLayout;
  }
  if (!layout) return;

  const group = groups[focusState?.activeIndex];
  if (!group || group.terms.length < 2) return;

  const scrollTop = viewport?.scrollTop ?? 0;
  const viewportHeight = layout.viewportHeight ?? getLiveViewportHeight();

  termPageFrozenSecoloBaselineScreenY = null;
  termSimilarLabelRestTop = null;
  termPageSimilarLabelAnchorStale = true;

  if (isTermPageScrollBgMode()) {
    if (isViewportTermScrollable() || scrollTop > 0.5) {
      termPageCensoredScrollShiftY = getTermCensoredGroupScreenShiftY(
        scrollTop,
        viewportHeight
      );
    }
    applyFocusRayScrollAnchor(layout);
    applyTermPageScrollLiftTransform();
  }

  const rayGroup = getFocusRayGroup();
  if (rayGroup && termPageScreenZ != null) {
    termPageDeferCensoredWrapRepack = true;
    applyTermPageCensoredBaselineAlign(rayGroup, { refreshBars: false });
    termPageDeferCensoredWrapRepack = false;
  }

  if (scrollTop > 0.5) {
    captureTermPageHeaderRowRestTopFromScroll();
  } else {
    termPageHeaderRowRestTop = null;
    captureTermPageHeaderRowRestTopIfNeeded();
  }

  updateTermPageSimilarLabel(layout);
}

function getTermHeaderPinThresholdPx(viewportHeight) {
  let threshold;
  if (isTermPageScrollBgMode()) {
    captureTermPageHeaderRowRestTopIfNeeded();
    if (termPageHeaderRowRestTop != null) {
      const pinnedMinY = getPinnedSelectedMinTopPx();
      threshold = Math.max(0, termPageHeaderRowRestTop - pinnedMinY);
    } else {
      const bottomY = getTermPageBottomFocusRowTopPx(viewportHeight);
      const pinnedY = getPinnedFocusRowTopPx(viewportHeight);
      threshold = Math.max(0, bottomY - pinnedY);
    }
  } else {
    const navH = getSiteNavHeightPx();
    const bandH = getTermPageTitleBandHeightPx(viewportHeight);
    threshold = Math.max(0, viewportHeight - bandH - navH);
  }
  return threshold;
}

/** Scroll offset where the censored title group reaches its pinned floor. */
function getTermHeaderPinSnapScrollTop(viewportHeight = getLiveViewportHeight()) {
  const desiredThreshold = getTermHeaderPinThresholdPx(viewportHeight);
  const maxRise = getTermPageMaxScrollRisePx(viewportHeight);
  return Math.min(desiredThreshold, maxRise);
}

/** Pinned header band bottom in scrollport-local px (similar label + censored row). */
function getTermPinnedHeaderBottomLocalPx(viewportHeight = getLiveViewportHeight()) {
  const cssHeight = parseFloat(
    viewport?.style.getPropertyValue("--term-header-fixed-height") || ""
  );
  if (isTermHeaderPinned() && Number.isFinite(cssHeight) && cssHeight > 0) {
    return cssHeight;
  }

  const pinSnap = getTermHeaderPinSnapScrollTop(viewportHeight);
  const pinTop = getTermSimilarLabelPinTopPx(viewportHeight, pinSnap);
  const labelHeight = termSimilarLabelEl?.offsetHeight || 22;
  const scrollportTop = viewport?.getBoundingClientRect().top ?? 0;
  const labelBottom = pinTop + labelHeight;
  const scrollTop = viewport?.scrollTop ?? 0;
  const censoredScreenBottom = getCensoredRowScreenBottom();
  const censoredAtPin =
    censoredScreenBottom != null
      ? censoredScreenBottom - (pinSnap - scrollTop)
      : null;
  const bottom = Math.max(labelBottom, censoredAtPin ?? labelBottom);
  return Math.ceil(bottom - scrollportTop + LAYOUT.termPageHeaderBackdropBottomExtra);
}

/** Scroll offset where the definition tucks directly below the pinned header. */
function getTermPageDefinitionSnapScrollTop(viewportHeight = getLiveViewportHeight()) {
  if (!isTermPageScrollContentMode() || !termPageEl || termPageEl.hidden) {
    return getTermHeaderPinSnapScrollTop(viewportHeight);
  }

  const pageTop =
    termPageEl.offsetTop || getTermPageScrollContentTopPx(viewportHeight);
  const headerBottom = getTermPinnedHeaderBottomLocalPx(viewportHeight);
  const target = Math.round(pageTop - headerBottom);
  const headerPinSnap = getTermHeaderPinSnapScrollTop(viewportHeight);
  return Math.max(headerPinSnap, Math.max(0, target));
}

function isTermDefinitionAtSnapPosition(
  scrollTop = viewport?.scrollTop ?? 0,
  viewportHeight = getLiveViewportHeight()
) {
  const snapTop = getTermPageDefinitionSnapScrollTop(viewportHeight);
  if (Math.abs(scrollTop - snapTop) < 2) return true;
  if (!termDefinitionEl || termPageEl?.hidden) return scrollTop >= snapTop - 0.5;

  const defLocal =
    termDefinitionEl.getBoundingClientRect().top -
    (viewport?.getBoundingClientRect().top ?? 0);
  const headerBottom = getTermPinnedHeaderBottomLocalPx(viewportHeight);
  return Math.abs(defLocal - headerBottom) < 4;
}

/**
 * Minimum fold-2 chapter height (in page px) that guarantees fold 3 is pushed
 * fully below the viewport at the definition (fold-2) snap, so the two folds
 * never share a screen.
 *
 * At that snap the page top maps to the pinned-header bottom, so fold 3's
 * content begins at screen y = `headerBottom + fold2EndInPage + blockGap`; for
 * it to clear the viewport we need `fold2EndInPage + blockGap >= viewportHeight`.
 *
 * We deliberately do *not* subtract the header height here. This floor is baked
 * into the details element's position at layout time, while the resting header
 * height is read live at the fold-2 snap, and the pinned header routinely
 * renders shorter at rest than projected during layout (it can swing by far more
 * than a small margin). Subtracting the layout-time header therefore lets fold 3
 * peek when the rest header is shorter. Ignoring the header makes the separation
 * header-independent — fold 3 starts at least `blockGap`-below the bottom of the
 * fold-2 screen, and any real header height only pushes it further off-screen.
 * The large `blockGap` absorbs the extra reserve, so almost no empty space shows.
 *
 * Pure geometry: it does *not* check whether fold 3 exists, so callers must only
 * apply it when there is fold-3 content (otherwise the extra reserve would clip
 * the fold-2 snap on short pages).
 */
function getTermPageFold2ClearFloorPx(viewportHeight = getLiveViewportHeight()) {
  const blockGap = getTermPageScrollBlockGapPx(viewportHeight);
  // Small extra so the next fold's top edge sits a touch below the viewport
  // bottom rather than flush against it.
  const separationMargin = scaleLayoutPx(16, viewportHeight);
  return Math.max(0, viewportHeight - blockGap + separationMargin);
}

/**
 * Fold-2 chapter floor used by the settled snap getters: the design ratio,
 * lifted to the clear floor when fold-3 content is present so fold 3 stays off
 * the fold-2 screen. Safe to call once the term page is visible (the layout
 * path below detects fold-3 differently while the page is still hidden).
 */
function getTermPageFold2ChapterFloorPx(viewportHeight = getLiveViewportHeight()) {
  const ratioMin = getTermPageFold2ChapterMinPx(viewportHeight);
  if (!hasTermPageFold3Content()) return ratioMin;
  return Math.max(ratioMin, getTermPageFold2ClearFloorPx(viewportHeight));
}

function getTermPageFold2EndInPagePx(viewportHeight = getLiveViewportHeight()) {
  if (!termPageEl || !termDefinitionEl || !termPageEl.classList.contains("is-scroll-content")) {
    return 0;
  }

  const imagesBlockTop = getTermPageFold2ImageBlockTopInPagePx(viewportHeight);
  const imagesHeight = termImagesEl?.offsetHeight || 0;
  const imagesBottomInPage = imagesBlockTop + imagesHeight;

  let fold2BottomInPage = imagesBottomInPage;
  const pageTop = parseFloat(termPageEl.style.top) || termPageEl.offsetTop || 0;
  if (termMetaEl && !termMetaEl.hidden) {
    fold2BottomInPage = Math.max(
      fold2BottomInPage,
      termMetaEl.offsetTop + termMetaEl.offsetHeight - pageTop
    );
  }

  const minFold2Chapter = getTermPageFold2ChapterFloorPx(viewportHeight);
  const fold2Pad = Math.max(0, minFold2Chapter - fold2BottomInPage);
  return imagesBottomInPage + fold2Pad;
}

/** Bottom of fold 2's actual content (images / meta) in page px, before the
 *  fold-2 chapter padding. */
function getTermPageFold2ContentBottomInPagePx(viewportHeight = getLiveViewportHeight()) {
  if (
    !termPageEl ||
    !termDefinitionEl ||
    !termPageEl.classList.contains("is-scroll-content")
  ) {
    return 0;
  }

  const imagesBlockTop = getTermPageFold2ImageBlockTopInPagePx(viewportHeight);
  const imagesHeight = termImagesEl?.offsetHeight || 0;
  let bottom = imagesBlockTop + imagesHeight;

  const pageTop = parseFloat(termPageEl.style.top) || termPageEl.offsetTop || 0;
  if (termMetaEl && !termMetaEl.hidden) {
    bottom = Math.max(bottom, termMetaEl.offsetTop + termMetaEl.offsetHeight - pageTop);
  }
  return bottom;
}

/** Bottom of fold 3's actual content (details image / details / labels) in page
 *  px, before the fold-3 chapter padding. */
function getTermPageFold3ContentBottomInPagePx(viewportHeight = getLiveViewportHeight()) {
  if (!hasTermPageFold3Content()) return 0;
  let bottom = getTermPageFold3TopInPagePx(viewportHeight);
  // These elements live inside termPageEl, so offsetTop is already page-relative.
  for (const el of [termDetailsImageEl, termDetailsEl, termLabelNavEl]) {
    if (el && !el.hidden) {
      bottom = Math.max(bottom, el.offsetTop + el.offsetHeight);
    }
  }
  return bottom;
}

function hasTermPageFold3Content() {
  if (!isTermPageScrollContentMode() || !termPageEl || termPageEl.hidden) return false;
  if (termDetailsImageEl && !termDetailsImageEl.hidden) return true;
  if (termDetailsEl && !termDetailsEl.hidden) return true;
  if (termLabelNavEl && !termLabelNavEl.hidden) return true;
  return false;
}

function getTermPageFold3TopInPagePx(viewportHeight = getLiveViewportHeight()) {
  const detailsTop = parseFloat(
    termDetailsImageEl?.style.top || termDetailsEl?.style.top || ""
  );
  if (Number.isFinite(detailsTop) && detailsTop > 0) return detailsTop;
  return getTermPageFold2EndInPagePx(viewportHeight) + getTermPageScrollBlockGapPx(viewportHeight);
}

function applyTermPageFold3ChapterPad(fold2EndInPage, contentBottom, viewportHeight) {
  if (!hasTermPageFold3Content()) return contentBottom;
  const blockGap = getTermPageScrollBlockGapPx(viewportHeight);
  const fold3ContentHeight = Math.max(0, contentBottom - fold2EndInPage - blockGap);

  // Fold 3 snaps to the bottom of the page, so it must reserve enough height
  // that scrolling there lifts fold 2 fully above the pinned header. The header
  // and bottom padding are capped in px, so a fixed viewport-height ratio
  // under-reserves on tall screens and leaves fold-2 content visible. Derive the
  // floor from the actual header bottom + bottom reserve as well.
  const headerBottom = getTermPinnedHeaderBottomLocalPx(viewportHeight);
  const bottomReserve =
    getTermPageScrollPaddingBottomPx(viewportHeight) + 2 * LAYOUT.termPageBottomMargin;
  const fold2ClearHeight = Math.max(
    0,
    viewportHeight - headerBottom - bottomReserve - blockGap
  );
  const minFold3Content = Math.max(
    getTermPageFold3ChapterMinPx(viewportHeight),
    fold2ClearHeight
  );

  const fold3Pad = Math.max(0, minFold3Content - fold3ContentHeight);
  return contentBottom + fold3Pad;
}

function getTermPageMaxScrollTopPx(viewportHeight = getLiveViewportHeight()) {
  if (!viewport) return 0;
  return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
}

/** True when more than half the area below the pinned header shows fold-3 content. */
function isViewportMajorityInFold3(
  scrollTop = viewport?.scrollTop ?? 0,
  viewportHeight = getLiveViewportHeight()
) {
  if (!hasTermPageFold3Content()) return false;

  const pageTop = termPageEl?.offsetTop || getTermPageScrollContentTopPx(viewportHeight);
  const fold3TopInPage = getTermPageFold3TopInPagePx(viewportHeight);
  const headerBottom = getTermPinnedHeaderBottomLocalPx(viewportHeight);
  const contentHeight = viewportHeight - headerBottom;
  if (contentHeight < 1) return false;

  const fold3StartLocal = pageTop + fold3TopInPage - scrollTop;
  const visibleFold3 = Math.max(0, viewportHeight - Math.max(headerBottom, fold3StartLocal));
  return visibleFold3 > contentHeight * 0.5;
}

/** Scroll offset at the end of fold 2 — entering fold 3 territory. */
function getTermPageFold2EndScrollTop(viewportHeight = getLiveViewportHeight()) {
  const fold1 = getTermPageDefinitionSnapScrollTop(viewportHeight);
  const pageTop =
    termPageEl?.offsetTop || getTermPageScrollContentTopPx(viewportHeight);
  const fold2EndInPage = getTermPageFold2EndInPagePx(viewportHeight);
  const headerBottom = getTermPinnedHeaderBottomLocalPx(viewportHeight);
  return Math.max(fold1, Math.round(pageTop + fold2EndInPage - headerBottom));
}

/**
 * Scroll offset for fold 3.
 *
 * Snapping all the way to the bottom of the page (maxScroll) over-scrolls fold
 * 3: the page reserves extra height for the background-reveal padding, so the
 * bottom snap lifts fold 3 to the very top of the viewport and leaves a large
 * empty gap below the (often short) fold-3 content. Instead, rest fold 3 at the
 * lowest scroll that still hides fold 2:
 *
 *   - `fold2HiddenScroll` — minimum scroll that tucks the end of the fold-2
 *     chapter just under the pinned header (fold 2 fully hidden). Lower bound.
 *   - `bottomAlignScroll` — rests the bottom of fold 3's content flush with the
 *     bottom of the viewport, minimising empty space under short fold-3 chapters
 *     (the scroll stops as early as possible without leaving a gap below).
 *   - `fold3PinScroll` — tucks the *top* of fold 3 under the header; going past
 *     this only clips fold 3 off the top, so it is the upper bound for tall
 *     fold-3 chapters.
 */
/**
 * Resting scroll target for fold 3 *before* clamping to the page's max scroll.
 * Computed independently of `maxScroll` so the scrollable height can be capped
 * to it (see `applyViewportTermScrollBounds`) — that way scrolling stops with
 * fold 3 at rest instead of continuing into the empty background-reveal runway.
 */
function getTermPageFold3SnapTargetPx(viewportHeight = getLiveViewportHeight()) {
  if (!hasTermPageFold3Content()) return 0;

  const fold1Snap = getTermPageDefinitionSnapScrollTop(viewportHeight);
  const pageTop =
    termPageEl?.offsetTop || getTermPageScrollContentTopPx(viewportHeight);
  // Use the *calibrated* pinned-header band rather than the live projection: the
  // live value depends on the current scroll/pin animation state and can swing
  // wildly (seen jumping 120→390px for the same viewport), which made fold 3
  // rest at an inconsistent height — sometimes far too high. This estimate is
  // stable per viewport, so the resting position is deterministic.
  const headerBottom = getTermPageFold2PinnedHeaderBottomPx(viewportHeight);

  const fold3TopInPage = getTermPageFold3TopInPagePx(viewportHeight);
  const fold3Height = Math.max(
    0,
    getTermPageFold3ContentBottomInPagePx(viewportHeight) - fold3TopInPage
  );
  const availableBelowHeader = Math.max(0, viewportHeight - headerBottom);

  // Tuck the whole fold-2 chapter, not just its rendered image/meta content,
  // under the header. On tall screens fold 2 gets extra chapter padding so fold
  // 3 does not peek into fold 2; using only the content bottom here would undo
  // that separation when resting at fold 3.
  const fold2HideMargin = scaleLayoutPx(28, viewportHeight);
  const fold2HiddenScroll =
    pageTop +
    getTermPageFold2EndInPagePx(viewportHeight) -
    headerBottom +
    fold2HideMargin;
  const fold3PinScroll = pageTop + fold3TopInPage - headerBottom;
  // Rest fold 3 a touch above dead-centre in the area below the pinned header:
  // the image sits in the middle of the composition (not pinned high), while the
  // smaller top gap keeps fold 2 — including its image caption — tucked further
  // under the header backdrop.
  const freeSpace = Math.max(0, availableBelowHeader - fold3Height);
  const centreGap = Math.max(0, Math.min(freeSpace, freeSpace * termPageFold3CentreFrac));
  const centredScroll = fold3PinScroll - centreGap;

  const target = Math.max(
    fold2HiddenScroll,
    Math.min(fold3PinScroll, centredScroll)
  );

  return Math.round(Math.max(fold1Snap, target));
}

function getTermPageFold3SnapScrollTop(viewportHeight = getLiveViewportHeight()) {
  if (!hasTermPageFold3Content()) return 0;

  const fold1Snap = getTermPageDefinitionSnapScrollTop(viewportHeight);
  const maxScroll = getTermPageMaxScrollTopPx(viewportHeight);
  if (maxScroll <= fold1Snap + 24) return 0;

  const target = getTermPageFold3SnapTargetPx(viewportHeight);
  return Math.round(Math.min(maxScroll, Math.max(fold1Snap, target)));
}

function getTermPagePinSnapStops(viewportHeight = getLiveViewportHeight()) {
  const fold1 = getTermPageDefinitionSnapScrollTop(viewportHeight);
  if (fold1 <= 0.5) return [0];

  const stops = [0, fold1];
  const fold3 = getTermPageFold3SnapScrollTop(viewportHeight);
  if (fold3 > fold1 + 0.5) stops.push(fold3);
  return stops;
}

function isTermPageFold3AtSnapPosition(
  scrollTop = viewport?.scrollTop ?? 0,
  viewportHeight = getLiveViewportHeight()
) {
  const snapTop = getTermPageFold3SnapScrollTop(viewportHeight);
  if (snapTop <= 0.5) return false;
  return Math.abs(scrollTop - snapTop) < 4;
}

function isTermPageAtSnapStop(scrollTop, stop, viewportHeight) {
  if (Math.abs(scrollTop - stop) < 2) return true;
  if (stop === getTermPageDefinitionSnapScrollTop(viewportHeight)) {
    return isTermDefinitionAtSnapPosition(scrollTop, viewportHeight);
  }
  if (stop === getTermPageFold3SnapScrollTop(viewportHeight)) {
    return isTermPageFold3AtSnapPosition(scrollTop, viewportHeight);
  }
  return false;
}

function shouldTermPagePinSnap() {
  if (!viewport || !isViewportTermScrollable() || !isFocusActive()) return false;
  if (isTermNavigating() || termScrollResetFrame) return false;
  if (!isTermPageScrollBgMode() || focusState?.phase !== "locked") return false;
  if (viewport.classList.contains("is-term-font-scrambling")) return false;
  if (!termPageSelectedFontSettled) return false;
  return true;
}

function cancelTermPagePinSnapMotion() {
  clearTimeout(termPagePinSnapDebounceTimer);
  termPagePinSnapDebounceTimer = null;
  if (!termPagePinSnapFrame) return;
  cancelAnimationFrame(termPagePinSnapFrame);
  termPagePinSnapFrame = null;
  termPagePinSnapLockedTarget = null;
}

function isTermPageWheelSmoothing() {
  return termPageWheelSmoothFrame != null || Math.abs(termPageWheelPending) > 0.5;
}

function cancelTermPagePinSnap() {
  cancelTermPageWheelSmooth();
  cancelTermPagePinSnapMotion();
}

function cancelTermPageWheelSmooth() {
  if (termPageWheelSmoothFrame) {
    cancelAnimationFrame(termPageWheelSmoothFrame);
    termPageWheelSmoothFrame = null;
  }
  termPageWheelPending = 0;
}

function syncAfterTermPageWheelScroll(wheelDelta = 0) {
  syncTermScrollBgPosition(currentLayout);
  syncTermHeaderPinState(currentLayout);
  termPagePrevScrollTop = viewport.scrollTop;
  noteTermPageScrollInput(wheelDelta);
}

function applyTermPageWheelScroll(deltaY) {
  if (!viewport) return;
  if (Math.abs(deltaY) < TERM_PAGE_WHEEL_FINE_MAX) {
    viewport.scrollTop += deltaY;
    syncAfterTermPageWheelScroll(deltaY);
    return;
  }
  cancelTermPagePinSnapMotion();
  termPageWheelPending += deltaY;
  if (!termPageWheelSmoothFrame && Math.abs(termPageWheelPending) > 0.5) {
    const step = termPageWheelPending * 0.35;
    const applied = Math.abs(step) < 1 ? termPageWheelPending : step;
    termPageWheelPending -= applied;
    viewport.scrollTop += applied;
    syncAfterTermPageWheelScroll(applied);
  }
  ensureTermPageWheelSmoothLoop();
}

function ensureTermPageWheelSmoothLoop() {
  if (termPageWheelSmoothFrame || !viewport) return;

  function frame() {
    if (!viewport || !isViewportTermScrollable() || !isFocusActive() || isTermNavigating()) {
      cancelTermPageWheelSmooth();
      return;
    }
    if (Math.abs(termPageWheelPending) < 0.5) {
      termPageWheelPending = 0;
      termPageWheelSmoothFrame = null;
      noteTermPageScrollInput();
      return;
    }
    const step = termPageWheelPending * 0.35;
    const applied = Math.abs(step) < 1 ? termPageWheelPending : step;
    termPageWheelPending -= applied;
    viewport.scrollTop += applied;
    syncAfterTermPageWheelScroll(applied);
    termPageWheelSmoothFrame = requestAnimationFrame(frame);
  }

  termPageWheelSmoothFrame = requestAnimationFrame(frame);
}

function shouldInterruptTermPagePinSnap(wheelDelta) {
  if (!termPagePinSnapFrame || wheelDelta === 0) return false;
  if (Math.abs(wheelDelta) < TERM_PAGE_PIN_SNAP_INTERRUPT_MIN) return false;
  if (termPagePinSnapLockedTarget == null) return true;
  const scrollTop = viewport?.scrollTop ?? 0;
  const opposing =
    (termPagePinSnapLockedTarget > scrollTop && wheelDelta < 0) ||
    (termPagePinSnapLockedTarget < scrollTop && wheelDelta > 0);
  return opposing;
}

function noteTermPageScrollInput(wheelDelta = 0) {
  if (wheelDelta !== 0) {
    termPagePinScrollDir = wheelDelta > 0 ? 1 : -1;
  }
  if (isTermPageWheelSmoothing()) return;
  if (!shouldTermPagePinSnap()) return;
  // Programmatic scroll ticks from the settle animation must not restart debounce.
  if (termPagePinSnapFrame && wheelDelta === 0) return;
  if (shouldInterruptTermPagePinSnap(wheelDelta)) {
    cancelAnimationFrame(termPagePinSnapFrame);
    termPagePinSnapFrame = null;
    termPagePinSnapLockedTarget = null;
  } else if (termPagePinSnapFrame) {
    return;
  }
  clearTimeout(termPagePinSnapDebounceTimer);
  termPagePinSnapDebounceTimer = setTimeout(() => {
    termPagePinSnapDebounceTimer = null;
    snapTermPagePinScroll();
  }, LAYOUT.termPagePinSnapDebounceMs);
}

function clampSnapTargetToScrollDir(scrollTop, target) {
  if (termPagePinScrollDir > 0 && target < scrollTop - 0.5) return scrollTop;
  if (termPagePinScrollDir < 0 && target > scrollTop + 0.5) return scrollTop;
  return target;
}

function resolveTermPageSegmentSnapTarget(
  scrollTop,
  lower,
  upper,
  viewportHeight,
  isFirstSegment,
  isLastSegment = false
) {
  const span = upper - lower;
  if (span < 1) return lower;

  if (isTermPageAtSnapStop(scrollTop, lower, viewportHeight)) return lower;
  if (isTermPageAtSnapStop(scrollTop, upper, viewportHeight)) return upper;

  if (isLastSegment) {
    if (isViewportMajorityInFold3(scrollTop, viewportHeight)) {
      return clampSnapTargetToScrollDir(scrollTop, upper);
    }

    const fold2EndScroll = getTermPageFold2EndScrollTop(viewportHeight);
    if (scrollTop > fold2EndScroll) {
      return clampSnapTargetToScrollDir(scrollTop, fold2EndScroll);
    }
    if (termPagePinScrollDir < 0) {
      const fold2Span = Math.max(1, fold2EndScroll - lower);
      if (scrollTop < lower + fold2Span * LAYOUT.termPagePinSnapCommitFrac) {
        return clampSnapTargetToScrollDir(scrollTop, lower);
      }
    }
    return scrollTop;
  }

  const frac = isFirstSegment
    ? LAYOUT.termPageFold1SnapCommitFrac
    : LAYOUT.termPagePinSnapCommitFrac;
  const commitLine = lower + span * frac;
  const releaseLine = lower + span * (1 - frac);
  const midLine = lower + span * 0.5;

  if (isFirstSegment && scrollTop <= upper * 0.15) {
    return clampSnapTargetToScrollDir(scrollTop, 0);
  }
  if (scrollTop >= commitLine) {
    return clampSnapTargetToScrollDir(scrollTop, upper);
  }
  if (scrollTop <= releaseLine) {
    if (termPagePinScrollDir < 0) {
      if (isFirstSegment) return clampSnapTargetToScrollDir(scrollTop, 0);
      return clampSnapTargetToScrollDir(scrollTop, lower);
    }
    if (termPagePinScrollDir > 0) {
      if (isFirstSegment) {
        return scrollTop >= midLine
          ? clampSnapTargetToScrollDir(scrollTop, upper)
          : scrollTop;
      }
      return scrollTop;
    }
    return clampSnapTargetToScrollDir(
      scrollTop,
      scrollTop - lower < span * 0.5 ? lower : upper
    );
  }
  if (termPagePinScrollDir > 0) {
    if (isFirstSegment && scrollTop < commitLine) return scrollTop;
    return clampSnapTargetToScrollDir(scrollTop, upper);
  }
  if (termPagePinScrollDir < 0) return clampSnapTargetToScrollDir(scrollTop, lower);
  return clampSnapTargetToScrollDir(
    scrollTop,
    scrollTop - lower < span * 0.5 ? lower : upper
  );
}

function resolveTermPagePinSnapTarget(scrollTop, viewportHeight) {
  const stops = getTermPagePinSnapStops(viewportHeight);
  const lastStop = stops[stops.length - 1];

  if (scrollTop > lastStop + 0.5) {
    if (termPagePinScrollDir < 0) return lastStop;
    return scrollTop;
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const lower = stops[i];
    const upper = stops[i + 1];
    if (scrollTop <= upper + 0.5) {
      return resolveTermPageSegmentSnapTarget(
        scrollTop,
        lower,
        upper,
        viewportHeight,
        i === 0,
        i === stops.length - 2
      );
    }
  }

  return scrollTop;
}

function snapTermPagePinScroll() {
  if (!shouldTermPagePinSnap()) return;

  const viewportHeight = getLiveViewportHeight();
  const stops = getTermPagePinSnapStops(viewportHeight);
  if (stops.length < 2 || stops[1] <= 0.5) return;

  const scrollTop = viewport.scrollTop;
  if (scrollTop <= 0.5) return;

  const target = resolveTermPagePinSnapTarget(scrollTop, viewportHeight);
  if (Math.abs(scrollTop - target) < 1) return;
  animateTermPagePinSnapTo(target);
}

function animateTermPagePinSnapTo(targetTop) {
  if (!viewport) return;

  cancelTermPageWheelSmooth();
  clearTimeout(termPagePinSnapDebounceTimer);
  termPagePinSnapDebounceTimer = null;
  if (termPagePinSnapFrame) {
    cancelAnimationFrame(termPagePinSnapFrame);
    termPagePinSnapFrame = null;
  }

  const startTop = viewport.scrollTop;
  const distance = Math.abs(targetTop - startTop);
  if (distance < 1) {
    termPagePinSnapLockedTarget = null;
    viewport.scrollTop = targetTop;
    syncTermScrollBgPosition(currentLayout);
    syncTermHeaderPinState(currentLayout);
    return;
  }

  if (distance <= LAYOUT.termPagePinSnapInstantPx) {
    termPagePinSnapLockedTarget = null;
    viewport.scrollTop = targetTop;
    syncTermScrollBgPosition(currentLayout);
    syncTermHeaderPinState(currentLayout);
    return;
  }

  termPagePinSnapLockedTarget = targetTop;
  const fold1Snap = getTermPageDefinitionSnapScrollTop();
  const isFold1Snap =
    Math.abs(targetTop - fold1Snap) < 2 && startTop < targetTop - 0.5;
  const snapStops = getTermPagePinSnapStops();
  const pinSpan = Math.max(
    1,
    (snapStops[snapStops.length - 1] ?? fold1Snap) - snapStops[0]
  );
  const baseDurationMs = isFold1Snap
    ? LAYOUT.termPageFold1SnapDurationMs
    : LAYOUT.termPagePinSnapDurationMs;
  const durationMs = clamp(
    baseDurationMs * (0.55 + (distance / pinSpan) * 0.45),
    baseDurationMs * 0.5,
    baseDurationMs
  );
  const easePinSnap = isFold1Snap ? easeOutQuart : easeOutCubic;
  const startTime = performance.now();

  function tick(now) {
    const t = clamp((now - startTime) / durationMs, 0, 1);
    viewport.scrollTop = Math.round(
      startTop + (targetTop - startTop) * easePinSnap(t)
    );
    syncTermScrollBgPosition(currentLayout);
    syncTermHeaderPinState(currentLayout);

    if (t < 1) {
      termPagePinSnapFrame = requestAnimationFrame(tick);
      return;
    }

    viewport.scrollTop = targetTop;
    termPagePinSnapFrame = null;
    termPagePinSnapLockedTarget = null;
    syncTermScrollBgPosition(currentLayout);
    syncTermHeaderPinState(currentLayout);
  }

  termPagePinSnapFrame = requestAnimationFrame(tick);
}

function getTermSimilarLabelPinTopPx(
  viewportHeight = getLiveViewportHeight(),
  scrollTop = viewport?.scrollTop ?? 0
) {
  if (termSimilarLabelRestTop != null) {
    return (
      termSimilarLabelRestTop -
      getTermHeaderPinScrollLiftPx(scrollTop, viewportHeight)
    );
  }
  return getPinnedFocusRowTopPx(viewportHeight);
}

function isTermScrollBgFullyCovered(viewportHeight = currentLayout?.viewportHeight ?? viewport?.clientHeight ?? 0) {
  if (!viewport || !isTermPageScrollBgMode()) return false;
  return viewport.scrollTop >= getTermImageCutYpx(viewportHeight);
}

function isTermPageBleedImageInFrame(
  viewportHeight = getLiveViewportHeight(),
  scrollTop = viewport?.scrollTop ?? 0
) {
  if (!isTermPageFocusVisual() || !termPageBleedImage?.url) return false;
  if (isTermPageScrollBgMode()) {
    return !isTermScrollBgFullyCovered(viewportHeight);
  }
  return (
    Boolean(
      bleedBackdropEl &&
        !bleedBackdropEl.hidden &&
        bleedBackdropEl.classList.contains("is-term-page")
    ) && getTermPageBleedBandHeightPx() > 0
  );
}

function isTermPageBleedCaptionVisible(
  viewportHeight = getLiveViewportHeight(),
  scrollTop = viewport?.scrollTop ?? 0
) {
  if (!termBleedCaptionEl?.textContent?.trim()) return false;
  if (!isTermPageBleedImageInFrame(viewportHeight, scrollTop)) return false;
  if (isTermPageScrollBgMode() && scrollTop > 0) return false;
  return true;
}

function syncActivePageCensorOverlays() {
  syncMediaCensorPlaceholder();
  if (!pageCensorLayer) return;
  if (viewport?.classList.contains("is-term-switch-censor")) {
    rebuildFullPageCensorOverlays();
    return;
  }
  if (hoveredSameObjectMentionId) {
    rebuildPageCensorOverlays();
  }
}

function applyTermPageBleedCaptionVisibility(layout = currentLayout) {
  if (!termBleedCaptionEl || !termBleedCaptionEl.textContent?.trim()) return;
  const viewportHeight = layout?.viewportHeight ?? getLiveViewportHeight();
  const scrollTop = viewport?.scrollTop ?? 0;
  const wasVisible = !termBleedCaptionEl.hidden;
  const visible = isTermPageBleedCaptionVisible(viewportHeight, scrollTop);
  termBleedCaptionEl.hidden = !visible;
  termBleedCaptionEl.setAttribute("aria-hidden", visible ? "false" : "true");
  if (wasVisible !== visible) {
    syncActivePageCensorOverlays();
  }
}

function getTermPageBottomFocusRowTopPx(viewportHeight) {
  return (
    viewportHeight -
    getTermPageTitleBandHeightPx(viewportHeight) +
    getTermPageTitleBaselineInsetPx(viewportHeight) +
    LAYOUT.termPageTitleBaselineNudgePx
  );
}

function getFocusRayGroupScrollTransform(layout = currentLayout) {
  if (!focusState) return null;
  return getGroupTransform(focusState.activeIndex, layout);
}

function applyFocusRayScrollAnchor(layout = currentLayout) {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup || !focusState) return;
  const transform = getFocusRayGroupScrollTransform(layout);
  if (!transform) return;
  const { anchor, rotation } = transform;
  if (
    !Number.isFinite(anchor?.x) ||
    !Number.isFinite(anchor?.y) ||
    !Number.isFinite(rotation)
  ) {
    return;
  }
  rayGroup.setAttribute(
    "transform",
    `translate(${anchor.x}, ${anchor.y}) rotate(${rotation})`
  );
}

/** Screen-pixel rise on the shared term-row lift group (matches similar-label screenShift). */
function getTermScrollLiftGroup() {
  return getFocusRayGroup()?.querySelector(".sun-term-scroll-lift") ?? null;
}

function applyTermPageScrollLiftTransform() {
  const scrollTop = viewport?.scrollTop ?? 0;
  const canLift =
    isViewportTermScrollable() ||
    (isTermPageScrollBgMode() &&
      focusState?.phase === "locked" &&
      scrollTop > 0.5);
  if (!isTermPageScrollBgMode() || !canLift) {
    getTermScrollLiftGroup()?.removeAttribute("transform");
    svgEl?.style.removeProperty("transform");
    return;
  }

  const shift = termPageCensoredScrollShiftY;
  const rise = Math.max(0, -shift);
  getTermScrollLiftGroup()?.removeAttribute("transform");

  if (!svgEl) return;
  if (rise < 0.01) {
    svgEl.style.removeProperty("transform");
    return;
  }
  svgEl.style.transform = `translateY(${shift}px)`;
}

/** @deprecated use applyTermPageScrollLiftTransform */
function applyTermPageHeaderScreenShift() {
  applyTermPageScrollLiftTransform();
}

function getTermScrollBgOverlapTopPx(
  viewportHeight,
  scrollTop = viewport?.scrollTop ?? 0
) {
  if (termScrollBgEl && !termScrollBgEl.hidden) {
    const rect = termScrollBgEl.getBoundingClientRect();
    if (rect.height > 0.5) return rect.top;
  }
  const scrollportTop = viewport?.getBoundingClientRect().top ?? 0;
  return scrollportTop + getTermImageCutYpx(viewportHeight) - scrollTop;
}

function clearTermHeaderScrollVisuals() {
  cancelTermPagePinSnap();
  termPagePinSnapLockedTarget = null;
  termPagePinScrollDir = 0;
  termPagePrevScrollTop = 0;
  if (svgEl) svgEl.style.removeProperty("transform");
  getTermScrollLiftGroup()?.removeAttribute("transform");
  if (termSimilarLabelWrapEl) termSimilarLabelWrapEl.style.removeProperty("transform");
  clearPinnedSimilarGroupBackdrop();
  termPageCensoredScrollShiftY = 0;
  clearSelectedTermPostPinScroll();
  termSimilarLabelRestTop = null;
  termSimilarLabelIsPinned = false;
  termPageHeaderRowRestTop = null;
  if (currentLayout && focusState) {
    applyFocusRayScrollAnchor(currentLayout);
    applyTermPageCensoredBaselineAlign();
  }
}

function syncTermHeaderScrollTransform(layout = currentLayout) {
  const scrollTop = viewport?.scrollTop ?? 0;
  const canSync =
    isViewportTermScrollable() ||
    (focusState?.phase === "locked" && scrollTop > 0.5);

  if (!svgEl || !isTermPageScrollBgMode() || !canSync) {
    clearTermHeaderScrollVisuals();
    return;
  }

  syncTermScrollBgPosition(layout);
  const viewportHeight = layout?.viewportHeight ?? getLiveViewportHeight();

  termPageCensoredScrollShiftY = getTermCensoredGroupScreenShiftY(
    scrollTop,
    viewportHeight
  );
  applyFocusRayScrollAnchor(layout);
  applyTermPageScrollLiftTransform();
  // Wrap transforms are settled at scrollTop=0; scroll lift moves the whole SVG.
  syncTermHeaderBackdrop(layout);

  if (
    (termPageSelectedFontSettled || termPageLayoutAnimActive) &&
    !viewport?.classList.contains("is-term-font-scrambling")
  ) {
    if (!termFontOverlayEl?.hidden) syncTermFontOverlayPosition();
    updateTermPageSimilarLabel(layout);
  }

  if (
    hoveredSameObjectMentionId &&
    !isTermNavigating() &&
    !viewport?.classList.contains("is-term-font-scrambling")
  ) {
    syncMediaCensorPlaceholder();
    rebuildPageCensorOverlays();
  }

  syncTermPageScrollReveal(layout);
}

function getFocusRowTopPx(viewportHeight) {
  if (isTermPageScrollBgMode() && isViewportTermScrollable()) {
    return getTermPageBottomFocusRowTopPx(viewportHeight);
  }
  if (!TERM_PAGE_LEGACY_CONTENT_ENABLED) {
    return getTermPageBottomFocusRowTopPx(viewportHeight);
  }
  return Math.round(
    LAYOUT.focusRowTopRefPx * (viewportHeight / LAYOUT.focusRowTopRefHeight)
  );
}

/** Cached ratio: glyph shift when switching dominant-baseline middle→alphabetic, per font px. */
let termMiddleToAlphabeticRatio = null;

/**
 * Measure the exact vertical glyph shift between `dominant-baseline:middle` and
 * `:alphabetic` for the term font, normalized per font pixel. Measuring (instead of
 * hardcoding) keeps the rise anchor and the locked alphabetic baseline continuous, so
 * the title doesn't jump when the focus rise hands off to the term-page scramble.
 */
function measureTermMiddleToAlphabeticRatio() {
  if (!svgEl) return null;
  const probeSize = 100;
  const makeBboxY = (baseline) => {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("class", "sun-term");
    t.setAttribute("x", "0");
    t.setAttribute("y", "0");
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", baseline);
    t.setAttribute("style", `font-size:${probeSize}px`);
    t.setAttribute("visibility", "hidden");
    t.textContent = "מבחןAQ";
    svgEl.appendChild(t);
    let y = NaN;
    try {
      y = t.getBBox().y;
    } catch {
      y = NaN;
    }
    t.remove();
    return y;
  };
  const midY = makeBboxY("middle");
  const alphaY = makeBboxY("alphabetic");
  if (!Number.isFinite(midY) || !Number.isFinite(alphaY)) return null;
  return (midY - alphaY) / probeSize;
}

/** Anchor Y delta so middle- and alphabetic-baseline text share the same visual band. */
function getTermMiddleToAlphabeticAnchorOffset(fontSizePx = LAYOUT.fontSize) {
  if (termMiddleToAlphabeticRatio == null) {
    termMiddleToAlphabeticRatio = measureTermMiddleToAlphabeticRatio() ?? 0.252;
  }
  return fontSizePx * termMiddleToAlphabeticRatio;
}

// Re-measure once the real fonts load — fallback metrics differ from RoobertVF.
if (typeof document !== "undefined" && document.fonts?.ready) {
  document.fonts.ready.then(() => {
    termMiddleToAlphabeticRatio = null;
  });
}

function usesTermPageAlphabeticBaseline() {
  if (TERM_PAGE_LEGACY_CONTENT_ENABLED || !focusState) return false;
  return (
    isFocusTermLayoutPhase(focusState.phase) ||
    focusState.riseT >= 1
  );
}

function getFocusRowRiseTargetPx(viewportHeight) {
  const exitPinnedBaselineY =
    focusState?.phase === "unfocusing" && focusState.exitFromPinned
      ? focusState.exitPinnedBaselineY
      : null;
  const finalY = Number.isFinite(exitPinnedBaselineY)
    ? exitPinnedBaselineY
    : getFocusRowTopPx(viewportHeight);
  if (usesTermPageAlphabeticBaseline()) return finalY;
  if (focusState.riseT <= 0) return finalY;
  return finalY - getTermMiddleToAlphabeticAnchorOffset();
}

function resetViewportTermScroll() {
  cancelTermPagePinSnap();
  if (viewport) {
    viewport.scrollTop = 0;
    viewport.classList.remove(
      "is-term-scrollable",
      "is-term-header-pinned",
      "is-term-bleed-scroll-active",
      "is-term-scroll-bg-covered",
      "is-term-scroll-content"
    );
    viewport.style.removeProperty("--term-header-fixed-height");
    clearPinnedSimilarGroupBackdrop();
  }
  if (scrollSpacerEl) {
    scrollSpacerEl.style.height = "0";
    scrollSpacerEl.style.marginTop = "0";
  }
  if (gridEl) gridEl.style.height = "";
  if (termScrollBgEl) {
    termScrollBgEl.hidden = true;
    termScrollBgEl.style.top = "";
    termScrollBgEl.style.height = "";
  }
  if (termSimilarLabelWrapEl) {
    termSimilarLabelWrapEl.classList.remove("is-term-header-pinned");
    termSimilarLabelWrapEl.hidden = true;
    termSimilarLabelWrapEl.setAttribute("aria-hidden", "true");
  }
  if (termSimilarLabelEl) {
    termSimilarLabelEl.classList.remove("is-term-header-pinned");
  }
  clearTermHeaderScrollVisuals();
}

function getTermImageCutYpx(viewportHeight) {
  if (focusState && isTermPageFocusVisual()) {
    return viewportHeight - getTermPageBleedImageClipPx(viewportHeight);
  }
  return viewportHeight - getTermPageTitleBandHeightPx(viewportHeight);
}

function getTermPageBleedImageClipPx(viewportHeight = getLiveViewportHeight()) {
  const band = getTermPageBleedBandHeightPx(viewportHeight);
  if (band <= 0) return 0;
  const fullBand = getTermPageTitleBandHeightPx(viewportHeight);
  const fullOverlap = getBleedImageBandOverlapPx(viewportHeight);
  const overlap = fullBand > 0 ? fullOverlap * (band / fullBand) : 0;
  return Math.max(0, band - overlap);
}

function getTermPageMaxScrollRisePx(viewportHeight) {
  return (
    getTermImageCutYpx(viewportHeight) + getTermPageGroupPinExtraRisePx(viewportHeight)
  );
}

function getTermScrollRangePx(viewportHeight) {
  return (
    getTermPageMaxScrollRisePx(viewportHeight) +
    getTermPageScrollPaddingBottomPx(viewportHeight)
  );
}

function syncTermScrollBgPosition(layout = currentLayout) {
  if (!termScrollBgEl || termScrollBgEl.hidden || !viewport) return;
  const viewportHeight = getLiveViewportHeight();
  const imageCutY = getTermImageCutYpx(viewportHeight);
  const scrollTop = viewport.scrollTop;
  const rise = getTermPageScrollRisePx(scrollTop, viewportHeight);
  const fullyCovered = rise >= imageCutY;

  viewport?.classList.toggle("is-term-scroll-bg-covered", fullyCovered);

  termScrollBgEl.style.position = "fixed";
  termScrollBgEl.style.left = "0";
  termScrollBgEl.style.right = "0";
  termScrollBgEl.style.width = "100%";

  if (fullyCovered) {
    termScrollBgEl.style.top = "0";
    termScrollBgEl.style.height = `${viewportHeight}px`;
    return;
  }

  termScrollBgEl.style.top = `${imageCutY - rise}px`;
  const bandHeight = getTermPageTitleBandHeightPx(viewportHeight);
  termScrollBgEl.style.height =
    rise > 0
      ? `${rise + bandHeight + LAYOUT.termPageHeaderBackdropBottomExtra}px`
      : "0";
}

function updateTermScrollBg(layout) {
  if (!termScrollBgEl) return;
  const show =
    isTermPageScrollBgMode() &&
    isTermPageFocusVisual() &&
    (focusState?.phase === "locked");

  if (!show) {
    termScrollBgEl.hidden = true;
    termScrollBgEl.style.position = "";
    termScrollBgEl.style.top = "";
    termScrollBgEl.style.height = "";
    termScrollBgEl.style.left = "";
    termScrollBgEl.style.right = "";
    termScrollBgEl.style.width = "";
    return;
  }

  const { viewportHeight } = layout;
  termScrollBgEl.hidden = false;
  syncTermScrollBgPosition(layout);
}

function getTermPageBottomPadding(viewportHeight = getLiveViewportHeight()) {
  return LAYOUT.termPageBottomMargin + getTermPageScrollPaddingBottomPx(viewportHeight);
}

function getTermContentBottom() {
  let bottom = 0;
  if (termPageEl && !termPageEl.hidden) {
    bottom = Math.max(bottom, termPageEl.offsetTop + termPageEl.offsetHeight);
  }
  if (termMetaEl && !termMetaEl.hidden) {
    bottom = Math.max(bottom, termMetaEl.offsetTop + termMetaEl.offsetHeight);
  }
  if (isTermPageScrollContentMode()) {
    bottom = Math.max(bottom, getTermPageScrollContentBottomPx());
  }
  return bottom;
}

function getTermDefinitionTopPx(viewportHeight) {
  const focusTop = getFocusRowTopPx(viewportHeight);
  return (
    focusTop + LAYOUT.fontSize / 2 + LAYOUT.termPageGapBelowTitle
  );
}

function getTermFixedHeaderBottomPx(viewportHeight) {
  const focusTop = getFocusRowTopPx(viewportHeight);
  const selectedFontSize = TERM_PAGE_LEGACY_CONTENT_ENABLED
    ? LAYOUT.fontSize
    : getTermPageSelectedFontSizePx();
  const metaTop = focusTop - selectedFontSize / 2;
  const termRowBottom = focusTop + selectedFontSize * 0.12;
  let bottom = termRowBottom;

  if (TERM_PAGE_LEGACY_CONTENT_ENABLED && termMetaEl && !termMetaEl.hidden) {
    bottom = Math.max(bottom, metaTop + termMetaEl.offsetHeight);
  }

  if (TERM_PAGE_LEGACY_CONTENT_ENABLED) {
    bottom = Math.min(bottom, getTermDefinitionTopPx(viewportHeight));
  } else if (isTermPageScrollBgMode()) {
    const bandTop = parseFloat(
      viewport?.style.getPropertyValue("--term-similar-label-pinned-top") || ""
    );
    const bandHeight = parseFloat(
      viewport?.style.getPropertyValue("--term-similar-label-pinned-height") || ""
    );
    if (Number.isFinite(bandTop) && Number.isFinite(bandHeight)) {
      return Math.ceil(bandTop + bandHeight);
    }
    if (!isTermHeaderPinned()) return getSiteNavHeightPx();
    const labelHeight = termSimilarLabelEl?.offsetHeight || 22;
    return getSiteNavHeightPx() + labelHeight + LAYOUT.termPageSimilarLabelGap;
  } else {
    bottom = Math.max(bottom, viewportHeight);
  }

  return Math.ceil(bottom);
}

function syncTermPageBleedClipForScroll() {
  if (!isTermPageFocusVisual()) {
    syncTermPageBleedClip();
    return;
  }
  if (isTermPageScrollBgMode() && viewport) {
    const viewportHeight = currentLayout?.viewportHeight ?? viewport.clientHeight;
    const fullyCovered = isTermScrollBgFullyCovered(viewportHeight);
    viewport.classList.toggle("is-term-bleed-scroll-active", viewport.scrollTop > 0);
    if (fullyCovered) {
      setTermPageBleedClipHeight(0);
    } else {
      syncTermPageBleedClip();
    }
    syncBleedBackdropDarkInvert();
    return;
  }
  viewport?.classList.remove("is-term-bleed-scroll-active");
  syncTermPageBleedClip();
  syncBleedBackdropDarkInvert();
}

function syncTermHeaderPinState(layout = currentLayout) {
  const scrollTop = viewport?.scrollTop ?? 0;
  const keepScrollHeader =
    isViewportTermScrollable() ||
    (isTermPageScrollBgMode() && focusState?.phase === "locked" && scrollTop > 0.5);

  if (!viewport || !keepScrollHeader) {
    viewport?.classList.remove(
      "is-term-header-pinned",
      "is-term-bleed-scroll-active",
      "is-term-scroll-bg-covered"
    );
    termSimilarLabelWrapEl?.classList.remove("is-term-header-pinned");
    termSimilarLabelEl?.classList.remove("is-term-header-pinned");
    clearTermHeaderScrollVisuals();
    syncTermPageBleedClipForScroll();
    return;
  }

  const viewportHeight = layout?.viewportHeight ?? viewport.clientHeight;
  const wasPinned = isTermHeaderPinned();

  syncTermScrollBgPosition(layout);
  syncTermHeaderScrollTransform(layout);

  if (
    termPageSelectedFontSettled &&
    isTermPageScrollBgMode() &&
    !viewport?.classList.contains("is-term-font-scrambling")
  ) {
    updateTermPageSimilarLabel(layout);
  }

  const pinned = TERM_PAGE_LEGACY_CONTENT_ENABLED ? true : termSimilarLabelIsPinned;

  viewport.classList.toggle("is-term-header-pinned", pinned);
  viewport.classList.toggle(
    "is-term-bleed-scroll-active",
    viewport.scrollTop > 0
  );
  termSimilarLabelWrapEl?.classList.toggle("is-term-header-pinned", pinned);
  termSimilarLabelEl?.classList.toggle("is-term-header-pinned", pinned);

  syncTermPageBleedClipForScroll();
  applyTermPageBleedCaptionVisibility(layout);
  if (shouldApplyMediaCensorPlaceholder()) {
    syncMediaCensorFrame(layout);
  }

  if (pinned !== wasPinned && currentLayout) {
    if (isTermPageScrollBgMode()) {
      syncTermHeaderScrollTransform(currentLayout);
    } else {
      termPageSiblingLayoutApplied = false;
      applyFocusTermPageLayout();
      render(currentLayout);
      if (layout) updateTermPageSimilarLabel(layout);
    }
  }
}

function applyViewportTermScrollBounds(viewportHeight) {
  let totalHeight;
  let scrollContentBottom = 0;
  const usesBleedScrollSpacer =
    isTermPageScrollBgMode() && termScrollBgEl && !termScrollBgEl.hidden;

  if (usesBleedScrollSpacer) {
    const bleedScrollHeight = viewportHeight + getTermScrollRangePx(viewportHeight);
    scrollContentBottom = getTermPageScrollContentBottomPx();
    totalHeight = Math.max(bleedScrollHeight, scrollContentBottom);
  } else {
    totalHeight = getTermContentBottom();
    scrollContentBottom = totalHeight;
  }

  // Fold 3 rests partway down the page and the bleed background finishes
  // revealing well before it, so any scroll runway *below* fold 3's resting
  // position is dead space the reader is forced to drag through. Pin the
  // scrollable height to exactly the fold-3 rest so that snap *is* the bottom of
  // the page: extend up to it when the content alone is shorter (otherwise the
  // bleed spacer overshoots and leaves an empty tail past the snap) and trim it
  // when the bleed runway would otherwise overshoot — but never trim below the
  // real content. The page element is absolutely positioned, so its bottom edge
  // (via minHeight) sets scrollHeight; the spacer is matched to it below.
  let fold3ScrollCap = 0;
  if (isTermPageScrollContentMode() && hasTermPageFold3Content() && termPageEl) {
    const pageTop = termPageEl.offsetTop || 0;
    const fold3Rest = viewportHeight + getTermPageFold3SnapTargetPx(viewportHeight);
    if (fold3Rest > viewportHeight + 1) {
      const capped = Math.max(fold3Rest, scrollContentBottom);
      fold3ScrollCap = capped;
      totalHeight = capped;
      termPageEl.style.paddingBottom = "0px";
      termPageEl.style.minHeight = `${Math.max(0, capped - pageTop)}px`;
    }
  }

  const scrollTop = viewport?.scrollTop ?? 0;
  const preserveScrollMode =
    isTermPageScrollBgMode() &&
    focusState?.phase === "locked" &&
    scrollTop > 0.5;
  if (preserveScrollMode) {
    totalHeight = Math.max(totalHeight, viewportHeight + scrollTop + 1);
  }
  const needsScroll = totalHeight > viewportHeight + 1 || preserveScrollMode;
  const headerBottom = getTermFixedHeaderBottomPx(viewportHeight);

  if (viewport) {
    viewport.style.setProperty(
      "--term-header-fixed-height",
      needsScroll ? `${headerBottom}px` : "0px"
    );
  }

  if (scrollSpacerEl) {
    if (!needsScroll) {
      scrollSpacerEl.style.height = "0";
      scrollSpacerEl.style.marginTop = "0";
    } else if (usesBleedScrollSpacer) {
      // Absolute scroll content sets scrollHeight from its bottom edge; park the
      // spacer below that content so bleed-scroll range always reaches imageCutY.
      const spacerTop = Math.max(0, scrollContentBottom);
      // When fold 3 caps the scroll, the (absolute) page already defines the
      // full scrollHeight — adding the usual runway here would re-introduce the
      // empty tail below fold 3, so keep the spacer flush with the content.
      const spacerHeight = fold3ScrollCap
        ? Math.max(0, totalHeight - spacerTop)
        : Math.max(
            getTermPageScrollPaddingBottomPx(viewportHeight),
            totalHeight - spacerTop
          );
      scrollSpacerEl.style.marginTop = `${spacerTop}px`;
      scrollSpacerEl.style.height = `${spacerHeight}px`;
    } else {
      scrollSpacerEl.style.marginTop = "0";
      scrollSpacerEl.style.height = `${Math.max(0, totalHeight - viewportHeight)}px`;
    }
  }

  if (gridEl) {
    gridEl.style.height = needsScroll
      ? `${totalHeight - 2 * GRID.margin}px`
      : "";
  }

  viewport?.classList.toggle("is-term-scrollable", needsScroll);
  if (needsScroll) {
    if (
      currentLayout &&
      Number.isFinite(currentLayout.viewportWidth) &&
      Number.isFinite(currentLayout.viewportHeight)
    ) {
      syncTermHeaderPinState(currentLayout);
    } else {
      refreshMapLayoutFromViewport();
      syncTermHeaderPinState(currentLayout);
    }
  }
}

function isViewportTermScrollable() {
  return viewport?.classList.contains("is-term-scrollable") ?? false;
}

function isFocusActive() {
  return focusState !== null;
}

function cancelFocusAnimation() {
  if (focusAnimFrame) {
    cancelAnimationFrame(focusAnimFrame);
    focusAnimFrame = null;
  }
}

function cancelBackCircleAnimation() {
  if (backCircleAnimFrame) {
    cancelAnimationFrame(backCircleAnimFrame);
    backCircleAnimFrame = null;
  }
  backCircleOutComplete = null;
}

function isBackMiniCircleVisible(backCircleT, backMiniExitT) {
  return backCircleT > 0.001 || backMiniExitT < 0.999;
}

function isTermNavigating() {
  return termNavState !== null || termScrollResetFrame !== null;
}

function cancelTermScrollReset() {
  if (!termScrollResetFrame) return;
  cancelAnimationFrame(termScrollResetFrame);
  termScrollResetFrame = null;
  setNavigatingUI(false);
}

function animateViewportScrollToTop(onComplete) {
  if (!viewport || viewport.scrollTop <= 0) {
    onComplete();
    return;
  }

  cancelTermPagePinSnap();
  cancelTermScrollReset();
  setNavigatingUI(true);

  const startTop = viewport.scrollTop;
  const startTime = performance.now();
  const durationMs = TERM_NAV_TIMING.scrollResetMs;

  function tick(now) {
    const t = clamp((now - startTime) / durationMs, 0, 1);
    viewport.scrollTop = Math.round(startTop + (0 - startTop) * easeOutCubic(t));
    syncTermScrollBgPosition(currentLayout);
    syncTermHeaderPinState(currentLayout);

    if (t < 1) {
      termScrollResetFrame = requestAnimationFrame(tick);
      return;
    }

    viewport.scrollTop = 0;
    termScrollResetFrame = null;
    syncTermScrollBgPosition(currentLayout);
    syncTermHeaderPinState(currentLayout);
    onComplete();
  }

  termScrollResetFrame = requestAnimationFrame(tick);
}

function setNavigatingUI(active) {
  viewport?.classList.toggle("is-navigating", active);
}

function buildTermLocationIndex() {
  termLocationById = new Map();
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    for (let termIndex = 0; termIndex < groups[groupIndex].terms.length; termIndex++) {
      const id = groups[groupIndex].terms[termIndex].id;
      if (id) termLocationById.set(id, { groupIndex, termIndex });
    }
  }
}

function findTermLocation(termId) {
  return termLocationById.get(termId) ?? null;
}

function getUnfocusRiseMs() {
  if (termNavState?.phase === "exiting") return TERM_NAV_TIMING.exitRiseMs;
  return UNFOCUS_TIMING.riseMs;
}

function getUnfocusExitMs() {
  if (termNavState?.phase === "exiting") return TERM_NAV_TIMING.exitFadeMs;
  return UNFOCUS_TIMING.exitMs;
}

function getFocusExitMs() {
  return termNavState?.phase === "entering"
    ? TERM_NAV_TIMING.focusExitMs
    : LAYOUT.focusExitMs;
}

function getFocusRiseMs() {
  return termNavState?.phase === "entering"
    ? TERM_NAV_TIMING.focusRiseMs
    : LAYOUT.focusRiseMs;
}

/** Elapsed ms before the title-row carousel may start (after arc exit + rise). */
function getFocusReorderStartMs() {
  return getFocusExitMs() + getFocusRiseMs();
}

function getReorderTimeScale() {
  return termNavState?.phase === "entering" ? TERM_NAV_TIMING.reorderScale : 1;
}

/** Title-row re-pack happens before any rise/exit — skipped for term-nav exits. */
function getUnfocusReflowMs() {
  if (termNavState?.phase === "exiting") return 0;
  return UNFOCUS_TIMING.reflowMs;
}

function getUnfocusAnimDuration() {
  const reflowMs = getUnfocusReflowMs();
  const backCircleMs = getBackCircleAnimMs();
  const riseMs = getUnfocusRiseMs();
  const exitMs = getUnfocusExitMs();
  // The row first re-packs to even spacing (reflowMs), then the rise ("row"
  // motion) starts, while the main arc exit starts only after the mini/back
  // circle finishes.
  return reflowMs + Math.max(riseMs, backCircleMs + exitMs);
}

function getBackCircleAnimMs() {
  if (termNavState?.phase === "exiting") {
    return TERM_NAV_TIMING.backCircleFadeMs;
  }
  if (focusState?.phase === "unfocusing") {
    return UNFOCUS_TIMING.backCircleFadeMs;
  }
  return LAYOUT.backCircleFadeMs;
}

function clearArcTermLayout() {
  arcTermLayout = null;
}

function startBackCircleExitAnimation(onComplete) {
  if (!focusState) {
    onComplete?.();
    return;
  }
  cancelBackCircleAnimation();
  focusState.backCircleStartTime = performance.now();
  focusState.backMiniExitT = 0;
  focusState.backCircleT = 1;
  backCircleOutComplete = onComplete ?? null;
  const now = performance.now();
  render(currentLayout);
  tickBackCircleExit(now);
}

function tickBackCircleExit(now) {
  if (!focusState) {
    backCircleAnimFrame = null;
    const done = backCircleOutComplete;
    backCircleOutComplete = null;
    done?.();
    return;
  }
  const elapsed = now - focusState.backCircleStartTime;
  const ms = getBackCircleAnimMs();
  const scatterT = clamp(elapsed / ms, 0, 1);
  const eased = easeOutCubic(scatterT);
  focusState.backMiniExitT = eased;
  focusState.backCircleT = scatterT < 1 ? 1 : 0;
  render(currentLayout);
  if (scatterT < 1) {
    backCircleAnimFrame = requestAnimationFrame(tickBackCircleExit);
    return;
  }
  focusState.backMiniExitT = 1;
  focusState.backCircleT = 0;
  backCircleAnimFrame = null;
  const done = backCircleOutComplete;
  backCircleOutComplete = null;
  done?.();
}

function startBackCircleFade() {
  if (!focusState || focusState.phase !== "locked") return;
  focusState.backCircleT = 1;
  focusState.backMiniExitT = 1;
  focusState.backCircleStartTime = performance.now();
  cancelBackCircleAnimation();
  backCircleAnimFrame = requestAnimationFrame(tickBackCircle);
}

function tickBackCircle(now) {
  if (!focusState || focusState.phase !== "locked") {
    backCircleAnimFrame = null;
    return;
  }
  const elapsed = now - focusState.backCircleStartTime;
  const enterMs = getBackCircleAnimMs();
  const t = clamp(elapsed / enterMs, 0, 1);
  const eased = easeOutCubic(t);
  focusState.backCircleT = 1;
  focusState.backMiniExitT = 1 - eased;
  if (isTermPageFocusVisual() && termPageSelectedFontSettled) {
    updateBackFixedOverlay(currentLayout);
  } else {
    render(currentLayout);
  }
  if (t < 1) {
    backCircleAnimFrame = requestAnimationFrame(tickBackCircle);
  } else {
    focusState.backCircleT = 1;
    focusState.backMiniExitT = 0;
    backCircleAnimFrame = null;
  }
}

/** @param {{ toOverviewWithFilter?: { key: string, value: string }, toOverviewWithMode?: "filter" | "timeline", toTermsIndex?: boolean, toAbout?: boolean }} options */
function applyUnfocusPendingOptions(options = {}) {
  if (options.toOverviewWithFilter) {
    pendingOverviewCensorFilter = options.toOverviewWithFilter;
    pendingOverviewMode = null;
    pendingTermsIndex = false;
    pendingAbout = false;
  } else if (options.toOverviewWithMode) {
    pendingOverviewMode = options.toOverviewWithMode;
    pendingOverviewCensorFilter = null;
    pendingTermsIndex = false;
    pendingAbout = false;
  } else if (options.toTermsIndex) {
    pendingTermsIndex = true;
    pendingOverviewMode = null;
    pendingOverviewCensorFilter = null;
    pendingAbout = false;
  } else if (options.toAbout) {
    pendingAbout = true;
    pendingTermsIndex = false;
    pendingOverviewMode = null;
    pendingOverviewCensorFilter = null;
  } else {
    pendingOverviewCensorFilter = null;
    pendingOverviewMode = null;
    pendingTermsIndex = false;
    pendingAbout = false;
    forceOverviewReset();
  }
}

function stabilizeFocusForNav() {
  if (!focusState) return;

  cancelFocusAnimation();
  cancelBackCircleAnimation();

  if (focusState.phase === "animating") {
    focusState.phase = "locked";
    focusState.riseT = 1;
    focusState.exitT = 1;
    focusState.backCircleT = 0;
    focusState.backMiniExitT = 1;
    focusState.enterFromSlots = undefined;
    focusState.enterCarouselSteps = undefined;
  }
}

function abortNavBlockingState() {
  if (isPageNavTransitionActive()) {
    cancelPageNavScramble();
  }
  pendingAfterHome = null;
  cancelTermScrollReset();
  if (termNavState) {
    termNavState = null;
    setNavigatingUI(false);
  }
  stabilizeFocusForNav();
}

function startUnfocusAnimation(options = {}) {
  if (!focusState) return;

  if (focusState.phase === "unfocusing") {
    applyUnfocusPendingOptions(options);
    return;
  }

  stabilizeFocusForNav();
  if (!focusState || focusState.phase !== "locked") return;

  const exitFromPinned =
    !termNavState && isTermPageScrollBgMode() && isTermHeaderPinned();
  let exitPinnedBaselineY = null;
  if (exitFromPinned) {
    const exitViewportHeight =
      currentLayout?.viewportHeight ?? getLiveViewportHeight();
    const exitScrollTop = viewport?.scrollTop ?? 0;
    // Where the title baseline actually sits on screen right now: the bottom-rest
    // anchor lifted by the scroll shift. The exit render clears that SVG lift, so
    // this captured value is what the rise target must reproduce at riseT = 1 to
    // avoid a jump before descending to the arc.
    exitPinnedBaselineY =
      getTermPageBottomFocusRowTopPx(exitViewportHeight) +
      getTermCensoredGroupScreenShiftY(exitScrollTop, exitViewportHeight);
  }

  releaseSiblingTermCensorHold();
  disableTermEnterSiblingCensor();
  resetTitleRowImage();
  hideTermPageChrome();
  cancelTermScrollReset();
  applyUnfocusPendingOptions(options);

  cancelBackCircleAnimation();
  focusState.phase = "unfocusing";
  focusState.direction = "out";
  focusState.exitFromPinned = exitFromPinned;
  focusState.exitPinnedBaselineY = exitPinnedBaselineY;
  const now = performance.now();
  focusState.startTime = now;
  focusState.riseT = 1;
  focusState.exitT = 1;
  focusState.backMiniExitT = 0;
  focusState.backCircleT = 1;
  focusState.unfocusReflowT = 0;

  cancelFocusAnimation();
  render(currentLayout);

  // Target the even arc-row layout the title row re-packs to before the rise.
  if (getUnfocusReflowMs() > 0 && focusState) {
    const widths = measureTermWidths(focusState.activeIndex);
    const { xs, anchor } = computeArcRowHomeXs(
      focusState.activeIndex,
      focusState.clickedIndex,
      widths
    );
    focusState.termHomeXs = xs;
    focusState.termHomeAnchor = anchor;
  }

  tickUnfocus(now);
  if (focusState?.phase === "unfocusing") {
    focusAnimFrame = requestAnimationFrame(tickUnfocus);
  }
}

function tickUnfocus(now) {
  if (!focusState || focusState.phase !== "unfocusing") return;

  const elapsed = now - focusState.startTime;
  const totalMs = getUnfocusAnimDuration();
  const reflowMs = getUnfocusReflowMs();
  const riseMs = getUnfocusRiseMs();
  const exitMs = getUnfocusExitMs();
  const backCircleMs = getBackCircleAnimMs();

  // Phase 1: re-pack the title row to even arc spacing in place.
  focusState.unfocusReflowT =
    reflowMs > 0 ? easeInOutCubic(clamp(elapsed / reflowMs, 0, 1)) : 1;

  // Phase 2 (after the reflow): rise/scatter back to the arc.
  const postReflow = Math.max(0, elapsed - reflowMs);
  const scatterT = clamp(postReflow / backCircleMs, 0, 1);
  focusState.backMiniExitT = easeOutCubic(scatterT);
  focusState.backCircleT = scatterT < 1 ? 1 : 0;
  // Allow the term row to move during the mini back-circle exit,
  // but delay the main arc exit until the mini is fully gone.
  focusState.riseT = 1 - clamp(postReflow / riseMs, 0, 1);
  focusState.exitT = 1 - clamp((postReflow - backCircleMs) / exitMs, 0, 1);

  render(currentLayout);

  if (elapsed < totalMs) {
    focusAnimFrame = requestAnimationFrame(tickUnfocus);
    return;
  }

  if (termNavState?.phase === "exiting") {
    focusState = null;
    focusAnimFrame = null;
    forceOverviewReset();
    render(currentLayout);
    startTermNavSnap();
    return;
  }

  arcTermLayout = {
    groupIndex: focusState.activeIndex,
    clickedIndex: focusState.clickedIndex,
    termXs: (focusState.termHomeXs ?? focusState.termEndXs).slice(),
    textAnchor: focusState.termHomeAnchor ?? focusState.textAnchor,
  };
  focusState = null;
  focusAnimFrame = null;
  if (pendingOverviewCensorFilter) {
    const { key, value } = pendingOverviewCensorFilter;
    pendingOverviewCensorFilter = null;
    if (overviewSubMode !== "filter") {
      setOverviewSubModeInternal("filter");
    }
    applyCensorFilterDimension(key, value);
    setOverviewTarget(1);
    syncNavAfterPageEnter();
  } else if (pendingOverviewMode) {
    const mode = pendingOverviewMode;
    pendingOverviewMode = null;
    enterOverviewAfterUnfocus(mode);
    syncNavAfterPageEnter();
  } else if (pendingTermsIndex) {
    pendingTermsIndex = false;
    revealTermsIndex();
  } else if (pendingAbout) {
    pendingAbout = false;
    revealAbout();
  } else {
    forceOverviewReset();
    syncNavAfterPageEnter();
  }
  render(currentLayout);
}

function startTermNavSnap() {
  if (!termNavState || !currentLayout) return;
  termNavState.phase = "snapping";
  const snapDurationMs = getTermNavSnapDurationMs(
    termNavState.sourceGroupIndex,
    termNavState.targetGroupIndex,
    currentLayout
  );
  animateSnapTo(
    snapIndexForGroup(termNavState.targetGroupIndex, currentLayout),
    currentLayout,
    {
      durationMs: snapDurationMs,
      onComplete: startTermNavEnter,
    }
  );
}

function startTermNavEnter() {
  if (!termNavState || !currentLayout) return;
  termNavState.phase = "entering";
  clearArcTermLayout();
  scrollOffset = scrollOffsetForGroup(
    termNavState.targetGroupIndex,
    currentLayout
  );
  updateActiveFromScroll(currentLayout);
  startFocusAnimation(termNavState.targetTermIndex);
}

function getSlotOrderForClickedIndex(clickedIndex, termCount) {
  return getSlotsAtStep(getCarouselSteps(clickedIndex, termCount), termCount);
}

function advanceSlots(slots, steps) {
  let result = slots.slice();
  for (let step = 0; step < steps; step++) {
    result = rotateLeftmostToFront(result);
  }
  return result;
}

function countCarouselRotations(fromSlots, toSlots) {
  const termCount = fromSlots.length;
  let slots = fromSlots.slice();
  for (let count = 0; count <= termCount; count++) {
    if (slots.every((value, index) => value === toSlots[index])) return count;
    slots = rotateLeftmostToFront(slots);
  }
  return termCount;
}

function isFocusTermLayoutPhase(phase) {
  return phase === "locked";
}

function getFocusSelectedTermIndex() {
  if (!focusState) return -1;
  return focusState.clickedIndex;
}

function getTermPageContentTermIndex() {
  if (!focusState) return -1;
  return focusState.clickedIndex;
}

function settleTermPageAfterSameGroupSwitch(layout) {
  const rayGroup = getFocusRayGroup();
  const selectedText = getSelectedTermTextEl();

  resetTermPageCensoredRowTransforms();
  termPageCensoredLayoutRef = null;
  termPageCensoredScrollRef = null;
  termPageCensoredRayOffset = null;
  termPageCensoredFrozenScreenAlign = null;
  clearTermPageCensoredWrapState();
  termPageSiblingLayoutApplied = false;

  applyFocusTermPageLayout();
  refineTermPagePositions();
  freezeTermPageSiblingLayout();

  termPageCensoredFrozenScreenAlign = null;
  termPageCensoredPushProgress = 1;
  termPageCensoredPushTarget = null;
  termSimilarLabelRestTop = null;
  termPageSimilarLabelAnchorStale = true;

  const Z =
    selectedText && rayGroup ? getSecoloTitleScreenZ(rayGroup, selectedText) : null;
  if (Z != null) {
    termPageScreenZ = Z;
    captureTermPageCensoredLayoutRef(rayGroup, Z);
  }

  const frozenBaseline = getLiveSecoloBaselineScreenY(rayGroup);
  if (frozenBaseline != null) {
    termPageFrozenSecoloBaselineScreenY = frozenBaseline;
    termPageSimilarLabelAnchorStale = false;
  }

  termPageDeferCensoredWrapRepack = true;
  applyTermPageCensoredBaselineAlign(rayGroup, { refreshBars: false });
  termPageDeferCensoredWrapRepack = false;

  const scrollTop = viewport?.scrollTop ?? 0;
  const viewportHeight = layout?.viewportHeight ?? getLiveViewportHeight();
  if (isViewportTermScrollable() || scrollTop > 0.5) {
    captureTermPageHeaderRowRestTopFromScroll();
    termPageCensoredScrollShiftY = getTermCensoredGroupScreenShiftY(
      scrollTop,
      viewportHeight
    );
    applyFocusRayScrollAnchor(layout);
    applyTermPageScrollLiftTransform();
  } else {
    termPageHeaderRowRestTop = null;
    termPageCensoredScrollShiftY = 0;
    captureTermPageHeaderRowRestTopIfNeeded();
  }

  holdSiblingTermCensors();
  termPageSiblingLayoutApplied = true;

  termSimilarLabelScrambleStarted = true;
  if (termSimilarLabelEl) {
    stopLetterShuffle(termSimilarLabelEl);
    termSimilarLabelEl.textContent = TERM_SIMILAR_LABEL_TEXT;
  }
  updateTermPageSimilarLabel(layout);
}

function instantSettleSelectedTermAfterCut(layout) {
  const group = groups[focusState?.activeIndex];
  const selectedIndex = focusState?.clickedIndex ?? -1;
  const selectedTerm = group?.terms[selectedIndex];
  const textEl = getSelectedTermTextEl();
  const wrap = getSelectedTermWrap();

  clearTermFontScrambleOverlay();

  if (textEl) {
    applySelectedTermDisplayFont(textEl);
    updateTermHitArea(
      textEl,
      wrap?.querySelector(".sun-term-hit"),
      wrap?.querySelector(".sun-term-censor")
    );
  }

  termPageSelectedFontSettled = true;

  if (termPageInlineTermSwitch) {
    settleTermPageAfterSameGroupSwitch(layout);
    return;
  }

  freezeTermPageSiblingLayout();
  applyFocusTermPageLayout();
  refreshTermPageSiblingCensorBars();

  const settledZ =
    (textEl && getSecoloTitleScreenZ(getFocusRayGroup(), textEl)) ??
    textEl?.getBoundingClientRect().left;
  if (settledZ != null) termPageScreenZ = settledZ;

  termPageCensoredPushProgress = 1;
  settleTermPageAfterFontScramble(layout, settledZ);
  termPageCensoredPushTarget = null;

  termSimilarLabelScrambleStarted = true;
  if (termSimilarLabelEl) {
    stopLetterShuffle(termSimilarLabelEl);
    termSimilarLabelEl.textContent = TERM_SIMILAR_LABEL_TEXT;
  }
  updateTermPageSimilarLabel(layout);
}

function updateSameGroupTitleRowSelection(selectedIndex) {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return;
  rayGroup.querySelectorAll(".sun-term-wrap").forEach((wrap) => {
    const termIndex = Number.parseInt(wrap.dataset.termIndex ?? "", 10);
    const isSelected = termIndex === selectedIndex;
    wrap.classList.toggle("is-selected", isSelected);
    if (!isSelected) {
      wrap.classList.remove("is-display-font");
      const textEl = wrap.querySelector(".sun-term");
      if (textEl) clearSelectedTermDisplayFont(textEl);
    }
    wrap.removeAttribute("transform");
  });
}

function refreshSameGroupTermPageContent(layout, term) {
  if (!termPageEl || !termDefinitionEl || !term) return;
  if (isTermPageScrollBgMode()) {
    updateTermMeta(layout);
    updateTermPageBleed(layout);
    updateTermScrollBg(layout);
    layoutTermPageScrollContent(layout, term, true, {
      skipAsyncReveal: termPageInlineTermSwitch,
    });
    applyViewportTermScrollBounds(layout.viewportHeight);
    return;
  }
  updateTermPage(layout);
}

function applyInstantSameGroupTermSwitch(newTermIndex) {
  if (!focusState || focusState.phase !== "locked") return;

  const group = groups[focusState.activeIndex];
  if (focusState.clickedIndex === newTermIndex) return;

  const layout = currentLayout;
  if (!layout) return;

  const preserveScrollTop = viewport?.scrollTop ?? 0;
  const resumeWithFontScramble =
    !termPageSelectedFontSettled ||
    termPageLayoutAnimActive ||
    viewport?.classList.contains("is-term-font-scrambling");
  const preservedBarBottoms = captureCensoredBarScreenBottoms(getFocusRayGroup());
  const oldText = applyTypographyRules(group.terms[focusState.clickedIndex]?.name ?? "");
  const prevTermId = group.terms[focusState.clickedIndex]?.id ?? null;

  clearSameObjectMentionHover();
  armSameObjectHoverReenterGate();
  if (group.terms.length > 1) {
    holdSiblingTermCensors();
  }
  disableTermEnterSiblingCensor();
  clearMediaCensorPlaceholder();

  termPageFontScrambleToken++;
  clearTermFontScrambleAnimation();
  termPageRevealToken++;
  clearTermPageSiblingFreeze();
  clearTermPageCensoredWrapState();
  resetTermPageCensoredRowTransforms();
  termPageSelectedFontSettled = false;
  termPageCensoredPushTarget = null;
  termPageCensoredPushProgress = 0;
  termPageSiblingBaselineRampStartMs = null;
  termPageSiblingBaselineRampDurationMs = 0;
  termPageScreenZ = null;
  termSimilarLabelScrambleStarted = false;
  termSimilarLabelRestTop = null;
  termPageSimilarLabelAnchorStale = true;

  focusState.switchTargetIndex = undefined;
  focusState.switchCarouselSteps = undefined;
  focusState.switchFromSlots = undefined;
  focusState.clickedIndex = newTermIndex;

  updateSameGroupTitleRowSelection(newTermIndex);
  focusState.termWidths = measureTermWidths(focusState.activeIndex);
  termPageSiblingRepackedForSwitch = group.terms.length > 1;
  repackTermPageSiblingsForSwitch(newTermIndex);

  const term = group.terms[newTermIndex];
  const newText = applyTypographyRules(term.name);
  lastTermPageRenderedId = term.id;
  refreshSameGroupTermPageContent(layout, term);

  const afterSwitch = () => {
    if (group.terms.length > 1) {
      holdSiblingTermCensors();
    }

    if (viewport && Math.abs(viewport.scrollTop - preserveScrollTop) > 0.5) {
      viewport.scrollTop = preserveScrollTop;
      termPagePrevScrollTop = preserveScrollTop;
    }

    updateTermPageBleed(layout);
    applyViewportTermScrollBounds(layout.viewportHeight);
    syncTermHeaderPinState(layout);
    resyncTermPageScrollHeaderAfterSwitch(layout);
    bindSameObjectMentionElements();
    holdSiblingTermCensors();

    if (lastPointer.known) {
      syncSameObjectHoverAtPointer(lastPointer.x, lastPointer.y);
    }
  };

  if (resumeWithFontScramble) {
    runSelectedTermFontScramble(afterSwitch);
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shouldAnimateTextSwitch =
    !prefersReducedMotion && oldText.trim() && newText.trim() && oldText !== newText;

  const runInstantSameGroupSettle = () => {
    termPageInlineTermSwitch = true;
    try {
      instantSettleSelectedTermAfterCut(layout);
      restoreCensoredBarScreenBottoms(getFocusRayGroup(), preservedBarBottoms);
      afterSwitch();
    } finally {
      termPageInlineTermSwitch = false;
    }
  };

  if (!shouldAnimateTextSwitch) {
    runInstantSameGroupSettle();
    const settleToken = termPageFontScrambleToken;
    requestAnimationFrame(() => {
      if (settleToken !== termPageFontScrambleToken) return;
      if (!focusState || focusState.phase !== "locked" || !currentLayout) return;
      if (!termPageSelectedFontSettled) return;
      resyncTermPageScrollHeaderAfterSwitch(currentLayout);
      syncTermHeaderPinState(currentLayout);
    });
    return;
  }

  const scrambleToken = termPageFontScrambleToken;
  runInstantSameGroupSettle();
  const overlayShown = showTermFontScrambleOverlay();

  if (!overlayShown) {
    const settleToken = termPageFontScrambleToken;
    requestAnimationFrame(() => {
      if (settleToken !== termPageFontScrambleToken) return;
      if (!focusState || focusState.phase !== "locked" || !currentLayout) return;
      if (!termPageSelectedFontSettled) return;
      resyncTermPageScrollHeaderAfterSwitch(currentLayout);
      syncTermHeaderPinState(currentLayout);
    });
    return;
  }

  // Freeze the overlay's vertical anchor against the FINAL Secolo content so the
  // handoff to the real SVG title at the end lands with no baseline jump. The
  // empty-overlay freeze done by showTermFontScrambleOverlay() skips the mounted
  // baseline-drift correction in computeTermFontOverlayTop().
  termFontOverlayFrozenTop = null;
  mountFontScrambleTerm(termFontOverlayTermEl, newText, "secolo");
  syncTermFontOverlayPosition();
  const syncedOverlayTop = parseFloat(termFontOverlayEl.style.top);
  if (Number.isFinite(syncedOverlayTop)) termFontOverlayFrozenTop = syncedOverlayTop;

  // The term we just left becomes a censored sibling. Reveal it uncensored first,
  // then write its censor bar in across the title's typewriter animation.
  startNewlyCensoredReveal(prevTermId);

  playFontScrambleTextSwitch(termFontOverlayTermEl, {
    fromText: oldText,
    toText: newText,
    font: "secolo",
    onComplete: () => {
      if (scrambleToken !== termPageFontScrambleToken) return;
      clearTermFontScrambleOverlay();
      // The earlier rAF resync ran while `is-term-font-scrambling` was set, so it
      // nulled the header rest anchor without being able to recapture it. Now that
      // the overlay (and scramble class) is cleared and the page is still at scroll
      // origin, recapture so later scrolling pins the group at the correct spot.
      if (
        focusState?.phase === "locked" &&
        currentLayout &&
        termPageSelectedFontSettled
      ) {
        resyncTermPageScrollHeaderAfterSwitch(currentLayout);
        syncTermHeaderPinState(currentLayout);
      }
    },
  });

  const settleToken = termPageFontScrambleToken;
  requestAnimationFrame(() => {
    if (settleToken !== termPageFontScrambleToken) return;
    if (!focusState || focusState.phase !== "locked" || !currentLayout) return;
    if (!termPageSelectedFontSettled) return;
    resyncTermPageScrollHeaderAfterSwitch(currentLayout);
    syncTermHeaderPinState(currentLayout);
  });
}

function startSameGroupTermSwitch(newTermIndex) {
  if (viewport && viewport.scrollTop > 0.5) {
    animateViewportScrollToTop(() => {
      applyInstantSameGroupTermSwitch(newTermIndex);
      setNavigatingUI(false);
    });
    return;
  }
  applyInstantSameGroupTermSwitch(newTermIndex);
}

function navigateToTerm(termId) {
  if (isTermNavigating()) return;
  if (focusState?.phase !== "locked") return;
  if (isTermPageFontScrambleInteractionBlocked()) return;

  const location = findTermLocation(termId);
  if (!location) return;

  if (
    focusState.activeIndex === location.groupIndex &&
    focusState.clickedIndex === location.termIndex
  ) {
    return;
  }

  if (focusState.activeIndex === location.groupIndex) {
    startSameGroupTermSwitch(location.termIndex);
    return;
  }

  cancelTermScrollReset();
  termNavState = {
    phase: "exiting",
    sourceGroupIndex: focusState.activeIndex,
    targetGroupIndex: location.groupIndex,
    targetTermIndex: location.termIndex,
  };
  setNavigatingUI(true);
  forceOverviewReset();
  clearArcTermLayout();
  cancelBackCircleAnimation();
  cancelScrollMotion();
  clearTimeout(snapDebounceTimer);
  clearTermHover();
  clearSameObjectMentionHover();
  startUnfocusAnimation();
}

function bindMentionNavigation() {
  viewport?.addEventListener("click", (event) => {
    if (isTermNavigating()) return;
    const mention = event.target.closest(".sun-def-mention--external");
    if (!mention) return;
    const termId = mention.dataset.termId;
    if (!termId) return;
    event.preventDefault();
    navigateToTerm(termId);
  });
}

function bindSameObjectMentionNavigation() {
  viewport?.addEventListener("click", (event) => {
    if (isTermNavigating()) return;
    if (focusState?.phase !== "locked") return;
    const mention = event.target.closest(".sun-def-mention--same-object");
    if (!mention) return;
    if (mention.closest(".sun-term-meta__value[data-meta-filter-key]")) return;
    const termId = mention.dataset.termId;
    if (!termId) return;
    event.preventDefault();
    navigateToTerm(termId);
  });
}

function getMetaFilterValue(term, filterKey) {
  switch (filterKey) {
    case "termType":
      return term.termType || "";
    case "framing":
      return term.framingTags?.[0] || "";
    case "connotation":
      return term.connotation || "";
    default:
      return "";
  }
}

function bindMetaFilterNavigation() {
  termMetaEl?.addEventListener("click", (event) => {
    if (isTermNavigating()) return;
    if (focusState?.phase !== "locked") return;

    const tagEl = event.target.closest(".sun-term-meta__tag[data-meta-filter-value]");
    const valueEl = tagEl
      ? tagEl.closest(".sun-term-meta__value[data-meta-filter-key]")
      : event.target.closest(".sun-term-meta__value[data-meta-filter-key]");
    if (!valueEl) return;
    if (event.target.closest(".sun-def-mention--external, .sun-def-mention--same-object")) {
      return;
    }

    const key = valueEl.dataset.metaFilterKey;
    const value = tagEl?.dataset.metaFilterValue || valueEl.dataset.metaFilterValue;
    if (!key || !value) return;

    event.preventDefault();
    event.stopPropagation();
    clearSameObjectMentionHover();
    startUnfocusAnimation({ toOverviewWithFilter: { key, value } });
  });
}

let pageCensorLayer = null;
/** Fixed-position media placeholders — above the SVG, sized to visible image slices. */
let mediaPlaceholderLayer = null;
/** @type {HTMLElement[]} */
let mediaCensorFrameEls = [];
let hoveredSameObjectMention = null;
let hoveredSameObjectMentionId = null;
/** Title-row hover only — does not include definition mentions. */
let hoveredTitleRowTermId = null;
/** @type {"bleed" | "inline" | "fixed" | null} */
let titleRowHoverMode = null;
/** @type {Map<string, "bleed" | "inline" | "fixed">} */
const titleRowHoverModeByTermName = new Map();
/** Term names picked for full-bleed hover — at least one per adjacent 2-row block. */
let titleRowBleedTermNames = new Set();
let titleRowFixedTermIds = new Set();
/** Per-page-load seed — image/term picks change on refresh, stay stable during the session. */
let pageImageSelectionSeed = Math.random();
/** @type {SVGGElement | null} */
let titleRowInlinePushRay = null;
let titleRowHoverSessionId = 0;
let lastTitleRowImageSession = -1;
let titleRowInlineExpandedSession = -1;
/** Image paired with the active title-row hover — thumbnail uses this pick. */
let titleRowHoverImage = null;
/** @type {ReturnType<typeof requestAnimationFrame> | null} */
let titleRowInlinePushAnimFrame = null;
/** Block term-page hover (censored mentions) until pointer leaves and re-enters. */
let sameObjectHoverAwaitingReenter = false;
let sameObjectHoverGuardUntil = 0;
/** Block new hover while content scrolls under a stationary pointer. */
let sameObjectHoverScrollActive = false;
let sameObjectHoverPointerMovedDuringScroll = false;
let sameObjectHoverScrollAnchor = { x: 0, y: 0 };
/** @type {ReturnType<typeof setTimeout> | null} */
let sameObjectHoverScrollSettleTimer = null;
let lastTermPageRenderedId = null;
/** Same-group term switch — skip hide/scroll reset in updateTermPage. */
let termPageInlineTermSwitch = false;
/** Siblings were repacked on same-group switch — layout anim moves only the selected term. */
let termPageSiblingRepackedForSwitch = false;
let termPageRevealToken = 0;
/** @type {Set<string>} */
let termPageScrollRevealedKeys = new Set();
/** @type {{ key: string, el: Element, text: string, postApply?: () => void }[]} */
let termPageScrollRevealQueue = [];

/** Headings and image captions — always fully censored as one block. */
const PAGE_CENSOR_BLOCK_SELECTORS = [
  ".sun-term-meta__heading",
  ".sun-term-page__side-heading",
  ".sun-term-page__label-row-heading",
  ".sun-term-page__label-nav-trigger",
  ".sun-term-page__caption",
  ".sun-term-bleed-caption",
];

/** Body text — censored line-by-line with cutouts for the revealed mention. */
const PAGE_CENSOR_LINE_SELECTORS = [
  ".sun-term-meta__value",
  ".sun-term-page__definition",
  ".sun-term-page__side-text",
  ".sun-term-page__label-row-text",
  ".sun-term-page__label-nav-panel-text",
];

function ensurePageCensorLayer() {
  if (!pageCensorLayer && viewport) {
    pageCensorLayer = document.createElement("div");
    pageCensorLayer.id = "sun-page-censor-layer";
    pageCensorLayer.className = "sun-page-censor-layer";
    pageCensorLayer.setAttribute("aria-hidden", "true");
    viewport.appendChild(pageCensorLayer);
  }
  return pageCensorLayer;
}

function getBlockLineHeight(el) {
  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight);
  if (Number.isFinite(lineHeight)) return lineHeight;
  const fontSize = parseFloat(style.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.2 : 20;
}

/** Tuned on definition (32px / 38px line-height → 33px bar). */
const DEFINITION_CENSOR_LINE_HEIGHT = 38;
const DEFINITION_CENSOR_BAR_HEIGHT = 33;
/** Definition body letters drop deeper descenders (sofit ך ף ן ץ + ק) that were
 *  escaping below the centered bar, so give the definition bar a touch more
 *  height and bias it slightly downward. */
const DEFINITION_CENSOR_BAR_EXTRA = 3;
const DEFINITION_CENSOR_TOP_OFFSET = 3;
/** מדגיש / מטשטש side body: its FrankRuhl mentions ride lower (deeper descenders
 *  + underline) than the generic block censor, which sits high (top offset -3)
 *  and left a sliver of underline showing below the bar. Bias the bar down so it
 *  reaches the bottom of the line — keeping the default bar height so the gap
 *  between wrapped lines stays intact. */
const SIDE_TEXT_CENSOR_TOP_OFFSET = 2;
/** Tuned on image captions (12px / 16px line-height). */
const CAPTION_CENSOR_LINE_HEIGHT = 16;
const CAPTION_CENSOR_BAR_HEIGHT = 14;
const CAPTION_CENSOR_TOP_OFFSET = -1;
const CENSOR_BAR_TOP_OFFSET = -3;
/** Label-nav headings (משתמשים / נפוץ / בשימוש + ↙) — sit slightly lower than default block censor. */
const LABEL_NAV_CENSOR_TOP_OFFSET = 2;
/** Word censor on definition: 40px bar on 32px text — shared by arc terms + inline mentions. */
const MENTION_CENSOR_HEIGHT_RATIO = 40 / LAYOUT.fontSize;
const TERM_CENSOR_BAR_HEIGHT = LAYOUT.fontSize * MENTION_CENSOR_HEIGHT_RATIO;
const TERM_DISPLAY_CENSOR_BAR_HEIGHT = 90;
const MENTION_CENSOR_WIDTH_PAD = 1;
const MENTION_CENSOR_TOP_OFFSET = 0;
/** Extra vertical clearance for carousel gate masks over censored sibling bars. */
const FOCUS_CAROUSEL_MASK_PAD = 4;
/** Secolo title row: keep the censor band compact instead of scaling with display size. */
const TERM_DISPLAY_CENSOR_Y_RATIO = 0.52;
const TERM_DISPLAY_CENSOR_TOP_OFFSET = -8;
const TERM_DISPLAY_CENSOR_BOTTOM_EXTEND = 4;
/** Censor draw speed: duration and step count scale with bar width (px). */
const CENSOR_WRITE_MS_PER_PX = 0.95;
const CENSOR_WRITE_MIN_S = 0.15;
const CENSOR_WRITE_MAX_S = 0.78;
const CENSOR_WRITE_PX_PER_STEP = 8;
const CENSOR_WRITE_MIN_STEPS = 6;
const CENSOR_WRITE_MAX_STEPS = 40;
/** Sublinear width exponent — wide bars grow slower than linear (keeps short lines similar). */
const CENSOR_WRITE_WIDTH_POWER = 0.84;
const CENSOR_WRITE_REF_WIDTH = 360;

function getCensorWriteTiming(widthPx) {
  const width = Math.max(1, widthPx);
  const refDurationMs =
    Math.pow(CENSOR_WRITE_REF_WIDTH, 1 - CENSOR_WRITE_WIDTH_POWER) * CENSOR_WRITE_MS_PER_PX;
  const durationS = Math.min(
    CENSOR_WRITE_MAX_S,
    Math.max(
      CENSOR_WRITE_MIN_S,
      (refDurationMs * Math.pow(width, CENSOR_WRITE_WIDTH_POWER)) / 1000
    )
  );
  const steps = Math.min(
    CENSOR_WRITE_MAX_STEPS,
    Math.max(CENSOR_WRITE_MIN_STEPS, Math.round(width / CENSOR_WRITE_PX_PER_STEP))
  );
  return { durationS, steps };
}

function applyCensorWriteTiming(el, widthPx) {
  const { durationS, steps } = getCensorWriteTiming(widthPx);
  el.style.setProperty("--sun-censor-write-duration", `${durationS}s`);
  el.style.setProperty("--sun-censor-write-steps", String(steps));
}

/** Keep the just-left term readable for this long before the censor writes in. */
const NEWLY_CENSORED_HOLD_MS = 650;
/** Term id (in the active group) currently being revealed-then-censored. */
let newlyCensoredTermId = null;
/** True once the readable hold ends and the censor bar is writing in. */
let newlyCensoredWriting = false;
let newlyCensoredToken = 0;
/** @type {number | null} */
let newlyCensoredHoldTimer = null;
/** @type {number | null} */
let newlyCensoredEndTimer = null;

function clearNewlyCensoredTimers() {
  if (newlyCensoredHoldTimer != null) {
    clearTimeout(newlyCensoredHoldTimer);
    newlyCensoredHoldTimer = null;
  }
  if (newlyCensoredEndTimer != null) {
    clearTimeout(newlyCensoredEndTimer);
    newlyCensoredEndTimer = null;
  }
}

/** Re-apply the reveal/write state to the (possibly re-rendered) sibling wrap. */
function applyNewlyCensoredStateToWrap() {
  if (!newlyCensoredTermId) return;
  const rayGroup = getFocusRayGroup();
  const wrap = rayGroup?.querySelector(
    `.sun-term-wrap[data-term-id="${CSS.escape(newlyCensoredTermId)}"]`
  );
  if (!wrap || wrap.classList.contains("is-selected")) return;
  const censorEl = wrap.querySelector(".sun-term-censor");
  if (!censorEl) return;
  wrap.classList.add("is-newly-censored");
  // Drop any held inline bar so CSS controls the reveal/write.
  censorEl.style.removeProperty("transform");
  censorEl.style.removeProperty("animation");
  censorEl.style.removeProperty("transition");
  const barWidth = parseFloat(censorEl.getAttribute("width")) || 0;
  if (barWidth > 0) applyCensorWriteTiming(censorEl, barWidth);
  if (newlyCensoredWriting) wrap.classList.add("is-censoring");
  else wrap.classList.remove("is-censoring");
}

/**
 * On a same-group term switch, the previously-selected term drops into the
 * censored sibling row. Instead of snapping it to a solid bar, leave it readable
 * for a beat, then animate the censor bar writing in. Driven by module state so
 * it survives the re-renders that happen during the title typewriter.
 * @param {string | null} termId
 */
function startNewlyCensoredReveal(termId) {
  if (!termId) return;
  clearNewlyCensoredTimers();
  const token = ++newlyCensoredToken;
  newlyCensoredTermId = termId;
  newlyCensoredWriting = false;
  applyNewlyCensoredStateToWrap();

  newlyCensoredHoldTimer = window.setTimeout(() => {
    newlyCensoredHoldTimer = null;
    if (token !== newlyCensoredToken) return;
    newlyCensoredWriting = true;
    applyNewlyCensoredStateToWrap();
    const rayGroup = getFocusRayGroup();
    const censorEl = rayGroup
      ?.querySelector(`.sun-term-wrap[data-term-id="${CSS.escape(termId)}"]`)
      ?.querySelector(".sun-term-censor");
    const barWidth = censorEl ? parseFloat(censorEl.getAttribute("width")) || 0 : 0;
    const { durationS } = getCensorWriteTiming(barWidth);
    newlyCensoredEndTimer = window.setTimeout(() => {
      newlyCensoredEndTimer = null;
      if (token !== newlyCensoredToken) return;
      finishNewlyCensoredReveal();
    }, durationS * 1000 + 80);
  }, NEWLY_CENSORED_HOLD_MS);
}

function finishNewlyCensoredReveal() {
  clearNewlyCensoredTimers();
  newlyCensoredToken++;
  const termId = newlyCensoredTermId;
  newlyCensoredTermId = null;
  newlyCensoredWriting = false;
  if (!termId) return;
  const rayGroup = getFocusRayGroup();
  const wrap = rayGroup?.querySelector(
    `.sun-term-wrap[data-term-id="${CSS.escape(termId)}"]`
  );
  if (wrap) {
    wrap.classList.remove("is-newly-censored");
    wrap.classList.remove("is-censoring");
    const censorEl = wrap.querySelector(".sun-term-censor");
    if (censorEl) {
      censorEl.style.removeProperty("animation");
      censorEl.style.removeProperty("transition");
      censorEl.style.transform = "scaleX(1)";
    }
  }
  refreshTermPageSiblingCensorBars();
}

function isCaptionCensorElement(el) {
  return (
    el?.classList.contains("sun-term-page__caption") ||
    el?.classList.contains("sun-term-bleed-caption")
  );
}

function getCensorBarHeight(el) {
  const lineHeight = getBlockLineHeight(el);
  if (isCaptionCensorElement(el)) {
    return CAPTION_CENSOR_BAR_HEIGHT;
  }
  const base =
    Math.round(lineHeight * (DEFINITION_CENSOR_BAR_HEIGHT / DEFINITION_CENSOR_LINE_HEIGHT)) + 1;
  if (isDefinitionCensorElement(el)) {
    return base + DEFINITION_CENSOR_BAR_EXTRA;
  }
  return base;
}

function getCensorBarLayout(el) {
  const lineHeight = getBlockLineHeight(el);
  const barHeight = getCensorBarHeight(el);
  if (isCaptionCensorElement(el)) {
    return {
      lineHeight,
      barHeight,
      interLineGap: 0,
    };
  }
  const interLineGap = Math.max(Math.round(lineHeight) - barHeight, 0);
  return { lineHeight, barHeight, interLineGap };
}

function isDefinitionCensorElement(el) {
  return el?.classList.contains("sun-term-page__definition");
}

function isSideTextCensorElement(el) {
  return el?.classList.contains("sun-term-page__side-text");
}

function isLabelNavCensorElement(el) {
  return (
    el?.classList.contains("sun-term-page__label-nav-trigger") ||
    el?.classList.contains("sun-term-page__label-nav-panel-text")
  );
}

function getCensorBarTopOffset(el) {
  if (isCaptionCensorElement(el)) {
    return CAPTION_CENSOR_TOP_OFFSET;
  }
  if (isDefinitionCensorElement(el)) {
    return DEFINITION_CENSOR_TOP_OFFSET;
  }
  if (isSideTextCensorElement(el)) {
    return SIDE_TEXT_CENSOR_TOP_OFFSET;
  }
  if (isLabelNavCensorElement(el)) {
    return LABEL_NAV_CENSOR_TOP_OFFSET;
  }
  return CENSOR_BAR_TOP_OFFSET;
}

function getCaptionCensorLineSpan(group, topOffset = CAPTION_CENSOR_TOP_OFFSET) {
  const measuredHeight =
    group.maxBottom > group.minTop ? group.maxBottom - group.minTop : CAPTION_CENSOR_LINE_HEIGHT;
  const barHeight = Math.round(Math.max(measuredHeight, 1));
  const barTop = group.minTop + topOffset;
  return {
    top: barTop,
    bottom: barTop + barHeight,
    height: barHeight,
  };
}

function getCensorLineSpan(lineTop, lineHeight, barHeight, topOffset = CENSOR_BAR_TOP_OFFSET) {
  const barTop = lineTop + (lineHeight - barHeight) / 2 + topOffset;
  return {
    top: barTop,
    bottom: barTop + barHeight,
    height: barHeight,
  };
}

function clusterCensoredLines(censoredLines, lineHeight) {
  const sorted = [...censoredLines].sort((a, b) => a.top - b.top);
  const groups = [];
  const mergeThreshold = lineHeight * 0.55;

  for (const line of sorted) {
    let group = groups.find((entry) => Math.abs(entry.anchorTop - line.top) < mergeThreshold);
    if (!group) {
      group = {
        anchorTop: line.top,
        minLeft: Infinity,
        maxRight: -Infinity,
        minTop: Infinity,
        maxBottom: -Infinity,
      };
      groups.push(group);
    }
    group.anchorTop = Math.min(group.anchorTop, line.top);
    group.minLeft = Math.min(group.minLeft, line.left);
    group.maxRight = Math.max(group.maxRight, line.right);
    group.minTop = Math.min(group.minTop, line.top);
    if (Number.isFinite(line.bottom)) {
      group.maxBottom = Math.max(group.maxBottom, line.bottom);
    }
  }

  return groups.sort((a, b) => a.anchorTop - b.anchorTop);
}

function enforceCensorBandGap(span, prevBottom, interLineGap) {
  if (prevBottom !== null && span.top < prevBottom + interLineGap) {
    span.top = prevBottom + interLineGap;
    span.bottom = span.top + span.height;
  }
  return span;
}

/**
 * Place a line's censor bar on a uniform grid derived from the first line.
 * Snapping each bar to firstBarTop + round(offset / pitch) * pitch keeps the
 * spacing between consecutive bars identical, instead of inheriting the
 * sub-pixel jitter in each line's measured top (which made gaps look uneven —
 * sometimes touching, sometimes spaced).
 */
function getUniformCensorLineSpan(group, firstAnchorTop, baseBarTop, pitch, barHeight) {
  const lineIndex = pitch > 0 ? Math.max(0, Math.round((group.anchorTop - firstAnchorTop) / pitch)) : 0;
  const top = Math.round(baseBarTop + lineIndex * pitch);
  return { top, bottom: top + barHeight, height: barHeight };
}

function isTextNodeRevealedForTerm(node, termId) {
  if (!termId || !node) return false;
  const mention = node.parentElement?.closest?.(".sun-def-mention--same-object");
  return mention?.dataset.termId === termId;
}

function collectTextLineBands(element, excludeTermId) {
  const rawLines = [];
  const range = document.createRange();
  const { lineHeight, barHeight, interLineGap } = getCensorBarLayout(element);
  const topOffset = getCensorBarTopOffset(element);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  let textNode;
  while ((textNode = walker.nextNode())) {
    const revealed = isTextNodeRevealedForTerm(textNode, excludeTermId);
    const len = textNode.length;
    for (let i = 0; i < len; i++) {
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      for (const rect of range.getClientRects()) {
        if (rect.height < 1) continue;
        rawLines.push({
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          revealed,
        });
      }
    }
  }

  if (!rawLines.length) return [];

  const censoredLines = rawLines.filter((line) => !line.revealed);
  if (!censoredLines.length) return [];

  const groups = clusterCensoredLines(censoredLines, lineHeight);
  const viewportRect = viewport.getBoundingClientRect();
  const scrollTop = viewport.scrollTop;
  const bands = [];
  let prevBottom = null;

  const pitch = Math.round(lineHeight);
  const firstAnchorTop = groups.length ? groups[0].anchorTop : 0;
  const baseBarTop = getCensorLineSpan(firstAnchorTop, lineHeight, barHeight, topOffset).top;

  for (const group of groups) {
    if (group.minLeft === Infinity || group.maxRight === -Infinity) continue;

    const span = enforceCensorBandGap(
      getUniformCensorLineSpan(group, firstAnchorTop, baseBarTop, pitch, barHeight),
      prevBottom,
      interLineGap
    );
    prevBottom = span.top + span.height;

    bands.push({
      top: span.top - viewportRect.top + scrollTop,
      height: span.height,
      left: group.minLeft - viewportRect.left,
      width: group.maxRight - group.minLeft,
    });
  }

  return bands;
}

function isPageCensorTextTarget(el) {
  if (!el || el.hidden) return false;
  if (el.closest("[hidden]")) return false;
  if (
    el.classList.contains("sun-term-bleed-caption") &&
    !isTermPageBleedCaptionVisible()
  ) {
    return false;
  }
  if (!el.textContent?.trim()) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function elementHasNonRevealedText(el, excludeTermId) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      if (isTextNodeRevealedForTerm(node, excludeTermId)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  return Boolean(walker.nextNode());
}

function getSameObjectHoverTarget(node) {
  if (!(node instanceof Element)) return null;
  return (
    node.closest(".sun-def-mention--same-object") ||
    node.closest(".sun-ray.is-locked .sun-term-wrap:not(.is-selected)")
  );
}

function getTermPageInteractionTarget(node) {
  if (!(node instanceof Element)) return null;
  return (
    getSameObjectHoverTarget(node) ||
    node.closest("img.sun-term-page__image.is-loaded")
  );
}

function elementsAtPointer(clientX, clientY) {
  if (typeof document.elementsFromPoint === "function") {
    return document.elementsFromPoint(clientX, clientY);
  }
  const el = document.elementFromPoint(clientX, clientY);
  return el ? [el] : [];
}

function findTermHitAtPointer(clientX, clientY) {
  const target = findOverviewHoverTargetAtPointer(clientX, clientY);
  if (!target?.wrap) return null;
  return target.wrap.querySelector(".sun-term-hit");
}

function findTermPageInteractionTargetAtPointer(clientX, clientY) {
  for (const el of elementsAtPointer(clientX, clientY)) {
    if (!(el instanceof Element)) continue;
    const target = getTermPageInteractionTarget(el);
    if (target) return target;
  }
  return null;
}

const SAME_OBJECT_HOVER_REENTER_GUARD_MS = 150;
const SAME_OBJECT_HOVER_SCROLL_MOVE_PX = 4;
const SAME_OBJECT_HOVER_SCROLL_SETTLE_MS = 120;

function markSameObjectHoverScrollActivity() {
  if (!sameObjectHoverScrollActive) {
    sameObjectHoverScrollActive = true;
    sameObjectHoverPointerMovedDuringScroll = false;
    if (lastPointer.known) {
      sameObjectHoverScrollAnchor = { x: lastPointer.x, y: lastPointer.y };
    }
  }
  if (sameObjectHoverScrollSettleTimer != null) {
    clearTimeout(sameObjectHoverScrollSettleTimer);
  }
  sameObjectHoverScrollSettleTimer = setTimeout(() => {
    sameObjectHoverScrollSettleTimer = null;
    settleSameObjectHoverScrollGuard();
  }, SAME_OBJECT_HOVER_SCROLL_SETTLE_MS);
}

function noteSameObjectHoverPointerMove(clientX, clientY) {
  if (!sameObjectHoverScrollActive || sameObjectHoverPointerMovedDuringScroll) return;
  const dx = clientX - sameObjectHoverScrollAnchor.x;
  const dy = clientY - sameObjectHoverScrollAnchor.y;
  if (
    dx * dx + dy * dy >=
    SAME_OBJECT_HOVER_SCROLL_MOVE_PX * SAME_OBJECT_HOVER_SCROLL_MOVE_PX
  ) {
    sameObjectHoverPointerMovedDuringScroll = true;
  }
}

function settleSameObjectHoverScrollGuard() {
  const scrollWithoutPointerMove =
    sameObjectHoverScrollActive && !sameObjectHoverPointerMovedDuringScroll;
  sameObjectHoverScrollActive = false;
  sameObjectHoverPointerMovedDuringScroll = false;
  if (
    scrollWithoutPointerMove &&
    !hoveredSameObjectMentionId &&
    lastPointer.known &&
    findTermPageInteractionTargetAtPointer(lastPointer.x, lastPointer.y)
  ) {
    armSameObjectHoverReenterGate();
  }
}

function clearSameObjectHoverScrollGuard() {
  sameObjectHoverScrollActive = false;
  sameObjectHoverPointerMovedDuringScroll = false;
  if (sameObjectHoverScrollSettleTimer != null) {
    clearTimeout(sameObjectHoverScrollSettleTimer);
    sameObjectHoverScrollSettleTimer = null;
  }
}

function isSameObjectHoverScrollGuardActive() {
  return sameObjectHoverScrollActive && !sameObjectHoverPointerMovedDuringScroll;
}

function armSameObjectHoverReenterGate(
  durationMs = SAME_OBJECT_HOVER_REENTER_GUARD_MS
) {
  sameObjectHoverAwaitingReenter = true;
  sameObjectHoverGuardUntil = performance.now() + durationMs;
}

function isSameObjectHoverReenterGuardActive() {
  return (
    sameObjectHoverAwaitingReenter && performance.now() < sameObjectHoverGuardUntil
  );
}

function tryClearSameObjectHoverReenterGate(relatedTarget) {
  if (!sameObjectHoverAwaitingReenter) return;
  if (performance.now() < sameObjectHoverGuardUntil) return;
  if (relatedTarget instanceof Node && getTermPageInteractionTarget(relatedTarget)) return;
  sameObjectHoverAwaitingReenter = false;
}

function clearSameObjectHoverReenterGate() {
  sameObjectHoverAwaitingReenter = false;
  sameObjectHoverGuardUntil = 0;
}

function syncSameObjectHoverReenterGateAtPointer(clientX, clientY) {
  if (!sameObjectHoverAwaitingReenter) return;
  if (performance.now() < sameObjectHoverGuardUntil) return;
  const target = findTermPageInteractionTargetAtPointer(clientX, clientY);
  if (!target) clearSameObjectHoverReenterGate();
}

function syncSameObjectHoverAtPointer(clientX, clientY) {
  syncSameObjectHoverReenterGateAtPointer(clientX, clientY);
  if (focusState?.phase !== "locked" || isTermNavigating()) return;
  if (!allowSameObjectHoverActivation()) return;

  const target = findTermPageInteractionTargetAtPointer(clientX, clientY);
  if (!target) return;

  const termId = target.dataset.termId;
  if (!termId) return;
  if (hoveredSameObjectMentionId === termId && hoveredSameObjectMention === target) return;

  setSameObjectTermHover(termId, target);
}

/** Keep same-object hover while scrolling if the pointer is still over a valid target. */
function syncSameObjectHoverDuringScroll() {
  if (!hoveredSameObjectMentionId && !sameObjectHoverAwaitingReenter) return;
  clearSameObjectHoverReenterGate();
  if (!lastPointer.known) {
    clearSameObjectMentionHover();
    return;
  }

  const target = findTermPageInteractionTargetAtPointer(
    lastPointer.x,
    lastPointer.y
  );
  if (!target) {
    clearSameObjectMentionHover();
    return;
  }

  const termId = target.dataset.termId;
  if (!termId) {
    clearSameObjectMentionHover();
    return;
  }

  if (hoveredSameObjectMentionId === termId && hoveredSameObjectMention === target) {
    rebuildPageCensorOverlays();
    return;
  }

  if (!allowSameObjectHoverActivation()) return;
  setSameObjectTermHover(termId, target);
}

function isTermPageFontScrambleInteractionBlocked() {
  if (focusState?.phase !== "locked") return false;
  return (
    !termPageSelectedFontSettled ||
    (viewport?.classList.contains("is-term-font-scrambling") ?? false)
  );
}

function allowSameObjectHoverActivation() {
  if (isTermPageFontScrambleInteractionBlocked()) return false;
  if (isSameObjectHoverReenterGuardActive()) return false;
  if (isSameObjectHoverScrollGuardActive()) return false;
  if (sameObjectHoverAwaitingReenter) clearSameObjectHoverReenterGate();
  return true;
}

function clearRevealedMentionMarks() {
  viewport
    ?.querySelectorAll(
      ".sun-def-mention--same-object.is-mention-revealed, .sun-def-mention--same-object.is-mention-hovered"
    )
    .forEach((el) => {
      el.classList.remove("is-mention-revealed", "is-mention-hovered");
    });
  svgEl
    ?.querySelectorAll(".sun-term-wrap.is-mention-revealed, .sun-term-wrap.is-mention-hovered")
    .forEach((el) => {
      el.classList.remove("is-mention-revealed", "is-mention-hovered");
    });
}

function clearHoverSourceMarks() {
  viewport?.querySelectorAll(".sun-def-mention--same-object.is-mention-hovered").forEach((el) => {
    el.classList.remove("is-mention-hovered");
  });
  svgEl?.querySelectorAll(".sun-term-wrap.is-mention-hovered").forEach((el) => {
    el.classList.remove("is-mention-hovered");
  });
}

function setHoverSourceMark(sourceEl) {
  clearHoverSourceMarks();
  // Title-row similar terms stay fully censored — don't mark them as hovered
  // (which would underline the covered glyphs). Only inline body mentions do.
  if (sourceEl?.classList.contains("sun-term-wrap")) return;
  sourceEl?.classList.add("is-mention-hovered");
}

function applyRevealedMentionMarks(termId, sourceEl = null) {
  if (!termId) return;
  if (viewport) {
    const selector = `.sun-def-mention--same-object[data-term-id="${CSS.escape(termId)}"]`;
    for (const mention of viewport.querySelectorAll(selector)) {
      mention.classList.add("is-mention-revealed");
    }
  }
  // Reveal the hovered similar term in the title row (uncensor just it) while
  // the rest of the page body stays censored — mirrors inline body mentions.
  if (sourceEl?.classList.contains("sun-term-wrap")) {
    sourceEl.classList.add("is-mention-revealed");
  }
  setHoverSourceMark(sourceEl);
}

function getSwitchTargetTermId() {
  if (!focusState || focusState.switchTargetIndex == null) return null;
  return groups[focusState.activeIndex]?.terms[focusState.switchTargetIndex]?.id ?? null;
}

function applySwitchRevealedMentionMarks(termId) {
  if (!termId || !viewport) return;
  const selector = `.sun-def-mention--same-object[data-term-id="${CSS.escape(termId)}"]`;
  for (const mention of viewport.querySelectorAll(selector)) {
    mention.classList.add("is-mention-revealed");
  }
}

function clearSwitchRevealedMentionMarks() {
  viewport
    ?.querySelectorAll(".sun-def-mention--same-object.is-mention-revealed")
    .forEach((el) => {
      el.classList.remove("is-mention-revealed");
    });
}

function collectElementCensorBands(el) {
  const viewportRect = viewport.getBoundingClientRect();
  const scrollTop = viewport.scrollTop;
  const { lineHeight, barHeight, interLineGap } = getCensorBarLayout(el);
  const topOffset = getCensorBarTopOffset(el);
  const useCaptionLayout = isCaptionCensorElement(el);
  const clusterLineHeight = useCaptionLayout ? CAPTION_CENSOR_LINE_HEIGHT : lineHeight;
  const range = document.createRange();
  range.selectNodeContents(el);

  const rawLines = [];
  for (const rect of range.getClientRects()) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    rawLines.push({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    });
  }
  if (!rawLines.length) return [];

  const groups = clusterCensoredLines(rawLines, clusterLineHeight);
  const bands = [];
  let prevBottom = null;

  const pitch = Math.round(lineHeight);
  const firstAnchorTop = groups.length ? groups[0].anchorTop : 0;
  const baseBarTop = useCaptionLayout
    ? 0
    : getCensorLineSpan(firstAnchorTop, lineHeight, barHeight, topOffset).top;

  for (const group of groups) {
    if (group.minLeft === Infinity || group.maxRight === -Infinity) continue;

    const span = enforceCensorBandGap(
      useCaptionLayout
        ? getCaptionCensorLineSpan(group, topOffset)
        : getUniformCensorLineSpan(group, firstAnchorTop, baseBarTop, pitch, barHeight),
      prevBottom,
      interLineGap
    );
    prevBottom = span.top + span.height;

    bands.push({
      top: span.top - viewportRect.top + scrollTop,
      height: span.height,
      left: group.minLeft - viewportRect.left,
      width: group.maxRight - group.minLeft,
    });
  }

  return bands;
}

/**
 * Client rects of a mention's own text, ignoring the letter-shuffle overlay.
 * The overlay is an absolutely positioned, white-space:nowrap copy of the term
 * that the shuffle animation lays over the text; selecting the whole element
 * would mix in its (single-line) geometry and punch spurious holes in the
 * surrounding censor bands. We measure only the element's own text/content.
 */
function collectMentionCutoutRects(el, range) {
  const rects = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent) continue;
      range.selectNodeContents(node);
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      !node.classList.contains("letter-shuffle-inline-overlay")
    ) {
      range.selectNode(node);
    } else {
      continue;
    }
    for (const rect of range.getClientRects()) {
      if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }
  }
  return rects;
}

function getRevealedMentionCutouts() {
  const viewportRect = viewport.getBoundingClientRect();
  const scrollTop = viewport.scrollTop;
  const cutouts = [];
  const range = document.createRange();

  for (const el of viewport.querySelectorAll(".sun-def-mention--same-object.is-mention-revealed")) {
    for (const rect of collectMentionCutoutRects(el, range)) {
      cutouts.push({
        left: rect.left - viewportRect.left,
        right: rect.right - viewportRect.left,
        top: rect.top - viewportRect.top + scrollTop,
        bottom: rect.bottom - viewportRect.top + scrollTop,
      });
    }
  }

  return cutouts;
}

function getTermMentionCutouts(termId) {
  if (!termId || !viewport) return [];
  const viewportRect = viewport.getBoundingClientRect();
  const scrollTop = viewport.scrollTop;
  const cutouts = [];
  const range = document.createRange();
  const selector = `.sun-def-mention--same-object[data-term-id="${CSS.escape(termId)}"]`;

  for (const el of viewport.querySelectorAll(selector)) {
    for (const rect of collectMentionCutoutRects(el, range)) {
      cutouts.push({
        left: rect.left - viewportRect.left,
        right: rect.right - viewportRect.left,
        top: rect.top - viewportRect.top + scrollTop,
        bottom: rect.bottom - viewportRect.top + scrollTop,
      });
    }
  }

  return cutouts;
}

function splitBandAroundCutouts(band, cutouts) {
  let segments = [{ left: band.left, right: band.left + band.width }];
  const bandTop = band.top;
  const bandBottom = band.top + band.height;

  for (const cutout of cutouts) {
    // Require a real vertical overlap, not just edge-touching. A revealed
    // mention's cutout sits flush against the band on the line below it; with
    // sub-pixel rounding that edge-touch would otherwise punch a hole directly
    // beneath the revealed word, leaking the neighbouring (censored) line.
    const overlap =
      Math.min(bandBottom, cutout.bottom) - Math.max(bandTop, cutout.top);
    const minOverlap = Math.max(
      2,
      Math.min(band.height, cutout.bottom - cutout.top) * 0.3
    );
    if (overlap < minOverlap) continue;

    const pad = 2;
    const cutLeft = cutout.left - pad;
    const cutRight = cutout.right + pad;
    const next = [];

    for (const segment of segments) {
      if (cutRight <= segment.left || cutLeft >= segment.right) {
        next.push(segment);
        continue;
      }
      if (cutLeft > segment.left) next.push({ left: segment.left, right: cutLeft });
      if (cutRight < segment.right) next.push({ left: cutRight, right: segment.right });
    }
    segments = next;
  }

  return segments
    .filter((segment) => segment.right - segment.left > 0.5)
    .map((segment) => ({
      ...band,
      left: segment.left,
      width: segment.right - segment.left,
    }));
}

function shouldClipPageCensorBandsToHeaderBackdrop() {
  return (
    isFocusActive() &&
    focusState?.phase === "locked" &&
    isTermPageScrollBgMode() &&
    isViewportTermScrollable()
  );
}

/** Bottom edge (screen Y) of the opaque title + nav backdrop — bands above are hidden. */
function getPageCensorHeaderBackdropBottomScreenY() {
  if (!shouldClipPageCensorBandsToHeaderBackdrop()) return null;

  if (termHeaderBackdropEl && !termHeaderBackdropEl.hidden) {
    const rect = termHeaderBackdropEl.getBoundingClientRect();
    if (rect.height > 0.5) return rect.bottom;
  }

  const scrollportTop = viewport?.getBoundingClientRect().top ?? 0;
  const fixedHeight = parseFloat(
    viewport?.style.getPropertyValue("--term-header-fixed-height") || ""
  );
  if (Number.isFinite(fixedHeight) && fixedHeight > 0) {
    return scrollportTop + fixedHeight;
  }

  const censoredBottom = getCensoredRowScreenBottom();
  const labelRect = termSimilarLabelEl?.getBoundingClientRect();
  const labelBottom = labelRect ? labelRect.bottom : null;
  if (censoredBottom != null || labelBottom != null) {
    return Math.max(censoredBottom ?? 0, labelBottom ?? 0);
  }

  return scrollportTop + getTermFixedHeaderBottomPx(getLiveViewportHeight());
}

function bandToScreenVerticalSpan(band) {
  const viewportRect = viewport.getBoundingClientRect();
  const scrollTop = viewport.scrollTop;
  const top = band.top - scrollTop + viewportRect.top;
  return { top, bottom: top + band.height };
}

/** Drop or trim bands scrolled behind the fixed header backdrop. */
function clipPageCensorBandsBelowHeaderBackdrop(band) {
  const backdropBottom = getPageCensorHeaderBackdropBottomScreenY();
  if (backdropBottom == null || !band) return [band];

  const screen = bandToScreenVerticalSpan(band);
  if (screen.bottom <= backdropBottom + 0.5) return [];
  if (screen.top >= backdropBottom - 0.5) return [band];

  const clipPx = backdropBottom - screen.top;
  const nextHeight = band.height - clipPx;
  if (nextHeight <= 0.5) return [];
  return [{ ...band, top: band.top + clipPx, height: nextHeight }];
}

function appendPageCensorLine(layer, band, { instant = false } = {}) {
  // Horizontal overlap only: it hides sub-pixel seams between segments split
  // around cutouts. Applying it vertically would eat the inter-line gap and
  // make stacked bars touch, so the height/top are left untouched.
  const overlap = 1;
  const width = band.width + overlap * 2;
  const line = document.createElement("div");
  line.className = instant ? "sun-page-censor-line is-instant" : "sun-page-censor-line";
  line.style.top = `${band.top}px`;
  line.style.left = `${band.left - overlap}px`;
  line.style.width = `${width}px`;
  line.style.height = `${band.height}px`;
  if (!instant) applyCensorWriteTiming(line, width);
  layer.appendChild(line);
}

function getSelectedTitleRowTermCutouts() {
  if (!svgEl || !viewport) return [];
  const textEl = svgEl.querySelector(".sun-ray.is-active .sun-term-wrap.is-selected .sun-term");
  if (!textEl) return [];

  const viewportRect = viewport.getBoundingClientRect();
  const scrollTop = viewport.scrollTop;
  const bbox = textEl.getBoundingClientRect();
  if (bbox.width <= 0 || bbox.height <= 0) return [];

  const padX = MENTION_CENSOR_WIDTH_PAD + 1;
  const padY = 2;

  return [
    {
      left: bbox.left - viewportRect.left - padX,
      right: bbox.right - viewportRect.left + padX,
      top: bbox.top - viewportRect.top + scrollTop - padY,
      bottom: bbox.bottom - viewportRect.top + scrollTop + padY,
    },
  ];
}

function appendViewportPageCensorBands(layer, revealedTermId = null, extraCutouts = [], options = {}) {
  const cutouts = [
    ...(revealedTermId ? getRevealedMentionCutouts() : []),
    ...extraCutouts,
  ];
  const useCutouts = cutouts.length > 0;
  const instant = Boolean(options.instant);

  const appendBand = (band) => {
    if (!band) return;
    for (const clipped of clipPageCensorBandsBelowHeaderBackdrop(band)) {
      if (useCutouts) {
        for (const segment of splitBandAroundCutouts(clipped, cutouts)) {
          appendPageCensorLine(layer, segment, { instant });
        }
        continue;
      }
      appendPageCensorLine(layer, clipped, { instant });
    }
  };

  for (const selector of PAGE_CENSOR_BLOCK_SELECTORS) {
    for (const el of viewport.querySelectorAll(selector)) {
      if (!isPageCensorTextTarget(el)) continue;
      for (const band of collectElementCensorBands(el)) {
        appendBand(band);
      }
    }
  }

  for (const selector of PAGE_CENSOR_LINE_SELECTORS) {
    for (const el of viewport.querySelectorAll(selector)) {
      if (!isPageCensorTextTarget(el)) continue;
      const bands = collectTextLineBands(el, revealedTermId);
      if (bands.length) {
        for (const band of bands) {
          appendBand(band);
        }
      } else if (elementHasNonRevealedText(el, revealedTermId)) {
        for (const band of collectElementCensorBands(el)) {
          appendBand(band);
        }
      }
    }
  }
}

function rebuildFullPageCensorOverlays() {
  const layer = ensurePageCensorLayer();
  if (!layer || !viewport) return;
  layer.replaceChildren();
  const isSwitchCensor = viewport.classList.contains("is-term-switch-censor");
  const switchTermId = isSwitchCensor ? getSwitchTargetTermId() : null;
  const extraCutouts = [
    ...getTermMentionCutouts(switchTermId),
    ...(isSwitchCensor ? getSelectedTitleRowTermCutouts() : []),
  ];
  appendViewportPageCensorBands(layer, null, extraCutouts, { instant: isSwitchCensor });
}

function holdSiblingTermCensors() {
  viewport?.classList.add("is-term-sibling-censor-held");
}

function releaseSiblingTermCensorHold() {
  viewport?.classList.remove("is-term-sibling-censor-held");
}

function enableTermEnterSiblingCensor() {
  viewport?.classList.add("is-term-enter-censor");
  svgEl?.classList.add("sun-is-page-censored");
}

function disableTermEnterSiblingCensor() {
  viewport?.classList.remove("is-term-enter-censor");
  if (
    !hoveredSameObjectMentionId &&
    !viewport?.classList.contains("is-term-switch-censor")
  ) {
    svgEl?.classList.remove("sun-is-page-censored");
  }
}

function getCensorHeaderBottomScreenY(viewportHeight = getLiveViewportHeight()) {
  const backdropBottom = getPageCensorHeaderBackdropBottomScreenY();
  if (backdropBottom != null) return backdropBottom;
  const viewportRect = viewport?.getBoundingClientRect();
  if (!viewportRect) return null;
  return viewportRect.top + getTermFixedHeaderBottomPx(viewportHeight);
}

function measureTermPageImageHeightPx(el, figure = el?.closest?.(".sun-term-page__figure")) {
  if (!el) return 0;

  const fromVar = figure
    ? parseFloat(figure.style.getPropertyValue("--term-page-image-censor-height"))
    : NaN;
  if (Number.isFinite(fromVar) && fromVar > 0) return fromVar;

  const fromStyle = parseFloat(el.style.height);
  if (Number.isFinite(fromStyle) && fromStyle > 0) return fromStyle;

  const computed = parseFloat(getComputedStyle(el).height);
  if (Number.isFinite(computed) && computed > 0) return computed;

  return el.getBoundingClientRect().height || el.offsetHeight || 0;
}

/** Intersect a term-page image box with viewport + pinned header. */
function getElementVisibleImageScreenSpan(el, viewportHeight = getLiveViewportHeight()) {
  if (!viewport || !el || el.hidden) return null;
  if (el.closest("[hidden]")) return null;
  if (el instanceof HTMLImageElement && !el.classList.contains("is-loaded")) return null;

  const figure = el.closest(".sun-term-page__figure");
  const viewportRect = viewport.getBoundingClientRect();
  const headerBottom = getCensorHeaderBottomScreenY(viewportHeight);
  const viewportBottom = viewportRect.top + viewportHeight;

  let left;
  let width;
  let screenTop;
  let screenBottom;

  if (figure) {
    const figureRect = figure.getBoundingClientRect();
    if (figureRect.width < 1) return null;

    const imageHeight = measureTermPageImageHeightPx(el, figure);
    if (imageHeight < 1) return null;

    left = figureRect.left;
    width = figureRect.width;
    screenTop = figureRect.top;
    screenBottom = figureRect.top + imageHeight;
  } else {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    left = rect.left;
    width = rect.width;
    screenTop = rect.top;
    screenBottom = rect.bottom;
  }

  screenTop = Math.max(
    screenTop,
    viewportRect.top,
    headerBottom ?? viewportRect.top
  );
  screenBottom = Math.min(screenBottom, viewportBottom);
  const height = screenBottom - screenTop;
  if (height < 1) return null;

  return {
    top: screenTop,
    left,
    width,
    height,
  };
}

/** Visible bleed slice in screen px — matches what is on screen, not full backdrop. */
function getTermPageMainImageVisibleScreenRect(
  viewportHeight = getLiveViewportHeight(),
  scrollTop = viewport?.scrollTop ?? 0
) {
  if (!viewport || !bleedBackdropEl || bleedBackdropEl.hidden) return null;
  if (!bleedBackdropEl.classList.contains("is-visible")) return null;
  if (!bleedBackdropEl.classList.contains("is-term-page")) return null;
  if (!isTermPageBleedImageInFrame(viewportHeight, scrollTop)) return null;

  const viewportRect = viewport.getBoundingClientRect();
  const bleedRect = bleedBackdropEl.getBoundingClientRect();
  if (bleedRect.width < 1 || bleedRect.height < 1) return null;

  const clipPx = getTermPageBleedImageClipPx(viewportHeight);
  let screenTop = bleedRect.top;
  let screenBottom = bleedRect.bottom - clipPx;

  if (isTermPageScrollBgMode() && isViewportTermScrollable()) {
    screenBottom = Math.min(
      screenBottom,
      getTermScrollBgOverlapTopPx(viewportHeight, scrollTop)
    );
  }

  screenTop = Math.max(screenTop, viewportRect.top);
  screenBottom = Math.min(screenBottom, viewportRect.top + viewportHeight);

  const height = screenBottom - screenTop;
  if (height < 1) return null;

  return {
    top: screenTop,
    left: bleedRect.left,
    width: bleedRect.width,
    height,
  };
}

/** Every on-screen image slice in screen px. */
function collectTermPageVisibleImageScreenRects(
  viewportHeight = getLiveViewportHeight(),
  scrollTop = viewport?.scrollTop ?? 0
) {
  const rects = [];
  const main = getTermPageMainImageVisibleScreenRect(viewportHeight, scrollTop);
  if (main) rects.push(main);
  for (const imageEl of viewport?.querySelectorAll(".sun-term-page__image") ?? []) {
    if (
      imageEl instanceof HTMLImageElement &&
      !imageEl.classList.contains("is-loaded")
    ) {
      continue;
    }
    const span = getElementVisibleImageScreenSpan(imageEl, viewportHeight);
    if (span) rects.push(span);
  }
  return rects;
}

function ensureMediaPlaceholderLayer() {
  if (!mediaPlaceholderLayer && viewport) {
    mediaPlaceholderLayer = document.createElement("div");
    mediaPlaceholderLayer.id = "sun-media-placeholder-layer";
    mediaPlaceholderLayer.className = "sun-media-placeholder-layer";
    mediaPlaceholderLayer.setAttribute("aria-hidden", "true");
    mediaPlaceholderLayer.hidden = true;
    viewport.appendChild(mediaPlaceholderLayer);
  }
  return mediaPlaceholderLayer;
}

function applyVisibleImageScreenRect(el, screenRect) {
  el.hidden = false;
  el.style.position = "fixed";
  el.style.top = `${screenRect.top}px`;
  el.style.left = `${screenRect.left}px`;
  el.style.width = `${screenRect.width}px`;
  el.style.height = `${screenRect.height}px`;
}

function ensureMediaCensorFrameEl(index) {
  const layer = ensureMediaPlaceholderLayer();
  if (!layer) return null;
  while (mediaCensorFrameEls.length <= index) {
    const el = document.createElement("div");
    el.className = "sun-page-censor-media-frame";
    el.setAttribute("aria-hidden", "true");
    el.hidden = true;
    layer.appendChild(el);
    mediaCensorFrameEls.push(el);
  }
  return mediaCensorFrameEls[index];
}

function clearMediaCensorFrames() {
  for (const el of mediaCensorFrameEls) el.hidden = true;
  if (mediaPlaceholderLayer) mediaPlaceholderLayer.hidden = true;
}

function syncMediaCensorFrame(layout = currentLayout) {
  if (!shouldApplyMediaCensorPlaceholder()) {
    clearMediaCensorFrames();
    return;
  }

  const layer = ensureMediaPlaceholderLayer();
  if (!layer) return;

  const viewportHeight = layout?.viewportHeight ?? getLiveViewportHeight();
  const scrollTop = viewport?.scrollTop ?? 0;
  const screenRects = collectTermPageVisibleImageScreenRects(viewportHeight, scrollTop);
  if (!screenRects.length) {
    clearMediaCensorFrames();
    return;
  }

  layer.hidden = false;
  for (let i = 0; i < screenRects.length; i++) {
    const el = ensureMediaCensorFrameEl(i);
    if (!el) continue;
    applyVisibleImageScreenRect(el, screenRects[i]);
  }

  for (let i = screenRects.length; i < mediaCensorFrameEls.length; i++) {
    mediaCensorFrameEls[i].hidden = true;
  }
}

function shouldApplyMediaCensorPlaceholder() {
  return Boolean(
    hoveredSameObjectMentionId ||
      viewport?.classList.contains("is-term-switch-censor")
  );
}

function applyMediaCensorPlaceholder() {
  bleedBackdropEl?.classList.add("is-censor-placeholder");
}

function clearMediaCensorPlaceholder() {
  bleedBackdropEl?.classList.remove("is-censor-placeholder");
  clearMediaCensorFrames();
}

function syncMediaCensorPlaceholder() {
  if (shouldApplyMediaCensorPlaceholder()) {
    applyMediaCensorPlaceholder();
    syncMediaCensorFrame();
  } else {
    clearMediaCensorPlaceholder();
  }
}

function enableTermSwitchPageCensor() {
  viewport?.classList.add("is-term-switch-censor");
  svgEl?.classList.add("sun-is-page-censored");
  applySwitchRevealedMentionMarks(getSwitchTargetTermId());
  syncMediaCensorPlaceholder();
  rebuildFullPageCensorOverlays();
}

function disableTermSwitchPageCensor() {
  viewport?.classList.remove("is-term-switch-censor");
  clearSwitchRevealedMentionMarks();
  syncMediaCensorPlaceholder();
  if (
    !hoveredSameObjectMentionId &&
    !viewport?.classList.contains("is-term-enter-censor")
  ) {
    svgEl?.classList.remove("sun-is-page-censored");
    pageCensorLayer?.replaceChildren();
  }
}

function rebuildPageCensorOverlays() {
  const layer = ensurePageCensorLayer();
  if (!layer || !hoveredSameObjectMentionId) return;
  layer.replaceChildren();
  appendViewportPageCensorBands(layer, hoveredSameObjectMentionId);
}

function detachSameObjectHoverForSwitch() {
  if (hoveredSameObjectMention) {
    stopLetterShuffle(getLetterShuffleTarget(hoveredSameObjectMention));
  }
  clearRevealedMentionMarks();
  hoveredSameObjectMention = null;
  hoveredSameObjectMentionId = null;
  viewport?.classList.remove("is-same-object-mention-hover");
  syncMediaCensorPlaceholder();
}

function clearSameObjectMentionHover() {
  if (!hoveredSameObjectMentionId) return;
  if (hoveredSameObjectMention) {
    stopLetterShuffle(getLetterShuffleTarget(hoveredSameObjectMention));
  }
  clearRevealedMentionMarks();
  hoveredSameObjectMention = null;
  hoveredSameObjectMentionId = null;
  viewport?.classList.remove("is-same-object-mention-hover");
  syncMediaCensorPlaceholder();
  if (!viewport?.classList.contains("is-term-switch-censor")) {
    svgEl?.classList.remove("sun-is-page-censored");
    pageCensorLayer?.replaceChildren();
  }
}

function setSameObjectTermHover(termId, sourceEl = null) {
  if (!termId) return;
  if (isSameObjectHoverReenterGuardActive()) return;
  if (isSameObjectHoverScrollGuardActive()) return;
  const prevSource = hoveredSameObjectMention;
  const changed = hoveredSameObjectMentionId !== termId;
  if (!changed && hoveredSameObjectMention === sourceEl) {
    applyRevealedMentionMarks(termId, sourceEl);
    rebuildPageCensorOverlays();
    return;
  }
  if (changed) {
    clearRevealedMentionMarks();
    hoveredSameObjectMentionId = termId;
  }
  if (prevSource && prevSource !== sourceEl) {
    stopLetterShuffle(getLetterShuffleTarget(prevSource));
  }
  hoveredSameObjectMention = sourceEl;
  viewport?.classList.add("is-same-object-mention-hover");
  svgEl?.classList.add("sun-is-page-censored");
  applyRevealedMentionMarks(termId, sourceEl);
  if (sourceEl) {
    startLetterShuffle(getLetterShuffleTarget(sourceEl));
  }
  syncMediaCensorPlaceholder();
  rebuildPageCensorOverlays();
  requestAnimationFrame(() => {
    syncMediaCensorFrame();
    rebuildPageCensorOverlays();
  });
}

function setSameObjectMentionHover(mention) {
  setSameObjectTermHover(mention.dataset.termId || null, mention);
}

function bindSameObjectMentionElement(mention) {
  if (mention.dataset.mentionHoverBound === "1") return;
  mention.dataset.mentionHoverBound = "1";

  mention.addEventListener("mouseenter", () => {
    if (focusState?.phase !== "locked" || isTermNavigating()) return;
    if (!allowSameObjectHoverActivation()) return;
    setSameObjectMentionHover(mention);
  });

  mention.addEventListener("mouseleave", (event) => {
    const related = event.relatedTarget;
    if (related instanceof Node) {
      const toTarget = getTermPageInteractionTarget(related);
      if (toTarget) {
        if (allowSameObjectHoverActivation()) {
          const toTermId = toTarget.dataset.termId;
          if (toTermId) {
            setSameObjectTermHover(toTermId, toTarget);
          }
        }
        return;
      }
    }
    tryClearSameObjectHoverReenterGate(related);
    clearSameObjectMentionHover();
  });
}

function bindSameObjectMentionElements() {
  viewport
    ?.querySelectorAll(".sun-def-mention--same-object")
    .forEach((mention) => bindSameObjectMentionElement(mention));
}

function bindSameObjectMentionHover() {
  viewport?.addEventListener(
    "scroll",
    () => {
      if (focusState?.phase !== "locked" || isTermNavigating()) return;
      markSameObjectHoverScrollActivity();
      syncSameObjectHoverDuringScroll();
      if (shouldApplyMediaCensorPlaceholder()) syncMediaCensorFrame();
    },
    { passive: true }
  );

  viewport?.addEventListener(
    "wheel",
    () => {
      if (focusState?.phase !== "locked" || isTermNavigating()) return;
      markSameObjectHoverScrollActivity();
    },
    { passive: true }
  );

  viewport?.addEventListener("mousemove", (event) => {
    lastPointer = { x: event.clientX, y: event.clientY, known: true };
    noteSameObjectHoverPointerMove(event.clientX, event.clientY);
    if (focusState?.phase !== "locked" || isTermNavigating()) return;
    syncSameObjectHoverAtPointer(event.clientX, event.clientY);
  });

  viewport?.addEventListener("mouseleave", () => {
    clearSameObjectHoverReenterGate();
    clearSameObjectHoverScrollGuard();
  });
}

function bindTermPageScroll() {
  viewport?.addEventListener(
    "scroll",
    () => {
      if (!isViewportTermScrollable() || !isFocusActive()) return;
      const scrollTop = viewport.scrollTop;
      const scrollDelta = scrollTop - termPagePrevScrollTop;
      const snapAnimating = termPagePinSnapFrame != null;
      if (!isTermPageWheelSmoothing() && !snapAnimating) {
        if (Math.abs(scrollDelta) > 0.01) {
          termPagePinScrollDir = scrollDelta > 0 ? 1 : -1;
        }
        noteTermPageScrollInput(scrollDelta);
      } else if (!isTermPageWheelSmoothing() && snapAnimating) {
        noteTermPageScrollInput(0);
      }
      termPagePrevScrollTop = scrollTop;
      syncTermScrollBgPosition(currentLayout);
      syncTermHeaderPinState(currentLayout);
    },
    { passive: true }
  );
}

function bindTitleRowTermClick() {
  if (!TERM_PAGE_LEGACY_CONTENT_ENABLED && !TERM_PAGE_SCROLL_BG_ENABLED) return;
  svgEl.addEventListener("click", (event) => {
    if (isTermNavigating()) return;
    if (focusState?.phase !== "locked") return;
    const hit = event.target.closest(
      ".sun-ray.is-locked .sun-term-wrap:not(.is-selected) .sun-term-hit"
    );
    if (!hit) return;
    const wrap = hit.closest(".sun-term-wrap");
    const termId = wrap?.dataset.termId;
    if (!termId) return;
    event.preventDefault();
    navigateToTerm(termId);
  });
}

function bindTitleRowTermHover() {
  svgEl.addEventListener("mouseover", (event) => {
    if (focusState?.phase !== "locked" || isTermNavigating()) return;
    if (!allowSameObjectHoverActivation()) return;
    const hit = event.target.closest(
      ".sun-ray.is-locked .sun-term-wrap:not(.is-selected) .sun-term-hit"
    );
    if (!hit) return;
    const wrap = hit.closest(".sun-term-wrap");
    const termId = wrap?.dataset.termId;
    if (!termId) return;
    setSameObjectTermHover(termId, wrap);
  });

  svgEl.addEventListener("mouseout", (event) => {
    const hit = event.target.closest(
      ".sun-ray.is-locked .sun-term-wrap:not(.is-selected) .sun-term-hit"
    );
    if (!hit) return;
    const wrap = hit.closest(".sun-term-wrap");
    const related = event.relatedTarget;
    if (wrap && related instanceof Node && wrap.contains(related)) return;
    if (related instanceof Node) {
      const toTarget = getTermPageInteractionTarget(related);
      if (toTarget) {
        if (allowSameObjectHoverActivation()) {
          const toTermId = toTarget.dataset.termId;
          if (toTermId) {
            setSameObjectTermHover(toTermId, toTarget);
          }
        }
        return;
      }
    }
    tryClearSameObjectHoverReenterGate(related);
    clearSameObjectMentionHover();
  });
}

function bindBackNavigation() {
  const onBackHover = (event) => {
    if (event.type === "mouseover") {
      const related = event.relatedTarget;
      if (related instanceof Node && backFixedEl?.contains(related)) return;
    }
    if (isTermNavigating()) return;
    if (focusState?.phase !== "locked") return;
    if (!event.target.closest(".sun-back-hit")) return;
    startUnfocusAnimation();
  };
  backFixedEl?.addEventListener("pointerover", onBackHover, true);
}

function getBackMiniRayScreenLeft(anchor, rotationDeg, localX, width, textAnchor) {
  const rotRad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  const left = textAnchor === "end" ? localX - width : localX;
  const right = textAnchor === "end" ? localX : localX + width;
  return Math.min(
    anchor.x + left * cos,
    anchor.x + right * cos
  );
}

function measureBackMiniMinLeftExtent(viewportWidth, viewportHeight, geoScale) {
  const { normal } = getGeometryEndpoints(viewportWidth, viewportHeight);
  const backCx = viewportWidth;
  const backCy = normal.cy;
  const backR = normal.radius * geoScale;
  const miniFontSize = LAYOUT.fontSize * geoScale;
  const arc = {
    angleTop: normal.angleTop,
    angleBottom: normal.angleBottom,
    angleCenter: normal.angleCenter,
  };
  const miniLayout = {
    overview: 1,
    contentScale: miniFontSize / LAYOUT.overviewFontSize,
    radius: backR,
  };
  const count = LAYOUT.rayCount || 0;
  let minLeft = Infinity;

  for (let groupIndex = 0; groupIndex < count; groupIndex++) {
    if (!isGroupOnArc(groupIndex)) continue;

    const group = groups[groupIndex];
    if (!group?.terms.length) continue;

    const angle = arc.angleTop - bestArcU(groupIndex) * arcRayStep(arc);
    const anchor = pointOnArc(backCx, backCy, backR, angle);
    const { rotation, outwardSign } = rayFrame(angle);
    const estWidths = group.terms.map(
      (term) => estimateTermWidth(term.name) * geoScale
    );
    const { placed } = layoutTermsOnRay(
      { anchor, rotation, outwardSign, radialAngle: angle },
      group.terms,
      miniLayout,
      estWidths
    );

    for (const tp of placed) {
      const screenLeft = getBackMiniRayScreenLeft(
        anchor,
        rotation,
        tp.localX,
        tp.width,
        tp.textAnchor
      );
      minLeft = Math.min(minLeft, screenLeft);
    }
  }

  return minLeft;
}

let backMiniScaleCacheKey = "";
let backMiniScaleCache = 0;

function computeBackMiniContentScale(viewportWidth, viewportHeight) {
  const cacheKey = `${viewportWidth}x${viewportHeight}`;
  if (cacheKey === backMiniScaleCacheKey) return backMiniScaleCache;

  const columnFromLeft = GRID.columns - LAYOUT.backCircleAlignColumnFromRight;
  const columnEdgeX = getGridColumnLeft(columnFromLeft, viewport);
  let lo = 0.05;
  let hi = 1;

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const minLeft = measureBackMiniMinLeftExtent(viewportWidth, viewportHeight, mid);
    if (!Number.isFinite(minLeft)) {
      hi = mid;
      continue;
    }
    if (minLeft > columnEdgeX) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  backMiniScaleCacheKey = cacheKey;
  backMiniScaleCache = lo;
  invalidateBackMiniWidthCache();
  return lo;
}

function getBackMiniArcGeometry(layout) {
  const { viewportWidth, viewportHeight } = layout;
  const { normal } = getGeometryEndpoints(viewportWidth, viewportHeight);
  const columnFromLeft = GRID.columns - LAYOUT.backCircleAlignColumnFromRight;
  const columnEdgeX = getGridColumnLeft(columnFromLeft, viewport);
  const geoScale = computeBackMiniContentScale(viewportWidth, viewportHeight);
  const backR = normal.radius * geoScale;

  return {
    viewportWidth,
    viewportHeight,
    normal,
    columnEdgeX,
    backCx: viewportWidth,
    backCy: normal.cy,
    backR,
    geoScale,
  };
}

function getBackMiniRayAngle(groupIndex, arc, exitT) {
  const u = bestArcU(groupIndex);
  const hU = horizontalArcU(arc);
  const dir = u >= hU ? 1 : -1;
  const magnitude = LAYOUT.backMiniExitMagnitude * easeInCubic(exitT);
  const arcU = u + dir * magnitude;
  return arc.angleTop - arcU * arcRayStep(arc);
}

function invalidateBackMiniWidthCache() {
  backMiniWidthCacheKey = "";
  backMiniWidthCache = null;
}

function getBackMiniWidthCacheKey(layout, geoScale) {
  return `${layout.viewportWidth}x${layout.viewportHeight}x${geoScale.toFixed(5)}`;
}

function collectBackMiniWidthCacheFromDom() {
  const cache = new Map();
  const scene = backFixedEl?.querySelector(".sun-back-scene");
  if (!scene) return cache;

  for (const ray of scene.querySelectorAll(".sun-back-ray")) {
    const groupIndex = Number(ray.dataset.group);
    if (!Number.isFinite(groupIndex)) continue;

    const widths = [...ray.querySelectorAll(".sun-back-term")].map((el) => {
      const w = el.getBBox().width;
      return w > 0.25 ? w : 0;
    });
    if (widths.length) cache.set(groupIndex, widths);
  }
  return cache;
}

function syncBackMiniWidthCache(layout, geoScale) {
  const cacheKey = getBackMiniWidthCacheKey(layout, geoScale);
  const measured = collectBackMiniWidthCacheFromDom();
  if (!measured.size) return false;

  let changed = cacheKey !== backMiniWidthCacheKey;
  if (!changed && backMiniWidthCache) {
    for (const [groupIndex, widths] of measured) {
      const prev = backMiniWidthCache.get(groupIndex);
      if (
        !prev ||
        prev.length !== widths.length ||
        prev.some((w, i) => Math.abs(w - widths[i]) > 0.5)
      ) {
        changed = true;
        break;
      }
    }
  }

  backMiniWidthCacheKey = cacheKey;
  backMiniWidthCache = measured;
  return changed;
}

function getBackMiniTermWidths(groupIndex, group, fontScale) {
  const cached = backMiniWidthCache?.get(groupIndex);
  if (cached?.length === group.terms.length) return cached;
  return group.terms.map((term) => estimateTermWidth(term.name) * fontScale);
}

function buildBackMiniArcMarkup(layout) {
  const backMiniExitT = focusState?.backMiniExitT ?? 0;
  const backCircleT = focusState?.backCircleT ?? 0;
  const geo = getBackMiniArcGeometry(layout);
  if (geo.backR <= 0.5 || !isBackMiniCircleVisible(backCircleT, backMiniExitT)) {
    return { markup: "", miniFontSize: 0, geoScale: 0 };
  }

  const arc = {
    angleTop: geo.normal.angleTop,
    angleBottom: geo.normal.angleBottom,
    angleCenter: geo.normal.angleCenter,
  };
  const count = LAYOUT.rayCount || 0;
  const miniFontSize = Math.max(4, LAYOUT.fontSize * geo.geoScale);
  const miniLayout = {
    overview: 1,
    contentScale: miniFontSize / LAYOUT.overviewFontSize,
    radius: geo.backR,
  };
  const fontScale = miniFontSize / LAYOUT.fontSize;
  const activeIndex = focusState?.activeIndex ?? getDisplayActiveIndex();
  const parts = [
    `<defs><clipPath id="sun-back-clip"><rect x="0" y="0" width="${geo.viewportWidth}" height="${geo.viewportHeight}" /></clipPath></defs>`,
    `<g class="sun-back-scene" clip-path="url(#sun-back-clip)">`,
  ];

  for (let groupIndex = 0; groupIndex < count; groupIndex++) {
    if (!isGroupOnArc(groupIndex)) continue;

    const group = groups[groupIndex];
    if (!group?.terms.length) continue;

    const currentAngle = getBackMiniRayAngle(groupIndex, arc, backMiniExitT);
    const anchor = pointOnArc(geo.backCx, geo.backCy, geo.backR, currentAngle);
    const { rotation, outwardSign } = rayFrame(currentAngle);
    const transform = {
      anchor,
      rotation,
      outwardSign,
      radialAngle: currentAngle,
    };
    const estWidths = getBackMiniTermWidths(groupIndex, group, fontScale);
    const { placed } = layoutTermsOnRay(
      transform,
      group.terms,
      miniLayout,
      estWidths
    );
    const isActive = groupIndex === activeIndex;
    const rayOpacity = getRayExitOpacity(anchor, layout);
    const rayClasses = [
      "sun-back-ray",
      "sun-ray",
      isActive ? "is-active" : "is-dimmed",
    ];
    if (isActive) rayClasses.push("is-locked");
    const rayStyle =
      rayOpacity < 0.999 ? ` style="opacity:${rayOpacity.toFixed(3)}"` : "";

    parts.push(
      `<g class="${rayClasses.join(" ")}" data-group="${groupIndex}" data-outward-sign="${outwardSign}" transform="translate(${anchor.x}, ${anchor.y}) rotate(${rotation})"${rayStyle}>`
    );

    for (let termIndex = 0; termIndex < placed.length; termIndex++) {
      const tp = placed[termIndex];

      parts.push(
        `<g class="sun-back-term-wrap sun-term-wrap" data-term-name="${escapeAttr(tp.term.name)}">`
      );
      parts.push(
        `<text class="sun-back-term sun-term" x="${tp.localX}" y="0" style="font-size:${miniFontSize}px" text-anchor="${tp.textAnchor}" dominant-baseline="middle">${escapeHtml(applyTypographyRules(tp.term.name))}</text>`
      );
      parts.push("</g>");
    }

    parts.push("</g>");
  }

  parts.push("</g>");

  const hitWidth = geo.viewportWidth - geo.columnEdgeX;
  if (hitWidth > 0.5) {
    parts.push(
      `<rect class="sun-back-hit" x="${geo.columnEdgeX}" y="0" width="${hitWidth}" height="${geo.viewportHeight}" fill="rgba(0,0,0,0.001)" />`
    );
  }

  return { markup: parts.join(""), miniFontSize, geoScale: geo.geoScale };
}

function updateBackFixedOverlay(layout) {
  if (!backFixedEl || !layout) return;

  const showBack =
    TERM_PAGE_BACK_MINI_SUN_ENABLED &&
    focusState &&
    (focusState.phase === "locked" ||
      focusState.phase === "unfocusing");

  if (!showBack) {
    backFixedEl.innerHTML = "";
    invalidateBackMiniWidthCache();
    backFixedEl.setAttribute("aria-hidden", "true");
    return;
  }

  const { viewportWidth, viewportHeight } = layout;
  const backCircleT = focusState.backCircleT ?? 0;
  const backMiniExitT = focusState.backMiniExitT ?? 0;
  let { markup, miniFontSize, geoScale } = buildBackMiniArcMarkup(layout);

  backFixedEl.setAttribute("width", viewportWidth);
  backFixedEl.setAttribute("height", viewportHeight);
  backFixedEl.setAttribute("viewBox", `0 0 ${viewportWidth} ${viewportHeight}`);
  backFixedEl.setAttribute(
    "aria-hidden",
    isBackMiniCircleVisible(backCircleT, backMiniExitT) ? "false" : "true"
  );
  backFixedEl.innerHTML = markup;
  if (markup && miniFontSize > 0) {
    if (syncBackMiniWidthCache(layout, geoScale)) {
      ({ markup } = buildBackMiniArcMarkup(layout));
      backFixedEl.innerHTML = markup;
    }
  }
}

function positionTermPageSide(sideEl, sideSpan, pageSpan) {
  if (!sideEl) return;
  sideEl.style.width = `${sideSpan.width}px`;
  sideEl.style.left = `${sideSpan.left - pageSpan.left}px`;
}

function positionTermPageBlock(el, blockSpan, pageSpan) {
  if (!el) return;
  el.style.width = `${blockSpan.width}px`;
  el.style.left = `${blockSpan.left - pageSpan.left}px`;
}

function renderAnnotatedTermText(text, term, options = {}) {
  return annotateDefinitionMentions(
    applyBlockTypography(text?.trim() || "", options),
    termMentionPatterns,
    term.objectId,
    term.id
  );
}

function renderMetaFramingTags(tags) {
  if (!tags?.length) return "";
  return tags
    .map((tag) => {
      const escaped = escapeHtml(tag);
      return `<span class="sun-term-meta__tag" data-meta-filter-value="${escapeAttr(tag)}">${escaped}</span>`;
    })
    .join(", ");
}

function setAnnotatedTermText(el, text, term, options = {}) {
  if (!el) return;
  el.innerHTML = renderAnnotatedTermText(text, term, options);
  bindSameObjectMentionElements();
}

function resetTermPageLabelRow(rowEl) {
  if (!rowEl) return;
  const headingEl = rowEl.querySelector(".sun-term-page__label-row-heading");
  const textEl = rowEl.querySelector(".sun-term-page__label-row-text");
  rowEl.hidden = true;
  rowEl.style.height = "";
  if (textEl) {
    textEl.innerHTML = "";
    textEl.style.left = "";
    textEl.style.width = "";
  }
  if (headingEl) {
    headingEl.style.left = "";
    headingEl.style.width = "";
  }
}

function layoutTermPageLabelRow(rowEl, viewportWidth, pageSpan) {
  if (!rowEl || rowEl.hidden) return;
  const headingEl = rowEl.querySelector(".sun-term-page__label-row-heading");
  const textEl = rowEl.querySelector(".sun-term-page__label-row-text");
  if (!headingEl || !textEl) return;
  const headingSpan = getGridSpanBounds(
    LAYOUT.termPageLabelHeadingColumns,
    LAYOUT.termPageLabelHeadingColumnFromRight,
    viewport
  );
  const contentSpan = getGridSpanBounds(
    LAYOUT.termPageLabelContentColumns,
    LAYOUT.termPageLabelContentColumnFromRight,
    viewport
  );
  positionTermPageBlock(headingEl, headingSpan, pageSpan);
  positionTermPageBlock(textEl, contentSpan, pageSpan);
  rowEl.style.height = `${textEl.offsetHeight}px`;
}

function updateTermPageLabelRow(rowEl, text, viewportWidth, pageSpan, term) {
  if (!rowEl) return false;
  const headingEl = rowEl.querySelector(".sun-term-page__label-row-heading");
  const textEl = rowEl.querySelector(".sun-term-page__label-row-text");
  const trimmed = text?.trim() || "";
  if (!trimmed || !textEl) {
    resetTermPageLabelRow(rowEl);
    return false;
  }
  const headingSpan = getGridSpanBounds(
    LAYOUT.termPageLabelHeadingColumns,
    LAYOUT.termPageLabelHeadingColumnFromRight,
    viewport
  );
  const contentSpan = getGridSpanBounds(
    LAYOUT.termPageLabelContentColumns,
    LAYOUT.termPageLabelContentColumnFromRight,
    viewport
  );
  setAnnotatedTermText(textEl, trimmed, term);
  positionTermPageBlock(headingEl, headingSpan, pageSpan);
  positionTermPageBlock(textEl, contentSpan, pageSpan);
  rowEl.hidden = false;
  rowEl.style.height = `${textEl.offsetHeight}px`;
  return true;
}

function getTermPageBleedCaptionSpan() {
  const {
    termPageBleedCaptionStartCssColumn: startCol,
    termPageBleedCaptionEndCssColumn: endCol,
  } = LAYOUT;

  const measured = measureGridCssColumnSpan(startCol, endCol, viewport);
  if (measured && measured.width > 0) return measured;

  const metrics = getGridMetrics();
  const containerLeft = viewport?.getBoundingClientRect().left ?? 0;
  const columnCount = startCol - endCol + 1;
  return {
    left: metrics.gridLeft - containerLeft,
    width: columnCount * metrics.colWidth + (columnCount - 1) * metrics.gutter,
  };
}

function measureTermHoverCaptionLineContentWidth(lineEl) {
  return Math.max(lineEl.scrollWidth, lineEl.offsetWidth, lineEl.getBoundingClientRect().width);
}

function syncTermHoverCaptionBoxWidth(captionEl = termBleedCaptionEl) {
  if (!captionEl) return;
  const maxWidth = parseFloat(captionEl.style.maxWidth);
  const lineEls = captionEl.querySelectorAll(".sun-term-hover-caption__line");
  let contentWidth = 0;
  for (const line of lineEls) {
    contentWidth = Math.max(contentWidth, measureTermHoverCaptionLineContentWidth(line));
  }
  if (!lineEls.length) contentWidth = captionEl.scrollWidth;

  let width = contentWidth;

  if (Number.isFinite(maxWidth)) {
    width = Math.min(width, maxWidth);
  }

  captionEl.style.width = `${Math.ceil(Math.max(width, 0))}px`;
}

/** @type {HTMLSpanElement | null} */
let termHoverCaptionMeasureEl = null;

function measureTermHoverCaptionLineWidth(text, captionEl = termBleedCaptionEl) {
  if (!captionEl) return 0;
  if (!termHoverCaptionMeasureEl) {
    termHoverCaptionMeasureEl = document.createElement("span");
    termHoverCaptionMeasureEl.className = "sun-term-hover-caption__line";
    termHoverCaptionMeasureEl.setAttribute("aria-hidden", "true");
    termHoverCaptionMeasureEl.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;top:0;left:0;";
    document.body.appendChild(termHoverCaptionMeasureEl);
  }
  const sourceStyle = getComputedStyle(captionEl);
  termHoverCaptionMeasureEl.style.font = sourceStyle.font;
  termHoverCaptionMeasureEl.style.fontFamily = sourceStyle.fontFamily;
  termHoverCaptionMeasureEl.style.fontSize = sourceStyle.fontSize;
  termHoverCaptionMeasureEl.style.fontWeight = sourceStyle.fontWeight;
  termHoverCaptionMeasureEl.style.fontVariationSettings = sourceStyle.fontVariationSettings;
  termHoverCaptionMeasureEl.style.letterSpacing = sourceStyle.letterSpacing;
  termHoverCaptionMeasureEl.textContent = text;
  return termHoverCaptionMeasureEl.offsetWidth;
}

function enumerateCaptionLineRanges(wordCount, lineCount) {
  const ranges = [];

  function build(start, linesLeft, cutEnds) {
    if (linesLeft === 1) {
      if (wordCount - start >= 1) ranges.push([...cutEnds, wordCount]);
      return;
    }
    const minEnd = start + 1;
    const maxEnd = wordCount - (linesLeft - 1);
    for (let end = minEnd; end <= maxEnd; end++) {
      build(end, linesLeft - 1, [...cutEnds, end]);
    }
  }

  build(0, lineCount, []);
  return ranges.map((cutEnds) => {
    const lineRanges = [];
    let start = 0;
    for (const end of cutEnds) {
      lineRanges.push([start, end]);
      start = end;
    }
    return lineRanges;
  });
}

function captionCharImbalanceScore(charCounts) {
  const mean = charCounts.reduce((sum, count) => sum + count, 0) / charCounts.length;
  return charCounts.reduce((sum, count) => sum + (count - mean) ** 2, 0);
}

function getCaptionLastLineCharTolerance(totalChars) {
  return Math.max(2, Math.ceil(totalChars / 7.5));
}

function captionLayoutScore(charCounts, lineWidths) {
  return (
    captionCharImbalanceScore(charCounts) +
    captionCharImbalanceScore(lineWidths) * 0.12
  );
}

/** 2 = last line at least as long (or 1-char shorter in 2-line captions), 1 = relaxed, 0 = invalid. */
function captionLastLineRank(charCounts, totalChars) {
  const lastChars = charCounts[charCounts.length - 1];
  const prevMax = Math.max(...charCounts.slice(0, -1));
  if (lastChars >= prevMax) return 2;
  if (charCounts.length === 2 && lastChars >= prevMax - 1) return 2;
  const tolerance = getCaptionLastLineCharTolerance(totalChars);
  if (lastChars >= prevMax - tolerance) return 1;
  return 0;
}

function layoutTermHoverCaptionLines(words, maxWidth, captionEl = termBleedCaptionEl) {
  const wordCount = words.length;
  if (!wordCount) return null;

  const maxLineCount = Math.min(wordCount, 5);
  const totalChars = words.reduce((sum, word) => sum + word.length, wordCount - 1);

  for (let lineCount = 2; lineCount <= maxLineCount; lineCount++) {
    let bestForCount = null;

    for (const ranges of enumerateCaptionLineRanges(wordCount, lineCount)) {
      const lines = ranges.map(([start, end]) => words.slice(start, end).join(" "));
      const styledLines = lines.map((line) => applyTypographyRules(line));
      const lineWidths = styledLines.map((line) =>
        measureTermHoverCaptionLineWidth(line, captionEl)
      );
      if (lineWidths.some((width) => width > maxWidth)) continue;

      const charCounts = lines.map((line) => line.length);
      const rank = captionLastLineRank(charCounts, totalChars);
      if (rank === 0) continue;

      const score = captionLayoutScore(charCounts, lineWidths);
      const candidate = { lines: styledLines, score, rank };

      if (
        !bestForCount ||
        rank > bestForCount.rank ||
        (rank === bestForCount.rank && score < bestForCount.score)
      ) {
        bestForCount = candidate;
      }
    }

    if (bestForCount) return bestForCount.lines;
  }

  return null;
}

function setTermHoverCaptionText(text, maxWidth, captionEl = termBleedCaptionEl) {
  if (!captionEl) return;
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);

  captionEl.replaceChildren();
  captionEl.classList.remove("is-multiline");

  const singleLine = applyTypographyRules(trimmed);
  if (
    words.length < 2 ||
    measureTermHoverCaptionLineWidth(singleLine, captionEl) <= maxWidth
  ) {
    appendTermHoverCaptionSingleLine(singleLine, captionEl);
    return;
  }

  const lines = layoutTermHoverCaptionLines(words, maxWidth, captionEl);
  if (!lines) {
    appendTermHoverCaptionWrappedFallback(singleLine, maxWidth, captionEl);
    captionEl.classList.add("is-multiline");
    return;
  }

  appendTermHoverCaptionLines(lines, captionEl);
  captionEl.classList.add("is-multiline");
}

function appendTermHoverCaptionSingleLine(text, captionEl = termBleedCaptionEl) {
  if (!captionEl) return;
  const line = document.createElement("span");
  line.className =
    "sun-term-hover-caption__line sun-term-hover-caption__line--single";
  line.textContent = text;
  captionEl.append(line);
  syncTermHoverCaptionBoxWidth(captionEl);
}

function appendTermHoverCaptionWrappedFallback(text, maxWidth, captionEl = termBleedCaptionEl) {
  if (!captionEl) return;
  const line = document.createElement("span");
  line.className = "sun-term-hover-caption__line";
  line.textContent = text;
  line.style.whiteSpace = "normal";
  captionEl.append(line);
  syncTermHoverCaptionBoxWidth(captionEl);
}

function appendTermHoverCaptionLines(lineTexts, captionEl = termBleedCaptionEl) {
  if (!captionEl || !lineTexts.length) return;

  const container = document.createElement("span");
  container.className = "sun-term-hover-caption__lines";

  lineTexts.forEach((lineText, index) => {
    const line = document.createElement("span");
    const isFirst = index === 0;
    const isLast = index === lineTexts.length - 1;
    line.className = isFirst
      ? "sun-term-hover-caption__line sun-term-hover-caption__line--first"
      : isLast
        ? "sun-term-hover-caption__line sun-term-hover-caption__line--last"
        : "sun-term-hover-caption__line";
    line.textContent = lineText;
    container.append(line);
  });

  captionEl.append(container);
  syncTermHoverCaptionBoxWidth(captionEl);
}

function escapeAttr(text) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveTermImageUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, APP_ROOT).href;
  } catch {
    return url;
  }
}

/** @type {string[]} */
let termImagePreloadAllUrls = [];
let termImagePreloadBoostIndex = -1;
let termImagePreloadBoostTimer = 0;

function getTermImagePreloadConcurrency() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const type = conn?.effectiveType;
  if (type === "slow-2g" || type === "2g") return 4;
  if (type === "3g") return 6;
  return 10;
}

function groupRingDistance(groupIndex, centerIndex, count) {
  const diff = Math.abs(groupIndex - centerIndex);
  return Math.min(diff, count - diff);
}

function collectGroupTermImageUrls(groupIndex) {
  const group = groups[groupIndex];
  if (!group?.terms?.length) return [];
  const urls = [];
  const seen = new Set();
  for (const term of group.terms) {
    for (const image of termImagesByName.get(term.name) || []) {
      if (!image?.url) continue;
      const resolved = resolveTermImageUrl(image.url);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      urls.push(resolved);
    }
  }
  return urls;
}

function collectTermImageUrlsForTerm(termName) {
  if (!termName) return [];
  return (termImagesByName.get(termName) || [])
    .map((image) => (image?.url ? resolveTermImageUrl(image.url) : ""))
    .filter(Boolean);
}

function buildPriorityTermImageUrlOrder(centerGroupIndex) {
  const count = groups.length;
  if (!count || !termImagePreloadAllUrls.length) return [...termImagePreloadAllUrls];

  const tiers = new Map();
  for (let groupIndex = 0; groupIndex < count; groupIndex += 1) {
    const dist = groupRingDistance(groupIndex, centerGroupIndex, count);
    const urls = collectGroupTermImageUrls(groupIndex);
    if (!urls.length) continue;
    if (!tiers.has(dist)) tiers.set(dist, []);
    tiers.get(dist).push(...urls);
  }

  const ordered = [];
  const seen = new Set();
  const maxDist = Math.floor(count / 2);
  for (let dist = 0; dist <= maxDist; dist += 1) {
    for (const url of tiers.get(dist) || []) {
      if (seen.has(url)) continue;
      seen.add(url);
      ordered.push(url);
    }
  }
  for (const url of termImagePreloadAllUrls) {
    if (seen.has(url)) continue;
    seen.add(url);
    ordered.push(url);
  }
  return ordered;
}

function scheduleTermImagePreloadBoost(centerGroupIndex = getDisplayActiveIndex()) {
  if (!termImagePreloadAllUrls.length) return;
  window.clearTimeout(termImagePreloadBoostTimer);
  termImagePreloadBoostTimer = window.setTimeout(() => {
    termImagePreloadBoostTimer = 0;
    if (centerGroupIndex === termImagePreloadBoostIndex) return;
    termImagePreloadBoostIndex = centerGroupIndex;
    boostTermImagePreloadPriority(buildPriorityTermImageUrlOrder(centerGroupIndex));
  }, 100);
}

function boostTermImagePreloadForTerm(termName) {
  const urls = collectTermImageUrlsForTerm(termName);
  if (urls.length) boostTermImagePreloadPriority(urls);
}

function startBackgroundTermImagePreload(urls, centerGroupIndex = 0) {
  if (!urls.length) return;
  termImagePreloadAllUrls = urls;
  termImagePreloadBoostIndex = centerGroupIndex;
  enqueueTermImagePreload(buildPriorityTermImageUrlOrder(centerGroupIndex), {
    decode: false,
    concurrency: getTermImagePreloadConcurrency(),
    retries: 1,
  });
}

function termImageSrcMatches(imgEl, url) {
  if (!(imgEl instanceof HTMLImageElement) || !url) return false;
  const resolved = resolveTermImageUrl(url);
  return Boolean(resolved && imgEl.src === resolved);
}


/** @type {WeakMap<HTMLImageElement, number>} */
const termImageLoadToken = new WeakMap();
let termImageLoadSeq = 0;

function cancelTermImageLoad(img) {
  if (!(img instanceof HTMLImageElement)) return;
  termImageLoadToken.set(img, ++termImageLoadSeq);
  img.removeAttribute("data-pending-src");
}

function assignPreloadedTermImage(img, url) {
  if (!(img instanceof HTMLImageElement) || !url) return Promise.resolve();

  const src = resolveTermImageUrl(url);
  img.removeAttribute("data-src");

  const finish = async () => {
    try {
      await img.decode();
    } catch {
      // decoded bitmap may still be usable
    }
    if (shouldApplyMediaCensorPlaceholder()) {
      syncMediaCensorFrame();
      rebuildPageCensorOverlays();
    }
  };

  if (getPreloadedTermImage(src)) {
    cancelTermImageLoad(img);
    img.src = src;
    img.classList.add("is-loaded");
    return finish();
  }

  if (img.src === src && img.complete && img.naturalWidth > 0) {
    registerPreloadedTermImage(src, img);
    img.classList.add("is-loaded");
    img.removeAttribute("data-pending-src");
    return finish();
  }

  if (img.dataset.pendingSrc === src) {
    return Promise.resolve();
  }

  const token = ++termImageLoadSeq;
  termImageLoadToken.set(img, token);
  img.dataset.pendingSrc = src;

  return new Promise((resolve) => {
    const loader = new Image();
    loader.decoding = "async";
    loader.referrerPolicy = "no-referrer";

    const apply = async () => {
      if (termImageLoadToken.get(img) !== token) return;
      img.removeAttribute("data-pending-src");
      if (loader.naturalWidth > 0) {
        registerPreloadedTermImage(src, loader);
      }
      img.src = src;
      img.classList.add("is-loaded");
      await finish();
      resolve();
    };

    loader.addEventListener("load", () => void apply(), { once: true });
    loader.addEventListener("error", () => void apply(), { once: true });
    loader.src = src;
    if (loader.complete) void apply();
  });
}

function loadTermPageImages(container) {
  if (!container) return Promise.resolve();
  const imgs = [...container.querySelectorAll("img.sun-term-page__image")];
  if (!imgs.length) return Promise.resolve();
  return Promise.all(
    imgs.map((img) => {
      const src = img.dataset.src || img.getAttribute("src");
      return src ? assignPreloadedTermImage(img, src) : Promise.resolve();
    })
  );
}

function collectTermPageScrollRevealTargets(term) {
  /** @type {{ key: string, el: Element, text: string, postApply?: () => void }[]} */
  const targets = [];
  let index = 0;
  const push = (el, text, postApply, html) => {
    const trimmed = text?.trim() || "";
    if (!el || !trimmed) return;
    targets.push({
      key: `scroll-reveal-${index++}`,
      el,
      text: applyTypographyRules(trimmed),
      html,
      postApply,
    });
  };

  push(
    termDefinitionEl,
    term.definition,
    () => setAnnotatedTermText(termDefinitionEl, term.definition, term),
    renderAnnotatedTermText(term.definition, term)
  );

  const metaRows = [
    { rowEl: termMetaTypeEl, value: term.termType, key: "termType" },
    { rowEl: termMetaFramingEl, value: term.framing, key: "framing" },
    {
      rowEl: termMetaConnotationEl,
      value: term.connotation,
      key: "connotation",
    },
  ];
  metaRows.forEach(({ rowEl, value, key }) => {
    const valueEl = rowEl?.querySelector(".sun-term-meta__value");
    push(valueEl, value, () =>
      updateTermMetaRow(rowEl, value, term, key, getTermPageScrollMetaColumnConfig())
    );
  });

  push(
    termEmphasizesTextEl,
    term.emphasizes,
    () => setAnnotatedTermText(termEmphasizesTextEl, term.emphasizes, term),
    renderAnnotatedTermText(term.emphasizes, term)
  );
  push(
    termObscuresTextEl,
    term.obscures,
    () => setAnnotatedTermText(termObscuresTextEl, term.obscures, term),
    renderAnnotatedTermText(term.obscures, term)
  );

  termImagesEl?.querySelectorAll(".sun-term-page__caption").forEach((captionEl, captionIndex) => {
    const images = getTermImagesForDisplay(term.name);
    const bleedUrl = termPageBleedImage?.url
      ? resolveTermImageUrl(termPageBleedImage.url)
      : null;
    const filtered = bleedUrl
      ? images.filter((img) => !img?.url || resolveTermImageUrl(img.url) !== bleedUrl)
      : images;
    const image = filtered[captionIndex] || null;
    push(captionEl, image ? formatTermImageCaption(image) : "");
  });

  termDetailsImageEl?.querySelectorAll(".sun-term-page__caption").forEach((captionEl) => {
    const image = getTermPageLastUnusedImage(term);
    push(captionEl, image ? formatTermImageCaption(image) : "");
  });

  return targets;
}

function resetTermPageScrollReveal() {
  termPageScrollRevealedKeys = new Set();
  termPageScrollRevealQueue = [];
}

function isTermPageScrollRevealActive() {
  return (
    isTermPageScrollContentMode() &&
    isFocusActive() &&
    focusState?.phase === "locked" &&
    !isTermNavigating() &&
    termPageScrollRevealQueue.length > 0
  );
}

function isTermPageScrollBlockVisible(el, viewportHeight = getLiveViewportHeight()) {
  if (!(el instanceof Element) || el.hidden) return false;
  const hiddenAncestor = el.closest("[hidden]");
  if (hiddenAncestor && hiddenAncestor !== el) return false;

  const headerBottom = getTermFixedHeaderBottomPx(viewportHeight);
  const rect = el.getBoundingClientRect();
  if (rect.height < 0.5 && rect.width < 0.5) return false;

  const visibleTop = Math.max(rect.top, headerBottom);
  const visibleBottom = Math.min(rect.bottom, viewportHeight);
  const visibleHeight = visibleBottom - visibleTop;
  if (visibleHeight < 8) return false;

  return visibleHeight >= Math.min(28, rect.height * 0.18);
}

function prepareTermPageScrollReveal(term) {
  if (!isTermPageScrollContentMode()) return;

  resetTermPageScrollReveal();
  termPageScrollRevealQueue = collectTermPageScrollRevealTargets(term);

  for (const { el } of termPageScrollRevealQueue) {
    abortFontScrambleTransition(el);
    stopLetterShuffle(el, { restore: false });
    el.textContent = "";
  }
}

function syncTermPageScrollReveal(layout = currentLayout) {
  if (!isTermPageScrollRevealActive()) return;

  const viewportHeight = layout?.viewportHeight ?? getLiveViewportHeight();
  const revealAll = !isViewportTermScrollable();

  for (const target of termPageScrollRevealQueue) {
    if (termPageScrollRevealedKeys.has(target.key)) continue;
    if (target.el.dataset.letterShuffleActive) {
      termPageScrollRevealedKeys.add(target.key);
      continue;
    }
    if (!revealAll && !isTermPageScrollBlockVisible(target.el, viewportHeight)) continue;

    termPageScrollRevealedKeys.add(target.key);
    const done = () => {
      target.postApply?.();
      bindSameObjectMentionElements();
      if (hoveredSameObjectMentionId && !isTermNavigating()) {
        rebuildPageCensorOverlays();
      }
    };
    if (target.html) {
      playAnnotatedTypewriterScrambleTo(target.el, target.html, done);
    } else {
      playLightTypewriterScrambleTo(target.el, target.text, done);
    }
  }
}

function revealTermPageContent(termId, revealToken) {
  if (revealToken !== termPageRevealToken) return;
  if (!termPageEl) return;
  const currentTerm = groups[focusState?.activeIndex]?.terms[focusState?.clickedIndex];
  if (!currentTerm || currentTerm.id !== termId) return;
  if (focusState?.phase !== "locked") return;
  termPageEl.classList.add("is-visible");
  termMetaEl?.classList.add("is-visible");
  if (currentLayout) {
    applyViewportTermScrollBounds(currentLayout.viewportHeight);
    syncTermHeaderPinState(currentLayout);
    if (isTermPageScrollBgMode()) {
      applyFocusRayScrollAnchor(currentLayout);
      applyTermPageScrollLiftTransform();
      termPageDeferCensoredWrapRepack = true;
      applyTermPageCensoredBaselineAlign(getFocusRayGroup(), { refreshBars: false });
      termPageDeferCensoredWrapRepack = false;
      updateTermPageSimilarLabel(currentLayout);
    }
  }
  syncTermPageScrollReveal(currentLayout);
  if (lastPointer.known) {
    syncSameObjectHoverAtPointer(lastPointer.x, lastPointer.y);
  }
}

function hideTermPageContent() {
  resetTermPageScrollReveal();
  termPageEl?.classList.remove("is-visible", "is-scroll-content");
  termMetaEl?.classList.remove("is-visible");
  viewport?.classList.remove("is-term-scroll-content");
}

function resetTermPageImages() {
  if (!termImagesEl) return;
  termImagesEl.innerHTML = "";
  termImagesEl.hidden = true;
  termImagesEl.style.top = "";
  termImagesEl.style.left = "";
  termImagesEl.style.width = "";
}

function resetTermPageDetailsImage() {
  if (!termDetailsImageEl) return;
  termDetailsImageEl.innerHTML = "";
  termDetailsImageEl.hidden = true;
  termDetailsImageEl.setAttribute("aria-hidden", "true");
  termDetailsImageEl.style.top = "";
  termDetailsImageEl.style.left = "";
  termDetailsImageEl.style.width = "";
  resetTermPageLabelNav();
}

const TERM_PAGE_LABEL_NAV_ITEMS = [
  { key: "users", label: "משתמשים" },
  { key: "contexts", label: "נפוץ" },
  { key: "period", label: "בשימוש" },
];

function getTermPageLabelField(term, key) {
  switch (key) {
    case "users":
      return term?.usedBy || "";
    case "contexts":
      return term?.contexts || "";
    case "period":
      return term?.period || "";
    default:
      return "";
  }
}

function resetTermPageLabelPanelState() {
  termLabelNavTermId = null;
  termLabelPanelOpen = { users: false, contexts: false, period: false };
  termLabelPanelAnimateKey = null;
}

function syncTermPageLabelPanelState(term) {
  if (!term) {
    resetTermPageLabelPanelState();
    return;
  }
  if (term.id === termLabelNavTermId) return;
  termLabelNavTermId = term.id;
  termLabelPanelOpen = { users: false, contexts: false, period: false };
}

function getTermPageLabelPanelWidthPx() {
  if (termPageScrollLayout.labelNavStacked) {
    return getGridSpanBounds(
      termPageScrollLayout.detailsImageColumns,
      termPageScrollLayout.detailsImageColumnFromRight,
      viewport
    ).width;
  }
  return getGridSpanBounds(
    termPageScrollLayout.labelPanelColumns,
    termPageScrollLayout.detailsImageColumnFromRight + termPageScrollLayout.labelPanelColumns,
    viewport
  ).width;
}

function ensureTermPageLabelNavMarkup() {
  const markupVersion = "3";
  if (!termLabelNavEl || termLabelNavEl.dataset.built === markupVersion) return;
  termLabelNavEl.dataset.built = markupVersion;
  termLabelNavEl.innerHTML = TERM_PAGE_LABEL_NAV_ITEMS.map(
    ({ key, label }) =>
      `<span class="sun-term-page__label-nav-item" data-label-key="${escapeAttr(key)}">` +
      `<span class="sun-term-page__label-nav-panel" hidden aria-hidden="true">` +
      `<span class="sun-term-page__label-nav-panel-text"></span>` +
      `</span>` +
      `<span class="sun-term-page__label-nav-trigger">` +
      `<span class="sun-term-page__label-nav-text">${escapeHtml(label)}</span>` +
      `<span class="sun-term-page__label-nav-glyph" aria-hidden="true"></span>` +
      `</span>` +
      `</span>`
  ).join("");
}

function clearTermLabelPanelTextAnimation(panelTextEl) {
  if (!panelTextEl) return;
  stopLetterShuffle(panelTextEl, { restore: false });
  panelTextEl.style.removeProperty("min-height");
}

function playTermLabelPanelTypewriter(panelTextEl, content, term) {
  clearTermLabelPanelTextAnimation(panelTextEl);
  setAnnotatedTermText(panelTextEl, content, term);
  const fullHeight = panelTextEl.offsetHeight;
  if (fullHeight > 0) {
    panelTextEl.style.minHeight = `${fullHeight}px`;
  }

  playAnnotatedTypewriterScrambleTo(panelTextEl, renderAnnotatedTermText(content, term), () => {
    panelTextEl.style.removeProperty("min-height");
    setAnnotatedTermText(panelTextEl, content, term);
    bindSameObjectMentionElements();
    if (termPageScrollLayout.labelNavStacked) {
      refreshTermPageLabelNavLayout();
    }
    syncActivePageCensorOverlays();
  });
}

function syncTermPageLabelPanelText(panelTextEl, content, term, key, isOpen) {
  if (!panelTextEl) return;
  if (!content) {
    clearTermLabelPanelTextAnimation(panelTextEl);
    panelTextEl.innerHTML = "";
    return;
  }
  if (!isOpen) {
    clearTermLabelPanelTextAnimation(panelTextEl);
    setAnnotatedTermText(panelTextEl, content, term);
    return;
  }
  if (termLabelPanelAnimateKey === key) {
    termLabelPanelAnimateKey = null;
    playTermLabelPanelTypewriter(panelTextEl, content, term);
    return;
  }
  if (panelTextEl.dataset.letterShuffleActive) return;
  clearTermLabelPanelTextAnimation(panelTextEl);
  setAnnotatedTermText(panelTextEl, content, term);
}

function resetTermPageLabelNav() {
  if (!termLabelNavEl) return;
  resetTermPageLabelPanelState();
  termLabelNavEl.hidden = true;
  termLabelNavEl.setAttribute("aria-hidden", "true");
  termLabelNavEl.style.top = "";
  termLabelNavEl.style.left = "";
  termLabelNavEl.style.width = "";
  termLabelNavEl.style.height = "";
  termLabelNavEl.style.removeProperty("display");
  termLabelNavEl.querySelectorAll(".sun-term-page__label-nav-item").forEach((itemEl) => {
    itemEl.style.position = "";
    itemEl.style.right = "";
    itemEl.classList.remove("is-panel-open");
    itemEl.removeAttribute("data-has-content");
    const panelEl = itemEl.querySelector(".sun-term-page__label-nav-panel");
    if (panelEl) {
      panelEl.hidden = true;
      panelEl.setAttribute("aria-hidden", "true");
      panelEl.style.width = "";
    }
    const panelTextEl = itemEl.querySelector(".sun-term-page__label-nav-panel-text");
    clearTermLabelPanelTextAnimation(panelTextEl);
    if (panelTextEl) panelTextEl.innerHTML = "";
    const textEl = itemEl.querySelector(".sun-term-page__label-nav-text");
    if (textEl) textEl.style.minWidth = "";
    itemEl.style.minWidth = "";
  });
}

function layoutTermPageLabelNav(imageTopInPage, imageHeight, term) {
  if (!termLabelNavEl) return 0;
  if (!imageHeight) {
    resetTermPageLabelNav();
    return 0;
  }

  const span = getGridSpanBounds(
    termPageScrollLayout.detailsImageColumns,
    termPageScrollLayout.detailsImageColumnFromRight,
    viewport
  );
  ensureTermPageLabelNavMarkup();
  syncTermPageLabelPanelState(term);

  const gap = LAYOUT.termPageLabelNavGapBelowImage;
  const panelGap = LAYOUT.termPageLabelPanelGap;
  const itemGap = LAYOUT.termPageLabelNavItemGap;
  termLabelNavEl.style.top = `${imageTopInPage + imageHeight + gap}px`;
  termLabelNavEl.style.left = `${span.left}px`;
  termLabelNavEl.style.width = `${span.width}px`;
  termLabelNavEl.style.setProperty("--term-page-label-nav-item-gap", `${itemGap}px`);
  termLabelNavEl.style.setProperty("--term-page-label-panel-gap", `${panelGap}px`);
  termLabelNavEl.hidden = false;
  termLabelNavEl.removeAttribute("aria-hidden");

  const itemEls = TERM_PAGE_LABEL_NAV_ITEMS.map(({ key }) =>
    termLabelNavEl.querySelector(`[data-label-key="${key}"]`)
  ).filter(Boolean);
  const panelWidth = getTermPageLabelPanelWidthPx();

  termLabelNavEl.style.display = "flex";
  termLabelNavEl.style.flexDirection = "row";
  termLabelNavEl.style.direction = "rtl";
  termLabelNavEl.style.justifyContent = "flex-start";
  termLabelNavEl.style.gap = `${itemGap}px`;
  itemEls.forEach((itemEl) => {
    itemEl.style.position = "static";
    itemEl.style.right = "";
    const key = itemEl.dataset.labelKey;
    const content = getTermPageLabelField(term, key).trim();
    const panelEl = itemEl.querySelector(".sun-term-page__label-nav-panel");
    const panelTextEl = itemEl.querySelector(".sun-term-page__label-nav-panel-text");
    itemEl.toggleAttribute("data-has-content", Boolean(content));
    const isOpen = Boolean(content) && termLabelPanelOpen[key];
    syncTermPageLabelPanelText(panelTextEl, content, term, key, isOpen);
    itemEl.classList.toggle("is-panel-open", isOpen);
    if (panelEl) {
      panelEl.style.width = `${panelWidth}px`;
      panelEl.hidden = !isOpen;
      panelEl.toggleAttribute("aria-hidden", !isOpen);
    }
  });

  itemEls.forEach((itemEl) => {
    const textEl = itemEl.querySelector(".sun-term-page__label-nav-text");
    if (textEl) {
      textEl.style.minWidth = `${textEl.offsetWidth}px`;
    }
    itemEl.style.minWidth = `${itemEl.offsetWidth}px`;
  });

  if (termPageScrollLayout.labelNavStacked) {
    termLabelNavEl.style.display = "flex";
    termLabelNavEl.style.flexDirection = "column";
    termLabelNavEl.style.direction = "rtl";
    termLabelNavEl.style.alignItems = "stretch";
    termLabelNavEl.style.gap = `${itemGap}px`;
    itemEls.forEach((itemEl) => {
      itemEl.style.position = "static";
      itemEl.style.right = "";
      itemEl.style.top = "";
      itemEl.style.minWidth = "";
      const panelEl = itemEl.querySelector(".sun-term-page__label-nav-panel");
      if (panelEl) panelEl.style.width = "100%";
    });
    const navHeight = itemEls.reduce((sum, itemEl) => {
      const panelEl = itemEl.querySelector(".sun-term-page__label-nav-panel");
      const panelHeight = panelEl && !panelEl.hidden ? panelEl.offsetHeight + panelGap : 0;
      return sum + itemEl.offsetHeight + panelHeight;
    }, 0) + Math.max(0, itemEls.length - 1) * itemGap;
    termLabelNavEl.style.height = `${navHeight}px`;
    return imageHeight + gap + navHeight;
  }

  const itemWidths = itemEls.map((itemEl) => itemEl.offsetWidth);
  let rightCursor = 0;
  itemEls.forEach((itemEl, index) => {
    let push = 0;
    for (let j = 0; j < index; j++) {
      const prevKey = TERM_PAGE_LABEL_NAV_ITEMS[j].key;
      if (termLabelPanelOpen[prevKey] && getTermPageLabelField(term, prevKey).trim()) {
        push += panelWidth + panelGap;
      }
    }
    itemEl.style.position = "absolute";
    itemEl.style.top = "0";
    itemEl.style.right = `${rightCursor + push}px`;
    rightCursor += itemWidths[index] + itemGap;
  });

  const labelRowHeight = itemEls.reduce(
    (max, itemEl) => Math.max(max, itemEl.offsetHeight),
    0
  );

  termLabelNavEl.style.display = "block";
  termLabelNavEl.style.removeProperty("gap");
  termLabelNavEl.style.height = `${labelRowHeight}px`;

  // Panels open to the left — only the heading row affects vertical scroll extent.
  return imageHeight + gap + labelRowHeight;
}

function refreshTermPageLabelNavLayout() {
  if (!termPageEl?.classList.contains("is-scroll-content")) return;
  const term = groups[focusState?.activeIndex]?.terms[focusState?.clickedIndex];
  if (!term || !termDefinitionEl) return;

  const viewportHeight = getLiveViewportHeight();
  const definitionHeight = termDefinitionEl.offsetHeight;
  const imagesBlockTop = getTermPageFold2ImageBlockTopInPagePx(viewportHeight);
  const imagesHeight = termImagesEl?.offsetHeight || 0;
  const imagesBottomInPage = imagesBlockTop + imagesHeight;

  let fold2BottomInPage = imagesBottomInPage;
  const pageTop = parseFloat(termPageEl.style.top) || 0;
  if (termMetaEl && !termMetaEl.hidden) {
    fold2BottomInPage = Math.max(
      fold2BottomInPage,
      termMetaEl.offsetTop + termMetaEl.offsetHeight - pageTop
    );
  }
  const fold2Pad = Math.max(
    0,
    getTermPageFold2ChapterFloorPx(viewportHeight) - fold2BottomInPage
  );
  const fold2EndInPage = imagesBottomInPage + fold2Pad;
  const scrollTopBefore = viewport?.scrollTop ?? 0;
  const detailsBottom = layoutTermPageScrollDetails(fold2EndInPage, term, true);
  const contentBottom = applyTermPageFold3ChapterPad(
    fold2EndInPage,
    detailsBottom,
    viewportHeight
  );
  termPageEl.style.minHeight = `${Math.max(definitionHeight, contentBottom)}px`;
  if (currentLayout) {
    applyViewportTermScrollBounds(currentLayout.viewportHeight);
    if (viewport && Math.abs(viewport.scrollTop - scrollTopBefore) > 1) {
      viewport.scrollTop = scrollTopBefore;
    }
    syncTermHeaderPinState(currentLayout);
  }
}

function bindTermPageLabelNav() {
  termLabelNavEl?.addEventListener("click", (event) => {
    if (isTermNavigating()) return;
    if (focusState?.phase !== "locked") return;
    if (event.target.closest(".sun-term-page__label-nav-panel")) return;
    const trigger = event.target.closest(".sun-term-page__label-nav-trigger");
    if (!trigger) return;
    const itemEl = trigger.closest(".sun-term-page__label-nav-item[data-label-key]");
    if (!itemEl || !termLabelNavEl.contains(itemEl)) return;
    const key = itemEl.dataset.labelKey;
    if (!key || !(key in termLabelPanelOpen)) return;

    const term = groups[focusState.activeIndex]?.terms[focusState.clickedIndex];
    if (!term || !getTermPageLabelField(term, key).trim()) return;

    event.preventDefault();
    event.stopPropagation();
    const wasOpen = termLabelPanelOpen[key];
    for (const { key: panelKey } of TERM_PAGE_LABEL_NAV_ITEMS) {
      termLabelPanelOpen[panelKey] = false;
    }
    if (!wasOpen) {
      termLabelPanelOpen[key] = true;
      termLabelPanelAnimateKey = key;
    } else {
      termLabelPanelAnimateKey = null;
      termLabelNavEl
        ?.querySelectorAll(".sun-term-page__label-nav-panel-text")
        .forEach((panelTextEl) => clearTermLabelPanelTextAnimation(panelTextEl));
    }
    refreshTermPageLabelNavLayout();
    syncActivePageCensorOverlays();
    requestAnimationFrame(() => syncActivePageCensorOverlays());
  });
}

function getTitleRowImageSize() {
  const span = getGridSpanBounds(
    LAYOUT.titleRowImageColumns,
    GRID.alignColumnFromRight,
    viewport
  );
  return span.width;
}

function getTermPageImageDimensions() {
  const span = getGridSpanBounds(
    LAYOUT.termPageImagesColumns,
    LAYOUT.termPageImagesColumnFromRight,
    viewport
  );
  return { width: span.width, height: getTermPageImageHeightPx() };
}

function getTermImagePixelSize(url) {
  if (!url) return null;
  const src = resolveTermImageUrl(url);
  const preloaded =
    getPreloadedTermImage(src) ||
    getPreloadedTermImage(url) ||
    getPreloadedTermImage(decodeURI(src));
  if (preloaded && preloaded.naturalWidth > 0 && preloaded.naturalHeight > 0) {
    return { width: preloaded.naturalWidth, height: preloaded.naturalHeight };
  }
  if (titleRowImageImgEl && titleRowImageImgEl.naturalWidth > 0) {
    const imgSrc = titleRowImageImgEl.currentSrc || titleRowImageImgEl.src;
    if (
      imgSrc === src ||
      imgSrc === url ||
      imgSrc.endsWith(url) ||
      decodeURI(imgSrc) === decodeURI(src)
    ) {
      return {
        width: titleRowImageImgEl.naturalWidth,
        height: titleRowImageImgEl.naturalHeight,
      };
    }
  }
  return null;
}

function getTermImageAspectRatio(url) {
  const size = getTermImagePixelSize(url);
  if (!size || size.height <= 0) return null;
  return size.width / size.height;
}

function getTermImageCoverScale(url, viewportWidth, viewportHeight) {
  const size = getTermImagePixelSize(url);
  if (!size || viewportWidth <= 0 || viewportHeight <= 0) return Infinity;
  return Math.max(viewportWidth / size.width, viewportHeight / size.height);
}

function hashStringToSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createPageRng(salt) {
  let state =
    (hashStringToSeed(String(salt)) ^
      Math.imul(pageImageSelectionSeed * 0xffffffff, 2654435761)) >>>
    0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandomItem(items, rng) {
  if (!items.length) return null;
  return items[Math.floor(rng() * items.length)];
}

/** First image in data/term-images.json — the fixed primary + full-bleed asset. */
function getTermPrimaryImage(termName) {
  const images = termImagesByName.get(termName) || [];
  return images.find((image) => image?.url) ?? null;
}

function pickTermDisplayImage(termName) {
  return getTermPrimaryImage(termName);
}

function getBleedTextLabPreviewForTerm(termName) {
  if (!isBleedTextLabMode() || !bleedTextLabPreview || !termName) return null;
  return bleedTextLabPreview.termName === termName ? bleedTextLabPreview : null;
}

function getBleedTextPrefsForActiveTerm(term) {
  if (!term?.name) {
    return { navText: "auto", titleRowText: "auto" };
  }
  const preview = getBleedTextLabPreviewForTerm(term.name);
  const saved = getTermTextPrefs(term.name);
  return {
    navText: preview?.navText ?? saved.navText,
    titleRowText: preview?.titleRowText ?? saved.titleRowText,
  };
}

function findTermImageByUrl(termName, imageUrl) {
  if (!termName || !imageUrl) return null;
  const images = termImagesByName.get(termName) || [];
  return images.find((image) => image?.url === imageUrl) ?? { url: imageUrl };
}

function getTermBleedEligibleImages(termName, viewportWidth, viewportHeight) {
  const images = termImagesByName.get(termName) || [];
  return images.filter(
    (image) =>
      image?.url &&
      getTermImagePixelSize(image.url) &&
      isTermImageBleedQuality(image.url, viewportWidth, viewportHeight)
  );
}

/** Fixed primary image for full bleed — always the first entry in term-images.json. */
function pickTermBleedImage(termName, viewportWidth, viewportHeight) {
  const preview = getBleedTextLabPreviewForTerm(termName);
  if (preview?.imageUrl) {
    return findTermImageByUrl(termName, preview.imageUrl);
  }
  return getTermPrimaryImage(termName);
}

/** One stable image for the fixed thumbnail and its full-bleed hover reveal. */
function pickTitleRowSharedImage(termName, viewportWidth, viewportHeight) {
  return pickTermBleedImage(termName, viewportWidth, viewportHeight);
}

function getTitleRowViewportSize(layout = currentLayout) {
  return {
    viewportWidth: layout?.viewportWidth ?? viewport?.clientWidth ?? window.innerWidth,
    viewportHeight: layout?.viewportHeight ?? viewport?.clientHeight ?? window.innerHeight,
  };
}

function getTermImagesForDisplay(termName) {
  const images = (termImagesByName.get(termName) || []).filter((image) => image?.url);
  if (!images.length) return [];
  const [primary, ...rest] = images;
  rest.sort((a, b) => {
    const aspectA = getTermImageAspectRatio(a.url) ?? 0;
    const aspectB = getTermImageAspectRatio(b.url) ?? 0;
    return aspectB - aspectA;
  });
  return [primary, ...rest];
}

function isTermImageBleedQuality(url, viewportWidth, viewportHeight) {
  const size = getTermImagePixelSize(url);
  if (!size || viewportWidth <= 0 || viewportHeight <= 0) return false;
  const shortEdge = Math.min(size.width, size.height);
  if (shortEdge < LAYOUT.titleRowBleedMinShortEdge) return false;
  return getTermImageCoverScale(url, viewportWidth, viewportHeight) <= LAYOUT.titleRowBleedMaxUpscale;
}

/** Fixed rows in scroll order: one every 5–7 eligible rows, random phase per page load. */
function pickFixedRayIndices(rayCount) {
  if (rayCount <= 0) return [];
  const rng = createPageRng("fixed-rays");
  const interval = 5 + Math.floor(rng() * 3);
  const offset = Math.floor(rng() * interval);
  const indices = [];
  for (let i = offset; i < rayCount; i += interval) {
    indices.push(i);
  }
  if (!indices.length) indices.push(0);
  return indices;
}

function pickRandomBleedCandidate(candidates, blockSalt, viewportWidth, viewportHeight) {
  const eligible = candidates.filter(
    (candidate) =>
      getTermBleedEligibleImages(candidate.term.name, viewportWidth, viewportHeight).length > 0
  );
  if (!eligible.length) return null;
  return pickRandomItem(eligible, createPageRng(`bleed-term-${blockSalt}`));
}

function canRunIdleGallery(layout) {
  // Full-bleed backdrop on term hover only — no idle slideshow.
  return false;
}

function buildIdleGalleryPool(groupIndex = getDisplayActiveIndex()) {
  const layout = currentLayout;
  const viewportWidth = layout?.viewportWidth ?? window.innerWidth;
  const viewportHeight = layout?.viewportHeight ?? window.innerHeight;
  const group = groups[groupIndex];
  if (!group?.terms?.length) return [];

  const seen = new Set();
  const urls = [];

  for (const term of group.terms) {
    const image = pickTitleRowSharedImage(term.name, viewportWidth, viewportHeight);
    if (!image?.url) continue;
    const resolved = resolveTermImageUrl(image.url);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    urls.push(image.url);
  }

  const rng = createPageRng(`idle-gallery-row-${groupIndex}`);
  for (let i = urls.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [urls[i], urls[j]] = [urls[j], urls[i]];
  }
  return urls;
}

function rebuildIdleGalleryPool() {
  const groupIndex = getDisplayActiveIndex();
  idleGalleryGroupIndex = groupIndex;
  idleGalleryUrls = buildIdleGalleryPool(groupIndex);
  idleGalleryIndex = 0;
  return idleGalleryUrls.length > 0;
}

function clearIdleGalleryTimer() {
  if (idleGalleryTimer === null) return;
  clearTimeout(idleGalleryTimer);
  idleGalleryTimer = null;
}

function scheduleIdleGalleryAdvance() {
  clearIdleGalleryTimer();
  if (!idleGalleryActive || idleGalleryPaused || idleGalleryUrls.length < 2) return;
  idleGalleryTimer = setTimeout(() => {
    idleGalleryTimer = null;
    advanceIdleGallery();
  }, LAYOUT.idleGalleryIntervalMs);
}

function advanceIdleGallery() {
  if (!idleGalleryActive || idleGalleryPaused || !idleGalleryUrls.length) return;
  idleGalleryIndex = (idleGalleryIndex + 1) % idleGalleryUrls.length;
  showBleedBackdrop(idleGalleryUrls[idleGalleryIndex], true, { mode: "idle" });
  scheduleIdleGalleryAdvance();
}

function pauseIdleGallery() {
  idleGalleryPaused = true;
  clearIdleGalleryTimer();
}

function clearBleedBackdropDarkInvert() {
  document.documentElement.classList.remove(
    "is-bleed-dark-invert-nav",
    "is-bleed-dark-invert-title-row"
  );
}

function getSiteNavSampleScreenRect() {
  const navEl = document.getElementById("site-nav");
  if (navEl) {
    const rect = navEl.getBoundingClientRect();
    if (rect.width >= 1 && rect.height >= 1) return rect;
  }
  return {
    left: 0,
    top: 0,
    width: viewport?.clientWidth ?? window.innerWidth,
    height: Math.max(1, getSiteNavHeightPx()),
  };
}

function screenRectToViewportRect(screenRect) {
  const viewportBounds = viewport?.getBoundingClientRect();
  if (!viewportBounds) return null;
  return {
    left: screenRect.left - viewportBounds.left,
    top: screenRect.top - viewportBounds.top,
    width: screenRect.width,
    height: screenRect.height,
  };
}

function intersectScreenRects(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1) return null;
  return { left, top, width, height };
}

/** Viewport-local band behind the fixed site navigation. */
function getSiteNavSampleViewportRect() {
  if (!viewport) return null;
  return screenRectToViewportRect(getSiteNavSampleScreenRect());
}

/** Nav band clipped to the visible term-page bleed image (null once image scrolls away). */
function getTermPageNavBleedSampleViewportRect(
  viewportHeight = getLiveViewportHeight(),
  scrollTop = viewport?.scrollTop ?? 0
) {
  if (!viewport) return null;
  const mainRect = getTermPageMainImageVisibleScreenRect(viewportHeight, scrollTop);
  if (!mainRect) return null;
  const overlap = intersectScreenRects(mainRect, getSiteNavSampleScreenRect());
  if (!overlap) return null;
  return screenRectToViewportRect(overlap);
}

function getActiveBleedTextTerm() {
  if (isTermPageFocusVisual() && focusState) {
    return groups[focusState.activeIndex]?.terms[getTermPageContentTermIndex()];
  }
  const groupIndex = getDisplayActiveIndex();
  return getTitleRowImageTerm(groups[groupIndex]);
}

/** Viewport-local horizontal band behind the active title-row terms. */
function getActiveTitleRowSampleViewportRect() {
  if (!svgEl || !viewport) return null;

  const groupIndex = getDisplayActiveIndex();
  const rayGroup = svgEl.querySelector(`.sun-ray[data-group="${groupIndex}"]`);
  if (!rayGroup) return null;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const text of rayGroup.querySelectorAll(".sun-term")) {
    const extents = getTermViewportYExtents(rayGroup, text);
    minY = Math.min(minY, extents.minY);
    maxY = Math.max(maxY, extents.maxY);
  }
  if (!Number.isFinite(minY)) return null;

  const viewportHeight = viewport.clientHeight;
  const viewportWidth = viewport.clientWidth;
  const padY = LAYOUT.titleRowBleedDarkSamplePadY;
  const top = Math.max(0, minY - padY);
  const bottom = Math.min(viewportHeight, maxY + padY);

  return {
    left: 0,
    top,
    width: viewportWidth,
    height: Math.max(1, bottom - top),
  };
}

/** @param {{ left: number, top: number, width: number, height: number }} viewportRect */
function getBleedBackdropCoverBox() {
  const rect = (bleedBackdropEl || viewport).getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/** Map a viewport-local rect to the matching region in a cover-cropped source image. */
function viewportRectToBleedCoverSourceRect(img, viewportRect) {
  const coverBox = getBleedBackdropCoverBox();
  const { x: posX, y: posY } = getBleedBackdropObjectPositionFraction();
  const coverRect = getCoverSourceRect(img, coverBox.width, coverBox.height, posX, posY);
  const viewportBounds = viewport.getBoundingClientRect();
  const windowRect = {
    left: viewportBounds.left + viewportRect.left,
    top: viewportBounds.top + viewportRect.top,
    width: viewportRect.width,
    height: viewportRect.height,
  };
  const relLeft = (windowRect.left - coverBox.left) / coverBox.width;
  const relTop = (windowRect.top - coverBox.top) / coverBox.height;
  const relWidth = windowRect.width / coverBox.width;
  const relHeight = windowRect.height / coverBox.height;

  return {
    sx: coverRect.sx + relLeft * coverRect.sWidth,
    sy: coverRect.sy + relTop * coverRect.sHeight,
    sWidth: Math.max(1, relWidth * coverRect.sWidth),
    sHeight: Math.max(1, relHeight * coverRect.sHeight),
  };
}

/** @param {HTMLImageElement} img @param {{ left: number, top: number, width: number, height: number } | null} sampleViewportRect */
function isBleedBackdropImageMostlyDarkInRect(img, sampleViewportRect) {
  if (!img?.naturalWidth || !img.naturalHeight || !sampleViewportRect) return false;

  try {

    const canvas = getSharedPixelOffscreen();
    const sampleSize = LAYOUT.titleRowBleedDarkSampleSize;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;

    const { sx, sy, sWidth, sHeight } = viewportRectToBleedCoverSourceRect(
      img,
      sampleViewportRect
    );
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sampleSize, sampleSize);

    const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const backdropOpacity = 0.9;
    const bgLuminance = 245 / 255;
    let darkCount = 0;
    let luminanceSum = 0;
    let sampleCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const imageLuminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const effectiveLuminance =
        imageLuminance * backdropOpacity + bgLuminance * (1 - backdropOpacity);
      if (effectiveLuminance < LAYOUT.titleRowBleedDarkLuminanceThreshold) {
        darkCount += 1;
      }
      luminanceSum += effectiveLuminance;
      sampleCount += 1;
    }

    if (!sampleCount) return false;
    const darkRatio = darkCount / sampleCount;
    const meanLuminance = luminanceSum / sampleCount;
    return (
      darkRatio >= LAYOUT.titleRowBleedDarkPixelRatio &&
      meanLuminance < LAYOUT.titleRowBleedDarkMeanThreshold
    );
  } catch {
    return false;
  }
}

function syncBleedBackdropDarkInvert() {
  const img = bleedBackdropImgEl;
  const imgLoaded = Boolean(img?.classList.contains("is-loaded"));
  const isHoverBleed =
    imgLoaded &&
    isTitleRowBleedActive() &&
    bleedBackdropEl?.classList.contains("is-hover");
  const isTermPageBleed =
    imgLoaded &&
    isTermPageFocusVisual() &&
    bleedBackdropEl &&
    !bleedBackdropEl.hidden &&
    bleedBackdropEl.classList.contains("is-term-page") &&
    bleedBackdropEl.classList.contains("is-visible");

  let invertNav = false;
  let invertTitleRow = false;

  if (isHoverBleed) {
    const autoInvertNav = isBleedBackdropImageMostlyDarkInRect(
      img,
      getSiteNavSampleViewportRect()
    );
    const autoInvertTitleRow = isBleedBackdropImageMostlyDarkInRect(
      img,
      getActiveTitleRowSampleViewportRect()
    );
    const textPrefs = getBleedTextPrefsForActiveTerm(getActiveBleedTextTerm());
    invertNav = resolveTextInvert(textPrefs.navText, autoInvertNav);
    invertTitleRow = resolveTextInvert(textPrefs.titleRowText, autoInvertTitleRow);
  } else if (isTermPageBleed && isTermPageBleedImageInFrame()) {
    const navSample = getTermPageNavBleedSampleViewportRect();
    if (navSample) {
      const autoInvertNav = isBleedBackdropImageMostlyDarkInRect(img, navSample);
      const textPrefs = getBleedTextPrefsForActiveTerm(getActiveBleedTextTerm());
      invertNav = resolveTextInvert(textPrefs.navText, autoInvertNav);
    }
  }

  document.documentElement.classList.toggle("is-bleed-dark-invert-nav", invertNav);
  document.documentElement.classList.toggle("is-bleed-dark-invert-title-row", invertTitleRow);
}

function isBleedBackdropLoaded() {
  return Boolean(
    bleedBackdropEl &&
      !bleedBackdropEl.hidden &&
      bleedBackdropImgEl?.classList.contains("is-loaded") &&
      bleedBackdropImgEl.src
  );
}

function shouldPreserveTermPageBleed() {
  return isTermPageFocusVisual() && isBleedBackdropLoaded();
}

/** Full-bleed hover on navigation — same term clicked into focus. */
function getActiveHoverBleedCarry(termId) {
  if (!termId || !isBleedBackdropLoaded()) return null;
  if (hoveredTitleRowTermId !== termId) return null;
  const term = findTermById(termId);
  if (!term || !currentLayout) return null;
  const image = titleRowHoverImage ?? getTitleRowHoverImage(term, currentLayout);
  return image?.url ? image : null;
}

function resolveTermPageBleedCarryImage(term) {
  if (!term || !currentLayout) return null;
  const fromHover = getActiveHoverBleedCarry(term.id);
  if (fromHover?.url) return fromHover;
  if (
    titleRowHoverImage?.url &&
    isBleedBackdropLoaded() &&
    termImageSrcMatches(bleedBackdropImgEl, titleRowHoverImage.url)
  ) {
    return titleRowHoverImage;
  }
  if (isBleedBackdropLoaded()) {
    const { viewportWidth, viewportHeight } = currentLayout;
    const shared = pickTitleRowSharedImage(term.name, viewportWidth, viewportHeight);
    if (shared?.url && termImageSrcMatches(bleedBackdropImgEl, shared.url)) {
      return shared;
    }
  }
  return null;
}

function setTermPageBleedClipHeight(heightPx) {
  const band = Math.max(0, heightPx);
  const viewportHeight = getLiveViewportHeight();
  const fullBand = getTermPageTitleBandHeightPx(viewportHeight);
  const fullOverlap = getBleedImageBandOverlapPx(viewportHeight);
  const overlap = fullBand > 0 ? fullOverlap * (band / fullBand) : 0;
  const imageClip = Math.max(0, band - overlap);
  const bandValue = `${band}px`;
  const overlapValue = `${overlap}px`;
  document.documentElement.style.setProperty("--term-title-band-height", bandValue);
  viewport?.style.setProperty("--term-title-band-height", bandValue);
  bleedBackdropEl?.style.setProperty("--term-title-band-height", bandValue);
  document.documentElement.style.setProperty("--bleed-image-band-overlap", overlapValue);
  viewport?.style.setProperty("--bleed-image-band-overlap", overlapValue);
  bleedBackdropEl?.style.setProperty("--bleed-image-band-overlap", overlapValue);
  if (bleedBackdropEl?.classList.contains("is-term-page")) {
    bleedBackdropEl.style.clipPath = `inset(0px 0px ${imageClip}px 0px)`;
  }
}

function clearTermPageBleedClip() {
  document.documentElement.style.removeProperty("--term-title-band-height");
  viewport?.style.removeProperty("--term-title-band-height");
  bleedBackdropEl?.style.removeProperty("--term-title-band-height");
  document.documentElement.style.removeProperty("--bleed-image-band-overlap");
  viewport?.style.removeProperty("--bleed-image-band-overlap");
  bleedBackdropEl?.style.removeProperty("--bleed-image-band-overlap");
  bleedBackdropEl?.style.removeProperty("clip-path");
}

function getTermPageBleedBandHeightPx(viewportHeight = getLiveViewportHeight()) {
  if (!focusState || !isTermPageFocusVisual()) return 0;
  const bandHeight = getTermPageTitleBandHeightPx(viewportHeight);
  if (focusState.phase === "locked") {
    return bandHeight;
  }
  if (focusState.riseT <= 0) return 0;
  return easeOutCubic(focusState.riseT) * bandHeight;
}

function syncTermPageBleedClip() {
  setTermPageBleedClipHeight(getTermPageBleedBandHeightPx());
}

function transitionBleedBackdropToTermPage() {
  if (!bleedBackdropEl || !isBleedBackdropLoaded()) return false;

  stopBleedPixelAnimation();
  clearBleedBackdropPixelation();
  bleedBackdropEl.classList.remove("is-hover", "is-idle");
  bleedBackdropEl.classList.add("is-term-page", "is-visible");
  bleedBackdropEl.hidden = false;
  bleedBackdropEl.setAttribute("aria-hidden", "false");
  viewport?.classList.remove("is-title-row-bleed", "is-title-row-inline");
  viewport?.classList.add("is-term-page-bleed");
  syncTermPageBleedClip();
  clearBleedBackdropDarkInvert();
  requestAnimationFrame(() => syncBleedBackdropDarkInvert());
  return true;
}

function hideBleedBackdropFully() {
  termPageBleedCarryImage = null;
  termPageBleedImage = null;
  clearBleedBackdropDarkInvert();
  clearIdleGalleryTimer();
  idleGalleryActive = false;
  idleGalleryPaused = false;
  idleGalleryGroupIndex = -1;
  stopBleedPixelAnimation();
  clearBleedBackdropPixelation();
  bleedBackdropEl?.classList.remove("is-visible", "is-idle", "is-hover", "is-term-page");
  viewport?.classList.remove("is-term-page-bleed");
  clearTermPageBleedClip();
  if (bleedBackdropEl) {
    bleedBackdropEl.hidden = true;
    bleedBackdropEl.setAttribute("aria-hidden", "true");
  }
  if (bleedBackdropImgEl) {
    bleedBackdropImgEl.removeAttribute("src");
    bleedBackdropImgEl.classList.remove("is-loaded");
  }
}

function stopIdleGallery() {
  hideBleedBackdropFully();
}

function startIdleGallery() {
  return;
}

function resumeIdleGallery() {
  return;
}

function syncIdleGallery(layout) {
  return;
}

function buildTitleRowBleedDistribution(viewportWidth, viewportHeight) {
  return;
}

let fixedRowImagePickKey = null;
/** @type {{ id: string, name: string } | null} */
let fixedRowImageContentTerm = null;

function resetFixedRowImagePick() {
  fixedRowImagePickKey = null;
  fixedRowImageContentTerm = null;
}

function getFixedRowContentCandidates(group) {
  if ((group?.terms.length ?? 0) < 2) return [];
  const { viewportWidth, viewportHeight } = getTitleRowViewportSize();
  return group.terms.filter((term) =>
    Boolean(pickTitleRowSharedImage(term.name, viewportWidth, viewportHeight)?.url)
  );
}

function rowHasFixedRowImage(group) {
  return getFixedRowContentCandidates(group).length > 0;
}

/** Random term for the thumbnail image — re-picked whenever the active row changes. */
function getFixedRowImageContentTerm(group) {
  const activeIndex = getDisplayActiveIndex();
  const pickKey = String(activeIndex);
  if (fixedRowImagePickKey !== pickKey) {
    fixedRowImagePickKey = pickKey;
    const activeGroup = groups[activeIndex] ?? group;
    const candidates = getFixedRowContentCandidates(activeGroup);
    fixedRowImageContentTerm =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null;
  }
  return fixedRowImageContentTerm;
}

function getRowEndTermWrap(rayGroup, group) {
  if (!rayGroup) return null;
  const trail = getRowTrailPlacement(rayGroup);
  if (!trail) return null;

  let bestWrap = null;
  let bestDist = Infinity;

  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap")) {
    const text = wrap.querySelector(".sun-term");
    if (!text) continue;
    const trailEdge = getTermTrailEdgeLocalX(rayGroup, text);
    const dist = Math.abs(trailEdge - trail.trailLocalX);
    if (dist < bestDist) {
      bestDist = dist;
      bestWrap = wrap;
    }
  }
  return bestWrap;
}

function pickTitleRowHoverMode(term, layout) {
  return "bleed";
}

function rayLocalToViewport(rayGroup, localX, localY = 0) {
  if (!rayGroup || !viewport || !svgEl) return null;
  const ctm = rayGroup.getScreenCTM();
  if (!ctm) return null;

  const pt = svgEl.createSVGPoint();
  pt.x = localX;
  pt.y = localY;
  const screen = pt.matrixTransform(ctm);
  const viewportRect = viewport.getBoundingClientRect();
  return {
    x: screen.x - viewportRect.left + viewport.scrollLeft,
    y: screen.y - viewportRect.top + viewport.scrollTop,
  };
}

function getRayScreenRotation(rayGroup) {
  const ctm = rayGroup.getScreenCTM();
  if (!ctm) return 0;
  return (Math.atan2(ctm.b, ctm.a) * 180) / Math.PI;
}

/** Text bbox in ray-local coordinates (same space as updateTermHitArea). */
function getTermTextRayBounds(text) {
  const bbox = text.getBBox();
  return {
    left: bbox.x,
    right: bbox.x + bbox.width,
    midY: bbox.y + bbox.height / 2,
    minY: bbox.y,
    maxY: bbox.y + bbox.height,
  };
}

/** Leftmost screen edge of the row + local axis pointing further left. */
function getRowTrailPlacement(rayGroup) {
  const texts = [...rayGroup.querySelectorAll(".sun-term")];
  const ctm = rayGroup.getScreenCTM();
  if (!texts.length || !ctm || !svgEl) return null;

  let trailLocalX = 0;
  let trailLocalY = 0;
  let minScreenX = Infinity;
  let rowMinY = Infinity;
  let rowMaxY = -Infinity;

  for (const text of texts) {
    const bounds = getTermTextRayBounds(text);
    rowMinY = Math.min(rowMinY, bounds.minY);
    rowMaxY = Math.max(rowMaxY, bounds.maxY);

    for (const localX of [bounds.left, bounds.right]) {
      const pt = svgEl.createSVGPoint();
      pt.x = localX;
      pt.y = bounds.midY;
      const screenX = pt.matrixTransform(ctm).x;
      if (screenX < minScreenX) {
        minScreenX = screenX;
        trailLocalX = localX;
        trailLocalY = bounds.midY;
      }
    }
  }

  if (!Number.isFinite(minScreenX)) return null;

  const probe = 8;
  const basePt = svgEl.createSVGPoint();
  basePt.x = trailLocalX;
  basePt.y = trailLocalY;
  const baseScreenX = basePt.matrixTransform(ctm).x;
  const probePt = svgEl.createSVGPoint();
  probePt.x = trailLocalX + probe;
  probePt.y = trailLocalY;
  const pastSign = probePt.matrixTransform(ctm).x < baseScreenX ? 1 : -1;

  return {
    trailLocalX,
    trailLocalY,
    pastSign,
    rowMidY: (rowMinY + rowMaxY) / 2,
    rowMinY,
    rowMaxY,
  };
}

function getHoveredTermWrap(rayGroup, termId) {
  return rayGroup.querySelector(
    `.sun-term-wrap[data-term-id="${CSS.escape(termId)}"]`
  );
}

function getRayLocalScaleX(rayGroup) {
  const ctm = rayGroup.getScreenCTM();
  if (!ctm) return 1;
  return Math.hypot(ctm.a, ctm.b) || 1;
}

function getRotatedRectViewportBounds(centerX, centerY, width, height, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = width / 2;
  const hh = height / 2;
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of corners) {
    const x = centerX + lx * cos - ly * sin;
    const y = centerY + lx * sin + ly * cos;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

/** Inline title image: transform-origin 100% 50% — right edge fixed at rightEdgeX. */
function getInlineImageScreenBounds(rightEdgeX, centerY, widthPx, heightPx, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfHeight = heightPx / 2;
  const corners = [
    [0, -halfHeight],
    [0, halfHeight],
    [-widthPx, -halfHeight],
    [-widthPx, halfHeight],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [localX, localY] of corners) {
    const x = rightEdgeX + localX * cos - localY * sin;
    const y = centerY + localX * sin + localY * cos;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function getTermTrailEdgeLocalX(rayGroup, text) {
  const bounds = getTermTextRayBounds(text);
  const ctm = rayGroup.getScreenCTM();
  if (!ctm || !svgEl) return bounds.left;

  let trailEdge = bounds.left;
  let minScreenX = Infinity;
  for (const localX of [bounds.left, bounds.right]) {
    const pt = svgEl.createSVGPoint();
    pt.x = localX;
    pt.y = bounds.midY;
    const screenX = pt.matrixTransform(ctm).x;
    if (screenX < minScreenX) {
      minScreenX = screenX;
      trailEdge = localX;
    }
  }
  return trailEdge;
}

function layoutInlineTitleImage(
  rayGroup,
  hoverWrap,
  imageWidthPx,
  imageHeightPx,
  imageAngleDeg
) {
  const trail = getRowTrailPlacement(rayGroup);
  if (!trail) return null;

  const trailEdge = trail.trailLocalX;
  const termMidY = trail.rowMidY;
  const gapPx = LAYOUT.titleRowInlineGap;

  const trailViewport = rayLocalToViewport(rayGroup, trailEdge, termMidY);
  if (!trailViewport) return null;

  const trailScreenX = trailViewport.x;
  const anchorY = trailViewport.y;
  const maxAllowedRight = trailScreenX - gapPx;
  let anchorX = maxAllowedRight;

  for (let i = 0; i < 2; i++) {
    const imageBounds = getInlineImageScreenBounds(
      anchorX,
      anchorY,
      imageWidthPx,
      imageHeightPx,
      imageAngleDeg
    );
    if (imageBounds.maxX <= maxAllowedRight) break;
    anchorX -= imageBounds.maxX - maxAllowedRight;
  }

  return {
    anchorX,
    anchorY,
    imageWidthPx,
    imageHeightPx,
    gapPx,
    imageAngleDeg,
  };
}

/** Fixed row images live in ray-local space so they move with the ray. */
function layoutInlineTitleImageRayLocal(rayGroup, hoverWrap, imageWidthPx, imageHeightPx) {
  const trail = getRowTrailPlacement(rayGroup);
  if (!trail) return null;

  const trailEdge = trail.trailLocalX;
  const termMidY = trail.rowMidY;
  const scale = getRayLocalScaleX(rayGroup);
  const imageWidthLocal = imageWidthPx / scale;
  const imageHeightLocal = imageHeightPx / scale;
  const gapLocal = LAYOUT.titleRowInlineGap / scale;
  const anchorInnerX = trailEdge + trail.pastSign * gapLocal;
  const imageTrailEdge = trailEdge + trail.pastSign * (gapLocal + imageWidthLocal);

  return {
    x: Math.min(anchorInnerX, imageTrailEdge),
    y: termMidY - imageHeightLocal / 2,
    width: imageWidthLocal,
    height: imageHeightLocal,
    anchorInnerX,
    imageTrailEdge,
    gapLocal,
    pastSign: trail.pastSign,
  };
}

function getRayLocalRectViewportBounds(rayGroup, x, y, width, height) {
  const corners = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [localX, localY] of corners) {
    const viewportPt = rayLocalToViewport(rayGroup, localX, localY);
    if (!viewportPt) return null;
    minX = Math.min(minX, viewportPt.x);
    maxX = Math.max(maxX, viewportPt.x);
    minY = Math.min(minY, viewportPt.y);
    maxY = Math.max(maxY, viewportPt.y);
  }

  return { minX, maxX, minY, maxY };
}

function computeFixedRowTermPushesRayLocal(rayGroup, hoverWrap, localLayout) {
  const trail = getRowTrailPlacement(rayGroup);
  if (!trail) return new Map();

  const { x, width, y, height, gapLocal } = localLayout;
  const localScale = getRayLocalScaleX(rayGroup);
  const gapPx = gapLocal * localScale;
  const imageBounds = getRayLocalRectViewportBounds(rayGroup, x, y, width, height);
  if (!imageBounds) return new Map();

  const rowTrailViewport = rayLocalToViewport(rayGroup, trail.trailLocalX, trail.trailLocalY);
  if (!rowTrailViewport) return new Map();

  const screenPushes = computeInlineTermPushes(
    rayGroup,
    null,
    rowTrailViewport.x,
    imageBounds,
    gapPx
  );

  const pushes = new Map();
  for (const [wrap, neededScreenPush] of screenPushes) {
    if (neededScreenPush <= 0.01) continue;
    pushes.set(wrap, neededScreenPush / localScale);
  }
  return pushes;
}

function applyFixedRowTermPushRayLocal(rayGroup, hoverWrap, localLayout) {
  const trail = getRowTrailPlacement(rayGroup);
  if (!trail) return;

  const pushes = computeFixedRowTermPushesRayLocal(rayGroup, hoverWrap, localLayout);

  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap")) {
    if (wrap === hoverWrap) continue;

    const neededLocal = pushes.get(wrap);
    if (!neededLocal) {
      if (wrap.classList.contains("is-inline-pushed-permanent")) {
        wrap.classList.remove("is-inline-pushed", "is-inline-pushed-permanent", "is-inline-animating");
        wrap.style.transform = "";
      }
      continue;
    }

    wrap.classList.add("is-inline-pushed", "is-inline-pushed-permanent");
    wrap.classList.remove("is-inline-animating");
    wrap.style.transform = `translateX(${trail.pastSign * neededLocal}px)`;
  }
}

/**
 * Aspect ratio of the row-end fixed image, locked to the MacBook reference
 * viewport. Width tracks the live grid span (which scales with viewport width,
 * uncapped) while the design-time height only scales with viewport height
 * (capped). Deriving height from the live width via this fixed ratio keeps the
 * thumbnail's proportions identical on every screen instead of stretching wide
 * on large monitors.
 */
function getFixedRowImageReferenceAspect() {
  const refGrid = getResponsiveGridLayout(VIEWPORT_DESIGN.width);
  const cols = LAYOUT.titleRowFixedImageColumns;
  const refWidth = cols * refGrid.colWidth + (cols - 1) * refGrid.gutter;
  const refHeight =
    LAYOUT.termPageImageHeight *
    (LAYOUT.titleRowFixedImageColumns / LAYOUT.termPageImagesColumns);
  if (refHeight <= 0) return 1;
  return refWidth / refHeight;
}

function getFixedRowImageDimensions() {
  const span = getGridSpanBounds(
    LAYOUT.titleRowFixedImageColumns,
    GRID.alignColumnFromRight,
    viewport
  );
  const width = span.width;
  const aspect = getFixedRowImageReferenceAspect();
  const height = aspect > 0 ? Math.round(width / aspect) : width;
  return { width, height };
}

function getFixedRowImageLayout(rayGroup, hoverWrap, viewportWidth) {
  const { width, height } = getFixedRowImageDimensions();
  return layoutInlineTitleImageRayLocal(rayGroup, hoverWrap, width, height);
}

function stopInlinePushAnimation() {
  if (!titleRowInlinePushAnimFrame) return;
  cancelAnimationFrame(titleRowInlinePushAnimFrame);
  titleRowInlinePushAnimFrame = null;
}

function clearInlinePushTransforms(rayGroup) {
  if (!rayGroup) return;
  rayGroup
    .querySelectorAll(".sun-term-wrap.is-inline-pushed, .sun-term-wrap.is-inline-pushed-permanent")
    .forEach((wrap) => {
      wrap.classList.remove("is-inline-pushed", "is-inline-pushed-permanent", "is-inline-animating");
      wrap.style.transform = "";
    });
}

function getTermViewportXExtents(rayGroup, text) {
  const bounds = getTermTextRayBounds(text);
  const corners = [
    [bounds.left, bounds.minY],
    [bounds.right, bounds.minY],
    [bounds.right, bounds.maxY],
    [bounds.left, bounds.maxY],
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  for (const [localX, localY] of corners) {
    const viewportPt = rayLocalToViewport(rayGroup, localX, localY);
    if (!viewportPt) continue;
    minX = Math.min(minX, viewportPt.x);
    maxX = Math.max(maxX, viewportPt.x);
  }

  if (!Number.isFinite(minX)) {
    return { minX: bounds.left, maxX: bounds.right };
  }
  return { minX, maxX };
}

function getTermViewportYExtents(rayGroup, text) {
  const bounds = getTermTextRayBounds(text);
  const corners = [
    [bounds.left, bounds.minY],
    [bounds.right, bounds.minY],
    [bounds.right, bounds.maxY],
    [bounds.left, bounds.maxY],
  ];

  let minY = Infinity;
  let maxY = -Infinity;
  for (const [localX, localY] of corners) {
    const viewportPt = rayLocalToViewport(rayGroup, localX, localY);
    if (!viewportPt) continue;
    minY = Math.min(minY, viewportPt.y);
    maxY = Math.max(maxY, viewportPt.y);
  }

  if (!Number.isFinite(minY)) {
    return { minY: bounds.minY, maxY: bounds.maxY };
  }
  return { minY, maxY };
}

function shouldPushTermForInlineImage(
  termExtents,
  termYExtents,
  hoverTrailViewportX,
  imageBounds,
  gapPx = 0
) {
  const verticalOverlap =
    termYExtents.maxY > imageBounds.minY + 0.5 &&
    termYExtents.minY < imageBounds.maxY - 0.5;
  if (!verticalOverlap) return false;

  const trailSide = termExtents.minX < hoverTrailViewportX - 0.5;
  const overlapsImage =
    termExtents.maxX > imageBounds.minX - gapPx - 0.5 &&
    termExtents.minX < imageBounds.maxX + gapPx + 0.5;
  return trailSide || overlapsImage;
}

/** Push eases faster than the image so adjacent terms clear before overlap. */
function getInlinePushProgress(linearT) {
  const t = Math.max(0, Math.min(1, linearT));
  return 1 - (1 - t) ** 3;
}

function computeInlineTermPushes(
  rayGroup,
  hoverWrap,
  hoverTrailViewportX,
  imageBounds,
  gapPx
) {
  const clearanceX = imageBounds.minX - gapPx;
  const candidates = [];

  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap")) {
    if (wrap === hoverWrap) continue;
    const termText = wrap.querySelector(".sun-term");
    if (!termText) continue;

    const termExtents = getTermViewportXExtents(rayGroup, termText);
    const termYExtents = getTermViewportYExtents(rayGroup, termText);
    if (
      !shouldPushTermForInlineImage(
        termExtents,
        termYExtents,
        hoverTrailViewportX,
        imageBounds,
        gapPx
      )
    ) {
      continue;
    }

    candidates.push({ wrap, termExtents });
  }

  candidates.sort((a, b) => b.termExtents.maxX - a.termExtents.maxX);

  const pushes = new Map();
  let frontier = clearanceX;

  for (const { wrap, termExtents } of candidates) {
    const neededScreenPush = Math.max(0, termExtents.maxX - frontier);
    pushes.set(wrap, neededScreenPush);
    frontier = termExtents.minX - neededScreenPush - gapPx;
  }

  return pushes;
}

function applyLeftOfTermPush(
  rayGroup,
  hoverWrap,
  anchorRightX,
  anchorY,
  imageWidthPx,
  imageHeightPx,
  gapPx,
  imageAngleDeg,
  imageProgress,
  animating = false,
  pushProgress = imageProgress,
  permanent = false
) {
  const trail = getRowTrailPlacement(rayGroup);
  if (!trail) return;
  const hoverText = hoverWrap.querySelector(".sun-term");
  if (!hoverText) return;

  const hoverTrailEdge = getTermTrailEdgeLocalX(rayGroup, hoverText);
  const hoverBounds = getTermTextRayBounds(hoverText);
  const hoverTrailViewport = rayLocalToViewport(rayGroup, hoverTrailEdge, hoverBounds.midY);
  if (!hoverTrailViewport) return;

  const imageBounds = getInlineImageScreenBounds(
    anchorRightX,
    anchorY,
    imageWidthPx * pushProgress,
    imageHeightPx,
    imageAngleDeg
  );
  const localScale = getRayLocalScaleX(rayGroup);
  const pushes = computeInlineTermPushes(
    rayGroup,
    hoverWrap,
    hoverTrailViewport.x,
    imageBounds,
    gapPx
  );

  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap")) {
    if (wrap === hoverWrap) continue;

    const neededScreenPush = pushes.get(wrap);
    if (!neededScreenPush) {
      if (permanent) {
        if (wrap.classList.contains("is-inline-pushed-permanent")) {
          wrap.classList.remove("is-inline-pushed", "is-inline-pushed-permanent", "is-inline-animating");
          wrap.style.transform = "";
        }
      } else {
        wrap.classList.remove("is-inline-pushed", "is-inline-pushed-permanent", "is-inline-animating");
        wrap.style.transform = "";
      }
      continue;
    }

    const pushOffset = trail.pastSign * (neededScreenPush / localScale);

    wrap.classList.add("is-inline-pushed");
    if (permanent) wrap.classList.add("is-inline-pushed-permanent");
    else wrap.classList.remove("is-inline-pushed-permanent");
    if (animating) wrap.classList.add("is-inline-animating");
    else wrap.classList.remove("is-inline-animating");
    wrap.style.transform = `translateX(${pushOffset}px)`;
  }
}

function canShowRowFixedContent(layout) {
  if (isTermNavigating() || focusState) return false;
  const overview = layout?.overview ?? overviewProgress ?? 0;
  return overview <= 0.02;
}

function isTitleRowBleedActive() {
  return (
    titleRowHoverMode === "bleed" &&
    viewport?.classList.contains("is-title-row-bleed")
  );
}

function clearAllRowFixedPushes() {
  if (!svgEl) return;
  svgEl.querySelectorAll(".sun-ray").forEach((rayGroup) => {
    clearInlinePushTransforms(rayGroup);
  });
  titleRowInlinePushRay = null;
}

/** Hide fixed thumbnails on the active row while any title-row term is hovered. */
function shouldHideFixedForActiveRowHover(groupIndex) {
  if (!hoveredTitleRowTermId) return false;
  const group = groups[groupIndex];
  const rayGroup = svgEl?.querySelector(`[data-group="${groupIndex}"]`);
  return Boolean(rowHasFixedRowImage(group) && getFixedRowImageContentTerm(group));
}

/** Hide the in-ray SVG while the HTML hover overlay plays pixel reveal. */
function shouldHideRayFixedImage(groupIndex) {
  if (isTitleRowBleedActive()) return true;
  return shouldHideFixedForActiveRowHover(groupIndex);
}

function clearRayFixedImages() {
  stopFixedThumbnailHideAnimation();
  clearActiveRowImageGlitch();
  clearPendingTitleRowBleedReveal();
  svgEl?.querySelectorAll(".sun-ray-fixed-image, .sun-ray-fixed-image-hit").forEach((el) =>
    el.remove()
  );
}

function stopFixedThumbnailHideAnimation() {
  if (fixedThumbHideAnimFrame !== null) {
    cancelAnimationFrame(fixedThumbHideAnimFrame);
    fixedThumbHideAnimFrame = null;
  }
  svgEl?.querySelectorAll(".sun-ray-fixed-image.is-hiding").forEach((el) => {
    el.classList.remove("is-hiding");
    el.removeAttribute("opacity");
  });
}

function layoutRayFixedImageHit(rayGroup, fixedTerm, localLayout) {
  let hitEl = rayGroup.querySelector(".sun-ray-fixed-image-hit");
  if (!hitEl) {
    hitEl = document.createElementNS(SVG_NS, "rect");
    hitEl.classList.add("sun-ray-fixed-image-hit");
    hitEl.setAttribute("fill", "transparent");
    hitEl.setAttribute("aria-hidden", "true");
    rayGroup.appendChild(hitEl);
  }
  setFixedImageTermId(hitEl, fixedTerm.id);
  hitEl.setAttribute("x", localLayout.x.toFixed(3));
  hitEl.setAttribute("y", localLayout.y.toFixed(3));
  hitEl.setAttribute("width", localLayout.width.toFixed(3));
  hitEl.setAttribute("height", localLayout.height.toFixed(3));
  rayGroup.appendChild(hitEl);
}

function clearRayFixedImagePointerHit(rayGroup) {
  rayGroup?.querySelector(".sun-ray-fixed-image-hit")?.remove();
}

function syncRayFixedImages(layout) {
  if (!svgEl) return;

  if (!canShowRowFixedContent(layout)) {
    clearRayFixedImages();
    return;
  }

  const count = LAYOUT.rayCount || groups.length;
  let anyFixed = false;
  const activeIndex = getDisplayActiveIndex();

  for (let groupIndex = 0; groupIndex < count; groupIndex++) {
    const rayGroup = svgEl.querySelector(`[data-group="${groupIndex}"]`);
    if (!rayGroup) continue;

    const existing = rayGroup.querySelector(".sun-ray-fixed-image");
    const existingHit = rayGroup.querySelector(".sun-ray-fixed-image-hit");
    const group = groups[groupIndex];
    const contentTerm = getFixedRowImageContentTerm(group);
    const isActiveRow =
      groupIndex === activeIndex &&
      isGroupVisible(groupIndex, layout) &&
      contentTerm &&
      rowHasFixedRowImage(group);

    if (!isActiveRow) {
      existing?.remove();
      existingHit?.remove();
      continue;
    }

    const layoutWrap = getRowEndTermWrap(rayGroup, group);
    if (!layoutWrap) {
      existing?.remove();
      existingHit?.remove();
      continue;
    }

    const { viewportWidth } = layout;
    const localLayout = getFixedRowImageLayout(rayGroup, layoutWrap, viewportWidth);
    if (!localLayout) {
      existing?.remove();
      existingHit?.remove();
      continue;
    }

    const shouldShowImage = !shouldHideRayFixedImage(groupIndex);
    const keepHoverHit =
      hoveredTitleRowTermId === contentTerm.id && shouldHideRayFixedImage(groupIndex);

    if (!shouldShowImage) {
      if (existing?.classList.contains("is-hiding")) {
        // Reverse pixel hide already running — leave in place until it completes.
      } else if (existing) {
        const { viewportWidth, viewportHeight } = layout;
        const sharedImage = pickTitleRowSharedImage(contentTerm.name, viewportWidth, viewportHeight);
        const url = sharedImage?.url || null;
        const pixelWidth = localLayout.width * getRayLocalScaleX(rayGroup);
        const pixelHeight = localLayout.height * getRayLocalScaleX(rayGroup);
        if (url && pixelWidth > 0 && pixelHeight > 0) {
          runFixedThumbnailHideAnimation(existing, url, pixelWidth, pixelHeight, () => {
            existing.remove();
            flushPendingTitleRowBleedReveal();
            scheduleFixedRowRelayout();
          });
        } else {
          existing.remove();
          flushPendingTitleRowBleedReveal();
        }
      }
    } else if (existing?.classList.contains("is-hiding")) {
      existing.remove();
    } else {
      const { viewportWidth, viewportHeight } = layout;
      const sharedImage = pickTitleRowSharedImage(contentTerm.name, viewportWidth, viewportHeight);
      const url = sharedImage?.url ? resolveTermImageUrl(sharedImage.url) : null;
      const pixelWidth = localLayout.width * getRayLocalScaleX(rayGroup);
      const pixelHeight = localLayout.height * getRayLocalScaleX(rayGroup);

      let imageEl = existing;
      if (!imageEl) {
        imageEl = document.createElementNS(SVG_NS, "image");
        imageEl.classList.add("sun-ray-fixed-image");
        imageEl.setAttribute("aria-hidden", "true");
        rayGroup.appendChild(imageEl);
      }

      setFixedImageTermId(imageEl, contentTerm.id);
      imageEl.setAttribute("x", localLayout.x.toFixed(3));
      imageEl.setAttribute("y", localLayout.y.toFixed(3));
      imageEl.setAttribute("width", localLayout.width.toFixed(3));
      imageEl.setAttribute("height", localLayout.height.toFixed(3));
      imageEl.setAttribute("preserveAspectRatio", "xMidYMid slice");

      const imageKey = url ? `${groupIndex}|${url}` : null;
      const restingFactor = LAYOUT.titleRowFixedPixelMaxFactor;
      const shouldGlitchReveal = Boolean(
        url && pixelWidth > 0 && pixelHeight > 0 && imageKey !== activeRowFixedImageKey
      );

      if (shouldGlitchReveal) {
        activeRowFixedImageKey = imageKey;
        startActiveRowImageGlitch(imageKey);
      }

      const glitchFactor = imageKey
        ? getActiveRowImageGlitchFactor(imageKey, restingFactor)
        : restingFactor;
      const resolvedHref = url
        ? resolvePixelatedFixedImageHref(url, pixelWidth, pixelHeight, glitchFactor)
        : null;

      if (resolvedHref) {
        imageEl.setAttributeNS(XLINK_NS, "href", resolvedHref);
        imageEl.setAttribute("href", resolvedHref);
      } else {
        imageEl.removeAttributeNS(XLINK_NS, "href");
        imageEl.removeAttribute("href");
      }

      anyFixed = Boolean(resolvedHref);
      if (resolvedHref) {
        layoutRayFixedImageHit(rayGroup, contentTerm, localLayout);
      } else {
        clearRayFixedImagePointerHit(rayGroup);
      }
    }

    if (keepHoverHit) layoutRayFixedImageHit(rayGroup, contentTerm, localLayout);
    else if (!shouldShowImage) clearRayFixedImagePointerHit(rayGroup);

    continue;
  }

  if (anyFixed) viewport?.classList.add("is-title-row-inline");
  else viewport?.classList.remove("is-title-row-inline");
}

function shouldApplyRowFixedPushes(layout, groupIndex, rayGroup = null) {
  if (isTitleRowBleedActive()) return false;
  if (!canShowRowFixedContent(layout)) return false;
  if (groupIndex !== getDisplayActiveIndex()) return false;
  if (!isGroupVisible(groupIndex, layout)) return false;
  if (!rowHasFixedRowImage(groups[groupIndex])) return false;
  if (shouldHideFixedForActiveRowHover(groupIndex)) return false;
  return true;
}

function applyAllRowFixedPushes(layout) {
  if (!layout || !svgEl) return;

  if (!canShowRowFixedContent(layout)) {
    for (const row of svgEl.querySelectorAll(".sun-ray")) {
      clearInlinePushTransforms(row);
    }
    if (titleRowInlinePushAnimFrame === null) {
      titleRowInlinePushRay = null;
    }
    return;
  }

  const count = LAYOUT.rayCount || groups.length;
  let anyFixed = false;

  for (let groupIndex = 0; groupIndex < count; groupIndex++) {
    const rayGroup = svgEl.querySelector(`[data-group="${groupIndex}"]`);
    if (!rayGroup) continue;

    if (!shouldApplyRowFixedPushes(layout, groupIndex, rayGroup)) {
      const shouldClear =
        isTitleRowBleedActive() ||
        (titleRowInlinePushAnimFrame === null && titleRowInlinePushRay !== rayGroup);
      if (shouldClear) clearInlinePushTransforms(rayGroup);
      continue;
    }

    const group = groups[groupIndex];
    const contentTerm = getFixedRowImageContentTerm(group);
    const layoutWrap = getRowEndTermWrap(rayGroup, group);
    if (!contentTerm || !layoutWrap) continue;

    const { viewportWidth } = layout;
    const localLayout = getFixedRowImageLayout(rayGroup, layoutWrap, viewportWidth);
    if (!localLayout) continue;

    anyFixed = true;
    applyFixedRowTermPushRayLocal(rayGroup, layoutWrap, localLayout);
  }

  if (anyFixed) viewport?.classList.add("is-title-row-inline");
}

function getSharedPixelOffscreen() {
  if (!imagePixelOffscreenEl) {
    imagePixelOffscreenEl = document.createElement("canvas");
  }
  return imagePixelOffscreenEl;
}

/** @param {number} openProgress 0 = closed, 1 = fully open */
function getTitleRowPixelFactor(openProgress) {
  const eased = Math.max(0, Math.min(1, openProgress));
  if (eased >= 1) return 1;
  const maxFactor = LAYOUT.titleRowInlinePixelMaxFactor;
  return Math.max(1, Math.round(1 + (maxFactor - 1) * (1 - eased)));
}

function ensureTitleRowPixelCanvas() {
  if (!titleRowImageEl) return null;
  if (!titleRowImagePixelCanvasEl) {
    const canvas = document.createElement("canvas");
    canvas.className = "sun-title-row-image__pixel-canvas";
    canvas.hidden = true;
    canvas.setAttribute("aria-hidden", "true");
    titleRowImageEl.appendChild(canvas);
    titleRowImagePixelCanvasEl = canvas;
  }
  return titleRowImagePixelCanvasEl;
}

function ensureBleedPixelCanvas() {
  if (!bleedBackdropEl) return null;
  if (!bleedBackdropPixelCanvasEl) {
    const canvas = document.createElement("canvas");
    canvas.className = "sun-bleed-backdrop__pixel-canvas";
    canvas.hidden = true;
    canvas.setAttribute("aria-hidden", "true");
    bleedBackdropEl.appendChild(canvas);
    bleedBackdropPixelCanvasEl = canvas;
  }
  return bleedBackdropPixelCanvasEl;
}

/**
 * Parse a CSS `object-position` value into crop fractions (0..1). Keeps the
 * pixelation canvas crop in sync with the `<img>` `object-position` so the
 * reveal doesn't snap to a different framing when the crisp image appears.
 * Defaults to `center top` (50% / 0%) — the CSS default for the bleed image.
 * @param {string | null | undefined} value
 * @returns {{ x: number, y: number }}
 */
function parseObjectPositionFraction(value) {
  const fallback = { x: 0.5, y: 0 };
  if (typeof value !== "string" || !value.trim()) return fallback;
  const tokens = value.trim().toLowerCase().split(/\s+/);
  const horizKeywords = { left: 0, center: 0.5, right: 1 };
  const vertKeywords = { top: 0, center: 0.5, bottom: 1 };
  const parsePercent = (token) => {
    if (typeof token !== "string" || !token.endsWith("%")) return null;
    const pct = parseFloat(token);
    return Number.isFinite(pct) ? pct / 100 : null;
  };

  let x = null;
  let y = null;
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token in horizKeywords) x = horizKeywords[token];
    else if (token in vertKeywords) y = vertKeywords[token];
    else x = parsePercent(token);
  } else {
    const [a, b] = tokens;
    const aIsVertOnly = a in vertKeywords && !(a in horizKeywords);
    if (aIsVertOnly) {
      y = vertKeywords[a];
      x = b in horizKeywords ? horizKeywords[b] : parsePercent(b);
    } else {
      x = a in horizKeywords ? horizKeywords[a] : parsePercent(a);
      y = b in vertKeywords ? vertKeywords[b] : parsePercent(b);
    }
  }

  return {
    x: Number.isFinite(x) ? x : 0.5,
    y: Number.isFinite(y) ? y : 0,
  };
}

/** Crop fractions matching the bleed `<img>` current `object-position`. */
function getBleedBackdropObjectPositionFraction() {
  return parseObjectPositionFraction(bleedBackdropImgEl?.style.objectPosition);
}

/**
 * @param {HTMLImageElement} img @param {number} boxWidth @param {number} boxHeight
 * @param {number} [posX] horizontal crop anchor (0 = left, 1 = right)
 * @param {number} [posY] vertical crop anchor (0 = top, 1 = bottom)
 */
function getCoverSourceRect(img, boxWidth, boxHeight, posX = 0.5, posY = 0) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = boxWidth / boxHeight;
  if (imgRatio > boxRatio) {
    const sHeight = img.naturalHeight;
    const sWidth = img.naturalHeight * boxRatio;
    return {
      sx: (img.naturalWidth - sWidth) * posX,
      sy: 0,
      sWidth,
      sHeight,
    };
  }
  const sWidth = img.naturalWidth;
  const sHeight = img.naturalWidth / boxRatio;
  return {
    sx: 0,
    sy: (img.naturalHeight - sHeight) * posY,
    sWidth,
    sHeight,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} img
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} pixelFactor
 */
function drawPixelatedCover(ctx, img, destWidth, destHeight, pixelFactor, posX = 0.5, posY = 0) {
  const factor = Math.max(1, pixelFactor);
  const lowW = Math.max(1, Math.round(destWidth / factor));
  const lowH = Math.max(1, Math.round(destHeight / factor));
  const { sx, sy, sWidth, sHeight } = getCoverSourceRect(img, lowW, lowH, posX, posY);
  const offscreen = getSharedPixelOffscreen();

  offscreen.width = lowW;
  offscreen.height = lowH;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) return;
  offCtx.imageSmoothingEnabled = false;
  offCtx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, lowW, lowH);

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, destWidth, destHeight);
  ctx.drawImage(offscreen, 0, 0, lowW, lowH, 0, 0, destWidth, destHeight);
}

function getFixedRowImageLoader() {
  if (!fixedRowImageLoaderEl) {
    fixedRowImageLoaderEl = document.createElement("img");
    fixedRowImageLoaderEl.decoding = "async";
    fixedRowImageLoaderEl.referrerPolicy = "no-referrer";
  }
  return fixedRowImageLoaderEl;
}

/** @type {number | null} */
let fixedRowRelayoutFrame = null;

/**
 * Coalesce fixed-row image relayout into a single pass per frame. Async image
 * loads complete one-by-one (slowly on the network), and running the heavy
 * reflow work (`syncRayFixedImages` + `applyAllRowFixedPushes`) once per load
 * saturates the main thread. Batching keeps the page responsive.
 */
function scheduleFixedRowRelayout() {
  if (fixedRowRelayoutFrame !== null) return;
  fixedRowRelayoutFrame = requestAnimationFrame(() => {
    fixedRowRelayoutFrame = null;
    if (!currentLayout) return;
    syncRayFixedImages(currentLayout);
    applyAllRowFixedPushes(currentLayout);
  });
}

/** @returns {string | null} data URL, or null while the source image is still loading */
function resolvePixelatedFixedImageHref(url, width, height, factor = LAYOUT.titleRowFixedPixelMaxFactor) {
  if (!url || width <= 0 || height <= 0) return null;

  const maxFactor = Math.max(1, factor);
  const roundedWidth = Math.max(1, Math.round(width));
  const roundedHeight = Math.max(1, Math.round(height));
  const cacheKey = `${url}|${roundedWidth}|${roundedHeight}|${maxFactor}`;
  if (pixelatedFixedImageCache.has(cacheKey)) {
    return pixelatedFixedImageCache.get(cacheKey) ?? null;
  }

  const src = resolveTermImageUrl(url);
  const preloaded =
    getPreloadedTermImage(src) ||
    getPreloadedTermImage(url) ||
    getPreloadedTermImage(decodeURI(src));
  if (preloaded?.complete && preloaded.naturalWidth > 0) {
    const canvas = document.createElement("canvas");
    canvas.width = roundedWidth;
    canvas.height = roundedHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawPixelatedCover(ctx, preloaded, roundedWidth, roundedHeight, maxFactor);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    pixelatedFixedImageCache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  if (!pixelatedFixedImagePending.has(cacheKey)) {
    pixelatedFixedImagePending.add(cacheKey);
    assignPreloadedTermImage(getFixedRowImageLoader(), url).then(() => {
      pixelatedFixedImagePending.delete(cacheKey);
      scheduleFixedRowRelayout();
    });
  }
  return null;
}

function clearBleedBackdropPixelation() {
  if (bleedBackdropPixelCanvasEl) {
    bleedBackdropPixelCanvasEl.hidden = true;
    const ctx = bleedBackdropPixelCanvasEl.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, bleedBackdropPixelCanvasEl.width, bleedBackdropPixelCanvasEl.height);
    }
  }
  bleedBackdropImgEl?.classList.remove("is-pixelation-hidden");
}

function stopBleedPixelAnimation() {
  if (bleedPixelAnimFrame === null) return;
  cancelAnimationFrame(bleedPixelAnimFrame);
  bleedPixelAnimFrame = null;
}

function clearPendingTitleRowBleedReveal() {
  titleRowBleedRevealPending = false;
  titleRowBleedRevealPendingSession = -1;
  pendingTitleRowBleedImageUrl = null;
}

function flushPendingTitleRowBleedReveal() {
  if (!titleRowBleedRevealPending) return;
  if (titleRowBleedRevealPendingSession !== titleRowHoverSessionId) {
    clearPendingTitleRowBleedReveal();
    return;
  }
  const url = pendingTitleRowBleedImageUrl;
  clearPendingTitleRowBleedReveal();
  if (!url || !currentLayout || !shouldShowTitleRowImage(currentLayout)) return;

  viewport?.classList.add("is-title-row-bleed");
  titleRowImageEl?.classList.add("is-bleed");
  if (titleRowImageEl) {
    titleRowImageEl.hidden = true;
    titleRowImageEl.setAttribute("aria-hidden", "true");
  }
  showBleedBackdrop(url, true, { mode: "hover" });
}

function getVisibleActiveRowFixedImage(rayGroup) {
  if (!rayGroup) return null;
  const imageEl = rayGroup.querySelector(".sun-ray-fixed-image:not(.is-hiding)");
  if (!imageEl) return null;
  const href = imageEl.getAttribute("href") || imageEl.getAttributeNS(XLINK_NS, "href");
  return href ? imageEl : null;
}

function shouldDeferBleedForFixedThumbnailExit(layout) {
  const groupIndex = getDisplayActiveIndex();
  const rayGroup = svgEl?.querySelector(`[data-group="${groupIndex}"]`);
  const fixedImage = getVisibleActiveRowFixedImage(rayGroup);
  return Boolean(fixedImage && shouldHideRayFixedImage(groupIndex));
}

function getPixelGlitchOpenProgress(t, hold = LAYOUT.titleRowImageSwapGlitchHold) {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= hold) return 0;
  const revealT = (clamped - hold) / Math.max(1e-6, 1 - hold);
  return revealT * (2 - revealT);
}

/** Smooth ease-out across the full duration — no glitch hold at max pixel size. */
function getTermPageBleedRevealOpenProgress(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * (2 - clamped);
}

function startActiveRowImageGlitch(imageKey) {
  if (!imageKey) return;
  activeRowImageGlitch = { key: imageKey, start: performance.now() };
  requestAnimationFrame(tickActiveRowImageGlitch);
}

function tickActiveRowImageGlitch() {
  if (!activeRowImageGlitch || !currentLayout) return;

  const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : LAYOUT.titleRowImageSwapTransitionMs;
  const elapsed = performance.now() - activeRowImageGlitch.start;
  syncRayFixedImages(currentLayout);

  if (duration > 0 && elapsed < duration) {
    requestAnimationFrame(tickActiveRowImageGlitch);
  }
}

function getActiveRowImageGlitchFactor(
  imageKey,
  restingFactor = LAYOUT.titleRowFixedPixelMaxFactor
) {
  if (!activeRowImageGlitch || activeRowImageGlitch.key !== imageKey) return restingFactor;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 0 : LAYOUT.titleRowImageSwapTransitionMs;
  if (duration <= 0) {
    activeRowImageGlitch = null;
    return restingFactor;
  }

  const t = (performance.now() - activeRowImageGlitch.start) / duration;
  if (t >= 1) {
    activeRowImageGlitch = null;
    return restingFactor;
  }

  const openProgress = getPixelGlitchOpenProgress(t);
  const maxFactor = LAYOUT.titleRowImageSwapPixelMaxFactor;
  return Math.max(
    restingFactor,
    Math.round(maxFactor + (maxFactor - restingFactor) * (1 - openProgress))
  );
}

function clearActiveRowImageGlitch() {
  activeRowImageGlitch = null;
  activeRowFixedImageKey = null;
}

/** Reverse of bleed reveal — blocks grow from the resting pixel size, then fade out. */
function runFixedThumbnailHideAnimation(imageEl, url, pixelWidth, pixelHeight, onComplete) {
  stopFixedThumbnailHideAnimation();

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 0 : LAYOUT.titleRowFixedHideTransitionMs;
  const maxFactor = LAYOUT.titleRowFixedPixelMaxFactor;

  if (duration <= 0) {
    onComplete?.();
    return;
  }

  imageEl.classList.add("is-hiding");
  const start = performance.now();
  const hideDepth = 0.42;

  function applyHideFrame(openProgress, fadeT) {
    const factor = getBleedPixelFactor(openProgress, maxFactor);
    const href = resolvePixelatedFixedImageHref(url, pixelWidth, pixelHeight, factor);
    if (href) {
      imageEl.setAttributeNS(XLINK_NS, "href", href);
      imageEl.setAttribute("href", href);
    }
    const opacity = fadeT <= 0.35 ? 1 : Math.max(0, 1 - (fadeT - 0.35) / 0.65);
    imageEl.setAttribute("opacity", String(opacity));
  }

  applyHideFrame(0, 0);

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const openProgress = -t * (2 - t) * hideDepth;
    applyHideFrame(openProgress, t);
    if (t < 1) {
      fixedThumbHideAnimFrame = requestAnimationFrame(frame);
    } else {
      fixedThumbHideAnimFrame = null;
      imageEl.classList.remove("is-hiding");
      imageEl.removeAttribute("opacity");
      onComplete?.();
    }
  }

  fixedThumbHideAnimFrame = requestAnimationFrame(frame);
}

/** Overlay canvases pixelating the visible term-page images during an exit. */
let termPageImageExitOverlays = [];
/** @type {number | null} */
let termPageImageExitFrame = null;
/** True while the exit beat is also pixelating the full-bleed backdrop. */
let termPageBleedExitActive = false;
/** Peak block size the term-page photos crumble to as the page scrambles away. */
const TERM_PAGE_IMAGE_EXIT_PIXEL_MAX_FACTOR = 30;

function clearTermPageImageExitPixelation() {
  if (termPageImageExitFrame !== null) {
    cancelAnimationFrame(termPageImageExitFrame);
    termPageImageExitFrame = null;
  }
  for (const { canvas, img } of termPageImageExitOverlays) {
    canvas.remove();
    img.classList.remove("is-pixelation-hidden");
  }
  termPageImageExitOverlays = [];
  if (termPageBleedExitActive) {
    termPageBleedExitActive = false;
    clearBleedBackdropPixelation();
  }
}

function collectVisibleTermPageImages() {
  if (!viewport) return [];
  return [...viewport.querySelectorAll("img.sun-term-page__image.is-loaded")].filter(
    (img) =>
      img instanceof HTMLImageElement &&
      img.naturalWidth > 0 &&
      img.clientWidth > 0 &&
      img.clientHeight > 0
  );
}

/**
 * Pixelate the term-page images in place over the exit beat — the photos
 * dissolve into blocks as the term page scrambles away. The overlays are torn
 * down by {@link clearTermPageImageExitPixelation} once the destination view
 * takes over.
 * @param {number} durationMs
 */
function runTermPageImagesExitPixelation(durationMs) {
  clearTermPageImageExitPixelation();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 0 : durationMs;
  if (duration <= 0) return;

  for (const img of collectVisibleTermPageImages()) {
    const figure = img.closest(".sun-term-page__figure") ?? img.parentElement;
    if (!figure) continue;
    const width = Math.round(img.clientWidth);
    const height = Math.round(img.clientHeight);
    if (width <= 0 || height <= 0) continue;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.pointerEvents = "none";
    canvas.style.imageRendering = "pixelated";
    canvas.style.zIndex = "2";
    figure.appendChild(canvas);
    img.classList.add("is-pixelation-hidden");
    termPageImageExitOverlays.push({ canvas, img });
  }

  // The full-bleed backdrop is the most prominent image at the top of the term
  // page (the figure thumbnails are usually below the fold), so crumble it too.
  termPageBleedExitActive = Boolean(
    bleedBackdropImgEl &&
      bleedBackdropEl &&
      !bleedBackdropEl.hidden &&
      bleedBackdropImgEl.complete &&
      bleedBackdropImgEl.naturalWidth > 0 &&
      bleedBackdropEl.clientWidth > 0 &&
      bleedBackdropEl.clientHeight > 0
  );

  if (!termPageImageExitOverlays.length && !termPageBleedExitActive) return;

  // Stop any idle/glitch bleed pixel loop so it doesn't fight our exit frames.
  if (termPageBleedExitActive) stopBleedPixelAnimation();

  const maxFactor = TERM_PAGE_IMAGE_EXIT_PIXEL_MAX_FACTOR;
  const drawAt = (factor, openProgress) => {
    for (const { canvas, img } of termPageImageExitOverlays) {
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      drawPixelatedCover(ctx, img, canvas.width, canvas.height, factor);
    }
    if (termPageBleedExitActive) {
      applyBleedBackdropPixelation(openProgress, { maxFactor });
    }
  };

  drawAt(1, 1);
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = t * (2 - t);
    const factor = Math.max(1, Math.round(1 + (maxFactor - 1) * eased));
    // Bleed pixelation: openProgress 1 = sharp, 0 = max blocky.
    drawAt(factor, 1 - eased);
    termPageImageExitFrame = t < 1 ? requestAnimationFrame(frame) : null;
  };
  termPageImageExitFrame = requestAnimationFrame(frame);
}

/** @param {number} openProgress 0 = closed, 1 = fully open */
function getBleedPixelFactor(openProgress, maxFactor = LAYOUT.titleRowInlinePixelMaxFactor) {
  if (openProgress >= 1) return 1;
  if (openProgress <= 0) {
    const extra = Math.abs(openProgress);
    return Math.max(1, Math.round(maxFactor + (maxFactor - 1) * extra));
  }
  const eased = Math.max(0, Math.min(1, openProgress));
  return Math.max(1, Math.round(1 + (maxFactor - 1) * (1 - eased)));
}

/** @param {number} openProgress 0 = closed, 1 = fully open @param {{ maxFactor?: number }} [options] */
function applyBleedBackdropPixelation(openProgress, options = {}) {
  const img = bleedBackdropImgEl;
  const container = bleedBackdropEl;
  const maxFactor = options.maxFactor ?? LAYOUT.titleRowInlinePixelMaxFactor;
  const factor = getBleedPixelFactor(openProgress, maxFactor);
  if (!img || !container || factor <= 1) {
    clearBleedBackdropPixelation();
    return;
  }

  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height || !img.complete || img.naturalWidth <= 0) return;

  const canvas = ensureBleedPixelCanvas();
  if (!canvas) return;

  canvas.width = width;
  canvas.height = height;
  canvas.hidden = false;
  img.classList.add("is-pixelation-hidden");

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { x: posX, y: posY } = getBleedBackdropObjectPositionFraction();
  drawPixelatedCover(ctx, img, width, height, factor, posX, posY);
}

function applyIdleBleedBackdropPixelation() {
  applyBleedBackdropPixelation(0, { maxFactor: LAYOUT.idleGalleryPixelMaxFactor });
}

function syncIdleBleedPixelation() {
  return;
}

function runBleedBackdropPixelationAnimation() {
  runBleedBackdropPixelGlitchAnimation();
}

function runBleedBackdropPixelGlitchAnimation(options = {}) {
  const durationMs = options.durationMs ?? LAYOUT.titleRowImageSwapTransitionMs;
  const progressFn = options.progressFn ?? getPixelGlitchOpenProgress;
  const maxFactor = options.maxFactor ?? LAYOUT.titleRowImageSwapPixelMaxFactor;
  stopBleedPixelAnimation();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 0 : durationMs;

  if (duration <= 0) {
    clearBleedBackdropPixelation();
    return;
  }

  applyBleedBackdropPixelation(0, { maxFactor });
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const openProgress = progressFn(t);
    applyBleedBackdropPixelation(openProgress, { maxFactor });
    if (t < 1) {
      bleedPixelAnimFrame = requestAnimationFrame(frame);
    } else {
      bleedPixelAnimFrame = null;
      clearBleedBackdropPixelation();
    }
  }
  bleedPixelAnimFrame = requestAnimationFrame(frame);
}

function runIdleBleedBackdropPixelationAnimation() {
  stopBleedPixelAnimation();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 0 : LAYOUT.idleGalleryTransitionMs;
  const maxFactor = LAYOUT.idleGalleryPixelMaxFactor;
  const transitionPeak = LAYOUT.idleGalleryPixelTransitionPeak ?? 0.2;

  if (duration <= 0) {
    applyIdleBleedBackdropPixelation();
    return;
  }

  applyBleedBackdropPixelation(0, { maxFactor });
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const openProgress =
      t <= 0.5 ? (t / 0.5) * transitionPeak : ((1 - t) / 0.5) * transitionPeak;
    applyBleedBackdropPixelation(openProgress, { maxFactor });
    if (t < 1) {
      bleedPixelAnimFrame = requestAnimationFrame(frame);
    } else {
      bleedPixelAnimFrame = null;
      applyIdleBleedBackdropPixelation();
    }
  }
  bleedPixelAnimFrame = requestAnimationFrame(frame);
}

function clearTitleRowImagePixelation() {
  if (titleRowImagePixelCanvasEl) {
    titleRowImagePixelCanvasEl.hidden = true;
    const ctx = titleRowImagePixelCanvasEl.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, titleRowImagePixelCanvasEl.width, titleRowImagePixelCanvasEl.height);
    }
  }
  titleRowImageImgEl?.classList.remove("is-pixelation-hidden");
}

/** @param {number} openProgress 0 = closed, 1 = fully open */
function applyTitleRowImagePixelation(openProgress) {
  const img = titleRowImageImgEl;
  const container = titleRowImageEl;
  const eased = Math.max(0, Math.min(1, openProgress));
  if (!img || !container) {
    clearTitleRowImagePixelation();
    return;
  }
  if (eased >= 1) {
    clearTitleRowImagePixelation();
    return;
  }

  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height || !img.complete || img.naturalWidth <= 0) return;

  const factor = Math.max(1, getTitleRowPixelFactor(openProgress));

  const canvas = ensureTitleRowPixelCanvas();
  if (!canvas) return;

  canvas.width = width;
  canvas.height = height;
  canvas.hidden = false;
  img.classList.add("is-pixelation-hidden");

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawPixelatedCover(ctx, img, width, height, factor);
}

function runTitleRowPixelRevealAnimation() {
  stopInlinePushAnimation();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 0 : LAYOUT.titleRowInlinePushMs;

  if (duration <= 0) {
    clearTitleRowImagePixelation();
    return;
  }

  applyTitleRowImagePixelation(0);
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const openProgress = t * (2 - t);
    applyTitleRowImagePixelation(openProgress);
    if (t < 1) {
      titleRowInlinePushAnimFrame = requestAnimationFrame(frame);
    } else {
      titleRowInlinePushAnimFrame = null;
      clearTitleRowImagePixelation();
    }
  }
  titleRowInlinePushAnimFrame = requestAnimationFrame(frame);
}

function runInlineImageEnterAnimation(rayGroup, hoverWrap, layoutResult) {
  stopInlinePushAnimation();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 0 : LAYOUT.titleRowInlinePushMs;
  const { anchorX, anchorY, imageWidthPx, imageHeightPx, gapPx, imageAngleDeg } =
    layoutResult;
  titleRowInlinePushRay = rayGroup;

  const applyFrame = (linearT) => {
    const t = Math.max(0, Math.min(1, linearT));
    const imageScale = t * (2 - t);
    const pushScale = getInlinePushProgress(t);
    if (titleRowImageEl) {
      titleRowImageEl.classList.add("is-inline-animating");
      titleRowImageEl.classList.remove("is-expanded");
      titleRowImageEl.style.transform = `rotate(${imageAngleDeg}deg) scaleX(${imageScale})`;
    }
    applyTitleRowImagePixelation(imageScale);
    applyLeftOfTermPush(
      rayGroup,
      hoverWrap,
      anchorX,
      anchorY,
      imageWidthPx,
      imageHeightPx,
      gapPx,
      imageAngleDeg,
      imageScale,
      true,
      pushScale
    );
  };

  if (duration <= 0) {
    applyFrame(1);
    clearTitleRowImagePixelation();
    titleRowImageEl?.classList.remove("is-inline-animating");
    titleRowImageEl?.style.removeProperty("transform");
    titleRowImageEl?.classList.add("is-expanded");
    return;
  }

  applyFrame(0);
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    applyFrame(t);
    if (t < 1) {
      titleRowInlinePushAnimFrame = requestAnimationFrame(frame);
    } else {
      titleRowInlinePushAnimFrame = null;
      rayGroup.querySelectorAll(".sun-term-wrap.is-inline-animating").forEach((wrap) => {
        wrap.classList.remove("is-inline-animating");
      });
      titleRowImageEl?.classList.remove("is-inline-animating");
      titleRowImageEl?.style.removeProperty("transform");
      titleRowImageEl?.classList.add("is-expanded");
      clearTitleRowImagePixelation();
    }
  }
  titleRowInlinePushAnimFrame = requestAnimationFrame(frame);
}

function hideBleedBackdrop() {
  hideBleedBackdropFully();
}

function showBleedBackdrop(url, shouldAnimate, options = {}) {
  if (!bleedBackdropEl || !bleedBackdropImgEl || !url) return;

  const mode = options.mode ?? (hoveredTitleRowTermId ? "hover" : "idle");
  if (mode !== "termPage") {
    applyBleedObjectPositionForUrl(url);
  }
  const seamlessTermPage =
    mode === "termPage" &&
    isBleedBackdropLoaded() &&
    termImageSrcMatches(bleedBackdropImgEl, url);
  const isImageSwap =
    !seamlessTermPage &&
    bleedBackdropEl.classList.contains("is-visible") &&
    bleedBackdropImgEl &&
    !termImageSrcMatches(bleedBackdropImgEl, url);

  if (!seamlessTermPage && !isImageSwap) {
    bleedBackdropEl.classList.remove("is-term-page");
    viewport?.classList.remove("is-term-page-bleed");
    clearTermPageBleedClip();
  }

  if (mode === "termPage") {
    bleedBackdropEl.classList.remove("is-hover", "is-idle");
    bleedBackdropEl.classList.add("is-term-page");
    viewport?.classList.add("is-term-page-bleed");
    syncTermPageBleedClip();
  } else if (mode === "hover") {
    pauseIdleGallery();
    bleedBackdropEl.classList.remove("is-idle");
    bleedBackdropEl.classList.add("is-hover");
  } else {
    bleedBackdropEl.classList.remove("is-hover");
    bleedBackdropEl.classList.add("is-idle");
  }

  stopBleedPixelAnimation();
  if (!seamlessTermPage && !isImageSwap) {
    bleedBackdropEl.classList.remove("is-visible");
  }

  if (mode === "idle") {
    bleedBackdropImgEl?.classList.add("is-pixelation-hidden");
  } else {
    clearBleedBackdropPixelation();
  }

  bleedBackdropEl.hidden = false;
  bleedBackdropEl.setAttribute("aria-hidden", "false");

  if (seamlessTermPage) {
    bleedBackdropEl.classList.add("is-visible");
    requestAnimationFrame(() => syncBleedBackdropDarkInvert());
    return;
  }

  const markBleedBackdropVisible = () => {
    bleedBackdropEl?.classList.add("is-visible");
    // Wait one frame so the active row's SVG screen bounds are settled.
    requestAnimationFrame(() => syncBleedBackdropDarkInvert());
  };

  const reveal = () => {
    if (mode === "idle") {
      if (shouldAnimate) {
        runIdleBleedBackdropPixelationAnimation();
      } else {
        applyIdleBleedBackdropPixelation();
      }
      markBleedBackdropVisible();
      return;
    }

    if (shouldAnimate) {
      if (mode === "termPage") {
        runBleedBackdropPixelGlitchAnimation({
          durationMs: LAYOUT.termPageBleedRevealTransitionMs,
          progressFn: getTermPageBleedRevealOpenProgress,
          maxFactor: LAYOUT.titleRowInlinePixelMaxFactor,
        });
      } else {
        runBleedBackdropPixelGlitchAnimation();
      }
      if (isImageSwap) {
        markBleedBackdropVisible();
      } else {
        requestAnimationFrame(markBleedBackdropVisible);
      }
    } else {
      clearBleedBackdropPixelation();
      markBleedBackdropVisible();
    }
  };

  assignPreloadedTermImage(bleedBackdropImgEl, url).then(reveal);
}

function clearTitleRowImageClasses() {
  titleRowImageEl?.classList.remove(
    "is-bleed",
    "is-inline",
    "is-inline-expand",
    "is-inline-fixed",
    "is-inline-animating",
    "is-expanded",
    "is-visible"
  );
  viewport?.classList.remove("is-title-row-bleed", "is-title-row-inline");
  // Recompute instead of force-clearing: a term-page bleed under the nav must
  // keep its inverted (white) nav even though the hover title-row bleed is gone.
  syncBleedBackdropDarkInvert();
}

function hideTitleRowImage({ preserveBleed = false } = {}) {
  stopInlinePushAnimation();
  clearInlinePushTransforms(titleRowInlinePushRay);
  titleRowInlinePushRay = null;
  clearTitleRowImageClasses();
  bleedBackdropEl?.classList.remove("is-hover");
  if (!preserveBleed) {
    hideBleedBackdropFully();
  }
  if (!titleRowImageEl) return;

  titleRowImageEl.hidden = true;
  titleRowImageEl.setAttribute("aria-hidden", "true");
  titleRowImageEl.style.left = "";
  titleRowImageEl.style.top = "";
  titleRowImageEl.style.width = "";
  titleRowImageEl.style.height = "";
  titleRowImageEl.style.transform = "";
  titleRowImageEl.style.transformOrigin = "";
  titleRowImageEl.style.removeProperty("--img-rotate");
  clearTitleRowImagePixelation();
}

function setTitleRowImageContent(term, image = null) {
  if (!titleRowImageEl || !titleRowImageImgEl) return;

  const selected = image ?? (term ? pickTermDisplayImage(term.name) : null);
  if (selected?.url) {
    const src = resolveTermImageUrl(selected.url);
    titleRowImageEl.classList.remove("is-placeholder");
    titleRowImageImgEl.hidden = false;
    if (titleRowImageImgEl.src !== src) {
      assignPreloadedTermImage(titleRowImageImgEl, selected.url);
    } else if (!titleRowImageImgEl.classList.contains("is-loaded")) {
      titleRowImageImgEl.classList.add("is-loaded");
    }
    return;
  }

  titleRowImageEl.classList.add("is-placeholder");
  titleRowImageImgEl.hidden = true;
  cancelTermImageLoad(titleRowImageImgEl);
  titleRowImageImgEl.removeAttribute("src");
  titleRowImageImgEl.removeAttribute("data-src");
  titleRowImageImgEl.classList.remove("is-loaded");
}

function getTitleRowImageGroupIndex() {
  return focusState ? focusState.activeIndex : getDisplayActiveIndex();
}

function shouldShowTitleRowImage(layout) {
  if (isTermNavigating()) return false;
  if (isArcScrollMotionActive()) return false;
  const overview = layout?.overview ?? overviewProgress ?? 0;
  if (overview > 0.02) return false;
  if (focusState) return false;
  if (!hoveredTitleRowTermId) return false;
  return true;
}

function getTitleRowImageTerm(group) {
  if (!group?.terms.length || !hoveredTitleRowTermId) return null;
  return group.terms.find((t) => t.id === hoveredTitleRowTermId) ?? null;
}

function clearTitleRowHoverImage() {
  titleRowHoverImage = null;
}

/** One stable image per hover session — bleed and display picks stay in sync with the caption. */
function getTitleRowHoverImage(term, layout) {
  if (titleRowHoverImage) return titleRowHoverImage;

  if (titleRowHoverMode === null) {
    titleRowHoverMode = pickTitleRowHoverMode(term, layout);
  }

  const { viewportWidth, viewportHeight } = layout;
  titleRowHoverImage = pickTitleRowSharedImage(term.name, viewportWidth, viewportHeight);
  return titleRowHoverImage;
}

function updateTitleRowImage(layout) {
  if (!titleRowImageEl || !layout) return;

  if (!shouldShowTitleRowImage(layout)) {
    hideTitleRowImage({ preserveBleed: shouldPreserveTermPageBleed() });
    syncIdleGallery(layout);
    return;
  }

  const groupIndex = getTitleRowImageGroupIndex();
  const group = groups[groupIndex];
  const rayGroup = svgEl.querySelector(`[data-group="${groupIndex}"]`);
  const term = getTitleRowImageTerm(group);
  const hoverWrap =
    rayGroup && term
      ? getHoveredTermWrap(rayGroup, term.id)
      : null;

  if (!group || !rayGroup || !term || !hoverWrap) {
    hideTitleRowImage();
    syncIdleGallery(layout);
    return;
  }

  const session = titleRowHoverSessionId;
  const bleedRevealActive =
    isTitleRowBleedActive() &&
    (bleedPixelAnimFrame !== null || bleedBackdropEl?.classList.contains("is-visible"));
  if (bleedRevealActive && session === lastTitleRowImageSession) {
    return;
  }

  lastTitleRowImageSession = session;
  clearTitleRowImageClasses();

  const { viewportWidth, viewportHeight } = layout;
  const hoverImage = getTitleRowHoverImage(term, layout);

  titleRowHoverMode = "bleed";
  const imageUrl = hoverImage?.url;
  if (!imageUrl) {
    hideTitleRowImage();
    return;
  }

  setTitleRowImageContent(term, hoverImage);

  if (shouldDeferBleedForFixedThumbnailExit(layout)) {
    titleRowBleedRevealPending = true;
    titleRowBleedRevealPendingSession = session;
    pendingTitleRowBleedImageUrl = imageUrl;
    syncRayFixedImages(layout);
    return;
  }

  clearPendingTitleRowBleedReveal();
  viewport?.classList.add("is-title-row-bleed");
  titleRowImageEl.classList.add("is-bleed");
  titleRowImageEl.hidden = true;
  titleRowImageEl.setAttribute("aria-hidden", "true");
  showBleedBackdrop(imageUrl, true, { mode: "hover" });
}

function resetTitleRowImage({ preserveBleed = false } = {}) {
  clearPendingTitleRowBleedReveal();
  hoveredTitleRowTermId = null;
  titleRowHoverMode = null;
  if (!preserveBleed) {
    clearTitleRowHoverImage();
  }
  titleRowHoverSessionId = 0;
  lastTitleRowImageSession = -1;
  titleRowInlineExpandedSession = -1;
  hideTitleRowImage({ preserveBleed });
  clearRayFixedImages();
  titleRowImageEl?.classList.remove("is-placeholder");

  if (titleRowImageImgEl) {
    titleRowImageImgEl.hidden = false;
    cancelTermImageLoad(titleRowImageImgEl);
    titleRowImageImgEl.removeAttribute("src");
    titleRowImageImgEl.removeAttribute("data-src");
    titleRowImageImgEl.classList.remove("is-loaded");
  }
}

function restoreOverviewTermHoverFromState() {
  if (!hoveredTitleRowTermId || !svgEl || isFocusActive()) return;

  const rayGroup = svgEl.querySelector(`[data-group="${getDisplayActiveIndex()}"]`);
  if (!rayGroup) return;

  const wrap = getHoveredTermWrap(rayGroup, hoveredTitleRowTermId);
  if (!wrap) return;

  setTermHover(rayGroup, wrap);
}

function refreshTitleRowTermHoverVisuals(termId = hoveredTitleRowTermId) {
  if (!termId || !currentLayout) return;
  const bleedRevealActive =
    isTitleRowBleedActive() &&
    (bleedPixelAnimFrame !== null || bleedBackdropEl?.classList.contains("is-visible"));
  if (!bleedRevealActive) {
    updateTitleRowImage(currentLayout);
  }
  syncRayFixedImages(currentLayout);
  applyAllRowFixedPushes(currentLayout);
}

function findTermById(termId) {
  for (const group of groups) {
    const term = group.terms.find((entry) => entry.id === termId);
    if (term) return term;
  }
  return null;
}

function setTitleRowTermHover(termId) {
  if (hoveredTitleRowTermId === termId) {
    refreshTitleRowTermHoverVisuals(termId);
    return;
  }
  clearInlinePushTransforms(titleRowInlinePushRay);
  titleRowInlinePushRay = null;
  stopInlinePushAnimation();
  hoveredTitleRowTermId = termId;
  titleRowHoverMode = null;
  clearTitleRowHoverImage();
  titleRowHoverSessionId += 1;
  const term = findTermById(termId);
  if (term?.name) boostTermImagePreloadForTerm(term.name);
  if (currentLayout) {
    updateTitleRowImage(currentLayout);
    if (!titleRowBleedRevealPending) {
      syncRayFixedImages(currentLayout);
    }
    applyAllRowFixedPushes(currentLayout);
  }
}

function clearTitleRowTermHover() {
  if (!hoveredTitleRowTermId) return;
  clearPendingTitleRowBleedReveal();
  hoveredTitleRowTermId = null;
  titleRowHoverMode = null;
  clearTitleRowHoverImage();
  titleRowInlineExpandedSession = -1;
  titleRowHoverSessionId += 1;
  if (currentLayout) {
    updateTitleRowImage(currentLayout);
    syncRayFixedImages(currentLayout);
    applyAllRowFixedPushes(currentLayout);
  } else {
    hideTitleRowImage();
    clearRayFixedImages();
  }
}

function formatTermImageCaption(image) {
  return image?.caption?.trim() || image?.sourceLabel?.trim() || "";
}

function getTermPageScrollUsedImageUrls(term) {
  const used = new Set();
  if (termPageBleedImage?.url) {
    used.add(resolveTermImageUrl(termPageBleedImage.url));
  }
  let images = getTermImagesForDisplay(term.name);
  if (termPageBleedImage?.url) {
    const bleedUrl = resolveTermImageUrl(termPageBleedImage.url);
    images = images.filter(
      (img) => !img?.url || resolveTermImageUrl(img.url) !== bleedUrl
    );
  }
  if (images[0]?.url) {
    used.add(resolveTermImageUrl(images[0].url));
  }
  return used;
}

function getTermPageLastUnusedImage(term) {
  const used = getTermPageScrollUsedImageUrls(term);
  const unused = getTermImagesForDisplay(term.name).filter(
    (img) => img?.url && !used.has(resolveTermImageUrl(img.url))
  );
  return unused.length ? unused[unused.length - 1] : null;
}

function syncTermPageImageCensorHeight(imageEl, heightPx) {
  const figure = imageEl?.closest?.(".sun-term-page__figure");
  if (!figure || !Number.isFinite(heightPx) || heightPx <= 0) return;
  figure.style.setProperty("--term-page-image-censor-height", `${Math.round(heightPx)}px`);
}

function renderTermPageImageSlot(image, index, { captionText } = {}) {
  const caption =
    captionText ?? (image ? formatTermImageCaption(image) : "");
  const figcaption = `<figcaption class="sun-term-page__caption">${escapeAttr(caption)}</figcaption>`;
  if (image?.url) {
    const src = resolveTermImageUrl(image.url);
    const preloaded = getPreloadedTermImage(src);
    const srcAttr = preloaded
      ? `src="${escapeAttr(src)}"`
      : `data-src="${escapeAttr(src)}"`;
    const loadedClass = preloaded ? " is-loaded" : "";
    return (
      `<figure class="sun-term-page__figure">` +
      `<img class="sun-term-page__image${loadedClass}" alt="" decoding="async" ` +
      `${srcAttr} data-term-image="${index + 1}" />` +
      figcaption +
      `</figure>`
    );
  }
  return (
    `<figure class="sun-term-page__figure">` +
    `<div class="sun-term-page__image sun-term-page__image--placeholder" role="img" ` +
    `aria-label="מקום לתמונה" data-term-image="${index + 1}"></div>` +
    figcaption +
    `</figure>`
  );
}

function applyTermPageImageCaptionWidths(imagesSpan) {
  if (!termImagesEl) return;
  const captionSpan = getGridSpanBounds(
    LAYOUT.termPageImageCaptionColumns,
    LAYOUT.termPageImageCaptionColumnFromRight,
    viewport
  );
  termImagesEl.querySelectorAll(".sun-term-page__caption").forEach((captionEl) => {
    captionEl.style.width = `${captionSpan.width}px`;
    captionEl.style.maxWidth = "none";
  });
}

function getTermPageScrollMetaColumnConfig() {
  const cfg = termPageScrollLayout;
  if (cfg.metaBelowImage) {
    const valueColumnFromRight = cfg.imageColumnFromRight + cfg.metaHeadingColumns;
    return {
      headingColumns: cfg.metaHeadingColumns,
      headingColumnFromRight: cfg.imageColumnFromRight,
      valueColumns: Math.min(cfg.metaValueColumns, GRID.columns - cfg.metaHeadingColumns),
      valueColumnFromRight,
      metaBelowImage: true,
    };
  }

  const imageStartFromLeft =
    GRID.columns - cfg.imageColumnFromRight - cfg.imageColumns + 1;
  const headingEndFromLeft = imageStartFromLeft - cfg.metaGapColumns - 1;
  const headingStartFromLeft = headingEndFromLeft - cfg.metaHeadingColumns + 1;
  const valueEndFromLeft = headingStartFromLeft - 1;

  return {
    headingColumns: cfg.metaHeadingColumns,
    headingColumnFromRight: GRID.columns - headingEndFromLeft,
    valueColumns: Math.min(cfg.metaValueColumns, valueEndFromLeft),
    valueColumnFromRight: GRID.columns - valueEndFromLeft,
    metaBelowImage: false,
  };
}

function getTermPageScrollDetailsColumnConfig() {
  const cfg = termPageScrollLayout;
  return {
    headingColumns: cfg.scrollDetailsHeadingColumns,
    headingColumnFromRight: cfg.imageColumnFromRight,
    valueColumns: cfg.scrollDetailsValueColumns,
    valueColumnFromRight: cfg.scrollDetailsValueColumnFromRight,
  };
}

function resetTermPageScrollDetailRow(sideEl) {
  if (!sideEl) return;
  const headingEl = sideEl.querySelector(".sun-term-page__side-heading");
  const textEl = sideEl.querySelector(".sun-term-page__side-text");
  sideEl.hidden = true;
  sideEl.style.top = "";
  sideEl.style.height = "";
  if (textEl) {
    textEl.innerHTML = "";
    textEl.style.left = "";
    textEl.style.width = "";
  }
  if (headingEl) {
    headingEl.style.left = "";
    headingEl.style.width = "";
  }
}

function updateTermPageScrollDetailRow(
  sideEl,
  text,
  term,
  columnConfig,
  { layoutOnly = false } = {}
) {
  if (!sideEl) return false;
  const headingEl = sideEl.querySelector(".sun-term-page__side-heading");
  const textEl = sideEl.querySelector(".sun-term-page__side-text");
  if (!headingEl || !textEl) return false;

  const trimmed = text?.trim() || "";
  if (!trimmed) {
    resetTermPageScrollDetailRow(sideEl);
    return false;
  }

  const headingSpan = getGridSpanBounds(
    columnConfig.headingColumns,
    columnConfig.headingColumnFromRight,
    viewport
  );
  const valueSpan = getGridSpanBounds(
    columnConfig.valueColumns,
    columnConfig.valueColumnFromRight,
    viewport
  );

  if (!layoutOnly) {
    setAnnotatedTermText(textEl, trimmed, term);
  }

  headingEl.style.left = `${headingSpan.left}px`;
  headingEl.style.width = `${headingSpan.width}px`;
  textEl.style.left = `${valueSpan.left}px`;
  textEl.style.width = `${valueSpan.width}px`;
  sideEl.hidden = false;
  sideEl.style.height = `${Math.max(headingEl.offsetHeight, textEl.offsetHeight)}px`;
  return true;
}

function layoutTermPageDetailsImage(detailsTopInPage, term, rebuild = true) {
  if (!termDetailsImageEl) return 0;

  const image = getTermPageLastUnusedImage(term);
  if (!image?.url) {
    resetTermPageDetailsImage();
    return 0;
  }

  const span = getGridSpanBounds(
    termPageScrollLayout.detailsImageColumns,
    termPageScrollLayout.detailsImageColumnFromRight,
    viewport
  );
  const aspect = getTermImageAspectRatio(image.url) ?? 4 / 3;
  const imageHeight = Math.round(span.width / aspect);

  if (rebuild) {
    termDetailsImageEl.innerHTML = renderTermPageImageSlot(image, 2);
  }

  termDetailsImageEl.querySelectorAll(".sun-term-page__image").forEach((el) => {
    el.style.height = `${imageHeight}px`;
    syncTermPageImageCensorHeight(el, imageHeight);
  });

  termDetailsImageEl.style.top = `${detailsTopInPage}px`;
  termDetailsImageEl.style.left = `${span.left}px`;
  termDetailsImageEl.style.width = `${span.width}px`;
  termDetailsImageEl.hidden = false;
  termDetailsImageEl.removeAttribute("aria-hidden");

  termDetailsImageEl.querySelectorAll(".sun-term-page__caption").forEach((captionEl) => {
    captionEl.style.width = `${span.width}px`;
    captionEl.style.maxWidth = "none";
  });

  return termDetailsImageEl.offsetHeight;
}

function layoutTermPageScrollDetails(fold2EndInPage, term, contentOnly = false) {
  if (!termDetailsEl) return fold2EndInPage;

  const columnConfig = getTermPageScrollDetailsColumnConfig();
  const blockGap = getTermPageScrollBlockGapPx(getLiveViewportHeight());
  const detailsTop = fold2EndInPage + blockGap;

  const detailsImageHeight = layoutTermPageDetailsImage(
    detailsTop,
    term,
    !contentOnly
  );
  const labelNavExtent = layoutTermPageLabelNav(detailsTop, detailsImageHeight, term);

  termDetailsEl.style.top = `${detailsTop}px`;
  termDetailsEl.style.left = "0";
  termDetailsEl.style.width = "100%";

  const hasEmphasizes = updateTermPageScrollDetailRow(
    termEmphasizesEl,
    term.emphasizes,
    term,
    columnConfig,
    { layoutOnly: contentOnly }
  );
  const hasObscures = updateTermPageScrollDetailRow(
    termObscuresEl,
    term.obscures,
    term,
    columnConfig,
    { layoutOnly: contentOnly }
  );

  if (!hasEmphasizes && !hasObscures && !detailsImageHeight) {
    termDetailsEl.hidden = true;
    termDetailsEl.style.height = "";
    return fold2EndInPage;
  }

  termDetailsEl.hidden = !hasEmphasizes && !hasObscures;

  let rowTop = 0;
  if (hasEmphasizes) {
    termEmphasizesEl.style.top = `${rowTop}px`;
    rowTop += termEmphasizesEl.offsetHeight + LAYOUT.termPageScrollDetailsRowGap;
  }
  if (hasObscures) {
    termObscuresEl.style.top = `${rowTop}px`;
    rowTop += termObscuresEl.offsetHeight;
  } else if (hasEmphasizes) {
    rowTop -= LAYOUT.termPageScrollDetailsRowGap;
  }

  termDetailsEl.style.height = hasEmphasizes || hasObscures ? `${rowTop}px` : "";
  const detailsBlockBottom = detailsTop + Math.max(rowTop, labelNavExtent);
  return Math.max(fold2EndInPage, detailsBlockBottom);
}

function layoutTermPageScrollMeta(imageTopPx, imageHeightPx, term, contentOnly = false) {
  if (!termMetaEl) return;

  const columnConfig = getTermPageScrollMetaColumnConfig();
  const viewportHeight = getLiveViewportHeight();
  termMetaEl.style.left = "0";
  termMetaEl.style.right = "0";
  termMetaEl.hidden = false;
  termMetaEl.classList.toggle("is-meta-below-image", Boolean(columnConfig.metaBelowImage));

  updateTermMetaRow(
    termMetaTypeEl,
    term.termType,
    term,
    "termType",
    columnConfig,
    { layoutOnly: contentOnly }
  );
  updateTermMetaRow(
    termMetaFramingEl,
    term.framing,
    term,
    "framing",
    columnConfig,
    { layoutOnly: contentOnly }
  );
  updateTermMetaRow(
    termMetaConnotationEl,
    term.connotation,
    term,
    "connotation",
    columnConfig,
    { layoutOnly: contentOnly }
  );

  const rowsEl = termMetaEl.querySelector(".sun-term-meta__rows");
  if (rowsEl) {
    rowsEl.style.gap = `${LAYOUT.termMetaRowGap}px`;
    rowsEl.style.justifyContent = columnConfig.metaBelowImage ? "flex-start" : "flex-end";
    rowsEl.style.minHeight = "";
  }

  const metaHeight = termMetaEl.offsetHeight;
  if (metaHeight < 1) {
    termMetaEl.hidden = true;
    termMetaEl.classList.remove("is-visible");
    return;
  }

  if (columnConfig.metaBelowImage) {
    termMetaEl.style.top = `${Math.round(
      imageTopPx + imageHeightPx + getTermPageMetaBelowImageGapPx(viewportHeight)
    )}px`;
  } else {
    termMetaEl.style.top = `${Math.round(imageTopPx + imageHeightPx - metaHeight)}px`;
  }
  termMetaEl.classList.add("is-visible");
}

function updateTermPageScrollImages(
  term,
  definitionHeight,
  viewportHeight,
  imageHeight,
  rebuild = true
) {
  if (!termImagesEl) return { imagesHeight: 0, imageBottom: 0 };

  const scrollCfg = termPageScrollLayout;
  const definitionImageGap = getTermPageScrollDefinitionImageGapPx(viewportHeight);
  const imagesSpan = getGridSpanBounds(
    scrollCfg.imageColumns,
    scrollCfg.imageColumnFromRight,
    viewport
  );
  const imagesTop = definitionHeight + definitionImageGap;

  if (rebuild) {
    let images = getTermImagesForDisplay(term.name);
    if (termPageBleedImage?.url) {
      const bleedUrl = resolveTermImageUrl(termPageBleedImage.url);
      images = images.filter(
        (img) => !img?.url || resolveTermImageUrl(img.url) !== bleedUrl
      );
    }
    const slot = images[0] || null;
    termImagesEl.innerHTML = renderTermPageImageSlot(slot, 0);
    termImagesEl.querySelectorAll(".sun-term-page__image").forEach((el) => {
      el.style.height = `${imageHeight}px`;
      syncTermPageImageCensorHeight(el, imageHeight);
    });
  } else {
    termImagesEl.querySelectorAll(".sun-term-page__image").forEach((el) => {
      el.style.height = `${imageHeight}px`;
      syncTermPageImageCensorHeight(el, imageHeight);
    });
  }

  termImagesEl.style.top = `${imagesTop}px`;
  termImagesEl.style.left = `${imagesSpan.left}px`;
  termImagesEl.style.width = `${imagesSpan.width}px`;
  termImagesEl.hidden = false;

  const captionSpan = imagesSpan;
  termImagesEl.querySelectorAll(".sun-term-page__caption").forEach((captionEl) => {
    captionEl.style.width = `${captionSpan.width}px`;
    captionEl.style.maxWidth = "none";
  });

  const imagesHeight = termImagesEl.offsetHeight;
  const pageTop = parseFloat(termPageEl?.style.top) || 0;
  const imageBottom = pageTop + imagesTop + imageHeight;
  return { imagesHeight, imageBottom };
}

function layoutTermPageScrollContent(layout, term, termChanged, options = {}) {
  if (!termPageEl || !termDefinitionEl) return;

  const { viewportWidth, viewportHeight } = layout;
  syncTermPageResponsiveState(viewportWidth, viewportHeight);
  const pageTop = getTermPageScrollContentTopPx(viewportHeight);
  const scrollCfg = termPageScrollLayout;
  const definitionImageGap = getTermPageScrollDefinitionImageGapPx(viewportHeight);

  termPageEl.classList.add("is-scroll-content");
  viewport?.classList.add("is-term-scroll-content");
  termPageEl.style.left = "0";
  termPageEl.style.width = "100%";
  termPageEl.style.top = `${pageTop}px`;
  termPageEl.style.paddingTop = "0";
  termPageEl.style.paddingBottom = `${getTermPageBottomPadding(viewportHeight)}px`;

  if (termChanged) {
    setAnnotatedTermText(termDefinitionEl, term.definition, term);
  }

  const definitionSpan = getGridSpanBounds(
    scrollCfg.definitionColumns,
    scrollCfg.definitionColumnFromRight,
    viewport
  );
  termDefinitionEl.style.left = `${definitionSpan.left}px`;
  termDefinitionEl.style.width = `${definitionSpan.width}px`;
  termDefinitionEl.style.top = "0";

  const definitionHeight = termDefinitionEl.offsetHeight;
  const imageHeight = getTermPageScrollImageHeightPx(viewportHeight, definitionHeight);
  viewport?.style.setProperty("--term-page-scroll-image-height", `${imageHeight}px`);

  const { imagesHeight } = updateTermPageScrollImages(
    term,
    definitionHeight,
    viewportHeight,
    imageHeight,
    termChanged
  );

  // Position the block at its natural (definition-stacked) spot first so the
  // meta can be measured, then anchor the whole image+meta block to the foot of
  // the fold on tall screens (pushing it down without resizing the image).
  const imagesBlockTopNatural = definitionHeight + definitionImageGap;
  layoutTermPageScrollMeta(
    pageTop + imagesBlockTopNatural,
    imageHeight,
    term,
    !termChanged
  );

  let naturalContentBottom = imagesBlockTopNatural + imagesHeight;
  if (termMetaEl && !termMetaEl.hidden) {
    naturalContentBottom = Math.max(
      naturalContentBottom,
      termMetaEl.offsetTop + termMetaEl.offsetHeight - pageTop
    );
  }

  const fold2Drop = getTermPageFold2BottomAnchorDropPx(
    viewportHeight,
    naturalContentBottom,
    pageTop
  );
  const imagesBlockTop = imagesBlockTopNatural + fold2Drop;
  const imagesBottomInPage = imagesBlockTop + imagesHeight;
  const imageTop = pageTop + imagesBlockTop;
  if (fold2Drop > 0) {
    termImagesEl.style.top = `${Math.round(imagesBlockTop)}px`;
    layoutTermPageScrollMeta(imageTop, imageHeight, term, true);
  }

  let fold2BottomInPage = imagesBottomInPage;
  if (termMetaEl && !termMetaEl.hidden) {
    fold2BottomInPage = Math.max(
      fold2BottomInPage,
      termMetaEl.offsetTop + termMetaEl.offsetHeight - pageTop
    );
  }
  const minFold2Chapter = getTermPageFold2ChapterMinPx(viewportHeight);
  const fold2Pad = Math.max(0, minFold2Chapter - fold2BottomInPage);
  let fold2EndInPage = imagesBottomInPage + fold2Pad;

  let detailsBottom = layoutTermPageScrollDetails(fold2EndInPage, term, !termChanged);

  // The page is still hidden here, so hasTermPageFold3Content() (which checks
  // termPageEl.hidden) can't be trusted. Detect fold 3 from the layout result —
  // the details layout returns a bottom past fold 2 only when it produced
  // content — and, if present, grow the fold-2 chapter to the clear floor so
  // fold 3 is pushed fully below the viewport at the fold-2 snap, then
  // reposition the details so their actual style.top matches.
  if (detailsBottom > fold2EndInPage) {
    const clearFloor = getTermPageFold2ClearFloorPx(viewportHeight);
    if (clearFloor > fold2EndInPage) {
      fold2EndInPage = clearFloor;
      detailsBottom = layoutTermPageScrollDetails(fold2EndInPage, term, true);
    }
  }

  const contentBottom = applyTermPageFold3ChapterPad(
    fold2EndInPage,
    detailsBottom,
    viewportHeight
  );
  termPageEl.style.minHeight = `${Math.max(definitionHeight, contentBottom)}px`;

  termPageEl.hidden = false;
  termPageEl.classList.add("is-visible");
  termMetaEl?.classList.add("is-visible");

  if (termChanged && !options.skipAsyncReveal) {
    const revealToken = ++termPageRevealToken;
    const imageContainers = [termImagesEl, termDetailsImageEl].filter(Boolean);
    Promise.all(imageContainers.map((container) => loadTermPageImages(container))).then(
      () => {
        revealTermPageContent(term.id, revealToken);
        refitTermPageScrollImage(currentLayout);
        if (currentLayout) {
          applyViewportTermScrollBounds(currentLayout.viewportHeight);
        }
      }
    );
  }

  if (currentLayout) {
    applyViewportTermScrollBounds(currentLayout.viewportHeight);
  }
}

/**
 * Re-fit the fold-2 inline image after the page settles. The pinned-header
 * geometry isn't ready during the first layout pass, so the image is sized
 * conservatively (too small) then. Once the title font has settled and the pin
 * threshold is accurate, re-run the layout so the image grows to fill the fold.
 * Runs while the reader is still on the title view, so the resize is unseen.
 */
function refitTermPageScrollImage(layout = currentLayout) {
  if (!layout || !isTermPageScrollContentMode()) return;
  if (!termPageEl || termPageEl.hidden || !termPageEl.classList.contains("is-scroll-content")) {
    return;
  }
  const term = groups[focusState?.activeIndex]?.terms[focusState?.clickedIndex];
  if (!term) return;
  layoutTermPageScrollContent(layout, term, false, { skipAsyncReveal: true });
}

function getTermPageScrollContentBottomPx() {
  if (!termPageEl || termPageEl.hidden || !termPageEl.classList.contains("is-scroll-content")) {
    return 0;
  }
  let bottom = termPageEl.offsetTop + termPageEl.offsetHeight;
  if (termMetaEl && !termMetaEl.hidden) {
    bottom = Math.max(bottom, termMetaEl.offsetTop + termMetaEl.offsetHeight);
  }
  return bottom + LAYOUT.termPageBottomMargin;
}

function updateTermPageImages(term, viewportWidth, pageSpan, detailsTop, rebuild = true) {
  if (!termImagesEl) return 0;
  const imagesSpan = getGridSpanBounds(
    LAYOUT.termPageImagesColumns,
    LAYOUT.termPageImagesColumnFromRight,
    viewport
  );

  if (rebuild) {
    let images = getTermImagesForDisplay(term.name);
    if (termPageBleedImage?.url) {
      const bleedUrl = resolveTermImageUrl(termPageBleedImage.url);
      images = [
        termPageBleedImage,
        ...images.filter(
          (img) => !img?.url || resolveTermImageUrl(img.url) !== bleedUrl
        ),
      ];
    }
    const slots = Array.from(
      { length: LAYOUT.termPageImageCount },
      (_, i) => images[i] || null
    );
    termImagesEl.innerHTML = slots
      .map((image, i) => renderTermPageImageSlot(image, i))
      .join("");
  }

  termImagesEl.style.top = `${detailsTop}px`;
  termImagesEl.style.left = `${imagesSpan.left - pageSpan.left}px`;
  termImagesEl.style.width = `${imagesSpan.width}px`;
  applyTermPageImageCaptionWidths(imagesSpan);
  termImagesEl.hidden = false;
  return termImagesEl.offsetHeight;
}

function updateTermPageSide(sideEl, textEl, text, sideSpan, pageSpan, term) {
  if (!sideEl || !textEl) return false;
  const trimmed = text?.trim() || "";
  if (!trimmed) {
    textEl.innerHTML = "";
    sideEl.style.left = "";
    sideEl.style.width = "";
    sideEl.hidden = true;
    return false;
  }
  setAnnotatedTermText(textEl, trimmed, term);
  positionTermPageSide(sideEl, sideSpan, pageSpan);
  sideEl.hidden = false;
  return true;
}

function resetTermMetaRow(rowEl) {
  if (!rowEl) return;
  const headingEl = rowEl.querySelector(".sun-term-meta__heading");
  const valueEl = rowEl.querySelector(".sun-term-meta__value");
  rowEl.hidden = true;
  rowEl.style.height = "";
  if (valueEl) {
    valueEl.innerHTML = "";
    valueEl.style.left = "";
    valueEl.style.width = "";
    delete valueEl.dataset.metaFilterKey;
    delete valueEl.dataset.metaFilterValue;
  }
  if (headingEl) {
    headingEl.style.left = "";
    headingEl.style.width = "";
  }
}

function updateTermMetaRow(
  rowEl,
  value,
  term,
  filterKey = "",
  columnConfig = null,
  { layoutOnly = false } = {}
) {
  if (!rowEl) return;
  const headingEl = rowEl.querySelector(".sun-term-meta__heading");
  const valueEl = rowEl.querySelector(".sun-term-meta__value");
  if (!headingEl || !valueEl) return;

  const trimmed = value?.trim() || "";
  const filterValue = filterKey ? getMetaFilterValue(term, filterKey) : "";
  const headingSpan = columnConfig
    ? getGridSpanBounds(
        columnConfig.headingColumns,
        columnConfig.headingColumnFromRight,
        viewport
      )
    : getGridSpanFromLeft(
        LAYOUT.termMetaHeadingColumns,
        LAYOUT.termMetaHeadingColumnFromLeft,
        viewport
      );
  const valueSpan = columnConfig
    ? getGridSpanBounds(
        columnConfig.valueColumns,
        columnConfig.valueColumnFromRight,
        viewport
      )
    : getGridSpanFromLeft(
        LAYOUT.termMetaValueColumns,
        LAYOUT.termMetaValueColumnFromLeft,
        viewport
      );

  if (!layoutOnly) {
    if (trimmed && term) {
      if (filterKey === "framing" && term.framingTags?.length) {
        valueEl.innerHTML = renderMetaFramingTags(term.framingTags);
      } else {
        setAnnotatedTermText(valueEl, trimmed, term, { ensurePeriod: false });
      }
    } else {
      valueEl.innerHTML = "";
    }
    if (filterKey) {
      valueEl.dataset.metaFilterKey = filterKey;
      if (filterKey === "framing") {
        delete valueEl.dataset.metaFilterValue;
      } else if (filterValue) {
        valueEl.dataset.metaFilterValue = filterValue;
      } else {
        delete valueEl.dataset.metaFilterValue;
      }
    } else {
      delete valueEl.dataset.metaFilterKey;
      delete valueEl.dataset.metaFilterValue;
    }
  }

  headingEl.style.left = `${headingSpan.left}px`;
  headingEl.style.width = `${headingSpan.width}px`;
  valueEl.style.left = `${valueSpan.left}px`;
  valueEl.style.width = `${valueSpan.width}px`;

  const hasContent =
    Boolean(trimmed) ||
    (filterKey === "framing" && term?.framingTags?.length);
  if (!hasContent) {
    rowEl.hidden = true;
    rowEl.style.height = "";
    return;
  }

  rowEl.hidden = false;
  rowEl.style.height = `${Math.max(headingEl.offsetHeight, valueEl.offsetHeight)}px`;
}

function isTermPageFocusVisual() {
  if (TERM_PAGE_LEGACY_CONTENT_ENABLED || !focusState) return false;
  return focusState.phase === "animating" || focusState.phase === "locked";
}

function stopTermPageLayoutAnimation() {
  if (termPageLayoutAnimFrame != null) {
    cancelAnimationFrame(termPageLayoutAnimFrame);
    termPageLayoutAnimFrame = null;
  }
  termPageLayoutAnimActive = false;
  termPageLayoutAnimOnComplete = null;
}

function clearTermFontScrambleOverlay() {
  abortFontScrambleTransition(termFontOverlayTermEl);
  termFontOverlayBaselineY = null;
  termFontOverlayFrozenTop = null;
  if (termFontOverlayEl) {
    termFontOverlayEl.hidden = true;
    termFontOverlayEl.setAttribute("aria-hidden", "true");
    termFontOverlayEl.style.left = "";
    termFontOverlayEl.style.top = "";
    termFontOverlayEl.style.width = "";
    termFontOverlayEl.style.height = "";
  }
  viewport?.classList.remove("is-term-font-scrambling");
}

function clearTermSimilarLabelScrambleTimer() {
  if (termSimilarLabelScrambleTimer != null) {
    clearTimeout(termSimilarLabelScrambleTimer);
    termSimilarLabelScrambleTimer = null;
  }
}

function clearTermFontScrambleAnimation() {
  stopTermPageLayoutAnimation();
  clearTermSimilarLabelScrambleTimer();
  termPageLayoutReverse = false;
  termPageLayoutAnimCensorOnly = false;
  termPageCensoredPushTarget = null;
  termPageCensoredPushProgress = 0;
  termPageCensoredPushSecoloStartMs = 0;
  termPageCensoredFrozenScreenAlign = null;
  termPageFrozenSecoloBaselineScreenY = null;
  termPageCensoredPreserveBarsAfterHandoff = false;
  if (isTermPageFocusVisual()) {
    resetTermPageCensoredRowTransforms();
  }
  clearTermFontScrambleOverlay();
}

/** Smooth 0→1 with zero velocity at both ends — avoids a jerk when push resumes after a hold. */
function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Push runs during the Secolo phase — starts when scramble switches to Secolo. */
function getTermPageCensoredPushProgress(
  elapsedMs,
  fontScrambleDurationMs,
  secoloStartMs = termPageCensoredPushSecoloStartMs
) {
  const pushElapsed = Math.max(0, elapsedMs - secoloStartMs);
  const secoloPhaseMs = Math.max(0, fontScrambleDurationMs - secoloStartMs);
  const capMs =
    secoloPhaseMs > 0
      ? Math.min(LAYOUT.termPageCensoredPushMs, secoloPhaseMs)
      : LAYOUT.termPageCensoredPushMs;
  const linearT = capMs > 0 ? Math.min(1, pushElapsed / capMs) : 1;
  return smoothstep01(linearT);
}

/** Gap from Secolo Z to censored-row right edge; slack fades out so the final frame matches settle. */
function getTermPageCensoredPushGap(progress) {
  const slack = LAYOUT.termPageCensoredPushSlack ?? 0;
  const t = Math.max(0, Math.min(1, progress));
  return LAYOUT.termPageCensoredRightFromZ + slack * (1 - t);
}

function captureTermPageCensoredPushTarget(text) {
  termPageCensoredPushTarget = null;
  setFontScrambleScale(getMapTypographyScale());
  const rayGroup = getFocusRayGroup();
  if (!rayGroup || !termFontOverlayTermEl || !termFontOverlayEl) return;

  const wasHidden = termFontOverlayEl.hidden;
  const prevVisibility = termFontOverlayEl.style.visibility;
  termFontOverlayBaselineY = getSelectedTermBaselineScreenPoint()?.y ?? null;
  termFontOverlayEl.hidden = false;
  termFontOverlayEl.style.visibility = "hidden";

  mountFontScrambleTerm(termFontOverlayTermEl, text, "roobert");
  syncTermFontOverlayPosition();
  const startZ = termFontOverlayTermEl.getBoundingClientRect().left;

  mountFontScrambleTerm(termFontOverlayTermEl, text, "secolo");
  syncTermFontOverlayPosition();
  const targetZ = termFontOverlayTermEl.getBoundingClientRect().left;

  mountFontScrambleTerm(termFontOverlayTermEl, text, "roobert", { scrambling: true });
  syncTermFontOverlayPosition();

  if (wasHidden) {
    termFontOverlayEl.hidden = true;
    termFontOverlayEl.setAttribute("aria-hidden", "true");
  }
  termFontOverlayEl.style.visibility = prevVisibility;
  termFontOverlayBaselineY = null;

  // Stable settled-title ink-left, captured once so the push lands exactly where
  // the handoff will (no overlap during the push, no snap at the end).
  const settledZ = measureSettledSecoloTitleScreenZ(rayGroup);

  const censored = withCensoredWrapTransformsSuspended(rayGroup, () =>
    getCensoredTermsScreenRight(rayGroup)
  );
  if (!censored) {
    termPageCensoredLayoutRef = null;
    termPageCensoredScrollRef = null;
    termPageCensoredPushTarget = {
      startZ,
      targetZ,
      settledZ,
      initialCensoredMaxX: null,
      refScreenY: 0,
    };
    return;
  }

  captureTermPageCensoredLayoutRef(rayGroup);

  termPageCensoredPushTarget = {
    startZ,
    targetZ,
    settledZ,
    initialCensoredMaxX: censored.maxX,
    refScreenY: censored.refScreenY,
  };
}

function applyTermPageCensoredPushFromTarget(
  target,
  progress = termPageCensoredPushProgress
) {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup || !target) return;

  const t = Math.max(0, Math.min(1, progress));

  // Roobert phase — keep censored siblings frozen; push only during Secolo.
  if (t <= 0) {
    termPageScreenZ = null;
    applyTermPageCensoredRayOffset(0, 0);
    return;
  }

  let clearanceZ = target.startZ;
  const overlayTerm = termFontOverlayTermEl;
  const liveZ =
    overlayTerm && !termFontOverlayEl?.hidden
      ? overlayTerm.getBoundingClientRect().left
      : NaN;
  // The overlay's box-left (glyph cells) and the settled SVG title's ink-left
  // differ by the per-glyph side bearings — a gap that scales with the title
  // size. Z is taken from the overlay during the push but snaps to the SVG
  // ink-left at the handoff, so without correcting toward the settled Z the
  // censored row and "similar terms" label jump at the end (worse on wide
  // screens). Ramp the ink correction in by `t` so the push lands exactly where
  // the handoff will, with no final jump.
  //
  // Use the *captured* settled Z (measured once at full title size). Reading it
  // live here is wrong: during the push the SVG title is still drawn at the
  // small home size, so its ink-left sits far to the right of the final big
  // title — which would shove the censored row into the title (overlap) and
  // snap back at handoff.
  const settledZ = target.settledZ ?? getSecoloTitleScreenZ(rayGroup, getSelectedTermTextEl());
  if (Number.isFinite(liveZ)) {
    // Ramp from the frozen Roobert Z toward the live overlay as Secolo grows in.
    clearanceZ = target.startZ + (liveZ - target.startZ) * t;
    if (Number.isFinite(settledZ) && Number.isFinite(target.targetZ)) {
      clearanceZ += (settledZ - target.targetZ) * t;
    }
  } else if (Number.isFinite(settledZ)) {
    clearanceZ = target.startZ + (settledZ - target.startZ) * t;
  } else {
    clearanceZ = target.startZ + (target.targetZ - target.startZ) * t;
  }

  termPageScreenZ = clearanceZ;

  if (target.initialCensoredMaxX == null) {
    applyTermPageCensoredRayOffset(0, 0);
    return;
  }

  const gap = getTermPageCensoredPushGap(t);
  // Ease the row offset from *zero* straight to its final resting edge. Two
  // properties fall out of this:
  //   • At the Secolo handoff (t→0) the offset is 0, continuous with the frozen
  //     Roobert phase — so the row only ever pushes, it never jumps.
  //   • It aims at the final left position from the start, so it leads the
  //     leftward-growing title instead of chasing the still-small title edge
  //     (which would lag and let the bars slide into the title).
  // The big title grows left far faster than this ease, so the row always stays
  // clear of it without needing a hard clamp (a clamp would reintroduce a jump
  // the instant the push begins).
  const finalTargetRight = Number.isFinite(target.settledZ)
    ? target.settledZ - LAYOUT.termPageCensoredRightFromZ
    : clearanceZ - gap;
  const screenDeltaX = (finalTargetRight - target.initialCensoredMaxX) * t;
  applyTermPageCensoredRayOffset(screenDeltaX, 0);
  if (t >= 0.999) {
    freezeTermPageCensoredScreenAlign(screenDeltaX, 0);
  }
}

function freezeTermPageCensoredScreenAlign(screenDx, screenDy) {
  termPageCensoredFrozenScreenAlign = {
    dx: Math.abs(screenDx) < 0.25 ? 0 : screenDx,
    dy: Math.abs(screenDy) < 0.25 ? 0 : screenDy,
  };
}

function applyFrozenTermPageCensoredScreenAlign() {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup || termPageScreenZ == null) return false;

  if (!termPageCensoredLayoutRef) {
    captureTermPageCensoredLayoutRef(rayGroup, termPageScreenZ);
  }

  if (termPageCensoredFrozenScreenAlign) {
    applyTermPageCensoredRayOffset(
      termPageCensoredFrozenScreenAlign.dx,
      termPageCensoredFrozenScreenAlign.dy
    );
    return true;
  }

  const censored = withCensoredWrapTransformsSuspended(rayGroup, () =>
    getCensoredTermsScreenRight(rayGroup)
  );
  if (!censored) return false;

  applyTermPageCensoredBaselineAlign(rayGroup);
  return true;
}

function getSecoloTitleBaselineScreenY(rayGroup) {
  return getSettledSecoloBaselineScreenY(rayGroup);
}

/** Secolo ink baseline from settled SVG bounds — matches overlay mount math. */
function getSettledSecoloBaselineScreenY(rayGroup) {
  const textEl = getSelectedTermTextEl();
  if (!rayGroup || !textEl) return null;
  // The title glyphs carry a title-only downward nudge; strip it so the censored
  // sibling bars keep resting on the shared (un-nudged) baseline.
  const nudge = getSecoloTitleNudgePx();
  const glyphBaseline = getRenderedTermBaselineScreenY(rayGroup, textEl);
  if (glyphBaseline != null) return glyphBaseline - nudge;
  const bounds = getTermTextScreenBounds(rayGroup, textEl);
  if (!bounds) return null;
  return bounds.maxY - getFontScrambleBaselineInset() - nudge;
}

function shouldUseSvgSecoloBaseline() {
  return (
    Boolean(getSelectedTermWrap()?.classList.contains("is-display-font")) &&
    Boolean(termFontOverlayEl?.hidden)
  );
}

/**
 * True ink baseline (screen Y) of the selected term, derived deterministically
 * from the ray anchor. While the focus row rises into the term page the term is
 * drawn with `dominant-baseline:middle`, so its visible baseline sits
 * `middle→alphabetic` below the y=0 anchor. Computing it via the anchor (instead
 * of `getStartPositionOfChar`, which is browser-inconsistent for middle text)
 * lets the sibling censor bars rest on the same line throughout the rise.
 */
function getSelectedTermInkBaselineScreenY(rayGroup = getFocusRayGroup()) {
  const textEl = getSelectedTermTextEl();
  if (!rayGroup || !textEl) return null;
  const x = parseFloat(textEl.getAttribute("x"));
  if (!Number.isFinite(x)) return null;
  const offset = usesTermPageAlphabeticBaseline()
    ? 0
    : getTermMiddleToAlphabeticAnchorOffset(getTermFontSize(textEl));
  return rayLocalPointToViewport(rayGroup, x, offset)?.y ?? null;
}

/** Entering a term page: rise in progress, before the font-scramble overlay shows. */
function isTermPageEnterRisePhase() {
  return (
    focusState?.phase === "animating" &&
    !termPageSelectedFontSettled &&
    Boolean(termFontOverlayEl?.hidden) &&
    Boolean(viewport?.classList.contains("is-term-enter-censor"))
  );
}

function getLiveSecoloBaselineScreenY(rayGroup) {
  if (
    termPageSelectedFontSettled &&
    termPageFrozenSecoloBaselineScreenY != null &&
    !termPageSimilarLabelAnchorStale
  ) {
    return termPageFrozenSecoloBaselineScreenY;
  }
  if (isTermPageEnterRisePhase()) {
    const ink = getSelectedTermInkBaselineScreenY(rayGroup);
    if (ink != null) return ink;
  }
  if (!shouldUseSvgSecoloBaseline()) {
    const overlayTerm = termFontOverlayTermEl;
    if (!termFontOverlayEl?.hidden && overlayTerm) {
      const overlayBaseline = getMountedTermScreenBaselineY(overlayTerm);
      // The overlay sits at the nudged title baseline; strip the title-only nudge
      // so sibling bars stay on the shared line during the scramble.
      if (overlayBaseline != null) return overlayBaseline - getSecoloTitleNudgePx();
    }
  }
  return getSettledSecoloBaselineScreenY(rayGroup);
}

/** Screen Y of each sibling censor bar bottom (includes wrap transforms). */
function captureCensoredBarScreenBottoms(rayGroup = getFocusRayGroup()) {
  /** @type {Map<Element, number>} */
  const bottoms = new Map();
  if (!rayGroup) return bottoms;
  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap:not(.is-selected)")) {
    const censorEl = wrap.querySelector(".sun-term-censor");
    if (!censorEl) continue;
    const rect = censorEl.getBoundingClientRect();
    if (rect.height > 0.5) bottoms.set(wrap, rect.bottom);
  }
  return bottoms;
}

function restoreCensoredBarScreenBottoms(rayGroup, preservedBottoms) {
  if (!rayGroup || !preservedBottoms?.size) return;
  for (const [wrap, targetBottom] of preservedBottoms) {
    const censorEl = wrap.querySelector(".sun-term-censor");
    const textEl = wrap.querySelector(".sun-term");
    if (!censorEl || !textEl) continue;
    const currentBottom = censorEl.getBoundingClientRect().bottom;
    const screenDelta = targetBottom - currentBottom;
    if (Math.abs(screenDelta) < 0.25) continue;
    const x = parseFloat(textEl.getAttribute("x"));
    if (!Number.isFinite(x)) continue;
    const anchor = rayLocalPointToViewport(rayGroup, x, 0);
    if (!anchor) continue;
    const localNudge = viewportScreenPointDeltaToRayLocalDelta(
      rayGroup,
      anchor.x,
      anchor.y,
      0,
      screenDelta
    ).dy;
    const barY = parseFloat(censorEl.getAttribute("y"));
    if (!Number.isFinite(barY)) continue;
    censorEl.setAttribute("y", barY + localNudge);
    const textY = parseFloat(textEl.getAttribute("y"));
    if (Number.isFinite(textY)) {
      textEl.setAttribute("y", textY + localNudge);
    }
  }
}

function getTermCensorBaselineBarY(
  textEl,
  barHeight,
  rayGroup = getFocusRayGroup(),
  screenYOverride = null
) {
  const screenY =
    screenYOverride != null
      ? screenYOverride
      : getLiveSecoloBaselineScreenY(rayGroup);
  if (screenY == null || !rayGroup || !textEl) return null;
  const x = parseFloat(textEl.getAttribute("x"));
  if (!Number.isFinite(x)) return null;
  const anchor = rayLocalPointToViewport(rayGroup, x, 0);
  if (!anchor) return null;
  const baselineLocalY = viewportScreenPointDeltaToRayLocalDelta(
    rayGroup,
    anchor.x,
    anchor.y,
    0,
    screenY - anchor.y
  ).dy;
  return baselineLocalY - barHeight;
}

/** Apply settled SVG Secolo while preserving censored-row screen position from animation. */
function handoffSettledTermPageCensoredRow() {
  const rayGroup = getFocusRayGroup();
  const textEl = getSelectedTermTextEl();
  const wrap = getSelectedTermWrap();
  if (!rayGroup || !textEl) return null;

  const preservedBarBottoms = captureCensoredBarScreenBottoms(rayGroup);
  const preservedFrozenAlign = termPageCensoredFrozenScreenAlign
    ? { ...termPageCensoredFrozenScreenAlign }
    : null;
  const preservedScreenZ = termPageScreenZ;
  const frozenBaseline = getLiveSecoloBaselineScreenY(rayGroup);
  if (frozenBaseline != null) {
    termPageFrozenSecoloBaselineScreenY = frozenBaseline;
  }

  applySelectedTermDisplayFont(textEl);
  updateTermHitArea(
    textEl,
    wrap?.querySelector(".sun-term-hit"),
    wrap?.querySelector(".sun-term-censor")
  );
  snapOverlayToSettledSvgBaseline();

  const settledZ = getSecoloTitleScreenZ(rayGroup, textEl);
  if (settledZ == null) return preservedScreenZ;

  termPageScreenZ = settledZ;

  const zDrifted =
    preservedScreenZ == null || Math.abs(settledZ - preservedScreenZ) >= 0.5;

  if (zDrifted) {
    termPageCensoredLayoutRef = null;
    captureTermPageCensoredLayoutRef(rayGroup, settledZ);
    const screenDeltaX = resolveCensoredAlignScreenDeltaX(rayGroup, null);
    applyTermPageCensoredRayOffset(screenDeltaX, 0);
    freezeTermPageCensoredScreenAlign(screenDeltaX, 0);
  } else if (preservedFrozenAlign) {
    termPageCensoredFrozenScreenAlign = preservedFrozenAlign;
    applyFrozenTermPageCensoredScreenAlign();
  }

  restoreCensoredBarScreenBottoms(rayGroup, preservedBarBottoms);
  termPageCensoredPreserveBarsAfterHandoff = true;
  return settledZ;
}

/** Bottom edge of censored bars — alignment reference before row transforms. */
function getCensoredRowAlignReferenceScreenY(rayGroup) {
  if (!rayGroup) return null;
  return withCensoredWrapTransformsSuspended(rayGroup, () => {
    let maxBottom = -Infinity;
    for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap:not(.is-selected)")) {
      const censorEl = wrap.querySelector(".sun-term-censor");
      if (!censorEl) continue;
      const rect = censorEl.getBoundingClientRect();
      if (rect.height > 0.5) maxBottom = Math.max(maxBottom, rect.bottom);
    }
    return Number.isFinite(maxBottom) ? maxBottom : null;
  });
}

function resolveCensoredAlignScreenDeltaY() {
  // Vertical alignment lives in per-sibling censor barY, not wrap transforms.
  return 0;
}

function applyTermPageCensoredBaselineAlign(
  rayGroup = getFocusRayGroup(),
  { refreshBars = true } = {}
) {
  if (!rayGroup || termPageScreenZ == null || !isTermPageFocusVisual()) return;

  if (refreshBars) refreshTermPageSiblingCensorBars();

  const screenDeltaX = resolveCensoredAlignScreenDeltaX(rayGroup, null);
  const screenDeltaY = resolveCensoredAlignScreenDeltaY(rayGroup);
  applyTermPageCensoredRayOffset(screenDeltaX, screenDeltaY);
  freezeTermPageCensoredScreenAlign(screenDeltaX, screenDeltaY);
}

/** Recompute censored-row alignment after the focus ray anchor or scroll lift changes. */
function realignTermPageCensoredRowAfterRayAnchor({ refreshBars = false } = {}) {
  if (
    !termPageSelectedFontSettled ||
    termPageScreenZ == null ||
    !isTermPageFocusVisual() ||
    viewport?.classList.contains("is-term-font-scrambling")
  ) {
    return;
  }
  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return;
  termPageCensoredLayoutRef = null;
  termPageCensoredFrozenScreenAlign = null;
  clearTermPageCensoredWrapState();
  applyTermPageCensoredBaselineAlign(rayGroup, { refreshBars });
}

function getTermPageSimilarLabelNaturalTopPx(labelHeight) {
  const rayGroup = getFocusRayGroup();
  const baselineY = getLiveSecoloBaselineScreenY(rayGroup);
  if (baselineY == null) return null;

  const barHeight = getTermCensorBarHeight(
    LAYOUT.fontSize * getMapTypographyScale(),
    false
  );
  return baselineY - barHeight - LAYOUT.termPageSimilarLabelGap - labelHeight;
}

function finalizeTermPageCensoredAlignment(overrideZ) {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup || !isTermPageFocusVisual()) return;

  termPageCensoredFrozenScreenAlign = null;
  alignCensoredTermsToSecoloZ(overrideZ);

  const Z = termPageScreenZ;
  if (Z == null) return;

  termPageDeferCensoredWrapRepack = true;
  applyTermPageCensoredBaselineAlign(rayGroup);
  termPageDeferCensoredWrapRepack = false;
}

function getSelectedTermBaselineScreenPoint() {
  const rayGroup = getFocusRayGroup();
  const textEl = getSelectedTermTextEl();
  if (!rayGroup || !textEl) return null;
  const x = parseFloat(textEl.getAttribute("x"));
  if (!Number.isFinite(x)) return null;
  return rayLocalPointToViewport(rayGroup, x, getSecoloTitleNudgePx());
}

/**
 * Title-only downward nudge (Secolo glyphs), in ray-local units (≈screen px).
 * Zero during the rise / Roobert phase; ramps in across the Roobert→Secolo
 * transition (tracking the Secolo push progress) and holds full once settled.
 */
function getSecoloTitleNudgePx() {
  const full = LAYOUT.termPageSecoloTitleNudgePx || 0;
  if (!full) return 0;
  if (termPageSelectedFontSettled) return full;
  if (isTermFontScrambleSecoloPhase()) {
    return full * clamp(termPageCensoredPushProgress, 0, 1);
  }
  return 0;
}

/** SVG glyph baseline — can differ by a few px from the y=0 anchor. */
function getRenderedTermBaselineScreenY(rayGroup, textEl) {
  const fallback = getSelectedTermBaselineScreenPoint()?.y ?? null;
  if (!rayGroup || !textEl?.getStartPositionOfChar) return fallback;
  try {
    const charCount = textEl.getNumberOfChars?.() ?? 0;
    if (!charCount) return fallback;
    const pos = textEl.getStartPositionOfChar(0);
    if (!pos) return fallback;
    const pt = rayLocalPointToViewport(rayGroup, pos.x, pos.y);
    return pt?.y ?? fallback;
  } catch {
    return fallback;
  }
}

function isTermFontScrambleSecoloPhase() {
  return termPageCensoredPushProgress > 0.001;
}

/**
 * CSS ascent (box-top -> alphabetic baseline) for a `line-height:1` inline box of
 * the given font/size, measured directly from the DOM. Canvas font metrics can
 * disagree with the browser's actual line-box layout by a few px; measuring the
 * real baseline via an empty `vertical-align:baseline` marker is exact. Cached per
 * family+size; cleared when web fonts finish loading.
 * @type {Map<string, number>}
 */
const overlayCssAscentCache = new Map();

function measureOverlayCssAscent(fontFamily, fontSizePx, fontWeight, fontVariation) {
  if (typeof document === "undefined" || !document.body) return null;
  const key = `${fontFamily}@${Math.round(fontSizePx)}`;
  const cached = overlayCssAscentCache.get(key);
  if (cached != null) return cached;

  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;" +
    "white-space:nowrap;display:inline-block;line-height:1;direction:rtl";
  probe.style.fontFamily = fontFamily;
  probe.style.fontSize = `${fontSizePx}px`;
  if (fontWeight) probe.style.fontWeight = fontWeight;
  if (fontVariation && fontVariation !== "normal")
    probe.style.fontVariationSettings = fontVariation;
  probe.textContent = "AgQjy";

  const marker = document.createElement("span");
  marker.style.cssText =
    "display:inline-block;width:0;height:0;vertical-align:baseline";
  probe.appendChild(marker);
  document.body.appendChild(probe);

  let ascent = NaN;
  try {
    const baseY = marker.getBoundingClientRect().bottom;
    const topY = probe.getBoundingClientRect().top;
    ascent = baseY - topY;
  } catch {
    ascent = NaN;
  }
  probe.remove();
  if (!Number.isFinite(ascent)) return null;
  overlayCssAscentCache.set(key, ascent);
  return ascent;
}

/**
 * True rendered alphabetic baseline (screen Y) of the mounted scramble overlay.
 * Each scramble cell is an `overflow:hidden` inline-block, so its box baseline is
 * not the glyph baseline — we derive the glyph baseline as cellTop + cssAscent for
 * the cell's actual font, averaged across cells (which share one baseline).
 */
function getOverlayTrueBaselineScreenY(overlayTermEl) {
  if (!overlayTermEl?.children?.length) return null;
  let sum = 0;
  let n = 0;
  for (const cell of overlayTermEl.children) {
    const rect = cell.getBoundingClientRect();
    if (rect.height < 0.5) continue;
    const cs = getComputedStyle(cell);
    const fs = parseFloat(cs.fontSize);
    if (!Number.isFinite(fs)) continue;
    const ascent = measureOverlayCssAscent(
      cs.fontFamily,
      fs,
      cs.fontWeight,
      cs.fontVariationSettings
    );
    if (ascent == null) continue;
    sum += rect.top + ascent;
    n++;
  }
  return n ? sum / n : null;
}

if (typeof document !== "undefined" && document.fonts?.ready) {
  document.fonts.ready.then(() => overlayCssAscentCache.clear());
}

function computeTermFontOverlayTop(rayGroup, textEl, overlayTermEl, { secoloInkBlend = 1 } = {}) {
  const baselinePt = getSelectedTermBaselineScreenPoint();
  if (!baselinePt) return null;

  const inSecoloPhase = isTermFontScrambleSecoloPhase();
  const baselineY = inSecoloPhase
    ? getRenderedTermBaselineScreenY(rayGroup, textEl)
    : baselinePt.y;
  if (!Number.isFinite(baselineY)) return null;

  const bounds = getTermTextScreenBounds(rayGroup, textEl);
  if (!bounds) return null;

  const anchorHeight = getFontScrambleAnchorHeight();
  const baselineInset = getFontScrambleBaselineInset();
  let top = baselineY + baselineInset - anchorHeight;

  const overlayBaseline = getMountedTermScreenBaselineY(overlayTermEl);
  if (overlayBaseline != null) {
    const drift = baselineY - overlayBaseline;
    if (Math.abs(drift) >= 0.1) top += drift;
  }

  const termRect = overlayTermEl.getBoundingClientRect();
  const topDrift = bounds.minY - termRect.top;
  if (Math.abs(topDrift) >= 0.1) {
    const inkBlend = inSecoloPhase ? secoloInkBlend : 1;
    top += topDrift * inkBlend;
  }

  return top;
}

function syncTermFontOverlayPosition({ releaseVerticalLock = false, secoloInkBlend = 1 } = {}) {
  if (!termFontOverlayEl || !termFontOverlayTermEl || termFontOverlayEl.hidden) return;

  const rayGroup = getFocusRayGroup();
  const textEl = getSelectedTermTextEl();
  if (!rayGroup || !textEl) return;

  if (releaseVerticalLock) {
    applySelectedTermDisplayFont(textEl);
  }

  const bounds = getTermTextScreenBounds(rayGroup, textEl);
  if (!bounds) return;

  const inSecoloPhase = isTermFontScrambleSecoloPhase();
  const anchorHeight = getFontScrambleAnchorHeight();
  const svgWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const overlayWidth = inSecoloPhase
    ? Math.max(svgWidth, termFontOverlayTermEl.offsetWidth || 0, 1)
    : svgWidth;

  termFontOverlayEl.style.left = `${bounds.maxX - overlayWidth}px`;
  termFontOverlayEl.style.width = `${overlayWidth}px`;
  termFontOverlayEl.style.height = `${anchorHeight}px`;

  const useFrozenTop =
    termFontOverlayFrozenTop != null && !releaseVerticalLock;

  let top = null;
  if (useFrozenTop) {
    top = termFontOverlayFrozenTop;
  } else if (termFontOverlayTermEl.childElementCount > 0) {
    top = computeTermFontOverlayTop(rayGroup, textEl, termFontOverlayTermEl, {
      secoloInkBlend,
    });
  } else {
    const baselinePt = getSelectedTermBaselineScreenPoint();
    if (baselinePt) {
      const baselineInset = getFontScrambleBaselineInset();
      top = baselinePt.y + baselineInset - anchorHeight;
    }
  }
  if (top == null) return;
  termFontOverlayEl.style.top = `${top}px`;

  // Lock the overlay's *actual* rendered baseline onto the SVG baseline. The
  // metric-based positioning above can leave the Secolo line box a few px off,
  // which only shows as a downward "settle" when the SVG takes over. Measuring
  // the real baseline from the DOM and nudging keeps the scramble and the
  // settled title on exactly the same line (no jitter — the measurement is
  // content-independent).
  if (!releaseVerticalLock && termFontOverlayTermEl.childElementCount > 0) {
    const targetBaseline = inSecoloPhase
      ? getRenderedTermBaselineScreenY(rayGroup, textEl)
      : getSelectedTermBaselineScreenPoint()?.y ?? null;
    const trueBaseline = getOverlayTrueBaselineScreenY(termFontOverlayTermEl);
    if (Number.isFinite(targetBaseline) && trueBaseline != null) {
      const correction = targetBaseline - trueBaseline;
      if (Math.abs(correction) >= 0.1) {
        top += correction;
        termFontOverlayEl.style.top = `${top}px`;
      }
    }
    termFontOverlayFrozenTop = top;
  }
}

/** Last-frame baseline snap — match overlay ink to settled SVG before handoff. */
function snapOverlayToSettledSvgBaseline() {
  if (!termFontOverlayEl || !termFontOverlayTermEl || termFontOverlayEl.hidden) return;
  const rayGroup = getFocusRayGroup();
  const textEl = getSelectedTermTextEl();
  if (!rayGroup || !textEl) return;

  const overlayBaseline = getMountedTermScreenBaselineY(termFontOverlayTermEl);
  const svgBaseline = getRenderedTermBaselineScreenY(rayGroup, textEl);
  if (overlayBaseline == null || svgBaseline == null) return;

  const delta = svgBaseline - overlayBaseline;
  if (Math.abs(delta) < 0.05) return;

  const top = parseFloat(termFontOverlayEl.style.top);
  if (!Number.isFinite(top)) return;
  termFontOverlayEl.style.top = `${top + delta}px`;
  termFontOverlayFrozenTop = top + delta;
}

function showTermFontScrambleOverlay() {
  if (!termFontOverlayEl || !termFontOverlayTermEl) return false;
  setFontScrambleScale(getMapTypographyScale());
  termFontOverlayFrozenTop = null;
  termFontOverlayTermEl.replaceChildren();
  termFontOverlayEl.hidden = false;
  termFontOverlayEl.removeAttribute("aria-hidden");
  syncTermFontOverlayPosition();
  const top = parseFloat(termFontOverlayEl.style.top);
  if (Number.isFinite(top)) termFontOverlayFrozenTop = top;
  viewport?.classList.add("is-term-font-scrambling");
  syncTermFontOverlayPosition();
  return true;
}

function updateCensoredAlignmentDuringFontScramble() {
  const target = termPageCensoredPushTarget;
  if (target) {
    applyTermPageCensoredPushFromTarget(target);
    return;
  }

  const rayGroup = getFocusRayGroup();
  const overlayTerm = termFontOverlayTermEl;
  if (!rayGroup || !overlayTerm || termFontOverlayEl?.hidden) return;

  const overlayRect = overlayTerm.getBoundingClientRect();
  const Z = overlayRect.left;
  if (!Number.isFinite(Z)) return;
  termPageScreenZ = Z;

  const ref = termPageCensoredLayoutRef;
  if (!ref) {
    applyTermPageCensoredRayOffset(0, 0);
    return;
  }

  const gap = getTermPageCensoredPushGap(termPageCensoredPushProgress);
  const targetRight = Z - gap;
  const screenDeltaX =
    (targetRight - ref.refScreenX) * termPageCensoredPushProgress;
  applyTermPageCensoredRayOffset(screenDeltaX, 0);
  if (termPageCensoredPushProgress >= 0.999) {
    freezeTermPageCensoredScreenAlign(screenDeltaX, 0);
  }
}

function tickTermPageLayoutAnimation(
  scrambleToken,
  startXs,
  endXs,
  startTime,
  durationMs,
  secoloStartMs
) {
  if (scrambleToken !== termPageFontScrambleToken || !termPageLayoutAnimActive) return;

  const elapsed = performance.now() - startTime;
  const rawProgress = getTermPageCensoredPushProgress(
    elapsed,
    durationMs,
    secoloStartMs
  );
  termPageCensoredPushProgress = termPageLayoutReverse ? 1 - rawProgress : rawProgress;
  const layoutT = termPageLayoutReverse ? rawProgress : termPageCensoredPushProgress;

  if (
    !termPageLayoutAnimCensorOnly &&
    focusState &&
    startXs?.length &&
    endXs?.length
  ) {
    for (let i = 0; i < startXs.length; i++) {
      if (startXs[i] == null || endXs[i] == null) continue;
      focusState.termEndXs[i] =
        startXs[i] + (endXs[i] - startXs[i]) * layoutT;
    }
    applyFocusTermPositionsToDom();
  }

  syncTermFontOverlayPosition();
  if (termPageCensoredPushProgress > 0.001 || isSiblingBaselineRampActive()) {
    refreshTermPageSiblingCensorBars();
  }
  updateCensoredAlignmentDuringFontScramble();
  if (currentLayout && !termPageLayoutAnimCensorOnly) {
    updateTermPageSimilarLabel(currentLayout);
  }

  if (rawProgress >= 1 && termPageLayoutAnimOnComplete) {
    const done = termPageLayoutAnimOnComplete;
    termPageLayoutAnimOnComplete = null;
    termPageLayoutAnimActive = false;
    termPageLayoutAnimFrame = null;
    done();
    return;
  }

  termPageLayoutAnimFrame = requestAnimationFrame(() =>
    tickTermPageLayoutAnimation(
      scrambleToken,
      startXs,
      endXs,
      startTime,
      durationMs,
      secoloStartMs
    )
  );
}

function startTermPageLayoutAnimation(
  scrambleToken,
  startXs,
  endXs,
  durationMs,
  secoloStartMs,
  options = {}
) {
  stopTermPageLayoutAnimation();
  if (!focusState) return;

  termPageLayoutReverse = Boolean(options.reverse);
  termPageLayoutAnimCensorOnly = Boolean(options.censorOnly);
  termPageLayoutAnimOnComplete = options.onComplete ?? null;
  termPageCensoredPushSecoloStartMs = secoloStartMs;
  termPageCensoredPushProgress = termPageLayoutReverse ? 1 : 0;
  termPageLayoutAnimActive = true;
  const startTime = performance.now();
  tickTermPageLayoutAnimation(
    scrambleToken,
    startXs,
    endXs,
    startTime,
    durationMs,
    secoloStartMs
  );
}

function computeTermPageLayoutTargets() {
  const group = groups[focusState?.activeIndex];
  if (!focusState || !group) return null;

  const selectedIndex = getFocusSelectedTermIndex();
  const widths = getFocusTermPageLayoutWidths();
  if (!widths) return null;

  return {
    endXs: computeTermPageEndXs(
      widths,
      focusState.outwardSign,
      selectedIndex,
      group.terms.length
    ),
  };
}

function measureTermDisplayWidth(termName) {
  const text = applyTypographyRules(termName);
  if (!termDisplayMeasureSvg) {
    termDisplayMeasureSvg = document.createElementNS(SVG_NS, "svg");
    termDisplayMeasureSvg.setAttribute("aria-hidden", "true");
    termDisplayMeasureSvg.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
    (svgEl ?? document.body).appendChild(termDisplayMeasureSvg);
  }
  const textEl = document.createElementNS(SVG_NS, "text");
  textEl.setAttribute("font-family", "Secolo, serif");
  const selectedFontSize = getTermPageSelectedFontSizePx();
  textEl.setAttribute("font-size", `${selectedFontSize}px`);
  textEl.setAttribute("dominant-baseline", "alphabetic");
  textEl.textContent = text;
  termDisplayMeasureSvg.appendChild(textEl);
  const width = textEl.getBBox().width;
  textEl.remove();
  if (width > 0.25) return width;
  return estimateTermWidth(termName) * (selectedFontSize / LAYOUT.fontSize);
}

function applyFocusTermPositionsToDom() {
  if (!focusState) return;
  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return;
  const selectedIndex = getFocusSelectedTermIndex();
  const overlayActive = !termFontOverlayEl?.hidden;
  const wraps = [...rayGroup.querySelectorAll(".sun-term-wrap")];
  for (let i = 0; i < wraps.length; i++) {
    const textEl = wraps[i].querySelector(".sun-term");
    if (!textEl || focusState.termEndXs[i] == null) continue;
    textEl.setAttribute("x", focusState.termEndXs[i]);
    textEl.setAttribute("text-anchor", focusState.textAnchor);
    if (overlayActive && i === selectedIndex) {
      textEl.setAttribute("y", String(getSecoloTitleNudgePx()));
      continue;
    }
    updateTermHitArea(
      textEl,
      wraps[i].querySelector(".sun-term-hit"),
      wraps[i].querySelector(".sun-term-censor"),
      {
        forceBaselineCensor:
          !wraps[i].classList.contains("is-selected") &&
          isTermPageSiblingCensorBaselineMode(textEl),
      }
    );
  }
}

function captureFocusTermPositionsFromDom() {
  if (!focusState) return;
  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return;
  const wraps = [...rayGroup.querySelectorAll(".sun-term-wrap")];
  for (let i = 0; i < wraps.length; i++) {
    const textEl = wraps[i].querySelector(".sun-term");
    const x = textEl?.getAttribute("x");
    if (!textEl || x == null) continue;
    const parsed = parseFloat(x);
    if (Number.isFinite(parsed)) focusState.termEndXs[i] = parsed;
  }
}

function clearFocusSiblingTermTransforms() {
  getFocusRayGroup()
    ?.querySelectorAll(".sun-term-wrap:not(.is-selected)")
    .forEach((wrap) => wrap.removeAttribute("transform"));
}

/** Drop stale per-sibling translate transforms before remeasuring censored-row layout. */
function resetTermPageCensoredRowTransforms() {
  clearFocusSiblingTermTransforms();
}

function clearTermPageSiblingFreeze() {
  termPageSiblingFrozenXs = null;
  termPageSiblingFrozenWidths = null;
  termPageSiblingLayoutApplied = false;
  termPageSiblingRepackedForSwitch = false;
  termPageScreenZ = null;
  termSimilarLabelRestTop = null;
  termSimilarLabelIsPinned = false;
  termPageSimilarLabelAnchorStale = true;
  termPageCensoredRayOffset = null;
  termPageCensoredLayoutRef = null;
  termPageCensoredScrollRef = null;
  termPageCensoredFrozenScreenAlign = null;
  termPageFrozenSecoloBaselineScreenY = null;
  clearTermPageCensoredWrapState();
}

function freezeTermPageSiblingLayout() {
  if (!focusState) return;
  const group = groups[focusState.activeIndex];
  if (!group) return;

  termPageSiblingFrozenXs = focusState.termEndXs.slice();
  termPageSiblingFrozenWidths = focusState.termWidths.slice();
  termPageSiblingLayoutApplied = false;

  const rayGroup = getFocusRayGroup();
  const selectedIndex = getFocusSelectedTermIndex();
  if (rayGroup) {
    const wraps = [...rayGroup.querySelectorAll(".sun-term-wrap")];
    wraps.forEach((wrap, index) => {
      if (index === selectedIndex) return;
      const measured = wrap.querySelector(".sun-term")?.getBBox().width ?? 0;
      if (measured > 0.25) termPageSiblingFrozenWidths[index] = measured;
    });
  }

}

function restoreFrozenTermPageSiblingXs() {
  if (!focusState || !termPageSiblingFrozenXs) return;
  const selectedIndex = getFocusSelectedTermIndex();
  for (let i = 0; i < termPageSiblingFrozenXs.length; i++) {
    if (i !== selectedIndex) {
      focusState.termEndXs[i] = termPageSiblingFrozenXs[i];
    }
  }
}

function getFocusTermPageLayoutWidths() {
  if (!focusState) return null;
  const group = groups[focusState.activeIndex];
  if (!group) return null;

  const selectedIndex = getFocusSelectedTermIndex();
  const selectedTerm = group.terms[selectedIndex];
  if (!selectedTerm) return null;

  const widths = termPageSiblingFrozenWidths?.length
    ? termPageSiblingFrozenWidths.slice()
    : focusState.termWidths?.length
      ? focusState.termWidths.slice()
      : group.terms.map((t) => estimateTermWidth(t.name));

  // Only the selected term grows to Secolo — sibling widths stay frozen Roobert sizes.
  const secoloMeasure = measureTermDisplayWidth(selectedTerm.name);
  if (termPageSelectedFontSettled) {
    const liveWidth = getSelectedTermTextEl()?.getBBox().width ?? 0;
    widths[selectedIndex] = Math.max(secoloMeasure, liveWidth);
  } else {
    widths[selectedIndex] = secoloMeasure;
  }

  return widths;
}

/**
 * Term-page positions: same edge-to-edge packing as layoutTermsOnRay / refineTermPositions.
 * Viewport Z alignment runs after render in alignCensoredTermsToSecoloZ.
 */
function getCensoredSiblingIndicesForSelected(selectedIndex, termCount) {
  const slots = getSlotsAtStep(getCarouselSteps(selectedIndex, termCount), termCount);
  return slots.slice(1);
}

function measureTermPageLayoutWidths() {
  const rayGroup = getFocusRayGroup();
  const group = groups[focusState?.activeIndex];
  if (!rayGroup || !group) return null;

  const widths = new Array(group.terms.length).fill(0);
  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap")) {
    const termIndex = Number.parseInt(wrap.dataset.termIndex ?? "", 10);
    if (!Number.isFinite(termIndex) || termIndex < 0) continue;
    const text = wrap.querySelector(".sun-term");
    const measured = text?.getBBox().width ?? 0;
    if (measured > 0.25) widths[termIndex] = measured;
  }
  if (widths.every((w) => w <= 0.25)) return null;
  return widths;
}

function getTermPageRoobertLayoutWidth(termIndex, widths, selectedIndex) {
  const selected = selectedIndex ?? getFocusSelectedTermIndex();

  if (termPageSiblingFrozenWidths?.[termIndex] > 0.25) {
    return termPageSiblingFrozenWidths[termIndex];
  }

  // Packing chain uses Roobert width — selected may display as Secolo.
  if (termIndex === selected) {
    const term = groups[focusState?.activeIndex]?.terms[termIndex];
    return term ? estimateTermWidth(term.name) : widths?.[termIndex] ?? 0;
  }

  const live = measureTermPageLayoutWidths();
  if (live?.[termIndex] > 0.25) return live[termIndex];
  if (widths?.[termIndex] > 0.25) return widths[termIndex];

  const term = groups[focusState?.activeIndex]?.terms[termIndex];
  return term ? estimateTermWidth(term.name) : 0;
}

function computeTermPageEndXs(widths, outwardSign, selectedIndex, termCount) {
  const termGap = focusState?.termGap ?? LAYOUT.termGap;
  const endXs = new Array(termCount).fill(null);
  endXs[selectedIndex] = 0;

  const siblings = getCensoredSiblingIndicesForSelected(selectedIndex, termCount);
  const selectedLayoutW = getTermPageRoobertLayoutWidth(
    selectedIndex,
    widths,
    selectedIndex
  );
  let dist = selectedLayoutW + termGap;

  for (const termIdx of siblings) {
    const w = getTermPageRoobertLayoutWidth(termIdx, widths, selectedIndex);
    endXs[termIdx] = outwardSign === 1 ? dist : -dist;
    dist += w + termGap;
  }

  return endXs;
}

/** Re-measure sibling widths and repack — mirrors refineTermPositions on the home row. */
function refineTermPagePositions() {
  if (
    !focusState ||
    focusState.phase !== "locked" ||
    TERM_PAGE_LEGACY_CONTENT_ENABLED ||
    termPageLayoutAnimActive ||
    viewport?.classList.contains("is-term-font-scrambling")
  ) {
    return;
  }
  if (!termPageSelectedFontSettled) return;

  const group = groups[focusState.activeIndex];
  if (!group || group.terms.length < 2) return;

  const selectedIndex = getFocusSelectedTermIndex();
  const widths = measureTermPageLayoutWidths();
  if (!widths) return;

  const layoutWidths = widths.map((_, index) =>
    getTermPageRoobertLayoutWidth(index, widths, selectedIndex)
  );
  const endXs = computeTermPageEndXs(
    layoutWidths,
    focusState.outwardSign,
    selectedIndex,
    group.terms.length
  );

  const changed = endXs.some(
    (x, i) => x != null && Math.abs((focusState.termEndXs[i] ?? 0) - x) > 0.35
  );
  if (!changed) return;

  focusState.termWidths = layoutWidths;
  focusState.termEndXs = endXs;
  termPageSiblingLayoutApplied = true;
  applyFocusTermPositionsToDom();
  refreshTermPageSiblingCensorBars();
}

/** On same-group switch: pack all title-row terms immediately so no gap remains at the clicked slot. */
function repackTermPageSiblingsForSwitch(newTermIndex) {
  if (!focusState) return;
  const group = groups[focusState.activeIndex];
  if (!group || group.terms.length < 2) return;

  const widths =
    measureTermPageLayoutWidths() ??
    (focusState.termWidths?.length === group.terms.length
      ? focusState.termWidths.slice()
      : measureTermWidths(focusState.activeIndex));
  if (!widths?.length) return;

  const endXs = computeTermPageEndXs(
    widths,
    focusState.outwardSign,
    newTermIndex,
    group.terms.length
  );

  focusState.termWidths = widths.map((_, index) =>
    getTermPageRoobertLayoutWidth(index, widths, newTermIndex)
  );
  focusState.termEndXs = endXs;

  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return;

  const wraps = [...rayGroup.querySelectorAll(".sun-term-wrap")];
  for (let i = 0; i < wraps.length; i++) {
    const textEl = wraps[i].querySelector(".sun-term");
    if (!textEl || endXs[i] == null) continue;
    textEl.setAttribute("x", endXs[i]);
    textEl.setAttribute("text-anchor", focusState.textAnchor);
    if (i === newTermIndex) continue;
    updateTermHitArea(
      textEl,
      wraps[i].querySelector(".sun-term-hit"),
      wraps[i].querySelector(".sun-term-censor"),
      {
        forceBaselineCensor:
          !wraps[i].classList.contains("is-selected") &&
          isTermPageSiblingCensorBaselineMode(textEl),
      }
    );
  }

  if (getLiveSecoloBaselineScreenY(rayGroup) != null) {
    refreshTermPageSiblingCensorBars();
  }
}

function applyFocusTermPageLayout() {
  if (
    !focusState ||
    focusState.phase !== "locked" ||
    TERM_PAGE_LEGACY_CONTENT_ENABLED
  ) {
    return;
  }

  const group = groups[focusState.activeIndex];
  if (!group) return;

  const selectedIndex = getFocusSelectedTermIndex();

  if (!termPageSelectedFontSettled && !termPageLayoutAnimActive) {
    restoreFrozenTermPageSiblingXs();
    return;
  }

  if (termPageSiblingLayoutApplied) return;

  const measured = measureTermPageLayoutWidths();
  const widths = measured
    ? measured.map((_, index) =>
        getTermPageRoobertLayoutWidth(index, measured, selectedIndex)
      )
    : getFocusTermPageLayoutWidths();
  if (!widths) return;

  focusState.termWidths = widths;
  focusState.termEndXs = computeTermPageEndXs(
    widths,
    focusState.outwardSign,
    selectedIndex,
    group.terms.length
  );
  termPageSiblingLayoutApplied = true;
  applyFocusTermPositionsToDom();
}

function repositionForDisplayFontWidth() {
  applyFocusTermPageLayout();
}

function hideTermPageChrome() {
  clearTermFontScrambleAnimation();
  stopLetterShuffle(getSelectedTermTextEl());
  termPageScreenZ = null;
  termSimilarLabelRestTop = null;
  termSimilarLabelIsPinned = false;
  termPageCensoredRayOffset = null;
  termPageCensoredLayoutRef = null;
  termPageCensoredScrollRef = null;
  clearTermPageCensoredWrapState();
  termPageBleedTermId = null;
  termPageBleedImage = null;
  termPageSelectedFontSettled = false;
  termSimilarLabelScrambleStarted = false;
  clearTermPageSiblingFreeze();
  termPageFontScrambleToken++;
  hideBleedBackdropFully();
  clearTermPageBleedCaption();
  clearPinnedSimilarGroupBackdrop();
  if (termSimilarLabelWrapEl) {
    termSimilarLabelWrapEl.hidden = true;
    termSimilarLabelWrapEl.setAttribute("aria-hidden", "true");
    termSimilarLabelWrapEl.classList.remove("is-term-header-pinned");
    termSimilarLabelWrapEl.style.removeProperty("transform");
    termSimilarLabelWrapEl.style.removeProperty("opacity");
  }
  if (termSimilarLabelEl) {
    termSimilarLabelEl.hidden = true;
    termSimilarLabelEl.setAttribute("aria-hidden", "true");
    termSimilarLabelEl.style.left = "";
    termSimilarLabelEl.style.top = "";
    termSimilarLabelEl.style.width = "";
    stopLetterShuffle(termSimilarLabelEl);
  }
}

function getFocusRayGroup() {
  if (!focusState || !svgEl) return null;
  return svgEl.querySelector(`[data-group="${focusState.activeIndex}"]`);
}

function getSelectedTermWrap() {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return null;
  const selectedIndex = getFocusSelectedTermIndex();
  if (selectedIndex < 0) return null;
  return rayGroup.querySelector(`.sun-term-wrap[data-term-index="${selectedIndex}"]`);
}

function getSelectedTermTextEl() {
  return getSelectedTermWrap()?.querySelector(".sun-term") ?? null;
}

function getRightmostCensoredTermWrap() {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return null;
  const wraps = [...rayGroup.querySelectorAll(".sun-term-wrap:not(.is-selected)")];
  if (!wraps.length) return null;
  let best = wraps[0];
  let bestScreenRight = -Infinity;
  for (const wrap of wraps) {
    const bounds = getTermCensorScreenBounds(wrap);
    const screenRight =
      bounds?.maxX ??
      wrap.querySelector(".sun-term")?.getBoundingClientRect().right ??
      -Infinity;
    if (screenRight > bestScreenRight) {
      bestScreenRight = screenRight;
      best = wrap;
    }
  }
  return best;
}

function rayLocalPointToViewport(rayGroup, localX, localY) {
  const svgPt = svgEl?.createSVGPoint();
  if (!svgPt || !rayGroup) return null;
  svgPt.x = localX;
  svgPt.y = localY;
  const ctm = rayGroup.getScreenCTM();
  if (!ctm) return null;
  const screen = svgPt.matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
}

/** Viewport bounds for SVG text bbox corners (standard screen X: left = min). */
function getTermTextScreenBounds(rayGroup, textEl) {
  if (!rayGroup || !textEl || !svgEl) return null;
  const bbox = textEl.getBBox();
  const ctm = textEl.getScreenCTM();
  if (!ctm) return null;
  const corners = [
    [bbox.x, bbox.y],
    [bbox.x + bbox.width, bbox.y],
    [bbox.x, bbox.y + bbox.height],
    [bbox.x + bbox.width, bbox.y + bbox.height],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [localX, localY] of corners) {
    const pt = svgEl.createSVGPoint();
    pt.x = localX;
    pt.y = localY;
    const screen = pt.matrixTransform(ctm);
    minX = Math.min(minX, screen.x);
    maxX = Math.max(maxX, screen.x);
    minY = Math.min(minY, screen.y);
    maxY = Math.max(maxY, screen.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

/** Lowest viewport Y across all censored sibling bars in the focus row. */
function getCensoredRowScreenTop() {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return null;
  let minY = Infinity;
  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap:not(.is-selected)")) {
    const bounds = getTermCensorScreenBounds(wrap);
    if (bounds) minY = Math.min(minY, bounds.minY);
  }
  return Number.isFinite(minY) ? minY : null;
}

/** Highest viewport Y across all censored sibling bars in the focus row. */
function getCensoredRowScreenBottom() {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return null;
  let maxY = -Infinity;
  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap:not(.is-selected)")) {
    const bounds = getTermCensorScreenBounds(wrap);
    if (bounds) maxY = Math.max(maxY, bounds.maxY);
  }
  return Number.isFinite(maxY) ? maxY : null;
}

/** Fixed backdrop band from viewport top (under nav) through pinned similar label + censored row (screen px). */
function getPinnedSimilarGroupBackdropBand(pinTop, labelHeight) {
  const labelBottom = pinTop + labelHeight;
  const censoredBottom = getCensoredRowScreenBottom();
  const bottom = Math.max(labelBottom, censoredBottom ?? labelBottom);
  const top = 0;
  return {
    top,
    height:
      Math.max(labelHeight, Math.ceil(bottom - top)) +
      LAYOUT.termPageHeaderBackdropBottomExtra,
  };
}

function clearPinnedSimilarGroupBackdrop() {
  if (!termHeaderBackdropEl) return;
  termHeaderBackdropEl.hidden = true;
  termHeaderBackdropEl.setAttribute("aria-hidden", "true");
  termHeaderBackdropEl.style.top = "";
  termHeaderBackdropEl.style.height = "";
  viewport?.style.removeProperty("--term-similar-label-pinned-top");
  viewport?.style.removeProperty("--term-similar-label-pinned-height");
}

function syncTermHeaderBackdrop(layout = currentLayout) {
  if (
    !termHeaderBackdropEl ||
    !viewport ||
    !isTermPageScrollBgMode() ||
    !isViewportTermScrollable()
  ) {
    clearPinnedSimilarGroupBackdrop();
    return;
  }

  const viewportHeight = layout?.viewportHeight ?? getLiveViewportHeight();
  const scrollTop = viewport.scrollTop ?? 0;
  const pinned = isTermCensoredGroupPinned(scrollTop, viewportHeight);
  if (!pinned) {
    clearPinnedSimilarGroupBackdrop();
    return;
  }

  const pinTop = getTermSimilarLabelPinTopPx(viewportHeight, scrollTop);
  const labelHeight = termSimilarLabelEl?.offsetHeight || 22;
  const band = getPinnedSimilarGroupBackdropBand(pinTop, labelHeight);
  const localTop = getScrollportLocalTopPx(band.top);
  const localHeight = Math.max(1, Math.ceil(band.height) + 4);

  termHeaderBackdropEl.hidden = false;
  termHeaderBackdropEl.setAttribute("aria-hidden", "true");
  termHeaderBackdropEl.style.top = `${Math.round(localTop)}px`;
  termHeaderBackdropEl.style.height = `${localHeight}px`;

  viewport.style.setProperty(
    "--term-similar-label-pinned-top",
    `${Math.round(localTop)}px`
  );
  viewport.style.setProperty(
    "--term-similar-label-pinned-height",
    `${localHeight}px`
  );
  viewport.style.setProperty(
    "--term-header-fixed-height",
    `${Math.round(localTop + localHeight)}px`
  );
}

/** @deprecated clip-path masked entire term-page; backdrop z-index handles band only */
function syncTermPageScrollClipForPinnedHeader() {}

/** Viewport bounds for the censored-term bar (falls back to text bbox). */
function getTermCensorScreenBounds(wrap) {
  if (!wrap) return null;
  const censorEl = wrap.querySelector(".sun-term-censor");
  if (censorEl) {
    const rect = censorEl.getBoundingClientRect();
    if (rect.height > 0.5) {
      return {
        minX: rect.left,
        maxX: rect.right,
        minY: rect.top,
        maxY: rect.bottom,
      };
    }
  }
  const textEl = wrap.querySelector(".sun-term");
  const rayGroup = getFocusRayGroup();
  return textEl && rayGroup ? getTermTextScreenBounds(rayGroup, textEl) : null;
}

/** Z — lowest viewport X on the Secolo title text bbox. */
function getSecoloTitleScreenZ(rayGroup, textEl) {
  return getTermTextScreenBounds(rayGroup, textEl)?.minX ?? null;
}

/**
 * Settled (full-size Secolo) ink-left of the selected title, measured even while
 * the SVG title is still drawn at the small home size behind the scramble
 * overlay. We temporarily apply the display font so the measurement reflects the
 * final handoff position, then revert. This runs synchronously (no paint), so it
 * never flickers. Used to capture a *stable* push offset instead of reading the
 * live (small) title every frame, which would shove the censored row toward the
 * title and snap back at handoff.
 */
function measureSettledSecoloTitleScreenZ(rayGroup, textEl = getSelectedTermTextEl()) {
  if (!rayGroup || !textEl) return null;
  const wrap = getSelectedTermWrap();
  const hadDisplayFont = wrap?.classList.contains("is-display-font") ?? false;
  if (!hadDisplayFont) applySelectedTermDisplayFont(textEl);
  const z = getSecoloTitleScreenZ(rayGroup, textEl);
  if (!hadDisplayFont) clearSelectedTermDisplayFont(textEl);
  return z;
}

function viewportScreenPointDeltaToRayLocalDelta(
  rayGroup,
  baseScreenX,
  baseScreenY,
  screenDeltaX,
  screenDeltaY
) {
  const inv = rayGroup.getScreenCTM()?.inverse();
  if (!inv || !svgEl) return { dx: 0, dy: 0 };
  const toLocal = (screenX, screenY) => {
    const pt = svgEl.createSVGPoint();
    pt.x = screenX;
    pt.y = screenY;
    return pt.matrixTransform(inv);
  };
  const localBase = toLocal(baseScreenX, baseScreenY);
  const localTarget = toLocal(baseScreenX + screenDeltaX, baseScreenY + screenDeltaY);
  return {
    dx: localTarget.x - localBase.x,
    dy: localTarget.y - localBase.y,
  };
}

function viewportScreenXDeltaToRayLocalDelta(
  rayGroup,
  screenY,
  screenDeltaX,
  refScreenX = 0
) {
  const inv = rayGroup.getScreenCTM()?.inverse();
  if (!inv || !svgEl) return null;
  const toLocal = (screenX) => {
    const pt = svgEl.createSVGPoint();
    pt.x = screenX;
    pt.y = screenY;
    return pt.matrixTransform(inv);
  };
  const localBase = toLocal(refScreenX);
  const localShifted = toLocal(refScreenX + screenDeltaX);
  return {
    dx: localShifted.x - localBase.x,
    dy: localShifted.y - localBase.y,
  };
}

function viewportScreenYDeltaToRayLocalDelta(
  rayGroup,
  screenY,
  screenDeltaY,
  refScreenX = 0
) {
  const inv = rayGroup.getScreenCTM()?.inverse();
  if (!inv || !svgEl) return null;
  const toLocal = (x, y) => {
    const pt = svgEl.createSVGPoint();
    pt.x = x;
    pt.y = y;
    return pt.matrixTransform(inv);
  };
  const localBase = toLocal(refScreenX, screenY);
  const localShifted = toLocal(refScreenX, screenY + screenDeltaY);
  return {
    dx: localShifted.x - localBase.x,
    dy: localShifted.y - localBase.y,
  };
}

function getCensoredRowScrollOnlyLocalOffset(
  scrollShiftY = termPageCensoredScrollShiftY
) {
  const ref = termPageCensoredLayoutRef;
  if (!ref) return { dx: 0, dy: 0 };
  const rise = Math.max(0, -scrollShiftY);
  // Per-pixel local delta for child-wrap transforms (post-pin selected lift).
  return {
    dx: ref.scrollLocalPerPx.dx * rise,
    dy: ref.scrollLocalPerPx.dy * rise,
  };
}

function getTermPagePostPinRisePx(
  scrollTop = viewport?.scrollTop ?? 0,
  viewportHeight = getLiveViewportHeight()
) {
  const rise = getTermPageScrollRisePx(scrollTop, viewportHeight);
  const scrollLift = getTermHeaderPinScrollLiftPx(scrollTop, viewportHeight);
  const pinned = isTermCensoredGroupPinned(scrollTop, viewportHeight);
  return pinned ? Math.max(0, rise - scrollLift) : 0;
}

function clearSelectedTermPostPinScroll() {
  getSelectedTermWrap()?.removeAttribute("transform");
}

/** Selected title no longer lifts separately — the whole row moves as one group. */
function applyTermPageSelectedScrollTransform() {
  clearSelectedTermPostPinScroll();
}

/** @deprecated use applyTermPageSelectedScrollTransform */
function applyTermPageSelectedPostPinScroll(postPinRisePx) {
  applyTermPageSelectedScrollTransform(postPinRisePx);
}

function getCensoredTermsScreenRight(rayGroup) {
  let censoredRight = -Infinity;
  let refScreenY = 0;
  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap:not(.is-selected)")) {
    const text = wrap.querySelector(".sun-term");
    if (!text) continue;
    const bounds = getTermTextScreenBounds(rayGroup, text);
    if (!bounds) continue;
    if (bounds.maxX > censoredRight) {
      censoredRight = bounds.maxX;
      refScreenY = (bounds.minY + bounds.maxY) / 2;
    }
  }
  if (!Number.isFinite(censoredRight)) return null;
  return { maxX: censoredRight, refScreenY };
}

function withCensoredWrapTransformsSuspended(rayGroup, fn) {
  const wraps = [...rayGroup.querySelectorAll(".sun-term-wrap:not(.is-selected)")];
  const saved = wraps.map((wrap) => wrap.getAttribute("transform"));
  wraps.forEach((wrap) => wrap.removeAttribute("transform"));
  try {
    return fn();
  } finally {
    wraps.forEach((wrap, index) => {
      const value = saved[index];
      if (value == null) wrap.removeAttribute("transform");
      else wrap.setAttribute("transform", value);
    });
  }
}

function captureTermPageCensoredLayoutRef(rayGroup, screenZ = termPageScreenZ) {
  if (!rayGroup) {
    termPageCensoredLayoutRef = null;
    termPageCensoredScrollRef = null;
    termPageCensoredRayOffset = null;
    return;
  }

  const layout = currentLayout;
  const baseTransform =
    layout && focusState ? getFocusRayGroupScrollTransform(layout) : null;
  const savedRayTransform = rayGroup.getAttribute("transform");
  const savedSvgTransform = svgEl?.style.transform ?? "";
  const liftGroup = rayGroup.querySelector(".sun-term-scroll-lift");
  const savedLiftTransform = liftGroup?.getAttribute("transform") ?? null;
  if (svgEl) svgEl.style.removeProperty("transform");
  if (liftGroup) liftGroup.removeAttribute("transform");
  if (
    baseTransform &&
    Number.isFinite(baseTransform.anchor?.x) &&
    Number.isFinite(baseTransform.anchor?.y) &&
    Number.isFinite(baseTransform.rotation)
  ) {
    rayGroup.setAttribute(
      "transform",
      `translate(${baseTransform.anchor.x}, ${baseTransform.anchor.y}) rotate(${baseTransform.rotation})`
    );
  }

  try {
    const censored = withCensoredWrapTransformsSuspended(rayGroup, () =>
      getCensoredTermsScreenRight(rayGroup)
    );
    if (!censored) {
      termPageCensoredLayoutRef = null;
      termPageCensoredScrollRef = null;
      termPageCensoredRayOffset = null;
      return;
    }

    const refScreenX = censored.maxX;
    const refScreenY = censored.refScreenY;
    let screenDeltaX = 0;
    if (screenZ != null) {
      const targetRight = screenZ - LAYOUT.termPageCensoredRightFromZ;
      screenDeltaX = targetRight - refScreenX;
    }

    const alignLocal =
      Math.abs(screenDeltaX) >= 0.25
        ? viewportScreenPointDeltaToRayLocalDelta(
            rayGroup,
            refScreenX,
            refScreenY,
            screenDeltaX,
            0
          )
        : { dx: 0, dy: 0 };
    const scrollLocalPerPx = viewportScreenPointDeltaToRayLocalDelta(
      rayGroup,
      refScreenX,
      refScreenY,
      0,
      -1
    );

    termPageCensoredLayoutRef = {
      refScreenX,
      refScreenY,
      alignLocal,
      scrollLocalPerPx,
    };
    termPageCensoredScrollRef = { refScreenY, refScreenX };
    termPageCensoredRayOffset = alignLocal;
  } finally {
    if (savedRayTransform == null) rayGroup.removeAttribute("transform");
    else rayGroup.setAttribute("transform", savedRayTransform);
    if (svgEl) {
      if (savedSvgTransform) svgEl.style.transform = savedSvgTransform;
      else svgEl.style.removeProperty("transform");
    }
    if (liftGroup) {
      if (savedLiftTransform == null) liftGroup.removeAttribute("transform");
      else liftGroup.setAttribute("transform", savedLiftTransform);
    }
  }
}

/** Screen Y anchor for layout-ref → local conversion; includes active scroll lift. */
function getCensoredLayoutRefScreenY() {
  const ref = termPageCensoredLayoutRef;
  if (!ref) return 0;
  const rise = Math.max(0, -termPageCensoredScrollShiftY);
  return ref.refScreenY + (rise > 0.01 ? termPageCensoredScrollShiftY : 0);
}

function getCensoredRowAlignLocalOffset(screenDx = 0, screenDy = 0) {
  const ref = termPageCensoredLayoutRef;
  if (!ref) return { dx: 0, dy: 0 };
  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return { dx: 0, dy: 0 };
  if (Math.abs(screenDx) < 0.01 && Math.abs(screenDy) < 0.01) {
    return { dx: 0, dy: 0 };
  }
  return viewportScreenPointDeltaToRayLocalDelta(
    rayGroup,
    ref.refScreenX,
    getCensoredLayoutRefScreenY(),
    screenDx,
    screenDy
  );
}

/** @deprecated scroll is applied on the ray group — use getCensoredRowAlignLocalOffset */
function getCensoredRowLocalOffset(
  scrollShiftY = termPageCensoredScrollShiftY,
  alignScreenDeltaX = null
) {
  const rayGroup = getFocusRayGroup();
  const screenDx =
    alignScreenDeltaX != null
      ? alignScreenDeltaX
      : rayGroup
        ? resolveCensoredAlignScreenDeltaX(rayGroup, null)
        : 0;
  return getCensoredRowAlignLocalOffset(screenDx, 0);
}

function alignCensoredTermsToSecoloZ(overrideZ) {
  if (
    !isTermPageFocusVisual() ||
    !termPageSelectedFontSettled ||
    viewport?.classList.contains("is-term-font-scrambling")
  ) {
    return;
  }

  const rayGroup = getFocusRayGroup();
  const selectedText = getSelectedTermTextEl();
  if (!rayGroup || !selectedText) return;

  const Z = Number.isFinite(overrideZ)
    ? overrideZ
    : getSecoloTitleScreenZ(rayGroup, selectedText);
  if (Z == null) return;

  if (
    termPageCensoredLayoutRef &&
    termPageScreenZ != null &&
    !Number.isFinite(overrideZ) &&
    Math.abs(termPageScreenZ - Z) < 0.5
  ) {
    return;
  }

  termPageCensoredLayoutRef = null;
  termPageCensoredScrollRef = null;
  termPageCensoredRayOffset = null;
  clearTermPageCensoredWrapState();
  termPageScreenZ = Z;
  captureTermPageCensoredLayoutRef(rayGroup, Z);
}

function getCensoredRowBandLeftPx() {
  const span = getGridSpanBounds(
    LAYOUT.termPageCensoredRowColumns,
    GRID.alignColumnFromRight,
    viewport
  );
  return span.left;
}

function getCensoredSiblingIndicesInSlotOrder() {
  if (!focusState) return [];
  const group = groups[focusState.activeIndex];
  if (!group || group.terms.length < 2) return [];
  return getCensoredSiblingIndicesForSelected(
    getFocusSelectedTermIndex(),
    group.terms.length
  );
}

function measureCensoredSiblingScreenBounds(rayGroup) {
  /** @type {Map<number, { minX: number, maxX: number, minY: number, maxY: number }>} */
  const bounds = new Map();
  withCensoredWrapTransformsSuspended(rayGroup, () => {
    for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap:not(.is-selected)")) {
      const termIndex = Number.parseInt(wrap.dataset.termIndex ?? "", 10);
      const text = wrap.querySelector(".sun-term");
      if (!text || !Number.isFinite(termIndex)) continue;
      const measured = getTermTextScreenBounds(rayGroup, text);
      if (measured) bounds.set(termIndex, measured);
    }
  });
  return bounds;
}

function clearTermPageCensoredWrapState() {
  termPageCensoredWrapOffsets = null;
  termPageCensoredWrapExtraPx = 0;
}

function resolveCensoredAlignScreenDeltaX(rayGroup, alignScreenDeltaX) {
  if (alignScreenDeltaX != null) return alignScreenDeltaX;
  if (termPageScreenZ == null) return 0;
  const censored = withCensoredWrapTransformsSuspended(rayGroup, () =>
    getCensoredTermsScreenRight(rayGroup)
  );
  if (!censored) return 0;
  const targetRight = termPageScreenZ - LAYOUT.termPageCensoredRightFromZ;
  return targetRight - censored.maxX;
}

function syncTermPageCensoredWrapPlan(
  rayGroup,
  alignScreenDeltaX = 0,
  alignScreenDeltaY = 0
) {
  if (termPageDeferCensoredWrapRepack) return;
  clearTermPageCensoredWrapState();
  if (
    !rayGroup ||
    !isTermPageFocusVisual() ||
    !termPageSelectedFontSettled ||
    termPageScreenZ == null
  ) {
    return;
  }

  const siblings = getCensoredSiblingIndicesInSlotOrder();
  if (!siblings.length) return;

  const bandLeft = getCensoredRowBandLeftPx();
  const targetRight = termPageScreenZ - LAYOUT.termPageCensoredRightFromZ;
  const naturalBounds = measureCensoredSiblingScreenBounds(rayGroup);
  const termGap = focusState?.termGap ?? LAYOUT.termGap;

  const row1 = [];
  const row2 = [];
  let cursor = targetRight;

  for (const termIndex of siblings) {
    const bounds = naturalBounds.get(termIndex);
    if (!bounds) continue;
    const width = bounds.maxX - bounds.minX;
    const placeLeft = cursor - width;
    if (placeLeft < bandLeft - 0.5) {
      row2.push(termIndex);
    } else {
      row1.push(termIndex);
      cursor = placeLeft - termGap;
    }
  }

  if (!row2.length) return;

  const sample = naturalBounds.get(row1[0] ?? row2[0]);
  const rowHeight =
    (sample ? sample.maxY - sample.minY : LAYOUT.fontSize) +
    LAYOUT.termPageCensoredWrapRowGap;
  termPageCensoredWrapExtraPx = rowHeight;

  const offsets = new Map();
  for (const termIndex of row1) {
    offsets.set(termIndex, {
      screenDx: alignScreenDeltaX,
      screenDy: alignScreenDeltaY,
    });
  }

  cursor = targetRight;
  for (const termIndex of row2) {
    const bounds = naturalBounds.get(termIndex);
    if (!bounds) continue;
    const width = bounds.maxX - bounds.minX;
    const targetLeft = cursor - width;
    const screenDx = alignScreenDeltaX + (targetLeft - (bounds.minX + alignScreenDeltaX));
    offsets.set(termIndex, {
      screenDx,
      screenDy: rowHeight + alignScreenDeltaY,
    });
    cursor = targetLeft - termGap;
  }

  termPageCensoredWrapOffsets = offsets;
}

function applyCensoredWrapPageOffset(layout = currentLayout) {
  if (!layout || !termPageEl || termPageEl.hidden || !isTermPageScrollContentMode()) {
    return;
  }
  const pageTop = getTermPageScrollContentTopPx(layout.viewportHeight);
  termPageEl.style.top = `${pageTop}px`;
}

function applyTermPageCensoredRayOffset(alignScreenDeltaX = null, alignScreenDeltaY = null) {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup) return;

  if (
    !termPageCensoredLayoutRef &&
    termPageScreenZ != null &&
    (termPageSelectedFontSettled ||
      termPageLayoutAnimActive ||
      termPageCensoredPushProgress > 0.001)
  ) {
    captureTermPageCensoredLayoutRef(rayGroup, termPageScreenZ);
  }

  const alignScreenDx =
    alignScreenDeltaX != null
      ? Math.abs(alignScreenDeltaX) < 0.25
        ? 0
        : alignScreenDeltaX
      : resolveCensoredAlignScreenDeltaX(rayGroup, null);
  const alignScreenDy =
    alignScreenDeltaY != null ? alignScreenDeltaY : resolveCensoredAlignScreenDeltaY();
  syncTermPageCensoredWrapPlan(rayGroup, alignScreenDx, alignScreenDy);

  // Horizontal Z-align only — vertical sibling position lives in censor barY.
  const { dx } = getCensoredRowAlignLocalOffset(alignScreenDx, 0);

  const ref = termPageCensoredLayoutRef;
  const refScreenX = ref?.refScreenX ?? 0;
  const refScreenY = getCensoredLayoutRefScreenY();

  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap:not(.is-selected)")) {
    const text = wrap.querySelector(".sun-term");
    if (!text) continue;

    const termIndex = Number.parseInt(wrap.dataset.termIndex ?? "", 10);
    const wrapPlan = Number.isFinite(termIndex)
      ? termPageCensoredWrapOffsets?.get(termIndex)
      : null;

    if (!wrapPlan || wrapPlan.screenDy < 0.01) {
      if (Math.abs(dx) < 0.01) {
        wrap.removeAttribute("transform");
      } else {
        wrap.setAttribute("transform", `translate(${dx}, 0)`);
      }
      continue;
    }

    const wrapped = viewportScreenPointDeltaToRayLocalDelta(
      rayGroup,
      refScreenX,
      refScreenY,
      wrapPlan.screenDx,
      wrapPlan.screenDy
    );
    if (Math.abs(wrapped.dx) < 0.01 && Math.abs(wrapped.dy) < 0.01) {
      wrap.removeAttribute("transform");
    } else {
      wrap.setAttribute("transform", `translate(${wrapped.dx}, ${wrapped.dy})`);
    }
  }

  applyCensoredWrapPageOffset();
}

function syncFocusSelectedTermLayout() {
  applyFocusTermPageLayout();
}

function applySelectedTermDisplayFont(textEl) {
  if (!textEl) return;
  textEl.style.fontFamily = '"Secolo", serif';
  textEl.style.fontSize = `${getTermPageSelectedFontSizePx()}px`;
  textEl.style.fontWeight = "normal";
  textEl.style.fontVariationSettings = "normal";
  getSelectedTermWrap()?.classList.add("is-display-font");
}

function clearSelectedTermDisplayFont(textEl) {
  if (!textEl) return;
  textEl.style.removeProperty("font-family");
  textEl.style.removeProperty("font-size");
  textEl.style.removeProperty("font-weight");
  textEl.style.removeProperty("font-variation-settings");
  getSelectedTermWrap()?.classList.remove("is-display-font");
}

function scheduleSimilarLabelScramble(delayMs) {
  clearTermSimilarLabelScrambleTimer();
  if (delayMs <= 0) {
    runSimilarLabelScramble();
    return;
  }
  termSimilarLabelScrambleTimer = window.setTimeout(() => {
    termSimilarLabelScrambleTimer = null;
    runSimilarLabelScramble();
  }, delayMs);
}

function runSimilarLabelScramble() {
  if (!termSimilarLabelEl) return;
  const group = groups[focusState?.activeIndex];
  if (!group || group.terms.length < 2) return;

  termSimilarLabelScrambleStarted = true;
  const layout = currentLayout ?? { viewportHeight: viewport?.clientHeight ?? 0 };
  stopLetterShuffle(termSimilarLabelEl);
  termSimilarLabelEl.textContent = TERM_SIMILAR_LABEL_TEXT;
  updateTermPageSimilarLabel(layout);
  playLightLetterShuffleTo(termSimilarLabelEl, TERM_SIMILAR_LABEL_TEXT, () => {
    if (currentLayout) updateTermPageSimilarLabel(currentLayout);
  });
}

function updateTermPageSimilarLabel(layout) {
  if (!termSimilarLabelEl || !termSimilarLabelWrapEl || !isTermPageFocusVisual()) {
    if (termSimilarLabelWrapEl) {
      termSimilarLabelWrapEl.hidden = true;
      termSimilarLabelWrapEl.setAttribute("aria-hidden", "true");
    }
    if (termSimilarLabelEl) {
      termSimilarLabelEl.hidden = true;
      termSimilarLabelEl.setAttribute("aria-hidden", "true");
    }
    return;
  }

  const group = groups[focusState.activeIndex];
  if (!group || group.terms.length < 2) {
    termSimilarLabelWrapEl.hidden = true;
    termSimilarLabelWrapEl.setAttribute("aria-hidden", "true");
    stopLetterShuffle(termSimilarLabelEl);
    return;
  }

  if (!termPageSelectedFontSettled && !termPageLayoutAnimActive) {
    termSimilarLabelWrapEl.hidden = true;
    termSimilarLabelWrapEl.setAttribute("aria-hidden", "true");
    return;
  }

  if (
    termPageLayoutAnimActive &&
    !termPageSelectedFontSettled &&
    termPageCensoredPushProgress <= 0
  ) {
    termSimilarLabelWrapEl.hidden = true;
    termSimilarLabelWrapEl.setAttribute("aria-hidden", "true");
    termSimilarLabelWrapEl.style.opacity = "";
    return;
  }

  if (termPageScreenZ == null) {
    termSimilarLabelWrapEl.hidden = true;
    termSimilarLabelWrapEl.setAttribute("aria-hidden", "true");
    return;
  }

  let censoredTop = getCensoredRowScreenTop();
  if (censoredTop == null && getTermPageSimilarLabelNaturalTopPx(29) == null) {
    return;
  }

  termSimilarLabelWrapEl.hidden = false;
  termSimilarLabelWrapEl.setAttribute("aria-hidden", "false");
  termSimilarLabelEl.hidden = false;
  termSimilarLabelEl.setAttribute("aria-hidden", "false");
  if (termPageLayoutAnimActive && !termPageSelectedFontSettled) {
    termSimilarLabelWrapEl.style.opacity = String(
      smoothstep01(termPageCensoredPushProgress)
    );
  } else {
    termSimilarLabelWrapEl.style.opacity = "";
  }
  const labelWidth = termSimilarLabelEl.offsetWidth || 180;
  const labelHeight = termSimilarLabelEl.offsetHeight || 29;
  const pushGap =
    termPageLayoutAnimActive && !termPageSelectedFontSettled
      ? getTermPageCensoredPushGap(termPageCensoredPushProgress)
      : LAYOUT.termPageCensoredRightFromZ;
  const targetRight = termPageScreenZ - pushGap;
  const left = targetRight - labelWidth;
  const viewportHeight = layout.viewportHeight ?? viewport?.clientHeight ?? getLiveViewportHeight();
  if (termPageSimilarLabelAnchorStale) {
    termPageFrozenSecoloBaselineScreenY = null;
  }
  let naturalTop =
    (termPageSiblingLayoutApplied && censoredTop != null
      ? censoredTop - LAYOUT.termPageSimilarLabelGap - labelHeight
      : null) ??
    getTermPageSimilarLabelNaturalTopPx(labelHeight) ??
    (censoredTop != null
      ? censoredTop - LAYOUT.termPageSimilarLabelGap - labelHeight
      : null);
  if (naturalTop == null) return;

  const scrollTop = viewport?.scrollTop ?? 0;
  const rayGroup = getFocusRayGroup();
  const selectedBounds = getSelectedTermTextEl()
    ? getTermTextScreenBounds(rayGroup, getSelectedTermTextEl())
    : null;
  let rowLooksAligned =
    censoredTop != null &&
    censoredTop > 200 &&
    (selectedBounds?.minY ?? censoredTop) > 200;
  if (!rowLooksAligned && scrollTop <= 0.5) {
    if (termPageScreenZ != null) {
      realignTermPageCensoredRowAfterRayAnchor({ refreshBars: false });
      const retryCensoredTop = getCensoredRowScreenTop();
      const retrySelectedBounds = getSelectedTermTextEl()
        ? getTermTextScreenBounds(rayGroup, getSelectedTermTextEl())
        : null;
      rowLooksAligned =
        retryCensoredTop != null &&
        retryCensoredTop > 200 &&
        (retrySelectedBounds?.minY ?? retryCensoredTop) > 200;
      if (rowLooksAligned) {
        censoredTop = retryCensoredTop;
        naturalTop =
          censoredTop - LAYOUT.termPageSimilarLabelGap - labelHeight;
      } else if (termSimilarLabelRestTop == null || termSimilarLabelRestTop <= 200) {
        return;
      }
    } else if (termSimilarLabelRestTop == null || termSimilarLabelRestTop <= 200) {
      return;
    }
  }

  termSimilarLabelEl.style.left = `${Math.round(left)}px`;
  termSimilarLabelEl.style.width = `${labelWidth}px`;

  // Capture rest anchor only at scroll origin — live censoredTop already includes scroll lift.
  if (
    scrollTop <= 0.5 &&
    rowLooksAligned &&
    naturalTop != null &&
    termPageSiblingLayoutApplied &&
    (termSimilarLabelRestTop == null ||
      termPageSimilarLabelAnchorStale ||
      Math.abs((termSimilarLabelRestTop ?? 0) - naturalTop) > 1.5)
  ) {
    termSimilarLabelRestTop = naturalTop;
    termPageSimilarLabelAnchorStale = false;
  }

  const pinned = isTermCensoredGroupPinned(scrollTop, viewportHeight);
  termSimilarLabelIsPinned = pinned;

  const scrollLiftPx = getTermHeaderPinScrollLiftPx(scrollTop, viewportHeight);
  let top;
  if (scrollLiftPx > 0.01 && censoredTop != null && termPageSiblingLayoutApplied) {
    top = censoredTop - LAYOUT.termPageSimilarLabelGap - labelHeight;
  } else {
    const anchorTop =
      termPageSimilarLabelAnchorStale && !termPageSiblingLayoutApplied
        ? naturalTop
        : (termSimilarLabelRestTop ?? naturalTop);
    top = anchorTop;
  }

  termSimilarLabelEl.style.top = `${Math.round(getScrollportLocalTopPx(top))}px`;
}

function clearTermPageBleedCaption() {
  if (!termBleedCaptionEl) return;
  termBleedCaptionEl.hidden = true;
  termBleedCaptionEl.setAttribute("aria-hidden", "true");
  termBleedCaptionEl.replaceChildren();
  termBleedCaptionEl.classList.remove("is-multiline");
  termBleedCaptionEl.style.left = "";
  termBleedCaptionEl.style.top = "";
  termBleedCaptionEl.style.width = "";
  termBleedCaptionEl.style.removeProperty("max-width");
}

function layoutTermPageBleedCaption(caption) {
  if (!termBleedCaptionEl || !caption) return;

  const span = getTermPageBleedCaptionSpan();
  const maxWidth =
    span.width > 0
      ? Math.max(0, span.width - LAYOUT.termHoverCaptionWidthSlack)
      : 0;
  if (span.width > 0) {
    termBleedCaptionEl.style.left = `${span.left}px`;
    termBleedCaptionEl.style.maxWidth = `${span.width}px`;
    termBleedCaptionEl.style.removeProperty("width");
  } else {
    termBleedCaptionEl.style.removeProperty("left");
    termBleedCaptionEl.style.removeProperty("width");
    termBleedCaptionEl.style.removeProperty("max-width");
  }
  termBleedCaptionEl.style.removeProperty("right");

  setTermHoverCaptionText(caption, maxWidth, termBleedCaptionEl);
  syncTermHoverCaptionBoxWidth(termBleedCaptionEl);
}

function updateTermPageBleedCaption(layout, image) {
  const caption = formatTermImageCaption(image);
  if (!termBleedCaptionEl || !caption) {
    clearTermPageBleedCaption();
    return;
  }

  layoutTermPageBleedCaption(caption);

  const { viewportHeight } = layout;
  const visibleImageBottom = getTermImageCutYpx(viewportHeight);
  const gridMargin =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--grid-margin")
    ) || GRID.margin;
  const top = visibleImageBottom + gridMargin;

  termBleedCaptionEl.style.top = `${Math.round(top)}px`;
  applyTermPageBleedCaptionVisibility(layout);
}

/**
 * Per-term framing for the full-screen (term-page) bleed image.
 * Value is a CSS `object-position` (horizontal vertical) that picks which area
 * of the covered image stays in frame. Only the crop shifts; the aspect ratio
 * is preserved by `object-fit: cover`. Default for all other terms is
 * `center top`.
 */
const TERM_BLEED_OBJECT_POSITION = {
  "ביביסטים": "50% 100%",
};

function applyTermPageBleedObjectPosition(termName) {
  if (!bleedBackdropImgEl) return;
  bleedBackdropImgEl.style.objectPosition =
    TERM_BLEED_OBJECT_POSITION[termName] || "";
}

/** Reverse lookup: which term owns this bleed image URL (for the framing override). */
function getTermNameForBleedUrl(url) {
  if (!url) return null;
  for (const [name, images] of termImagesByName) {
    if (images?.some((image) => image?.url === url)) return name;
  }
  return null;
}

/** Apply the per-term `object-position` override for any bleed image URL. */
function applyBleedObjectPositionForUrl(url) {
  if (!bleedBackdropImgEl) return;
  const termName = getTermNameForBleedUrl(url);
  bleedBackdropImgEl.style.objectPosition =
    (termName && TERM_BLEED_OBJECT_POSITION[termName]) || "";
}

function updateTermPageBleed(layout) {
  if (!isTermPageFocusVisual()) {
    hideTermPageChrome();
    return;
  }

  const term = groups[focusState.activeIndex]?.terms[getTermPageContentTermIndex()];
  if (!term) {
    hideTermPageChrome();
    return;
  }

  const carryImage = termPageBleedCarryImage;
  const carriedFromHover = Boolean(carryImage);
  if (carryImage) termPageBleedCarryImage = null;
  const { viewportWidth, viewportHeight } = layout;
  const image =
    carryImage ??
    pickTitleRowSharedImage(term.name, viewportWidth, viewportHeight) ??
    pickTermDisplayImage(term.name);
  const url = image?.url;
  if (!url) {
    hideBleedBackdropFully();
    termPageBleedTermId = null;
    updateTermPageBleedCaption(layout, null);
    return;
  }

  const termChanged = termPageBleedTermId !== term.id;
  const bleedSrcMatches =
    isBleedBackdropLoaded() && termImageSrcMatches(bleedBackdropImgEl, url);
  const bleedAlreadyVisible =
    bleedBackdropEl &&
    !bleedBackdropEl.hidden &&
    bleedBackdropEl.classList.contains("is-term-page") &&
    bleedBackdropEl.classList.contains("is-visible") &&
    bleedSrcMatches;
  const canContinueBleedToTermPage =
    !bleedAlreadyVisible &&
    bleedBackdropEl &&
    !bleedBackdropEl.hidden &&
    bleedBackdropEl.classList.contains("is-visible") &&
    bleedSrcMatches;

  termPageBleedTermId = term.id;
  termPageBleedImage = image;
  applyTermPageBleedObjectPosition(term.name);

  if (canContinueBleedToTermPage && transitionBleedBackdropToTermPage()) {
    // bleed promoted — clip synced below
  } else if (bleedAlreadyVisible) {
    viewport?.classList.add("is-term-page-bleed");
    bleedBackdropEl.classList.add("is-term-page");
  } else {
    showBleedBackdrop(url, termChanged && !carriedFromHover && !bleedSrcMatches, {
      mode: "termPage",
    });
  }

  syncTermPageBleedClip();
  syncBleedBackdropDarkInvert();
  updateTermPageBleedCaption(layout, image);
}

function settleTermPageAfterFontScramble(layout, finalOverlayZ) {
  termPageSelectedFontSettled = true;
  termPageHeaderRowRestTop = null;

  termPageSiblingLayoutApplied = false;
  applyFocusTermPageLayout();
  refineTermPagePositions();

  const rayGroup = getFocusRayGroup();
  const selectedText = getSelectedTermTextEl();
  const Z = Number.isFinite(finalOverlayZ)
    ? finalOverlayZ
    : rayGroup && selectedText
      ? getSecoloTitleScreenZ(rayGroup, selectedText)
      : null;

  const handoffComplete =
    termPageCensoredFrozenScreenAlign != null &&
    Z != null &&
    termPageScreenZ != null &&
    Math.abs(termPageScreenZ - Z) < 0.5;

  if (Z != null && !handoffComplete) {
    finalizeTermPageCensoredAlignment(Z);
  } else if (Z != null) {
    termPageScreenZ = Z;
  }

  if ((viewport?.scrollTop ?? 0) > 0.5) {
    captureTermPageHeaderRowRestTopFromScroll();
  } else {
    termPageHeaderRowRestTop = null;
    captureTermPageHeaderRowRestTopIfNeeded();
  }
  holdSiblingTermCensors();
  termPageDeferCensoredWrapRepack = true;
  if (handoffComplete) {
    applyFrozenTermPageCensoredScreenAlign();
  } else {
    applyTermPageCensoredBaselineAlign(getFocusRayGroup(), { refreshBars: false });
  }
  termPageDeferCensoredWrapRepack = false;

  const scrollTop = viewport?.scrollTop ?? 0;
  if (isViewportTermScrollable() || scrollTop > 0.5) {
    termPageCensoredScrollShiftY = getTermCensoredGroupScreenShiftY();
    applyFocusRayScrollAnchor(layout);
    applyTermPageScrollLiftTransform();
  }

  if (!termPageInlineTermSwitch) {
    updateTermPageSimilarLabel(layout);
  }

  // Now that the pin geometry is settled, re-fit the fold-2 image to fill the fold.
  refitTermPageScrollImage(layout);
}

function finishSelectedTermFontScramble(scrambleToken, onComplete) {
  if (scrambleToken !== termPageFontScrambleToken) return;
  stopTermPageLayoutAnimation();
  termPageSiblingLayoutApplied = true;
  termPageCensoredPushProgress = 1;
  termPageSiblingBaselineRampStartMs = null;
  termPageSiblingBaselineRampDurationMs = 0;

  const finalZ =
    handoffSettledTermPageCensoredRow() ??
    (() => {
      if (termPageCensoredPushTarget) {
        applyTermPageCensoredPushFromTarget(termPageCensoredPushTarget, 1);
      } else {
        updateCensoredAlignmentDuringFontScramble();
      }
      if (termPageCensoredFrozenScreenAlign) {
        applyTermPageCensoredRayOffset(
          termPageCensoredFrozenScreenAlign.dx,
          termPageCensoredFrozenScreenAlign.dy
        );
      }
      const rayGroup = getFocusRayGroup();
      const textEl = getSelectedTermTextEl();
      return (
        termPageScreenZ ??
        (textEl && rayGroup ? getSecoloTitleScreenZ(rayGroup, textEl) : null)
      );
    })();

  if (currentLayout) {
    settleTermPageAfterFontScramble(currentLayout, finalZ);
    clearTermFontScrambleOverlay();
    updateTermPageSimilarLabel(currentLayout);
    termPageCensoredPushTarget = null;
    requestAnimationFrame(() => {
      if (scrambleToken !== termPageFontScrambleToken) return;
      termPageCensoredPreserveBarsAfterHandoff = false;
      if (!termSimilarLabelScrambleStarted) runSimilarLabelScramble();
      onComplete?.();
    });
    return;
  }
  clearTermFontScrambleOverlay();
  termPageSelectedFontSettled = true;
  termPageCensoredPushTarget = null;
  onComplete?.();
}

function runSelectedTermFontScramble(onComplete) {
  const scrambleToken = ++termPageFontScrambleToken;
  termSimilarLabelScrambleStarted = false;
  clearTermFontScrambleAnimation();

  const group = groups[focusState?.activeIndex];
  const selectedIndex = getFocusSelectedTermIndex();
  const selectedTerm = group?.terms[selectedIndex];
  const textEl = getSelectedTermTextEl();
  if (!textEl || !selectedTerm) {
    termPageSelectedFontSettled = true;
    onComplete?.();
    return;
  }

  termPageSelectedFontSettled = false;
  clearSameObjectMentionHover();
  termPageCensoredFrozenScreenAlign = null;
  termPageFrozenSecoloBaselineScreenY = null;
  clearSelectedTermDisplayFont(textEl);
  stopContinuousScramble(textEl, { restore: false });
  freezeTermPageSiblingLayout();

  const originalText = applyTypographyRules(selectedTerm.name);
  const durationMs = estimateFontScrambleDuration(TERM_FONT_SCRAMBLE_MODE, originalText);
  const secoloStartMs = estimateFontScrambleSecoloStartMs(
    TERM_FONT_SCRAMBLE_MODE,
    originalText
  );
  const layoutTargets = computeTermPageLayoutTargets();
  const startXs = termPageSiblingFrozenXs?.slice() ?? focusState.termEndXs.slice();
  const endXs = layoutTargets?.endXs ?? startXs.slice();

  if (termPageSiblingRepackedForSwitch) {
    termPageSiblingRepackedForSwitch = false;
    const selectedIndex = getFocusSelectedTermIndex();
    for (let i = 0; i < endXs.length; i++) {
      if (endXs[i] != null) startXs[i] = endXs[i];
    }
    if (selectedIndex >= 0) {
      focusState.termEndXs = endXs.slice();
    }
  }

  if (currentLayout) {
    render(currentLayout);
  }

  refreshTermPageSiblingCensorBars();
  captureTermPageCensoredPushTarget(originalText);

  const overlayShown = showTermFontScrambleOverlay();

  if (!overlayShown || durationMs <= 0) {
    finishSelectedTermFontScramble(scrambleToken, onComplete);
    return;
  }

  playFontScrambleTransition(termFontOverlayTermEl, {
    mode: TERM_FONT_SCRAMBLE_MODE,
    text: originalText,
    fromFont: "roobert",
    toFont: "secolo",
    onComplete: () => finishSelectedTermFontScramble(scrambleToken, onComplete),
  });

  startTermPageLayoutAnimation(scrambleToken, startXs, endXs, durationMs, secoloStartMs);
  updateCensoredAlignmentDuringFontScramble();
  scheduleSimilarLabelScramble(secoloStartMs);
}

function onTermPageFocusLocked() {
  if (TERM_PAGE_LEGACY_CONTENT_ENABLED) return;
  termPageSelectedFontSettled = false;
  runSelectedTermFontScramble();
}

function updateTermMeta(layout, { contentOnly = false } = {}) {
  if (!termMetaEl) return;
  if (isTermPageScrollContentMode()) {
    const show =
      focusState &&
      isFocusTermLayoutPhase(focusState.phase) &&
      groups[focusState.activeIndex]?.terms[focusState.clickedIndex];

    if (!show) {
      termMetaEl.hidden = true;
      termMetaEl.classList.remove("is-visible");
      resetTermMetaRow(termMetaTypeEl);
      resetTermMetaRow(termMetaFramingEl);
      resetTermMetaRow(termMetaConnotationEl);
    }
    return;
  }

  if (!TERM_PAGE_LEGACY_CONTENT_ENABLED) {
    termMetaEl.hidden = true;
    termMetaEl.classList.remove("is-visible");
    resetTermMetaRow(termMetaTypeEl);
    resetTermMetaRow(termMetaFramingEl);
    resetTermMetaRow(termMetaConnotationEl);
    return;
  }

  const show =
    focusState &&
    isFocusTermLayoutPhase(focusState.phase) &&
    groups[focusState.activeIndex]?.terms[focusState.clickedIndex];

  if (!show) {
    termMetaEl.hidden = true;
    termMetaEl.classList.remove("is-visible");
    resetTermMetaRow(termMetaTypeEl);
    resetTermMetaRow(termMetaFramingEl);
    resetTermMetaRow(termMetaConnotationEl);
    return;
  }

  const term = groups[focusState.activeIndex].terms[focusState.clickedIndex];
  const { viewportWidth, viewportHeight } = layout;
  const metaTop =
    getFocusRowTopPx(viewportHeight) - LAYOUT.fontSize / 2;

  termMetaEl.style.top = `${metaTop}px`;
  termMetaEl.style.left = "0";
  termMetaEl.style.right = "0";
  termMetaEl.hidden = false;

  if (!contentOnly) {
    updateTermMetaRow(termMetaTypeEl, term.termType, term, "termType");
    updateTermMetaRow(termMetaFramingEl, term.framing, term, "framing");
    updateTermMetaRow(
      termMetaConnotationEl,
      term.connotation,
      term,
      "connotation"
    );
  }
  if (
    focusState &&
    isFocusTermLayoutPhase(focusState.phase) &&
    termPageEl?.classList.contains("is-visible")
  ) {
    termMetaEl.classList.add("is-visible");
  } else {
    termMetaEl.classList.remove("is-visible");
  }
}

function updateTermPage(layout) {
  if (!termPageEl || !termDefinitionEl) return;
  syncGridCssVars(viewport);
  syncTermPageResponsiveState(layout.viewportWidth, layout.viewportHeight);

  const show =
    focusState &&
    isFocusTermLayoutPhase(focusState.phase) &&
    groups[focusState.activeIndex]?.terms[focusState.clickedIndex];

  if (!show) {
    termPageRevealToken++;
    lastTermPageRenderedId = null;
    clearSameObjectMentionHover();
    hideTermPageContent();
    termPageEl.hidden = true;
    resetViewportTermScroll();

    if (isTermPageFocusVisual()) {
      updateTermMeta(layout);
      updateTermPageBleed(layout);
      return;
    }

    hideTermPageChrome();
    termDefinitionEl.innerHTML = "";
    termDefinitionEl.style.left = "";
    termDefinitionEl.style.width = "";
    termDefinitionEl.style.top = "";
    if (termPageEl) {
      termPageEl.style.paddingTop = "";
      termPageEl.style.paddingBottom = "";
      termPageEl.style.left = "";
      termPageEl.style.width = "";
      termPageEl.style.top = "";
      termPageEl.style.minHeight = "";
      termPageEl.style.removeProperty("clip-path");
      termPageEl.classList.remove("is-scroll-content");
    }
    viewport?.classList.remove("is-term-scroll-content");
    viewport?.style.removeProperty("--term-page-scroll-image-height");
    if (termDetailsEl) {
      termDetailsEl.hidden = true;
      termDetailsEl.style.top = "";
      termDetailsEl.style.height = "";
    }
    resetTermPageScrollDetailRow(termEmphasizesEl);
    resetTermPageScrollDetailRow(termObscuresEl);
    resetTermPageLabelRow(termUsersEl);
    resetTermPageLabelRow(termContextsEl);
    resetTermPageLabelRow(termPeriodEl);
    resetTermPageImages();
    resetTermPageDetailsImage();
    resetTermMetaRow(termMetaTypeEl);
    resetTermMetaRow(termMetaFramingEl);
    resetTermMetaRow(termMetaConnotationEl);
    updateTermMeta(layout);
    return;
  }

  if (!TERM_PAGE_LEGACY_CONTENT_ENABLED && !isTermPageScrollBgMode()) {
    termPageEl.hidden = true;
    hideTermPageContent();
    resetViewportTermScroll();
    updateTermMeta(layout);
    updateTermPageBleed(layout);
    return;
  }

  if (isTermPageScrollBgMode()) {
    updateTermMeta(layout);
    updateTermPageBleed(layout);
    updateTermScrollBg(layout);

    const term = groups[focusState.activeIndex].terms[focusState.clickedIndex];
    const termChanged = lastTermPageRenderedId !== term.id;
    if (termChanged) {
      lastTermPageRenderedId = term.id;
      clearSameObjectMentionHover();
      armSameObjectHoverReenterGate();
      if (!termPageInlineTermSwitch) {
        hideTermPageContent();
        if (viewport) viewport.scrollTop = 0;
      }
    }
    layoutTermPageScrollContent(layout, term, termChanged);

    applyViewportTermScrollBounds(layout.viewportHeight);
    syncTermHeaderPinState(layout);
    return;
  }

  if (!TERM_PAGE_LEGACY_CONTENT_ENABLED) {
    return;
  }

  const term = groups[focusState.activeIndex].terms[focusState.clickedIndex];
  const termChanged = lastTermPageRenderedId !== term.id;
  if (termChanged) {
    clearSameObjectMentionHover();
    armSameObjectHoverReenterGate();
    lastTermPageRenderedId = term.id;
    hideTermPageContent();
  }
  const { viewportWidth, viewportHeight } = layout;
  const span = getGridSpanBounds(
    LAYOUT.termPageColumns,
    GRID.alignColumnFromRight,
    viewport
  );
  const emphasizesSpan = getGridSpanBounds(
    LAYOUT.termPageSideColumns,
    LAYOUT.termPageEmphasizesColumnFromRight,
    viewport
  );
  const obscuresSpan = getGridSpanBounds(
    LAYOUT.termPageSideColumns,
    LAYOUT.termPageObscuresColumnFromRight,
    viewport
  );
  const top =
    getFocusRowTopPx(viewportHeight) +
    LAYOUT.fontSize / 2 +
    LAYOUT.termPageGapBelowTitle;

  termPageEl.style.left = `${span.left}px`;
  termPageEl.style.width = `${span.width}px`;
  termPageEl.style.top = `${top}px`;
  termPageEl.style.paddingBottom = `${getTermPageBottomPadding()}px`;
  if (termChanged) {
    viewport.scrollTop = 0;
    setAnnotatedTermText(termDefinitionEl, term.definition, term);
  }
  const definitionSpan = getGridSpanBounds(
    LAYOUT.termPageColumns,
    LAYOUT.termPageDefinitionColumnFromRight,
    viewport
  );
  positionTermPageBlock(termDefinitionEl, definitionSpan, span);
  const definitionHeight = termDefinitionEl.offsetHeight;
  const detailsTop = definitionHeight + getTermPageBlockGapPx();
  termPageEl.style.paddingTop = `${definitionHeight}px`;
  const imagesHeight = updateTermPageImages(
    term,
    viewportWidth,
    span,
    detailsTop,
    termChanged
  );

  let hasEmphasizes = Boolean(termEmphasizesEl && !termEmphasizesEl.hidden);
  let hasObscures = Boolean(termObscuresEl && !termObscuresEl.hidden);
  if (termChanged) {
    hasEmphasizes = updateTermPageSide(
      termEmphasizesEl,
      termEmphasizesTextEl,
      term.emphasizes,
      emphasizesSpan,
      span,
      term
    );
    hasObscures = updateTermPageSide(
      termObscuresEl,
      termObscuresTextEl,
      term.obscures,
      obscuresSpan,
      span,
      term
    );
    updateTermPageLabelRow(termUsersEl, term.usedBy, viewportWidth, span, term);
    updateTermPageLabelRow(termContextsEl, term.contexts, viewportWidth, span, term);
    updateTermPageLabelRow(termPeriodEl, term.period, viewportWidth, span, term);
    updateTermMeta(layout);
  } else {
    if (hasEmphasizes) positionTermPageSide(termEmphasizesEl, emphasizesSpan, span);
    if (hasObscures) positionTermPageSide(termObscuresEl, obscuresSpan, span);
    layoutTermPageLabelRow(termUsersEl, viewportWidth, span);
    layoutTermPageLabelRow(termContextsEl, viewportWidth, span);
    layoutTermPageLabelRow(termPeriodEl, viewportWidth, span);
    updateTermMeta(layout, { contentOnly: true });
  }

  if (termDetailsEl) {
    const showDetails = hasEmphasizes || hasObscures;
    termDetailsEl.hidden = !showDetails;
    if (showDetails) {
      const tallestSide = Math.max(
        hasEmphasizes ? termEmphasizesEl.offsetHeight : 0,
        hasObscures ? termObscuresEl.offsetHeight : 0
      );
      termDetailsEl.style.height = tallestSide ? `${tallestSide}px` : "";
    } else {
      termDetailsEl.style.height = "";
    }
  }

  const flowHeight = termPageEl.offsetHeight;
  const imagesBottom = detailsTop + imagesHeight;
  termPageEl.style.minHeight =
    imagesBottom > flowHeight ? `${imagesBottom}px` : "";

  termPageEl.hidden = false;
  if (termChanged) {
    const revealToken = ++termPageRevealToken;
    loadTermPageImages(termImagesEl).then(() => {
      revealTermPageContent(term.id, revealToken);
    });
  }
  applyViewportTermScrollBounds(viewportHeight);
}

function computeLayout(viewportWidth, viewportHeight) {
  return computeArcGeometry(viewportWidth, viewportHeight, overviewProgress);
}

function cancelOverviewAnimation() {
  if (overviewAnimFrame) {
    cancelAnimationFrame(overviewAnimFrame);
    overviewAnimFrame = null;
  }
}

function forceOverviewReset() {
  const wasInOverview = overviewProgress > 0.02;
  overviewTarget = 0;
  overviewProgress = 0;
  overviewOverflowPasses = 0;
  hideTimelineEventHint({ immediate: true });
  hideTimelineScrollHint();
  cancelOverviewAnimation();
  hideSunOverviewTermsGrid();
  if (overviewSubMode !== "filter") {
    setOverviewSubModeInternal("filter");
  }
  if (
    wasInOverview &&
    currentLayout &&
    !isFocusActive() &&
    !isTermNavigating()
  ) {
    snapToNearest(currentLayout);
  }
  if (viewport && groups.length) {
    refreshMapLayoutFromViewport();
  }
}

function enterOverviewAfterUnfocus(mode) {
  if (overviewSubMode !== mode) {
    setOverviewSubModeInternal(mode);
  }
  setOverviewTarget(1);
}

function getActiveNavTarget() {
  if (isFocusActive()) return null;
  if (isSunAboutVisible()) return "about";
  if (isSunTermsIndexVisible()) return "index";
  if (isInOverview()) return overviewSubMode === "timeline" ? "timeline" : "tags";
  return "home";
}

/** @param {string} target */
function isNavTargetActive(target) {
  const active = getActiveNavTarget();
  if (active === null) return false;
  if (target === "tags") return active === "tags";
  return target === active;
}

function syncNavAfterPageEnter() {
  syncSiteNavFromMap(getActiveNavTarget);
}

function isAtHomeView() {
  return (
    !isFocusActive() &&
    !isTermNavigating() &&
    !isSunAboutVisible() &&
    !isSunTermsIndexVisible() &&
    overviewProgress <= 0.002 &&
    overviewTarget <= 0.002
  );
}

/** @param {() => void} onHomeReady */
function runAfterOverviewClose(onHomeReady) {
  if (isAtHomeView()) {
    onHomeReady();
    return;
  }
  pendingAfterHome = onHomeReady;
  setOverviewTarget(0);
}

/**
 * Pick directional timing so only the timeline side of a transition is slowed.
 * @param {"filter" | "timeline"} toMode destination overview mode (enter leg)
 * @param {"filter" | "timeline"} [fromMode] source overview mode (exit leg)
 */
function pageTimingForOverviewMode(toMode, fromMode = toMode) {
  if (toMode === "timeline") return PAGE_TIMELINE_ENTER_TIMING;
  if (fromMode === "timeline") return PAGE_TIMELINE_EXIT_TIMING;
  return PAGE_ROUTE_TIMING;
}

/**
 * Route navigation through the home map view before continuing.
 * @param {() => void} onHomeReady
 * @param {{ exitMs: number, enterMs: number }} [timing]
 * @returns {boolean}
 */
function navigateViaHome(onHomeReady, timing = PAGE_ROUTE_TIMING) {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) {
    return false;
  }

  if (isSunAboutVisible()) {
    runPageNavScrambleTransition(
      "about",
      () => hideSunAbout(),
      "map",
      onHomeReady,
      timing
    );
    return true;
  }

  if (isSunTermsIndexVisible()) {
    runPageNavScrambleTransition(
      "index",
      () => hideSunTermsIndex(),
      "map",
      onHomeReady,
      timing
    );
    return true;
  }

  if (isInOverview()) {
    runAfterOverviewClose(onHomeReady);
    return true;
  }

  onHomeReady();
  return true;
}

/**
 * Route a page-to-page navigation through the home map view, playing the
 * scramble transition on the close leg so the home view animates in between.
 * @param {() => void} onHomeReady
 * @returns {boolean}
 */
function routeViaHomeScramble(onHomeReady, timing = PAGE_ROUTE_TIMING) {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) {
    return false;
  }

  if (isSunAboutVisible()) {
    runPageNavScrambleTransition(
      "about",
      () => hideSunAbout(),
      "map",
      onHomeReady,
      timing
    );
    return true;
  }

  if (isSunTermsIndexVisible()) {
    runPageNavScrambleTransition(
      "index",
      () => hideSunTermsIndex(),
      "map",
      onHomeReady,
      timing
    );
    return true;
  }

  if (isInOverview()) {
    runPageNavScrambleTransition(
      "overview",
      () => beginOverviewClose(),
      "map",
      onHomeReady,
      timing
    );
    return true;
  }

  onHomeReady();
  return true;
}

function navigateToHome() {
  if (isSunAboutVisible()) {
    // Mirror home→about (navigateHomeToAbout): scramble the About text out during
    // the exit phase, then the same timing so the two directions match.
    playSunAboutExitScramble();
    runPageNavScrambleTransition(
      "about",
      () => hideSunAbout(),
      "map",
      syncNavAfterPageEnter,
      PAGE_ROUTE_TIMING
    );
    return;
  }

  if (isSunTermsIndexVisible()) {
    runPageNavScrambleTransition(
      "index",
      () => hideSunTermsIndex(),
      "map",
      syncNavAfterPageEnter,
      PAGE_ROUTE_TIMING
    );
    return;
  }
  if (isFocusActive()) {
    startUnfocusAnimation();
    return;
  }
  if (isInOverview()) {
    if (isOverviewTagsMode()) {
      navigateTagsToHome();
      return;
    }
    if (isOverviewTimelineMode()) {
      navigateTimelineToHome();
      return;
    }
    setOverviewTarget(0);
    syncNavAfterPageEnter();
  }
}

function revealTermsIndex() {
  runPageNavScrambleTransition(
    "map",
    () => showSunTermsIndex(),
    "index",
    syncNavAfterPageEnter,
    PAGE_ROUTE_TIMING
  );
}

function revealAbout() {
  runPageNavScrambleTransition(
    "map",
    () => showSunAbout(),
    "about",
    syncNavAfterPageEnter,
    PAGE_ROUTE_TIMING
  );
}

function navigateHomeToAbout() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "map",
    () => showSunAbout(),
    "about",
    syncNavAfterPageEnter,
    PAGE_ROUTE_TIMING
  );
}

function navigateIndexToAbout() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "index",
    () => {
      hideSunTermsIndex();
      showSunAbout();
    },
    "about",
    syncNavAfterPageEnter,
    PAGE_ROUTE_TIMING
  );
}

function navigateAboutToIndex() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "about",
    () => {
      hideSunAbout();
      showSunTermsIndex();
    },
    "index",
    syncNavAfterPageEnter,
    PAGE_ROUTE_TIMING
  );
}

function navigateOverviewToAbout() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  const timing = pageTimingForOverviewMode("filter", overviewSubMode);
  runPageNavScrambleTransition(
    "overview",
    () => {
      // About covers the viewport — snap overview closed instead of zooming out over home.
      beginOverviewClose({ snap: true });
      showSunAbout();
    },
    "about",
    syncNavAfterPageEnter,
    timing
  );
}

function navigateAboutToTags() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "about",
    () => {
      hideSunAbout();
      beginOverviewOpen("filter");
    },
    "overview",
    syncNavAfterPageEnter,
    PAGE_ROUTE_TIMING
  );
}

function navigateAboutToTimeline() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  // About uses its own markup-preserving scramble (not page-nav continuous targets).
  playSunAboutExitScramble();
  runPageNavScrambleTransition(
    "about",
    () => {
      hideSunAbout();
      // Snap into timeline — skip the home-map zoom-in beat between about and timeline.
      beginOverviewOpen("timeline", { snap: true });
    },
    "overview",
    syncNavAfterPageEnter,
    PAGE_TIMELINE_ENTER_TIMING
  );
}

/** Term page → covering page: longer exit so the image pixelation reads. */
const PAGE_TERM_EXIT_TIMING = { exitMs: 240, enterMs: PAGE_ROUTE_TIMING.enterMs };

/**
 * Direct term-page → covering-page transition. Scrambles the term page text and
 * pixelates its images on the exit beat, tears the focus down instantly (no zoom
 * back through the home map), then scrambles the destination in on the enter beat.
 * @param {() => void} showDestination runs after the exit beat to reveal the target view
 * @param {PageScrambleView} enterView
 * @param {{ exitMs?: number, enterMs?: number }} [timing]
 * @returns {boolean}
 */
function runTermDirectNav(showDestination, enterView, timing = PAGE_TERM_EXIT_TIMING) {
  stabilizeFocusForNav();
  if (!focusState || focusState.phase !== "locked") return false;

  releaseSiblingTermCensorHold();
  disableTermEnterSiblingCensor();
  cancelTermScrollReset();

  runTermPageImagesExitPixelation(timing.exitMs ?? PAGE_TERM_EXIT_TIMING.exitMs);

  return runPageNavScrambleTransition(
    "termFocus",
    () => {
      clearTermPageImageExitPixelation();
      cancelFocusAnimation();
      cancelBackCircleAnimation();
      resetTitleRowImage();
      hideTermPageChrome();
      clearArcTermLayout();
      focusState = null;
      render(currentLayout);
      showDestination();
    },
    enterView,
    syncNavAfterPageEnter,
    timing
  );
}

function navigateTermToTermsIndex() {
  runTermDirectNav(
    () => {
      forceOverviewReset();
      showSunTermsIndex();
    },
    "index"
  );
}

function navigateTermToAbout() {
  runTermDirectNav(
    () => {
      forceOverviewReset();
      showSunAbout();
    },
    "about"
  );
}

function navigateTermToTags() {
  runTermDirectNav(
    // Snap straight into the tags grid — skip the home-map zoom-in beat so the
    // transition reads as a direct scramble swap, not a detour through home.
    () => beginOverviewOpen("filter", { snap: true }),
    "overview"
  );
}

function navigateToAbout() {
  if (isSunAboutVisible()) return;
  if (isFocusActive()) {
    navigateTermToAbout();
    return;
  }
  if (isSunTermsIndexVisible()) {
    navigateIndexToAbout();
    return;
  }
  if (isInOverview()) {
    navigateOverviewToAbout();
    return;
  }
  if (isAtHomeView()) {
    navigateHomeToAbout();
    return;
  }
  routeViaHomeScramble(revealAbout);
}

/** @param {"filter" | "timeline"} mode @param {{ snap?: boolean }} [options] */
function beginOverviewOpen(mode, { snap = false } = {}) {
  cancelScrollMotion();
  clearTimeout(snapDebounceTimer);
  // Set the target first so isInOverview() is true, then switch sub-mode — this
  // makes the tags grid show immediately so the enter scramble lands on its
  // labels instead of falling back to the home-map text.
  setOverviewTarget(1);
  setOverviewSubModeInternal(mode);
  syncOverviewTermsGridVisibility();
  if (snap) {
    overviewProgress = 1;
    cancelOverviewAnimation();
    refreshMapLayoutFromViewport();
    if (currentLayout) render(currentLayout);
    if (mode === "timeline") syncTimelineScrollHint();
  }
}

/** @param {{ snap?: boolean }} [options] */
function beginOverviewClose({ snap = false } = {}) {
  cancelScrollMotion();
  clearTimeout(snapDebounceTimer);

  if (overviewSubMode === "timeline" && !snap) {
    // Timeline keeps the SVG ring visible (no covering grid), so the zoom-out
    // tween IS the animation here — mirror of the timeline zoom-in.
    setOverviewTarget(0);
    return;
  }

  // Tags: the grid covers the sun, so the zoom isn't visible and the page-nav
  // scramble is the animation. Snap the overview state closed — the exact mirror
  // of the open direction (tags scramble out, grid hides, sun snaps to home and
  // scrambles in) with no mid-transition gap where the tags vanish.
  cancelOverviewAnimation();
  overviewTarget = 0;
  overviewProgress = 0;
  hideTimelineEventHint({ immediate: true });
  hideTimelineScrollHint();
  syncOverviewTermsGridVisibility();
  refreshMapLayoutFromViewport();
  if (currentLayout) render(currentLayout);
}

function navigateIndexToTags() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "index",
    () => {
      hideSunTermsIndex();
      beginOverviewOpen("filter");
    },
    "overview",
    syncNavAfterPageEnter,
    PAGE_ROUTE_TIMING
  );
}

function navigateIndexToTimeline() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "index",
    () => {
      hideSunTermsIndex();
      // Snap into timeline — skip the home-map zoom-in beat between index and timeline.
      beginOverviewOpen("timeline", { snap: true });
    },
    "overview",
    syncNavAfterPageEnter,
    PAGE_TIMELINE_ENTER_TIMING
  );
}

function navigateHomeToTags() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "map",
    () => beginOverviewOpen("filter"),
    "overview",
    syncNavAfterPageEnter,
    PAGE_ROUTE_TIMING
  );
}

function navigateHomeToTimeline() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "map",
    () => beginOverviewOpen("timeline"),
    "overview",
    syncNavAfterPageEnter,
    PAGE_TIMELINE_ENTER_TIMING
  );
}

function navigateTagsToHome() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "overview",
    () => beginOverviewClose(),
    "map",
    syncNavAfterPageEnter,
    PAGE_ROUTE_TIMING
  );
}

function navigateTimelineToHome() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "overview",
    () => beginOverviewClose(),
    "map",
    syncNavAfterPageEnter,
    PAGE_TIMELINE_EXIT_TIMING
  );
}

function navigateTagsToIndex() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "overview",
    () => {
      beginOverviewClose();
      showSunTermsIndex();
    },
    "index",
    syncNavAfterPageEnter,
    PAGE_ROUTE_TIMING
  );
}

function navigateTimelineToIndex() {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  runPageNavScrambleTransition(
    "overview",
    () => {
      // Index covers the viewport — snap timeline closed instead of zooming out over home.
      beginOverviewClose({ snap: true });
      showSunTermsIndex();
    },
    "index",
    syncNavAfterPageEnter,
    PAGE_TIMELINE_EXIT_TIMING
  );
}

function navigateToTermsIndex() {
  if (isSunTermsIndexVisible()) return;
  if (isFocusActive()) {
    navigateTermToTermsIndex();
    return;
  }
  if (isSunAboutVisible()) {
    navigateAboutToIndex();
    return;
  }
  if (isOverviewTagsMode()) {
    navigateTagsToIndex();
    return;
  }
  if (isOverviewTimelineMode()) {
    navigateTimelineToIndex();
    return;
  }
  routeViaHomeScramble(revealTermsIndex);
}

/** Switch tags ↔ timeline in place — scramble + relayout, no home detour. */
function navigateOverviewSubMode(mode) {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  if (!isInOverview() || overviewSubMode === mode) return;

  const timing = pageTimingForOverviewMode(mode, overviewSubMode);

  runPageNavScrambleTransition(
    "overview",
    () => {
      resetOverviewFitCache();
      overviewOverflowPasses = 0;
      setOverviewSubModeInternal(mode);
      cancelScrollMotion();
      clearTimeout(snapDebounceTimer);
      refreshMapLayoutFromViewport();
      if (currentLayout) render(currentLayout);
    },
    "overview",
    syncNavAfterPageEnter,
    timing
  );
}

/** @param {"filter" | "timeline"} mode */
function navigateToOverviewMode(mode) {
  if (isSunAboutVisible()) {
    if (mode === "filter") {
      navigateAboutToTags();
      return;
    }
    navigateAboutToTimeline();
    return;
  }

  if (isSunTermsIndexVisible()) {
    if (mode === "filter") {
      navigateIndexToTags();
      return;
    }
    navigateIndexToTimeline();
    return;
  }
  if (isFocusActive()) {
    if (mode === "filter") {
      navigateTermToTags();
      return;
    }
    startUnfocusAnimation({ toOverviewWithMode: mode });
    return;
  }
  if (!isInOverview()) {
    if (mode === "filter" && isAtHomeView()) {
      navigateHomeToTags();
      return;
    }
    if (mode === "timeline" && isAtHomeView()) {
      navigateHomeToTimeline();
      return;
    }
    navigateViaHome(() => {
      setOverviewSubModeInternal(mode);
      setOverviewTarget(1);
      syncNavAfterPageEnter();
    });
    return;
  }
  if (overviewSubMode !== mode) {
    navigateOverviewSubMode(mode);
  }
}

/** @param {string} target */
function handleMapNav(target) {
  if (isBleedTextLabMode()) return target === "home";
  if (isNavTargetActive(target)) return true;

  abortNavBlockingState();

  switch (target) {
    case "home":
      navigateToHome();
      return true;
    case "timeline":
      navigateToOverviewMode("timeline");
      return true;
    case "tags":
      navigateToOverviewMode("filter");
      return true;
    case "index":
      navigateToTermsIndex();
      return true;
    case "about":
      navigateToAbout();
      return true;
    default:
      return false;
  }
}

function openTermById(termId) {
  const location = findTermLocation(termId);
  if (!location || !currentLayout) return;
  if (isFocusActive() || isTermNavigating() || isPageNavTransitionActive()) return;

  cancelScrollMotion();
  clearTimeout(snapDebounceTimer);
  setOverviewTarget(0);
  clearTermHover();
  refreshMapLayoutFromViewport();
  activeIndex = location.groupIndex;
  scrollOffset = scrollOffsetForGroup(location.groupIndex, currentLayout);
  updateActiveFromScroll(currentLayout);
  ensureActiveRowSnapped(currentLayout);
  render(currentLayout);
  startFocusAnimation(location.termIndex);
}

/**
 * Open a term from a covering page (index / tags grid): route through the home
 * map first so the overlay scrambles away and the sun reappears, then zoom into
 * the term page. Falls back to a direct open when already at home.
 * @param {string} termId
 */
function openTermViaHome(termId) {
  if (isPageNavTransitionActive() || isFocusActive() || isTermNavigating()) return;
  if (isAtHomeView()) {
    openTermById(termId);
    return;
  }
  // Use the scramble route (not the eased overview zoom-out): from the tags
  // page it snaps the overview closed and scrambles the sun ring straight back
  // in, so the home view fills the frame immediately instead of leaving a blank
  // beat between the tags content vanishing and the sun reappearing.
  routeViaHomeScramble(() => openTermById(termId));
}

function consumeSessionNavIntent() {
  const navTarget = sessionStorage.getItem(NAV_STORAGE_KEY);
  if (navTarget) {
    sessionStorage.removeItem(NAV_STORAGE_KEY);
    requestAnimationFrame(() => {
      if (navTarget === "filter" || navTarget === "tags") {
        navigateToOverviewMode("filter");
      } else if (navTarget === "timeline") {
        navigateToOverviewMode("timeline");
      } else if (navTarget === "index") {
        navigateToTermsIndex();
      } else if (navTarget === "about") {
        navigateToAbout();
      } else if (navTarget === "home") {
        navigateToHome();
      }
    });
  }

  const termId = sessionStorage.getItem(TERM_STORAGE_KEY);
  if (termId) {
    sessionStorage.removeItem(TERM_STORAGE_KEY);
    requestAnimationFrame(() => openTermById(termId));
  }
}

function syncTimelineHintFromYearScroll() {
  if (!yearScroll) return;
  const { labelYear } = yearScroll.getDisplayedYears();
  syncTimelineEventHint(labelYear);
}

function syncOverviewTermsGridVisibility() {
  // Tie grid visibility to the *target*, not the current progress: while the
  // overview is zooming out (target 0, progress still high) the grid must hide
  // immediately so the sun reappears and the zoom-out reads as one smooth move
  // instead of the grid snapping away at the very end.
  if (overviewTarget > 0 && isOverviewTagsMode()) {
    showSunOverviewTermsGrid();
  } else {
    hideSunOverviewTermsGrid();
  }
}

function setOverviewSubModeInternal(mode) {
  overviewSubMode = mode === "timeline" ? "timeline" : "filter";
  setOverviewSubMode(overviewSubMode);
  syncOverviewTermsGridVisibility();
  if (overviewSubMode === "filter" && isInOverview()) {
    cancelScrollMotion();
  }
  if (overviewSubMode === "timeline") {
    resetTimelineScrollHint();
    syncTimelineHintFromYearScroll();
  } else {
    hideTimelineEventHint({ immediate: true });
    hideTimelineScrollHint();
  }
}

function isOverviewTimelineMode() {
  return overviewProgress > 0.02 && overviewSubMode === "timeline";
}

function isOverviewTagsMode() {
  return isInOverview() && overviewSubMode !== "timeline";
}

function flushPendingAfterHome() {
  if (!pendingAfterHome || !isAtHomeView()) return;
  const onHomeReady = pendingAfterHome;
  pendingAfterHome = null;
  onHomeReady();
}

function setOverviewTarget(value) {
  if (isFocusActive() || isTermNavigating()) return;
  if (value > 0) clearArcTermLayout();
  overviewTarget = value;
  if (value === 0) {
    hideTimelineEventHint({ immediate: true });
    hideTimelineScrollHint();
  } else if (overviewSubMode === "timeline") {
    syncTimelineScrollHint();
  }
  if (value > 0) {
    cancelScrollMotion();
    clearTimeout(snapDebounceTimer);
  }
  if (Math.abs(overviewProgress - overviewTarget) < 0.002) {
    overviewProgress = overviewTarget;
    cancelOverviewAnimation();
    syncOverviewTermsGridVisibility();
    flushPendingAfterHome();
    return;
  }
  // (Re)anchor the eased tween from wherever the zoom currently sits so a
  // mid-flight retarget (e.g. open then close) stays smooth instead of jumping.
  overviewAnimStartTime = performance.now();
  overviewAnimFromProgress = overviewProgress;
  if (!overviewAnimFrame) {
    overviewAnimFrame = requestAnimationFrame(tickOverview);
  }
}

function tickOverview() {
  const closingDuringFocus =
    isFocusActive() && overviewTarget <= 0 && overviewProgress > 0.002;
  if ((isFocusActive() || isTermNavigating()) && !closingDuringFocus) {
    cancelOverviewAnimation();
    return;
  }

  const durationMs = Math.max(1, LAYOUT.overviewTweenMs);
  const elapsed = performance.now() - overviewAnimStartTime;
  const t = clamp(elapsed / durationMs, 0, 1);
  const done = t >= 1 || Math.abs(overviewTarget - overviewAnimFromProgress) < 0.002;
  if (done) {
    const closingOverview = overviewTarget === 0 && overviewProgress > 0.001;
    overviewProgress = overviewTarget;
    overviewAnimFrame = null;
    if (
      closingOverview &&
      currentLayout &&
      !isFocusActive() &&
      !isTermNavigating()
    ) {
      snapToNearest(currentLayout);
    }
    flushPendingAfterHome();
    syncOverviewTermsGridVisibility();
  } else {
    overviewProgress =
      overviewAnimFromProgress +
      (overviewTarget - overviewAnimFromProgress) * easeInOutCubic(t);
    overviewAnimFrame = requestAnimationFrame(tickOverview);
  }

  if (!groups.length) return;
  currentLayout = computeLayout(viewport.clientWidth, viewport.clientHeight);
  render(currentLayout);
  syncOverviewTermsGridVisibility();
  // Only resurface the scroll hint while the timeline is the *destination*
  // (target > 0). When closing the timeline (target 0) the zoom is still
  // mid-flight, so without this guard the hint would flash back on top of the
  // home/index/about page we're navigating to.
  if (overviewSubMode === "timeline" && overviewTarget > 0 && overviewProgress > 0.02) {
    syncTimelineScrollHint();
  }
}

function isInOverview() {
  return overviewProgress > 0.02 || overviewTarget > 0;
}

function bindOverviewHover() {
  viewport.addEventListener("mousemove", (event) => {
    lastPointer = { x: event.clientX, y: event.clientY, known: true };
    applyOverviewHoverAtPointer(event.clientX, event.clientY);
  });

  viewport.addEventListener("mouseleave", () => {
    lastPointer.known = false;
    if (isFocusActive() || overviewProgress > 0.02) return;
    clearOverviewTermHover();
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function prepareRenderParts(layout) {
  const { viewportWidth, viewportHeight } = layout;

  svgEl.setAttribute("width", viewportWidth);
  svgEl.setAttribute("height", viewportHeight);
  svgEl.setAttribute("viewBox", `0 0 ${viewportWidth} ${viewportHeight}`);

  const parts = [];
  const needsCarouselClip =
    focusState &&
    getFocusEnterCarouselSteps(
      focusState,
      groups[focusState.activeIndex]?.terms.length ?? 0
    ) > 0 &&
    focusState.phase === "animating";
  const defsParts = [
    '<linearGradient id="sun-censor-rgb-fill" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0" stop-color="#111111" />',
    '<stop offset="0.82" stop-color="#111111" id="sun-censor-rgb-ink-edge" />',
    '<stop id="sun-censor-rgb-edge-a" offset="0.82" stop-color="#111111" />',
    '<stop id="sun-censor-rgb-edge-b" offset="1" stop-color="#111111" />',
    "</linearGradient>",
  ];
  if (needsCarouselClip) {
    const carouselClip = getFocusCarouselClipVerticalSpan();
    defsParts.push(
      `<clipPath id="sun-carousel-clip"><rect id="sun-carousel-clip-rect" y="${carouselClip.y}" height="${carouselClip.height}" /></clipPath>`
    );
  }
  parts.push(`<defs>${defsParts.join("")}</defs>`);

  const overview = resolveLayoutOverview(layout);
  const contentScale = layout.contentScale ?? 1;
  const fontSize = getOverviewFontSize(
    overview,
    contentScale,
    layout.typographyScale ?? 1,
    layout.overviewTypographyScale ?? layout.typographyScale ?? 1
  );
  if (overview > 0.001) {
    svgEl.style.setProperty("--sun-overview-font-size", `${fontSize}px`);
  } else {
    svgEl.style.removeProperty("--sun-overview-font-size");
  }
  const overviewHitR = getOverviewHitRadius(layout);

  if (
    !isOverviewTagsMode() &&
    (!focusState || focusState.phase === "animating")
  ) {
    parts.push(
      `<circle class="sun-overview-hit" cx="${layout.cx}" cy="${layout.cy}" r="${overviewHitR}" fill="rgba(0,0,0,0.001)" />`
    );
  }

  const isTermLocked = focusState ? isFocusTermLayoutPhase(focusState.phase) : false;

  if (
    focusState?.phase === "locked" &&
    !TERM_PAGE_LEGACY_CONTENT_ENABLED &&
    !termPageSelectedFontSettled &&
    !termPageLayoutAnimActive
  ) {
    restoreFrozenTermPageSiblingXs();
  }

  svgEl.classList.toggle("sun-is-overview", overview > 0.02);
  svgEl.classList.toggle("sun-is-in-overview", isInOverview());
  svgEl.classList.toggle(
    "sun-is-overview-timeline",
    overview > 0.02 && overviewSubMode === "timeline"
  );
  svgEl.classList.toggle("sun-is-focused", isFocusActive());
  svgEl.classList.toggle("sun-is-term-locked", isTermLocked);
  viewport?.classList.toggle("is-term-locked", isTermLocked);
  svgEl.classList.toggle(
    "sun-is-unfocusing",
    focusState?.phase === "unfocusing"
  );
  if (overview > 0.02 && hoveredRay) {
    hoveredRay.classList.remove("is-term-hover");
    hoveredWrap?.classList.remove("is-hovered");
    clearTermHover();
  }

  const timelineYears =
    overview > 0.02 && overviewSubMode === "timeline" && yearScroll
      ? yearScroll.getDisplayedYears()
      : null;

  if (overview > 0.02 && overviewSubMode === "timeline" && yearScroll) {
    const { labelYear } = yearScroll.getDisplayedYears();
    parts.push(
      `<text class="sun-overview-label sun-timeline-year" x="${layout.cx}" y="${layout.cy}" text-anchor="middle" dominant-baseline="middle">${labelYear}</text>`
    );
  }

  return { parts, overview, fontSize, timelineYears };
}

function appendRenderGroup(parts, layout, groupIndex, renderContext) {
  if (isOverviewTagsMode()) return;
  if (!isGroupVisible(groupIndex, layout)) return;

  const { overview, fontSize, timelineYears } = renderContext;
  const group = groups[groupIndex];
  const transform = getGroupTransform(groupIndex, layout);
  const { anchor, rotation, placed } = layoutTermsOnRay(transform, group.terms, layout);

  const displayActiveIndex = getDisplayActiveIndex();
  const isActiveRay =
    overview <= 0.02 && groupIndex === displayActiveIndex;
  const stateClasses = [];
  if (overview <= 0.02) {
    stateClasses.push(groupIndex === displayActiveIndex ? "is-active" : "is-dimmed");
  }
  if (
    focusState &&
    isActiveRay &&
    isFocusTermLayoutPhase(focusState.phase)
  ) {
    stateClasses.push("is-locked");
  }

  let rayStyle = "";
  if (focusState && groupIndex !== focusState.activeIndex) {
    const opacity = getRayExitOpacity(anchor, layout);
    if (opacity < 0.999) {
      rayStyle = ` style="opacity:${opacity.toFixed(3)}"`;
    }
  }

  parts.push(
    `<g class="sun-ray ${stateClasses.join(" ")}" data-group="${groupIndex}" transform="translate(${anchor.x}, ${anchor.y}) rotate(${rotation})"${rayStyle}>`
  );

  const carouselStepCount =
    focusState && isActiveRay
      ? getFocusEnterCarouselSteps(focusState, placed.length)
      : 0;
  const useCarouselLayers =
    focusState &&
    isActiveRay &&
    carouselStepCount > 0 &&
    focusState.phase === "animating";

  const isTermLocked = focusState?.phase === "locked";
  const useTermScrollLift =
    !TERM_PAGE_LEGACY_CONTENT_ENABLED &&
    isTermLocked &&
    isTermPageScrollBgMode();

  const useFocusTermLayout =
    focusState &&
    isActiveRay &&
    (isFocusTermLayoutPhase(focusState.phase) || focusState.phase === "unfocusing");
  const savedArcTermLayout =
    !focusState &&
    arcTermLayout &&
    isActiveRay &&
    arcTermLayout.groupIndex === groupIndex
      ? arcTermLayout
      : null;

  if (useCarouselLayers) {
    parts.push('<g class="sun-term-track">');
  }

  if (useTermScrollLift) {
    parts.push('<g class="sun-term-scroll-lift">');
  }

  for (let termIndex = 0; termIndex < placed.length; termIndex++) {
    const tp = placed[termIndex];
    const termX = useFocusTermLayout
      ? focusState.termEndXs[termIndex]
      : savedArcTermLayout
        ? savedArcTermLayout.termXs[termIndex]
        : tp.localX;
    const termAnchor = useFocusTermLayout
      ? focusState.textAnchor
      : savedArcTermLayout
        ? savedArcTermLayout.textAnchor
        : tp.textAnchor;
    const selectedClass =
      focusState && isActiveRay && termIndex === getFocusSelectedTermIndex()
        ? " is-selected"
        : "";
    const displayFontClass =
      selectedClass &&
      termPageSelectedFontSettled &&
      focusState.phase === "locked"
        ? " is-display-font"
        : "";
    const carouselClass = "";
    const newlyCensoredClass =
      !selectedClass && newlyCensoredTermId && tp.term.id === newlyCensoredTermId
        ? newlyCensoredWriting
          ? " is-newly-censored is-censoring"
          : " is-newly-censored"
        : "";

    let termWrapStyle = "";
    if (timelineYears) {
      const termOpacity = getTermOpacity(
        termYearIndex,
        tp.term.id,
        timelineYears.fromYear,
        timelineYears.toYear,
        timelineYears.blend
      );
      if (termOpacity < 0.01) continue;
      if (termOpacity < 0.999) {
        termWrapStyle = ` style="opacity:${termOpacity.toFixed(3)}"`;
      }
    }

    const useTermPageBaseline =
      !TERM_PAGE_LEGACY_CONTENT_ENABLED &&
      focusState &&
      isActiveRay &&
      usesTermPageAlphabeticBaseline();
    const termBaseline = useTermPageBaseline ? "alphabetic" : "middle";
    const isSelectedTerm =
      Boolean(selectedClass) &&
      termPageSelectedFontSettled &&
      focusState.phase === "locked";
    const selectedFontSize = getTermPageSelectedFontSizePx(layout.viewportWidth);
    const termStyle = isSelectedTerm
      ? `font-family:Secolo,serif;font-size:${selectedFontSize}px;font-weight:normal`
      : `font-size:${fontSize}px`;

    parts.push(
      `<g class="sun-term-wrap${selectedClass}${displayFontClass}${carouselClass}${newlyCensoredClass}"${termWrapStyle} data-term-index="${termIndex}" data-term-id="${escapeAttr(tp.term.id)}">`
    );
    parts.push('<rect class="sun-term-hit" fill="rgba(0,0,0,0.001)" />');
    parts.push(
      `<text class="sun-term" x="${termX}" y="0" style="${termStyle}" text-anchor="${termAnchor}" dominant-baseline="${termBaseline}">${escapeHtml(applyTypographyRules(tp.term.name))}</text>`
    );
    parts.push('<rect class="sun-term-censor" aria-hidden="true" />');
    parts.push("</g>");
  }

  if (useTermScrollLift) {
    parts.push("</g>");
  }

  if (useCarouselLayers) {
    parts.push("</g>");
    parts.push('<rect class="sun-term-mask sun-term-mask--left" />');
    parts.push('<rect class="sun-term-mask sun-term-mask--right" />');
  }

  parts.push("</g>");
}

function finalizeRender(layout) {
  clearTermHover();
  if (hoveredTitleRowTermId && !isFocusActive()) {
    restoreOverviewTermHoverFromState();
  }
  refineTermPositions(layout);
  refineTermPagePositions();
  if (focusState) {
    applyFocusTermPositions(layout);
  }
  updateBackFixedOverlay(layout);
  updateTermPage(layout);
  if (newlyCensoredTermId) {
    refreshTermPageSiblingCensorBars();
    applyNewlyCensoredStateToWrap();
  }
  if (isTermPageFocusVisual() && termPageLayoutAnimActive && termPageCensoredPushTarget) {
    refreshTermPageSiblingCensorBars();
    applyTermPageCensoredPushFromTarget(
      termPageCensoredPushTarget,
      termPageCensoredPushProgress
    );
    updateTermPageSimilarLabel(layout);
  } else if (
    isTermPageFocusVisual() &&
    termPageSelectedFontSettled &&
    !viewport?.classList.contains("is-term-font-scrambling")
  ) {
    termPageDeferCensoredWrapRepack = true;
    applyTermPageCensoredBaselineAlign(getFocusRayGroup(), {
      refreshBars: false,
    });
    termPageDeferCensoredWrapRepack = false;
    if (isViewportTermScrollable()) {
      termPageCensoredScrollShiftY = getTermCensoredGroupScreenShiftY();
    }
    if (currentLayout) {
      applyFocusRayScrollAnchor(currentLayout);
    }
    applyTermPageScrollLiftTransform();
    updateTermPageSimilarLabel(layout);
  }
  syncRayFixedImages(layout);
  applyAllRowFixedPushes(layout);
  updateTitleRowImage(layout);
  syncIdleGallery(layout);
  correctOverviewOverflow(layout);
  applySunFilterTestOpacity(svgEl);
  // The timeline zoom rebuilds the ring every frame, orphaning the page-nav
  // enter scramble on its labels. Re-apply it so the ring scrambles for the same
  // beat as snap routes (index/about/tags → timeline). No-op outside the enter window.
  if (overviewSubMode === "timeline" && isInOverview()) {
    maintainEnterScramble([...svgEl.querySelectorAll("text.sun-term")]);
  }
  syncSiteNavFromMap(getActiveNavTarget);
  repositionTimelineEventHint();
}

function render(layout) {
  const renderContext = prepareRenderParts(layout);
  const count = LAYOUT.rayCount || 0;
  for (let groupIndex = 0; groupIndex < count; groupIndex++) {
    appendRenderGroup(renderContext.parts, layout, groupIndex, renderContext);
  }
  svgEl.innerHTML = renderContext.parts.join("");
  finalizeRender(layout);
}

async function renderIncremental(layout, frameBudgetMs = 10) {
  const renderContext = prepareRenderParts(layout);
  const count = LAYOUT.rayCount || 0;
  let groupIndex = 0;

  while (groupIndex < count) {
    const frameStart = performance.now();
    while (groupIndex < count && performance.now() - frameStart < frameBudgetMs) {
      appendRenderGroup(renderContext.parts, layout, groupIndex, renderContext);
      groupIndex += 1;
    }
    await yieldToMain();
  }

  svgEl.innerHTML = renderContext.parts.join("");
  await yieldToMain();
  finalizeRender(layout);
}

function clearTermHover() {
  if (hoveredWrap) {
    stopLetterShuffle(getLetterShuffleTarget(hoveredWrap));
  }
  hoveredRay = null;
  hoveredWrap = null;
}

function setTermHover(ray, wrap) {
  if (hoveredRay === ray && hoveredWrap === wrap) return;
  clearTermHover();
  hoveredRay = ray;
  hoveredWrap = wrap;
  ray.classList.add("is-term-hover");
  wrap.classList.add("is-hovered");
  startLetterShuffle(getLetterShuffleTarget(wrap));
}

function getCarouselSteps(clickedIndex, termCount) {
  return clickedIndex > 0 ? termCount - clickedIndex : 0;
}

function getCarouselStepMs(termCount, carouselSteps) {
  const isFew = termCount <= 3;
  let stepMs;
  if (carouselSteps <= 1) {
    stepMs = isFew ? LAYOUT.focusReorderMsFew : LAYOUT.focusReorderMs;
  } else {
    stepMs = isFew ? LAYOUT.focusReorderMsMultiFew : LAYOUT.focusReorderMsMulti;
    // Many-term carousels chain more rotation steps, so trim each step a touch
    // as the term count grows past 3 to keep the full rotation snappy.
    const extra = termCount - 3;
    if (extra > 0) {
      stepMs *= Math.max(
        LAYOUT.focusReorderMultiSpeedMin,
        1 - extra * LAYOUT.focusReorderMultiSpeedStep
      );
    }
  }
  return stepMs * getReorderTimeScale();
}

function getFocusReorderDuration(clickedIndex, termCount, carouselSteps = null) {
  const steps = carouselSteps ?? getCarouselSteps(clickedIndex, termCount);
  return steps * getCarouselStepMs(termCount, steps);
}

function getFocusAnimDuration(clickedIndex, termCount, carouselSteps = null) {
  return (
    getFocusExitMs() +
    getFocusRiseMs() +
    getFocusReorderDuration(clickedIndex, termCount, carouselSteps)
  );
}

function getFocusEnterCarouselSteps(state, termCount) {
  if (state.enterCarouselSteps != null) {
    return state.enterCarouselSteps;
  }
  return getCarouselSteps(state.clickedIndex, termCount);
}

function getFocusEnterFromSlots(state, termCount) {
  if (state.enterFromSlots) {
    return state.enterFromSlots;
  }
  return Array.from({ length: termCount }, (_, i) => i);
}

function startFocusAnimation(clickedIndex) {
  const preFocusGroupIndex =
    termNavState?.phase === "entering"
      ? termNavState.targetGroupIndex
      : activeIndex;
  const preFocusTerm = groups[preFocusGroupIndex]?.terms[clickedIndex];
  if (preFocusTerm?.name) {
    boostTermImagePreloadForTerm(preFocusTerm.name);
    scheduleTermImagePreloadBoost(preFocusGroupIndex);
  }
  const carryBleedImage = preFocusTerm
    ? resolveTermPageBleedCarryImage(preFocusTerm)
    : null;
  termPageBleedCarryImage = carryBleedImage;
  const preserveBleed =
    Boolean(carryBleedImage) ||
    (isBleedBackdropLoaded() &&
      Boolean(preFocusTerm && hoveredTitleRowTermId === preFocusTerm.id));
  resetTitleRowImage({ preserveBleed });
  clearSameObjectMentionHover();
  clearTermFontScrambleAnimation();
  termPageSelectedFontSettled = false;
  clearTermPageSiblingFreeze();
  termPageBleedTermId = null;
  termPageFontScrambleToken++;
  armSameObjectHoverReenterGate();
  const groupIndex = preFocusGroupIndex;
  const preservedArc =
    arcTermLayout && arcTermLayout.groupIndex === groupIndex ? arcTermLayout : null;
  clearArcTermLayout();
  activeIndex = groupIndex;
  const group = groups[groupIndex];
  if (group.terms.length > 1) {
    holdSiblingTermCensors();
    enableTermEnterSiblingCensor();
  }
  const transform = getGroupTransform(groupIndex, currentLayout);
  const widths = measureTermWidths(groupIndex);
  const termTargets = computeFocusTermTargets(groupIndex, currentLayout, widths, clickedIndex);

  let termStartXs = termTargets.startXs;
  let enterFromSlots = null;
  let enterCarouselSteps = null;
  if (preservedArc && preservedArc.clickedIndex != null) {
    termStartXs = preservedArc.termXs.slice();
    enterFromSlots = getSlotOrderForClickedIndex(
      preservedArc.clickedIndex,
      group.terms.length
    );
    const toSlots = getSlotOrderForClickedIndex(clickedIndex, group.terms.length);
    enterCarouselSteps = countCarouselRotations(enterFromSlots, toSlots);
  }

  focusState = {
    phase: "animating",
    direction: "in",
    activeIndex: groupIndex,
    clickedIndex,
    startTime: performance.now(),
    riseT: 0,
    exitT: 0,
    backCircleT: 0,
    backMiniExitT: 1,
    backCircleStartTime: 0,
    riseStartY: transform.anchor.y,
    exitFromPinned: false,
    exitPinnedBaselineY: null,
    termStartXs,
    enterFromSlots,
    enterCarouselSteps,
    termEndXs: termTargets.endXs,
    termWidths: termTargets.termWidths,
    termGap: termTargets.termGap,
    exitX: termTargets.exitX,
    enterX: termTargets.enterX,
    exitGateX: termTargets.exitGateX,
    entryGateX: termTargets.entryGateX,
    outwardSign: termTargets.outwardSign,
    textAnchor: termTargets.textAnchor,
  };

  if (preserveBleed && isBleedBackdropLoaded()) {
    transitionBleedBackdropToTermPage();
  }

  const overviewClosing = overviewTarget <= 0 && overviewProgress > 0.02;
  if (!overviewClosing) {
    forceOverviewReset();
  }

  cancelFocusAnimation();
  render(currentLayout);
  focusAnimFrame = requestAnimationFrame(tickFocus);
}

function tickFocus(now) {
  if (!focusState) return;

  const elapsed = now - focusState.startTime;
  const group = groups[focusState.activeIndex];
  const enterCarouselSteps = getFocusEnterCarouselSteps(focusState, group.terms.length);
  const totalMs = getFocusAnimDuration(
    focusState.clickedIndex,
    group.terms.length,
    enterCarouselSteps
  );

  const exitMs = getFocusExitMs();
  const riseMs = getFocusRiseMs();
  focusState.exitT = clamp(elapsed / exitMs, 0, 1);
  focusState.riseT = clamp((elapsed - exitMs) / riseMs, 0, 1);

  if (isTermPageFocusVisual() && isBleedBackdropLoaded()) {
    syncTermPageBleedClip();
    syncBleedBackdropDarkInvert();
  }

  render(currentLayout);

  if (elapsed < totalMs) {
    focusAnimFrame = requestAnimationFrame(tickFocus);
    return;
  }

  focusState.riseT = 1;
  focusState.exitT = 1;
  focusState.termEndXs = computeTermEndXs(
    focusState.termWidths,
    focusState.termGap,
    focusState.outwardSign,
    focusState.clickedIndex,
    group.terms.length
  );
  focusState.phase = "locked";
  focusState.backCircleT = 0;
  focusState.backMiniExitT = 1;
  focusState.enterFromSlots = undefined;
  focusState.enterCarouselSteps = undefined;
  focusAnimFrame = null;
  const wasTermNavEnter = termNavState?.phase === "entering";
  if (wasTermNavEnter) {
    termNavState = null;
    setNavigatingUI(false);
  }
  render(currentLayout);
  disableTermEnterSiblingCensor();
  onTermPageFocusLocked();
  if (wasTermNavEnter) {
    requestAnimationFrame(() => {
      if (focusState?.phase === "locked") render(currentLayout);
    });
  }
  if (lastPointer.known) {
    syncSameObjectHoverAtPointer(lastPointer.x, lastPointer.y);
  }
  startBackCircleFade();
}

function rebuildFocusLayout() {
  if (!groups.length || !focusState) return;

  const prevScrollTop = viewport?.scrollTop ?? 0;
  const prevHeight = currentLayout?.viewportHeight ?? getLiveViewportHeight();
  const prevWidth = currentLayout?.viewportWidth ?? getLiveViewportWidth();

  invalidateBackMiniWidthCache();
  currentLayout = computeLayout(viewport.clientWidth, viewport.clientHeight);
  syncTermPageResponsiveState(currentLayout.viewportWidth, currentLayout.viewportHeight);
  buildTitleRowBleedDistribution(currentLayout.viewportWidth, currentLayout.viewportHeight);
  if (titleRowHoverMode !== null) titleRowHoverMode = null;
  clearTitleRowHoverImage();
  const rayGroup = svgEl.querySelector(`[data-group="${focusState.activeIndex}"]`);
  const wraps = rayGroup ? [...rayGroup.querySelectorAll(".sun-term-wrap")] : [];
  const widths = wraps.map((wrap) => wrap.querySelector(".sun-term")?.getBBox().width ?? 0);

  if (!widths.length) {
    widths.push(
      ...groups[focusState.activeIndex].terms.map((t) => estimateTermWidth(t.name))
    );
  }

  const termTargets = computeFocusTermTargets(
    focusState.activeIndex,
    currentLayout,
    widths,
    focusState.clickedIndex
  );

  focusState.riseStartY = getGroupTransform(focusState.activeIndex, currentLayout, {
    skipFocusModifiers: true,
  }).anchor.y;
  focusState.termStartXs = termTargets.startXs;
  focusState.termEndXs = termTargets.endXs;
  focusState.termWidths = termTargets.termWidths;
  focusState.termGap = termTargets.termGap;
  focusState.exitX = termTargets.exitX;
  focusState.enterX = termTargets.enterX;
  focusState.exitGateX = termTargets.exitGateX;
  focusState.entryGateX = termTargets.entryGateX;
  focusState.outwardSign = termTargets.outwardSign;
  focusState.textAnchor = termTargets.textAnchor;

  if (focusState.phase === "locked") {
    focusState.riseT = 1;
    focusState.exitT = 1;
    if (!TERM_PAGE_LEGACY_CONTENT_ENABLED) {
      applyFocusTermPageLayout();
    }
  }

  render(currentLayout);
  if (
    focusState.phase === "locked" &&
    isTermPageScrollBgMode() &&
    viewport &&
    (Math.abs(prevHeight - currentLayout.viewportHeight) > 0.5 ||
      Math.abs(prevWidth - currentLayout.viewportWidth) > 0.5)
  ) {
    termPageCensoredFrozenScreenAlign = null;
    termPageHeaderRowRestTop = null;
    const nextScrollTop = resolveTermPageScrollTopAfterResize({
      scrollTop: prevScrollTop,
      prevHeight,
      nextHeight: currentLayout.viewportHeight,
      getPinSnap: getTermPageDefinitionSnapScrollTop,
    });
    if (Math.abs(nextScrollTop - prevScrollTop) > 0.5) {
      viewport.scrollTop = nextScrollTop;
    }
    syncTermHeaderScrollTransform(currentLayout);
    syncTermHeaderPinState(currentLayout);
  }
  if (hoveredSameObjectMentionId) clearSameObjectMentionHover();
}

function isMapTermActivationBlocked() {
  return isBleedTextLabMode() || isFocusActive() || isSnapping || isTermNavigating();
}

function activateMapTerm(wrap, ray) {
  if (!wrap || !ray) return false;

  const wraps = [...ray.querySelectorAll(".sun-term-wrap")];
  const clickedIndex = wraps.indexOf(wrap);
  if (clickedIndex < 0) return false;

  cancelScrollMotion();
  clearTimeout(snapDebounceTimer);
  setOverviewTarget(0);
  clearTermHover();
  refreshMapLayoutFromViewport();
  ensureActiveRowSnapped(currentLayout);
  startFocusAnimation(clickedIndex);
  return true;
}

function resolveHomeMapTermClickTarget(event) {
  const hit = event.target.closest(".sun-term-hit");
  if (hit) {
    const wrap = hit.closest(".sun-term-wrap");
    const ray = hit.closest(".sun-ray.is-active");
    if (wrap && ray) return { wrap, ray };
  }

  const fixedHit = event.target.closest(".sun-ray-fixed-image-hit");
  if (fixedHit) {
    const termId = getFixedImageTermId(fixedHit);
    const ray = fixedHit.closest(".sun-ray.is-active");
    const wrap = termId && ray ? getHoveredTermWrap(ray, termId) : null;
    if (wrap && ray) return { wrap, ray };
  }

  return null;
}

function resolveOverviewTermClickTarget(event) {
  if (resolveLayoutOverview() <= 0.02) return null;

  const hit = event.target.closest(".sun-term-hit");
  if (!hit) return null;

  const wrap = hit.closest(".sun-term-wrap");
  const termId = wrap?.dataset.termId;
  if (!wrap || !termId) return null;

  return { termId };
}

function handleMapTermPointerActivate(event) {
  if (isMapTermActivationBlocked()) return false;

  const overview = resolveLayoutOverview();
  if (overview > 0.02) {
    const overviewTarget = resolveOverviewTermClickTarget(event);
    if (!overviewTarget) return false;
    event.preventDefault();
    openTermById(overviewTarget.termId);
    return true;
  }

  if (overviewProgress > 0.02) return false;

  const target = resolveHomeMapTermClickTarget(event);
  if (!target) return false;

  event.preventDefault();
  return activateMapTerm(target.wrap, target.ray);
}

function bindTermClick() {
  let pointerDown = null;

  const isPointerTrackingTarget = (el) =>
    Boolean(
      el?.closest(".sun-term-hit") || el?.closest(".sun-ray-fixed-image-hit")
    );

  const resetPointerDown = () => {
    pointerDown = null;
  };

  svgEl.addEventListener("pointerdown", (event) => {
    if (!isPointerTrackingTarget(event.target)) return;
    pointerDown = { x: event.clientX, y: event.clientY };
  });

  svgEl.addEventListener("pointerup", (event) => {
    if (!pointerDown) return;

    const moved = Math.hypot(
      event.clientX - pointerDown.x,
      event.clientY - pointerDown.y
    );
    resetPointerDown();
    if (moved > 8) return;

    handleMapTermPointerActivate(event);
  });

  svgEl.addEventListener("pointercancel", resetPointerDown);
}

function bindTermHover() {
  // Arm hover on the first genuine pointer movement. A stationary pointer that
  // the freshly rendered map appears under never fires `pointermove`, so its
  // synthetic `mouseover` stays ignored until the user actually moves.
  svgEl.addEventListener(
    "pointermove",
    () => {
      termHoverArmed = true;
    },
    { passive: true }
  );

  svgEl.addEventListener("mouseover", (event) => {
    if (!termHoverArmed) return;
    if (isFocusActive()) return;
    if (overviewProgress > 0.02) return;
    if (isArcScrollMotionActive()) return;

    const fixedImage = event.target.closest(".sun-ray-fixed-image, .sun-ray-fixed-image-hit");
    if (fixedImage) {
      const termId = getFixedImageTermId(fixedImage);
      const ray = fixedImage.closest(".sun-ray.is-active");
      const wrap = termId && ray ? getHoveredTermWrap(ray, termId) : null;
      if (!termId || !ray) return;
      if (!wrap) return;
      setTermHover(ray, wrap);
      setTitleRowTermHover(termId);
      return;
    }

    const hit = event.target.closest(".sun-term-hit");
    if (!hit) return;
    const wrap = hit.closest(".sun-term-wrap");
    const ray = hit.closest(".sun-ray.is-active");
    if (wrap && ray) {
      setTermHover(ray, wrap);
      const termId = wrap.dataset.termId;
      if (termId) setTitleRowTermHover(termId);
    }
  });

  svgEl.addEventListener("mouseout", (event) => {
    const hit = event.target.closest(".sun-term-hit");
    const fixedImage = event.target.closest(".sun-ray-fixed-image, .sun-ray-fixed-image-hit");
    if (!hit && !fixedImage) return;

    const related = event.relatedTarget;
    if (hit) {
      const wrap = hit.closest(".sun-term-wrap");
      if (wrap && (!related || !wrap.contains(related))) {
        clearOverviewTermHover();
      }
      return;
    }

    const termId = getFixedImageTermId(fixedImage);
    const ray = fixedImage.closest(".sun-ray.is-active");
    const wrap = termId && ray ? getHoveredTermWrap(ray, termId) : null;
    if (!wrap) return;
    if (related instanceof Node && wrap.contains(related)) return;
    clearOverviewTermHover();
  });
}

function getTermFontSize(textEl) {
  const styleSize = parseFloat(textEl.style.fontSize);
  if (Number.isFinite(styleSize)) return styleSize;
  const attrSize = parseFloat(textEl.getAttribute("font-size"));
  if (Number.isFinite(attrSize)) return attrSize;
  // No inline size (e.g. after the display font is cleared on a demoted title):
  // the term falls back to the CSS --sun-term-font-size, which is the scaled
  // home size. Match it so every sibling censor bar uses the same scale.
  return LAYOUT.fontSize * getMapTypographyScale();
}

/** Flat display-band height for the big Secolo title; scales with typography. */
function getTermDisplayCensorBarHeightPx(scale = getMapTypographyScale()) {
  return TERM_DISPLAY_CENSOR_BAR_HEIGHT * scale;
}

/**
 * Font size at/above which the censor switches from a full redaction box
 * (height = font × ratio) to the flat display band. Used only as a fallback when
 * the term's role (display title vs sibling) is not explicitly known. Derived
 * from the band height so the two regimes meet at the threshold.
 */
function getTermDisplayFontThreshold(scale = getMapTypographyScale()) {
  return (TERM_DISPLAY_CENSOR_BAR_HEIGHT / MENTION_CENSOR_HEIGHT_RATIO) * scale;
}

/**
 * Whether a term should use the flat display band. Prefer the explicit role
 * (the selected Secolo title) so the regime never flips mid-animation as the
 * font grows/shrinks past a size threshold — that flip moves the bar's Y and
 * looks like a smeared rectangle during the carousel. Falls back to the size
 * threshold when the role is unknown.
 */
function isTermCensorDisplay(fontSize, isDisplay) {
  if (isDisplay === true) return true;
  if (isDisplay === false) return false;
  return fontSize >= getTermDisplayFontThreshold();
}

function getTermCensorBarHeight(fontSize, isDisplay) {
  if (isTermCensorDisplay(fontSize, isDisplay)) {
    return getTermDisplayCensorBarHeightPx();
  }
  return fontSize * MENTION_CENSOR_HEIGHT_RATIO;
}

function getTermCensorBarY(bbox, barHeight, fontSize, options = {}) {
  if (options.alignBottomToBaseline) {
    if (options.textEl) {
      return getTermCensorBaselineBarY(options.textEl, barHeight);
    }
    return null;
  }
  if (!isTermCensorDisplay(fontSize, options.isDisplay)) {
    return bbox.y + (bbox.height - barHeight) / 2 + MENTION_CENSOR_TOP_OFFSET;
  }
  return (
    bbox.y +
    bbox.height * TERM_DISPLAY_CENSOR_Y_RATIO -
    barHeight / 2 +
    TERM_DISPLAY_CENSOR_TOP_OFFSET
  );
}

function getSiblingCensorCenteredTextY(bbox, barY, barHeight) {
  const barCenterY = barY + barHeight / 2;
  const glyphCenterY = bbox.y + bbox.height / 2;
  return barCenterY - glyphCenterY;
}

function isSiblingBaselineRampActive() {
  return (
    termPageSiblingBaselineRampStartMs != null &&
    termPageSiblingBaselineRampDurationMs > 0 &&
    !termPageSelectedFontSettled
  );
}

/**
 * How fully sibling censor bars sit on the title baseline (1) vs. their
 * glyph-centered line (0).
 *
 * For the initial term-page entry the censored siblings keep the exact
 * home-row relationship to their text — centered on the glyph box — for the
 * whole sequence (descent, Roobert erase, Secolo type, and settled). They only
 * move horizontally with the censored push; their y never changes. Same-group
 * switches still align the bars to the title baseline.
 */
function getSiblingCensorBaselineBlend() {
  if (viewport?.classList.contains("is-term-switch-censor")) return 1;
  return 0;
}

function isTermPageSiblingCensorBaselineMode(textEl) {
  const wrap = textEl?.closest?.(".sun-term-wrap");
  if (!wrap || wrap.classList.contains("is-selected")) return false;
  if (!isTermPageFocusVisual()) return false;
  return (
    termPageSelectedFontSettled ||
    termPageLayoutAnimActive ||
    termPageCensoredPushProgress > 0.001 ||
    viewport?.classList.contains("is-term-font-scrambling") ||
    isTermPageEnterRisePhase()
  );
}

function refreshTermPageSiblingCensorBars() {
  const rayGroup = getFocusRayGroup();
  if (!rayGroup || getLiveSecoloBaselineScreenY(rayGroup) == null) return;
  for (const wrap of rayGroup.querySelectorAll(".sun-term-wrap:not(.is-selected)")) {
    const textEl = wrap.querySelector(".sun-term");
    if (!textEl) continue;
    updateTermHitArea(
      textEl,
      wrap.querySelector(".sun-term-hit"),
      wrap.querySelector(".sun-term-censor"),
      { forceBaselineCensor: true }
    );
  }
}

function updateTermHitArea(textEl, hitEl, censorEl, options = {}) {
  if (!textEl) return;
  const alignBottomToBaseline =
    options.forceBaselineCensor || isTermPageSiblingCensorBaselineMode(textEl);

  const isSelectedTitle = Boolean(
    textEl.closest(".sun-term-wrap")?.classList.contains("is-selected")
  );
  const baseTitleY = isSelectedTitle ? getSecoloTitleNudgePx() : 0;
  textEl.setAttribute("y", String(baseTitleY));

  let bbox = textEl.getBBox();
  const hitPad = 4;
  let barY = null;
  let barHeight = 0;
  let barWidth = 0;
  let barX = 0;

  if (censorEl) {
    const fontSize = getTermFontSize(textEl);
    // Decide regime by role (the selected Secolo title), not by a size threshold,
    // so the bar never flips height/position mid-animation (which smears).
    const isDisplay = isSelectedTitle;
    barHeight =
      getTermCensorBarHeight(fontSize, isDisplay) +
      (isDisplay ? TERM_DISPLAY_CENSOR_BOTTOM_EXTEND : 0);
    const coreBarHeight =
      barHeight - (isDisplay ? TERM_DISPLAY_CENSOR_BOTTOM_EXTEND : 0);
    barWidth = bbox.width + MENTION_CENSOR_WIDTH_PAD * 2;
    barX = bbox.x - MENTION_CENSOR_WIDTH_PAD;
    const blend = alignBottomToBaseline ? getSiblingCensorBaselineBlend() : 0;
    if (alignBottomToBaseline && blend > 0.001) {
      // During the entry ramp, aim the bars at the *settled* SVG baseline rather
      // than the live overlay bbox baseline (which sits ~4px low and would snap
      // up at the settle handoff).
      const rampSettledScreenY = isSiblingBaselineRampActive()
        ? getSettledSecoloBaselineScreenY(getFocusRayGroup())
        : null;
      const baselineBarY =
        rampSettledScreenY != null
          ? getTermCensorBaselineBarY(
              textEl,
              coreBarHeight,
              getFocusRayGroup(),
              rampSettledScreenY
            )
          : getTermCensorBarY(bbox, coreBarHeight, fontSize, {
              alignBottomToBaseline: true,
              textEl,
              isDisplay,
            });
      if (baselineBarY == null) return;
      if (blend >= 0.999) {
        barY = baselineBarY;
      } else {
        const glyphBarY = getTermCensorBarY(bbox, coreBarHeight, fontSize, {
          alignBottomToBaseline: false,
          isDisplay,
        });
        barY = lerp(glyphBarY, baselineBarY, blend);
      }
      const targetTextY = getSiblingCensorCenteredTextY(
        bbox,
        baselineBarY,
        coreBarHeight
      );
      textEl.setAttribute("y", String(lerp(0, targetTextY, blend)));
      bbox = textEl.getBBox();
    } else {
      // Glyph-centered (home-row relationship); textEl.y stays 0.
      barY = getTermCensorBarY(bbox, coreBarHeight, fontSize, {
        alignBottomToBaseline: false,
        isDisplay,
      });
    }
  }

  if (hitEl) {
    hitEl.setAttribute("x", bbox.x - hitPad);
    hitEl.setAttribute("y", bbox.y - hitPad);
    hitEl.setAttribute("width", bbox.width + hitPad * 2);
    hitEl.setAttribute("height", bbox.height + hitPad * 2);
  }

  if (censorEl) {
    censorEl.setAttribute("x", barX);
    censorEl.setAttribute("width", barWidth);
    censorEl.setAttribute("y", barY);
    censorEl.setAttribute("height", barHeight);
    censorEl.removeAttribute("transform");
    const isNewlyCensored = textEl
      .closest(".sun-term-wrap")
      ?.classList.contains("is-newly-censored");
    if (isNewlyCensored) {
      applyCensorWriteTiming(censorEl, barWidth);
    } else if (alignBottomToBaseline) {
      censorEl.style.animation = "none";
      censorEl.style.transition = "none";
      censorEl.style.transform = "scaleX(1)";
    }
    const isSelectedDuringScramble =
      textEl.closest(".sun-term-wrap")?.classList.contains("is-selected") &&
      viewport?.classList.contains("is-term-font-scrambling");
    if (
      !options.skipCensorAnimation &&
      !isSelectedDuringScramble &&
      !viewport?.classList.contains("is-term-sibling-censor-held") &&
      !alignBottomToBaseline
    ) {
      applyCensorWriteTiming(censorEl, barWidth);
    }
  }
}

function getSlotsAtStep(step, termCount) {
  let slots = Array.from({ length: termCount }, (_, i) => i);
  for (let s = 0; s < step; s++) {
    slots = rotateLeftmostToFront(slots);
  }
  return slots;
}

function rotateLeftmostToFront(slots) {
  const leftmost = slots[slots.length - 1];
  return [leftmost, ...slots.slice(0, -1)];
}

function computeSlotPositions(slots, widths, termGap, outwardSign) {
  let dist = 0;
  return slots.map((termIdx) => {
    const x = outwardSign === 1 ? dist : -dist;
    dist += widths[termIdx] + termGap;
    return x;
  });
}

function getCarouselStepTiming(globalProgress, carouselSteps) {
  if (carouselSteps <= 0) return { step: 0, stepProgress: 1 };
  const scaled = clamp(globalProgress, 0, 1) * carouselSteps;
  const step = Math.min(carouselSteps - 1, Math.floor(scaled));
  return { step, stepProgress: scaled - step };
}

function getCarouselGlobalProgress(reorderElapsed, carouselSteps, termCount) {
  if (carouselSteps <= 0) return 1;
  return clamp(
    reorderElapsed / (carouselSteps * getCarouselStepMs(termCount, carouselSteps)),
    0,
    1
  );
}

function getCarouselStepGeometry(
  slots,
  slotPos,
  endSlotPos,
  exitingIndex,
  widths,
  termGap,
  outwardSign
) {
  const chainSign = outwardSign === 1 ? 1 : -1;
  const leftSlot = slotPos.length - 1;
  const extraExit = widths[exitingIndex] * LAYOUT.focusExitExtraFactor;
  const exitX =
    slotPos[leftSlot] +
    chainSign * (widths[exitingIndex] + termGap + extraExit);
  const enterX =
    endSlotPos[0] -
    chainSign * (widths[exitingIndex] + termGap + LAYOUT.focusGatePad);

  const textLeftEdges = slotPos.map((x, slot) => x - widths[slots[slot]]);
  const textRightEdges = slotPos.map((x) => x);

  return {
    exitX,
    enterX,
    exitGateX: Math.min(...textLeftEdges) - LAYOUT.focusGatePad,
    entryGateX: Math.max(...textRightEdges) + LAYOUT.focusGatePad,
  };
}

function getCarouselPhases(progress) {
  const exitEnd = LAYOUT.focusCarouselExitEnd;
  const enterStart = LAYOUT.focusCarouselEnterStart;
  return {
    exitT: easeInOutCubic(clamp(progress / exitEnd, 0, 1)),
    shiftT: easeInOutCubic(clamp(progress / exitEnd, 0, 1)),
    enterT: easeOutCubic(clamp((progress - enterStart) / (1 - enterStart), 0, 1)),
  };
}

function getCarouselTermX(termIndex, stepProgress, carouselContext, state) {
  const { slots, slotPos, endSlotPos, geometry } = carouselContext;
  const { exitT, shiftT, enterT } = getCarouselPhases(stepProgress);
  const termCount = slots.length;
  const exiting = slots[termCount - 1];
  const slot = slots.indexOf(termIndex);
  const { exitX, enterX } = geometry;

  if (slot < 0) return state.termStartXs[termIndex];

  if (termIndex === exiting) {
    if (enterT <= 0) {
      return lerp(slotPos[slot], exitX, exitT);
    }
    return lerp(enterX, endSlotPos[0], enterT);
  }

  if (slot < termCount - 1) {
    return lerp(slotPos[slot], endSlotPos[slot + 1], shiftT);
  }

  return slotPos[slot];
}

function getCarouselContext(reorderElapsed, state) {
  const termCount = state.termWidths.length;
  const carouselSteps = getFocusEnterCarouselSteps(state, termCount);
  const scaledElapsed = reorderElapsed;
  const baseSlots = getFocusEnterFromSlots(state, termCount);
  let globalProgress;
  if (state.phase === "locked") {
    globalProgress = 1;
  } else if (state.direction === "out") {
    globalProgress =
      1 -
      getCarouselGlobalProgress(scaledElapsed, carouselSteps, termCount);
  } else {
    globalProgress = getCarouselGlobalProgress(
      scaledElapsed,
      carouselSteps,
      termCount
    );
  }
  const { step, stepProgress } = getCarouselStepTiming(globalProgress, carouselSteps);
  const slots = advanceSlots(baseSlots, step);
  const endSlots = rotateLeftmostToFront(slots);
  const slotPos =
    step === 0
      ? slots.map((termIdx) => state.termStartXs[termIdx])
      : computeSlotPositions(
          slots,
          state.termWidths,
          state.termGap,
          state.outwardSign
        );
  const endSlotPos = computeSlotPositions(
    endSlots,
    state.termWidths,
    state.termGap,
    state.outwardSign
  );
  const exiting = slots[termCount - 1];
  const geometry = getCarouselStepGeometry(
    slots,
    slotPos,
    endSlotPos,
    exiting,
    state.termWidths,
    state.termGap,
    state.outwardSign
  );

  return {
    step,
    stepProgress,
    slots,
    endSlots,
    slotPos,
    endSlotPos,
    geometry,
    exiting,
    carouselSteps,
  };
}

function computeTermEndXs(widths, termGap, outwardSign, clickedIndex, termCount) {
  const carouselSteps = getCarouselSteps(clickedIndex, termCount);
  const finalSlots = getSlotsAtStep(carouselSteps, termCount);
  const slotPos = computeSlotPositions(finalSlots, widths, termGap, outwardSign);
  const endXs = new Array(termCount);
  for (let slot = 0; slot < finalSlots.length; slot++) {
    endXs[finalSlots[slot]] = slotPos[slot];
  }
  return endXs;
}

function computeFocusTermTargets(groupIndex, layout, widths, clickedIndex) {
  const group = groups[groupIndex];
  const terms = group.terms;
  const transform = getGroupTransform(groupIndex, layout);
  const { outwardSign, termGap } = layoutTermsOnRay(transform, terms, layout, widths);

  const startXs = [];
  let dist = 0;
  for (let i = 0; i < terms.length; i++) {
    startXs.push(outwardSign === 1 ? dist : -dist);
    dist += widths[i] + termGap;
  }

  const endXs = computeTermEndXs(
    widths,
    termGap,
    outwardSign,
    clickedIndex,
    terms.length
  );

  const slotStep = widths[clickedIndex] + termGap;
  const chainSign = outwardSign === 1 ? 1 : -1;
  const extraExit = widths[clickedIndex] * LAYOUT.focusExitExtraFactor;
  const exitX = startXs[clickedIndex] + chainSign * (slotStep + extraExit);
  const enterX =
    startXs[0] -
    chainSign * (widths[clickedIndex] + termGap + LAYOUT.focusGatePad);

  const textLeftEdges = startXs.map((x, i) => x - widths[i]);
  const textRightEdges = startXs.map((x, i) => x);
  const exitGateX = Math.min(...textLeftEdges) - LAYOUT.focusGatePad;
  const entryGateX = Math.max(...textRightEdges) + LAYOUT.focusGatePad;

  return {
    startXs,
    endXs,
    termWidths: widths,
    termGap,
    exitX,
    enterX,
    exitGateX,
    entryGateX,
    outwardSign,
    textAnchor: outwardSign === 1 ? "end" : "start",
  };
}

function getFocusCarouselClipVerticalSpan() {
  // The gate masks + carousel clip must cover the *actual* (typography-scaled)
  // sibling bars/text. Using the unscaled reference here let taller bars poke
  // out above/below the mask while rotating — the "smeared remnants" artifact.
  const scale = getMapTypographyScale();
  const pad = FOCUS_CAROUSEL_MASK_PAD * scale;
  const barHeight = TERM_CENSOR_BAR_HEIGHT * scale;
  const textHeight = LAYOUT.fontSize * 1.05 * scale;
  const textTop = -textHeight / 2;
  const barTop =
    textTop +
    (textHeight - barHeight) / 2 +
    MENTION_CENSOR_TOP_OFFSET;
  const barBottom = barTop + barHeight;
  // Keep the pre-fix vertical reach so gate masks + carousel clip stay stable.
  const height = Math.max(barHeight + pad * 2, LAYOUT.fontSize * 1.9 * scale, 80 * scale);
  const barCenter = (barTop + barBottom) / 2;
  return {
    y: barCenter - height / 2,
    height,
  };
}

function getFocusCarouselMaskMetrics() {
  const span = getFocusCarouselClipVerticalSpan();
  return { maskY: span.y, maskH: span.height };
}

function updateFocusMasks(rayGroup, geometry, exitingIndex) {
  if (!focusState) return;

  const leftMask = rayGroup.querySelector(".sun-term-mask--left");
  const rightMask = rayGroup.querySelector(".sun-term-mask--right");
  if (!leftMask || !rightMask) return;

  const { exitGateX, entryGateX } = geometry;
  const gateW = Math.max(focusState.termWidths[exitingIndex], 72);
  const { maskY, maskH } = getFocusCarouselMaskMetrics();

  leftMask.setAttribute("x", exitGateX - gateW);
  leftMask.setAttribute("y", maskY);
  leftMask.setAttribute("width", gateW + LAYOUT.focusGatePad);
  leftMask.setAttribute("height", maskH);

  rightMask.setAttribute("x", entryGateX - gateW * 0.35);
  rightMask.setAttribute("y", maskY);
  rightMask.setAttribute("width", gateW * 0.85 + LAYOUT.focusGatePad);
  rightMask.setAttribute("height", maskH);
}

function updateCarouselExitClip(wrap, textEl, exitSubProgress) {
  const clipRect = document.getElementById("sun-carousel-clip-rect");
  if (!clipRect || !focusState) return;

  const bbox = textEl.getBBox();
  const fullWidth = bbox.width;
  const eaten = fullWidth * easeInOutCubic(exitSubProgress);
  const clipX = bbox.x + eaten;
  const clipW = Math.max(0, fullWidth - eaten);

  clipRect.setAttribute("x", clipX);
  clipRect.setAttribute("width", clipW);
  wrap.setAttribute("clip-path", "url(#sun-carousel-clip)");
}

function clearCarouselClip(wrap) {
  wrap.removeAttribute("clip-path");
}

function updateCarouselEntryClip(wrap, textEl, blockRightX) {
  const clipRect = document.getElementById("sun-carousel-clip-rect");
  if (!clipRect) return;

  const bbox = textEl.getBBox();
  const clipX = blockRightX;
  const clipW = Math.max(0, bbox.x + bbox.width - clipX + LAYOUT.focusGatePad);

  clipRect.setAttribute("x", clipX);
  clipRect.setAttribute("width", clipW);
  wrap.setAttribute("clip-path", "url(#sun-carousel-clip)");
}

function applyFocusCarouselStacking(rayGroup, stepProgress, exitingIndex) {
  const track = rayGroup.querySelector(".sun-term-track");
  const traveling =
    rayGroup.querySelector(`.sun-term-wrap.is-carousel[data-term-index="${exitingIndex}"]`) ||
    track?.querySelector(`.sun-term-wrap[data-term-index="${exitingIndex}"]`);
  const leftMask = rayGroup.querySelector(".sun-term-mask--left");
  const rightMask = rayGroup.querySelector(".sun-term-mask--right");
  if (!traveling || !leftMask || !rightMask || !track) return;

  const { enterT } = getCarouselPhases(stepProgress);
  const paintOrder =
    enterT <= 0
      ? [track, rightMask, traveling, leftMask]
      : [track, leftMask, rightMask, traveling];

  for (const node of paintOrder) {
    rayGroup.appendChild(node);
  }
}

function applyFocusTermPositions(layout) {
  if (!focusState) return;

  const rayGroup = svgEl.querySelector(`[data-group="${focusState.activeIndex}"]`);
  if (!rayGroup) return;

  const wraps = [...rayGroup.querySelectorAll(".sun-term-wrap")];
  const elapsed = performance.now() - focusState.startTime;
  const isUnfocusing = focusState.phase === "unfocusing";
  const reorderElapsed = isUnfocusing
    ? elapsed
    : Math.max(0, elapsed - getFocusReorderStartMs());
  const { termEndXs, textAnchor } = focusState;
  const carouselSteps = getFocusEnterCarouselSteps(focusState, wraps.length);
  const carouselContext =
    carouselSteps > 0 &&
    reorderElapsed > 0 &&
    focusState.phase === "animating"
      ? getCarouselContext(reorderElapsed, focusState)
      : null;

  for (const wrap of wraps) {
    wrap.classList.remove("is-carousel");
  }

  if (carouselContext) {
    const exitingWrap = wraps[carouselContext.exiting];
    exitingWrap?.classList.add("is-carousel");
  }

  const selectedIndex = getFocusSelectedTermIndex();
  const overlayActive = !termFontOverlayEl?.hidden;

  for (let i = 0; i < wraps.length; i++) {
    const textEl = wraps[i].querySelector(".sun-term");
    if (!textEl) continue;

    let localX;
    if (isUnfocusing) {
      const home = focusState.termHomeXs;
      const reflowT = focusState.unfocusReflowT ?? 1;
      localX = home ? lerp(termEndXs[i], home[i], reflowT) : termEndXs[i];
    } else if (focusState.phase === "locked") {
      localX = termEndXs[i];
    } else if (carouselSteps === 0) {
      localX = termEndXs[i];
    } else if (reorderElapsed <= 0) {
      localX = focusState.termStartXs[i];
    } else if (carouselContext) {
      localX = getCarouselTermX(
        i,
        carouselContext.stepProgress,
        carouselContext,
        focusState
      );
    } else {
      localX = focusState.termStartXs[i];
    }

    textEl.setAttribute("x", localX);
    textEl.setAttribute("text-anchor", textAnchor);
    if (overlayActive && i === selectedIndex) continue;
    updateTermHitArea(
      textEl,
      wraps[i].querySelector(".sun-term-hit"),
      wraps[i].querySelector(".sun-term-censor"),
      {
        forceBaselineCensor:
          !wraps[i].classList.contains("is-selected") &&
          isTermPageSiblingCensorBaselineMode(textEl),
      }
    );
  }

  const carouselAnimating =
    focusState.phase === "animating" &&
    carouselSteps > 0 &&
    reorderElapsed > 0 &&
    carouselContext;

  if (carouselAnimating) {
    const { stepProgress, geometry, exiting } = carouselContext;
    const clipProgress = isUnfocusing ? 1 - stepProgress : stepProgress;
    const travelingWrap = wraps[exiting];

    updateFocusMasks(rayGroup, geometry, exiting);
    applyFocusCarouselStacking(rayGroup, clipProgress, exiting);

    if (travelingWrap) {
      const travelingText = travelingWrap.querySelector(".sun-term");
      const { exitT, enterT } = getCarouselPhases(clipProgress);
      if (enterT <= 0 && exitT > 0 && travelingText) {
        updateCarouselExitClip(travelingWrap, travelingText, exitT);
      } else if (
        enterT > 0 &&
        enterT < 1 &&
        travelingText &&
        carouselContext.endSlotPos.length > 1
      ) {
        updateCarouselEntryClip(
          travelingWrap,
          travelingText,
          carouselContext.endSlotPos[1] + LAYOUT.focusCarouselStrokePad
        );
      } else {
        clearCarouselClip(travelingWrap);
      }
    }
  }
}

/**
 * Even arc-row term positions for a group's title row, keeping the selected
 * term leading (carousel order). This is the resting home layout the row
 * re-packs to when leaving a term page.
 * @param {number} groupIndex
 * @param {number} selectedIndex
 * @param {number[]} widths per-term widths in natural index order
 * @returns {{ xs: number[], anchor: "start" | "end" }}
 */
function computeArcRowHomeXs(groupIndex, selectedIndex, widths) {
  const group = groups[groupIndex];
  const termCount = widths.length;
  const transform = getGroupTransform(groupIndex, currentLayout);
  const { outwardSign, termGap } = layoutTermsOnRay(
    transform,
    group.terms,
    currentLayout,
    widths
  );
  const slots = getSlotsAtStep(
    getCarouselSteps(selectedIndex, termCount),
    termCount
  );
  const xs = new Array(termCount).fill(0);
  let dist = 0;
  for (const termIdx of slots) {
    xs[termIdx] = outwardSign === 1 ? dist : -dist;
    dist += (widths[termIdx] ?? 0) + termGap;
  }
  return { xs, anchor: outwardSign === 1 ? "end" : "start" };
}

function refineTermPositions(layout) {
  const count = LAYOUT.rayCount || 0;

  for (let groupIndex = 0; groupIndex < count; groupIndex++) {
    if (!isGroupVisible(groupIndex, layout)) continue;
    if (focusState && groupIndex === focusState.activeIndex) continue;

    const rayGroup = svgEl.querySelector(`[data-group="${groupIndex}"]`);
    if (!rayGroup) continue;

    const group = groups[groupIndex];
    const wraps = [...rayGroup.querySelectorAll(".sun-term-wrap")];
    const texts = wraps.map((wrap) => wrap.querySelector(".sun-term"));
    const widths = texts.map((el) => el.getBBox().width);

    if (arcTermLayout && arcTermLayout.groupIndex === groupIndex) {
      // The cached termXs are the even arc-row positions the title row was
      // re-packed to during the unfocus reflow, so apply them as-is.
      for (let i = 0; i < texts.length; i++) {
        texts[i].setAttribute("x", arcTermLayout.termXs[i]);
        texts[i].setAttribute("text-anchor", arcTermLayout.textAnchor);
        updateTermHitArea(
          texts[i],
          wraps[i].querySelector(".sun-term-hit"),
          wraps[i].querySelector(".sun-term-censor")
        );
      }
      continue;
    }

    const transform = getGroupTransform(groupIndex, layout);
    const { placed, outwardSign, termGap } = layoutTermsOnRay(
      transform,
      group.terms,
      layout,
      widths
    );

    let dist = 0;
    for (let i = 0; i < texts.length; i++) {
      const width = widths[i];
      const localX = outwardSign === 1 ? dist : -dist;
      texts[i].setAttribute("x", localX);
      texts[i].setAttribute("text-anchor", outwardSign === 1 ? "end" : "start");
      placed[i].localX = localX;
      placed[i].textAnchor = outwardSign === 1 ? "end" : "start";
      placed[i].width = width;
      updateTermHitArea(
        texts[i],
        wraps[i].querySelector(".sun-term-hit"),
        wraps[i].querySelector(".sun-term-censor")
      );
      dist += width + termGap;
    }
  }
}

function easeRoulette(t) {
  if (t >= 1) return 1;
  const c1 = LAYOUT.snapOvershoot;
  const c3 = c1 + 1;
  const back = 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  const wobble = Math.sin(t * Math.PI * 2.4) * Math.max(0, 1 - t * 0.95) ** 1.4 * 0.16;
  return back + wobble;
}

function animateSnapTo(targetIndex, arc, options = {}) {
  cancelMomentum();
  clearArcTermLayout();
  const start = scrollOffset;
  const end = scrollOffsetForSnapIndex(targetIndex, arc);
  const durationMs =
    options.durationMs ??
    getSnapDurationMs(arc, options.startVelocity ?? 0);
  const onComplete = options.onComplete ?? null;

  if (Math.abs(end - start) < 0.0005) {
    scrollOffset = end;
    snapAnimTargetIndex = null;
    updateActiveFromScroll(arc);
    render(currentLayout);
    onComplete?.();
    onArcScrollSettled();
    return;
  }

  const startTime = performance.now();

  if (snapAnimFrame) cancelAnimationFrame(snapAnimFrame);

  clearTitleRowTermHover();
  isSnapping = true;
  snapAnimTargetIndex = targetIndex;

  function frame(now) {
    const t = Math.min(1, (now - startTime) / durationMs);
    scrollOffset = start + (end - start) * easeRoulette(t);
    updateActiveFromScroll(arc);
    render(currentLayout);

    if (t < 1) {
      snapAnimFrame = requestAnimationFrame(frame);
    } else {
      scrollOffset = end;
      isSnapping = false;
      snapAnimFrame = null;
      snapAnimTargetIndex = null;
      updateActiveFromScroll(arc);
      render(currentLayout);
      onComplete?.();
      onArcScrollSettled();
    }
  }

  snapAnimFrame = requestAnimationFrame(frame);
}

function applyArcWheelDelta(deltaY, { fromSplashHandoff = false } = {}) {
  if (!currentLayout || isFocusActive() || isTermNavigating()) return false;

  if (isOverviewTimelineMode() && yearScroll) {
    yearScroll.handleWheel(deltaY);
    return true;
  }

  if (isOverviewTagsMode()) {
    return false;
  }

  cancelSnapAnimation();
  cancelMomentum();
  settleSnapIndex = null;
  clearTimeout(snapDebounceTimer);
  clearArcTermLayout();
  clearTitleRowTermHover();

  const wheelDeltaY =
    fromSplashHandoff && deltaY > 0 && deltaY < LAYOUT.scrollFineThresholdPx
      ? LAYOUT.scrollFineThresholdPx
      : deltaY;

  const delta = applyWheelScroll(wheelDeltaY);
  lastWheelWasNotch = isWheelNotch(wheelDeltaY);
  if (!lastWheelWasNotch) {
    scrollOffset -= delta;
  }
  updateActiveFromScroll(currentLayout);
  render(currentLayout);

  const isFineScroll =
    !fromSplashHandoff &&
    Math.abs(wheelDeltaY) < LAYOUT.scrollFineThresholdPx &&
    Math.abs(scrollVelocity) < LAYOUT.scrollMomentumMinVelocity * 2;
  if (isFineScroll) {
    scrollVelocity = 0;
    snapToNearest(currentLayout);
  } else {
    ensureMomentumLoop();
    scheduleSnapEnd(currentLayout);
  }
  return true;
}

function flushPendingSplashWheelDelta() {
  if (pendingSplashWheelDelta == null) return;
  const deltaY = pendingSplashWheelDelta;
  pendingSplashWheelDelta = null;
  if (!applyArcWheelDelta(deltaY, { fromSplashHandoff: true })) {
    pendingSplashWheelDelta = deltaY;
  }
}

function bindSplashWheelHandoff() {
  window.addEventListener("splash-wheel-handoff", (event) => {
    const deltaY = event.detail?.deltaY;
    const fromSplashHandoff = Boolean(event.detail?.fromSplashHandoff);
    if (!deltaY || deltaY <= 0) return;
    if (!applyArcWheelDelta(deltaY, { fromSplashHandoff })) {
      pendingSplashWheelDelta = (pendingSplashWheelDelta ?? 0) + deltaY;
    }
  });
}

let navTypewriterEntered = false;
const NAV_SPLASH_ENTRANCE_DELAY_MS = 220;

/** True while a splash overlay is present and has not yet been dismissed. */
function isSplashAwaitingEntrance() {
  if (navTypewriterEntered) return false;
  const splashEl = document.getElementById("splash");
  return Boolean(splashEl) && !splashEl.hidden && !splashEl.classList.contains("is-dismissed");
}

/** Home entrance: typewriter-scramble the nav labels once the splash clears. */
function bindSplashNavEntrance() {
  window.addEventListener(
    "splash-dismissed",
    () => {
      if (navTypewriterEntered) return;
      navTypewriterEntered = true;
      window.setTimeout(() => {
        revealSiteNav();
        runNavTypewriterEnter();
      }, NAV_SPLASH_ENTRANCE_DELAY_MS);
    },
    { once: true }
  );
}

function markUserActivity() {
  lastUserActivityAt = performance.now();
}

/** Hover on a censored term or pixelated title-row image counts as engagement. */
function hasActiveHomeHoverEngagement() {
  if (!isAtHomeView()) return false;
  if (hoveredTitleRowTermId) return true;
  if (
    bleedBackdropEl?.classList.contains("is-visible") &&
    bleedBackdropEl.classList.contains("is-hover")
  ) {
    return true;
  }
  return bleedPixelAnimFrame !== null;
}

function canIdleRotate(now) {
  if (!currentLayout || !groups.length) return false;
  if (!isAtHomeView()) return false;
  if (isSplashAwaitingEntrance()) return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (isArcScrollMotionActive()) return false;
  if (hasActiveHomeHoverEngagement()) return false;
  if (now - lastUserActivityAt < LAYOUT.idleRotateRestartDelayMs) return false;
  return true;
}

function tickIdleRotate(now) {
  idleRotateFrame = requestAnimationFrame(tickIdleRotate);

  if (!canIdleRotate(now)) {
    idleRotateLastFrameAt = now;
    return;
  }

  const dt = idleRotateLastFrameAt > 0 ? Math.min(48, now - idleRotateLastFrameAt) : 16.67;
  idleRotateLastFrameAt = now;

  scrollOffset -= LAYOUT.idleRotateSpeed * (dt / 1000);
  updateActiveFromScroll(currentLayout);
  render(currentLayout);
}

function bindIdleRotate() {
  if (idleRotateBound || !viewport) return;
  idleRotateBound = true;

  const onActivity = () => markUserActivity();
  viewport.addEventListener("mousemove", onActivity, { passive: true });
  viewport.addEventListener("wheel", onActivity, { passive: true });
  viewport.addEventListener("touchstart", onActivity, { passive: true });
  viewport.addEventListener("touchmove", onActivity, { passive: true });

  markUserActivity();
  idleRotateLastFrameAt = performance.now();
  idleRotateFrame = requestAnimationFrame(tickIdleRotate);
}

function bindWheelScroll() {
  if (wheelBound) return;
  wheelBound = true;

  viewport.addEventListener(
    "wheel",
    (event) => {
      if (isBleedTextLabMode()) {
        event.preventDefault();
        return;
      }
      if (isSunAboutVisible()) {
        event.preventDefault();
        return;
      }

      if (isSunTermsIndexVisible()) {
        event.preventDefault();
        return;
      }

      if (isViewportTermScrollable() && isFocusActive() && !isTermNavigating()) {
        applyTermPageWheelScroll(event.deltaY);
        event.preventDefault();
        return;
      }

      event.preventDefault();
      if (!applyArcWheelDelta(event.deltaY)) return;
    },
    { passive: false }
  );

  flushPendingSplashWheelDelta();
}

function rebuild(preserveScroll = true) {
  if (!groups.length) return;

  if (!isFocusActive() && !isTermNavigating()) {
    cancelScrollMotion();
    clearTimeout(snapDebounceTimer);
  }

  overviewGeo.resetFitCache();
  overviewOverflowPasses = 0;
  clearArcTermLayout();
  const prevSnap = currentLayout ? snapIndex(currentLayout) : 0;
  currentLayout = computeLayout(viewport.clientWidth, viewport.clientHeight);
  buildTitleRowBleedDistribution(currentLayout.viewportWidth, currentLayout.viewportHeight);
  if (titleRowHoverMode !== null) titleRowHoverMode = null;
  clearTitleRowHoverImage();

  scrollOffset = scrollOffsetForSnapIndex(
    preserveScroll ? prevSnap : randomSnapIndex(),
    currentLayout
  );
  updateActiveFromScroll(currentLayout);
  render(currentLayout);
}

async function rebuildAsync(preserveScroll = true) {
  if (!groups.length) return;

  if (!isFocusActive() && !isTermNavigating()) {
    cancelScrollMotion();
    clearTimeout(snapDebounceTimer);
  }

  overviewGeo.resetFitCache();
  overviewOverflowPasses = 0;
  clearArcTermLayout();
  const prevSnap = currentLayout ? snapIndex(currentLayout) : 0;
  currentLayout = computeLayout(viewport.clientWidth, viewport.clientHeight);
  buildTitleRowBleedDistribution(currentLayout.viewportWidth, currentLayout.viewportHeight);
  if (titleRowHoverMode !== null) titleRowHoverMode = null;
  clearTitleRowHoverImage();

  scrollOffset = scrollOffsetForSnapIndex(
    preserveScroll ? prevSnap : randomSnapIndex(),
    currentLayout
  );
  updateActiveFromScroll(currentLayout);
  await yieldToMain();
  await renderIncremental(currentLayout);
}

function bindGridToggle() {
  if (!gridEl) return;
  gridEl.classList.add("is-hidden");
}

async function warmInitialViewImages(layout) {
  if (!layout || !titleRowImageImgEl) return;

  const groupIndex = getTitleRowImageGroupIndex();
  const group = groups[groupIndex];
  const term = group ? getTitleRowImageTerm(group) : null;
  const { viewportWidth, viewportHeight } = layout;
  const image = term ? pickTitleRowSharedImage(term.name, viewportWidth, viewportHeight) : null;
  if (!image?.url) return;

  await assignPreloadedTermImage(titleRowImageImgEl, image.url);
}

function updateLoadingProgress(ratio, label) {
  const pct = clamp(ratio, 0, 1) * 100;
  // Label stays fixed ("טרמינולוגיה פוליטית"); the censor bar conveys progress.
  void label;
  if (loadingBarFillEl) loadingBarFillEl.style.width = `${pct}%`;
  if (loadingProgressEl) loadingProgressEl.textContent = "";
}

function finishLoadingWithScramble() {
  advanceLoadingWork(LOADING_WORK_WEIGHT.finish, "מוכן");
  return waitForLoadingMinimum().then(
    () =>
      new Promise((resolve) => {
        loadingEl?.classList.add("hidden");
        // Splash dismissal owns the visible nav entrance (typewriter scramble).
        // While the splash is still up, keep the nav hidden so its text is never
        // seen before the entrance animation plays; the splash-dismissed handler
        // reveals + types it. If it already played, nothing more to do here.
        if (navTypewriterEntered || isSplashAwaitingEntrance()) {
          resolve();
          return;
        }
        revealSiteNav();
        runNavEnterScramble(resolve);
      })
  );
}

function findTermByName(termName) {
  if (!termName) return null;
  for (const group of groups) {
    const term = group.terms.find((entry) => entry.name === termName);
    if (term) return term;
  }
  return null;
}

function navigateToTermRow(termId) {
  const location = findTermLocation(termId);
  if (!location || !currentLayout) return false;
  if (isFocusActive()) return false;
  cancelScrollMotion();
  activeIndex = location.groupIndex;
  scrollOffset = scrollOffsetForGroup(location.groupIndex, currentLayout);
  updateActiveFromScroll(currentLayout);
  render(currentLayout);
  return true;
}

function previewTermBleed(termId, imageUrl, { navText = "auto", titleRowText = "auto" } = {}) {
  const term = findTermById(termId);
  if (!term || !currentLayout) return false;

  bleedTextLabPreview = {
    termName: term.name,
    imageUrl: imageUrl || null,
    navText,
    titleRowText,
  };

  if (!navigateToTermRow(termId)) return false;

  clearPendingTitleRowBleedReveal();
  clearInlinePushTransforms(titleRowInlinePushRay);
  titleRowInlinePushRay = null;
  stopInlinePushAnimation();
  hoveredTitleRowTermId = termId;
  titleRowHoverMode = "bleed";
  clearTitleRowHoverImage();
  titleRowHoverSessionId += 1;

  const hoverImage = imageUrl
    ? findTermImageByUrl(term.name, imageUrl)
    : pickTitleRowSharedImage(
        term.name,
        currentLayout.viewportWidth,
        currentLayout.viewportHeight
      );

  if (!hoverImage?.url) {
    hideTitleRowImage();
    return false;
  }

  titleRowHoverImage = hoverImage;
  viewport?.classList.add("is-title-row-bleed");
  if (titleRowImageEl) {
    titleRowImageEl.classList.add("is-bleed");
    titleRowImageEl.hidden = true;
    titleRowImageEl.setAttribute("aria-hidden", "true");
  }
  showBleedBackdrop(hoverImage.url, false, { mode: "hover" });
  syncRayFixedImages(currentLayout);
  applyAllRowFixedPushes(currentLayout);
  return true;
}

function listAllTermsForLab() {
  return groups.flatMap((group, groupIndex) =>
    group.terms.map((term, termIndex) => ({
      id: term.id,
      name: term.name,
      groupIndex,
      termIndex,
    }))
  );
}

function getBleedEligibleImagesForLab(termName) {
  const layout = currentLayout ?? {
    viewportWidth: viewport?.clientWidth ?? window.innerWidth,
    viewportHeight: viewport?.clientHeight ?? window.innerHeight,
  };
  const { viewportWidth, viewportHeight } = layout;
  const images = termImagesByName.get(termName) || [];
  return images
    .filter((image) => image?.url)
    .map((image) => ({
      ...image,
      bleedEligible: Boolean(
        getTermImagePixelSize(image.url) &&
          isTermImageBleedQuality(image.url, viewportWidth, viewportHeight)
      ),
    }));
}

function getCurrentBleedImageUrlForTerm(termName) {
  const layout = currentLayout ?? {
    viewportWidth: viewport?.clientWidth ?? window.innerWidth,
    viewportHeight: viewport?.clientHeight ?? window.innerHeight,
  };
  return pickTitleRowSharedImage(termName, layout.viewportWidth, layout.viewportHeight)?.url ?? null;
}

/**
 * Temporary live tuner for the fold-3 resting height. Enabled with `?foldTune`.
 * Arrow Up/Down nudge `termPageFold3CentreFrac` (Shift = fine step), re-cap the
 * scroll bounds and re-snap fold 3 so the new height is visible immediately. The
 * current value is shown in a small overlay — read it off, tell me the number,
 * and I'll bake it in and remove this.
 */
function exposeFold3CentreTuner() {
  if (!new URLSearchParams(location.search).has("foldTune")) return;

  const overlay = document.createElement("div");
  overlay.style.cssText = [
    "position:fixed",
    "top:12px",
    "left:12px",
    "z-index:99999",
    "padding:8px 12px",
    "background:rgba(0,0,0,0.82)",
    "color:#fff",
    "font:13px/1.4 monospace",
    "border-radius:6px",
    "pointer-events:none",
    "white-space:pre",
  ].join(";");
  const render = () => {
    overlay.textContent =
      `fold3 height: ${termPageFold3CentreFrac.toFixed(3)}\n` +
      `↑ higher  ↓ lower  (Shift = fine)`;
  };
  render();
  document.body.appendChild(overlay);

  const reSnap = () => {
    render();
    const vh = getLiveViewportHeight();
    applyViewportTermScrollBounds(vh);
    if (hasTermPageFold3Content()) {
      animateTermPagePinSnapTo(getTermPageFold3SnapScrollTop(vh));
    }
  };

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const step = event.shiftKey ? 0.005 : 0.02;
      const delta = event.key === "ArrowUp" ? -step : step;
      termPageFold3CentreFrac = Math.min(
        0.6,
        Math.max(0, +(termPageFold3CentreFrac + delta).toFixed(3))
      );
      event.preventDefault();
      reSnap();
    },
    true
  );

  globalThis.__FOLD3_TUNE__ = {
    get: () => termPageFold3CentreFrac,
    set: (value) => {
      termPageFold3CentreFrac = Math.min(0.6, Math.max(0, Number(value) || 0));
      reSnap();
    },
  };
}

function exposeBleedTextLabApi() {
  if (!isBleedTextLabMode()) return;
  const api = {
    listAllTerms: listAllTermsForLab,
    findTermByName,
    findTermById,
    getBleedEligibleImages: getBleedEligibleImagesForLab,
    getCurrentBleedImageUrl: getCurrentBleedImageUrlForTerm,
    getTermTextPrefs,
    previewTermBleed,
    navigateToTermRow,
  };
  globalThis.__SUN_BLEED_LAB_API__ = api;
  document.dispatchEvent(new CustomEvent("sun-map-ready", { detail: api }));
}

async function init() {
  bindSplashWheelHandoff();
  bindSplashNavEntrance();
  try {
    loadingWork.startedAt = performance.now();
    loadingWork.display = 0;
    updateLoadingProgress(0, "טוען נתונים…");
    ensureLoadingDisplayTick();
    const [data, termImages] = await Promise.all([
      loadSemanticData(),
      loadTermImages(),
      loadTimelineEvents(),
      loadBleedTextPrefs(),
    ]);
    const imageUrls = collectTermImageUrls(termImages).map((url) => resolveTermImageUrl(url));
    resetLoadingWork(2);
    advanceLoadingWork(LOADING_WORK_WEIGHT.dataFetch * 2, "טוען נתונים…");

    await runLoadingSegmentAsync("מעבד נתונים…", LOADING_WORK_WEIGHT.setup, 1400, async () => {
      termImagesByName = termImages;
      groups = groupTermsByObject(data.termNodes, data.objectRows);
      overviewSpinOffset = computeOverviewSpinOffset(groups);
      swapGroupsByObjectId(groups, SUN_GROUP_POSITION_SWAPS);
      initSunFilterTest({
        getGroups: () => groups,
        getSvg: () => svgEl,
        isInOverview,
        // Tie the filter bar to the overview *target* (not the zoom progress)
        // so it disappears together with the terms grid the moment a term is
        // clicked, instead of lingering until the zoom-out finishes.
        isTagsPageOpen: () => overviewTarget > 0,
      });
      initSunTermsIndex({
        getGroups: () => groups,
        rootEl: document.getElementById("sun-terms-index-root"),
        viewportEl: viewport,
        onTermSelect: (termId) => {
          openTermViaHome(termId);
        },
      });
      initSunAbout({
        rootEl: document.getElementById("sun-about-root"),
        viewportEl: viewport,
      });
      setSunTermsIndexGridRebuildGuard(
        () => isPageNavTransitionActive() || isIndexEnterScrambleActive()
      );
      initSunOverviewTermsGrid({
        getGroups: () => groups,
        rootEl: document.getElementById("sun-overview-terms-root"),
        viewportEl: viewport,
        onTermSelect: (termId) => {
          openTermViaHome(termId);
        },
      });
      setSunOverviewTermsGridRebuildGuard(
        () => isPageNavTransitionActive() || isIndexEnterScrambleActive()
      );

      const allTerms = groups.flatMap((g) => g.terms);
      termYearIndex = buildTermYearIndex(allTerms);
      const timelineBounds = getTimelineBounds(termYearIndex);
      timelineMinYear = LAYOUT.timelineStartYear;
      timelineMaxYear = timelineBounds.maxYear;
      yearScroll = createYearScrollController({
        minYear: timelineMinYear,
        maxYear: timelineMaxYear,
        onChange: () => {
          dismissTimelineScrollHint();
          syncTimelineHintFromYearScroll();
          if (currentLayout && isOverviewTimelineMode()) render(currentLayout);
        },
      });
      yearScroll.resetToMaxYear();
      initSunTimelineHint({
        isInOverview,
        getOverviewSubMode: () => overviewSubMode,
        getSunCircle: () => {
          if (!currentLayout || !viewport) return null;
          const rect = viewport.getBoundingClientRect();
          return {
            cx: rect.left + currentLayout.cx,
            cy: rect.top + currentLayout.cy,
            r: currentLayout.radius,
          };
        },
      });
      initSiteNav({
        pending: true,
        controller: {
          navigate: handleMapNav,
          getActiveNav: getActiveNavTarget,
        },
      });
    });

    await runLoadingSegmentAsync("מעבד נתונים…", LOADING_WORK_WEIGHT.setup, 900, async () => {
      termMentionPatterns = buildDefinitionMentionPatterns(
        data.termNodes,
        data.keywordRows
      );

      if (!groups.length) {
        throw new Error("לא נמצאו קבוצות מונחים");
      }

      LAYOUT.rayCount = groups.length;
      overviewGeo.resetFitCache();
      buildTermLocationIndex();
    });

    await runLoadingSegmentAsync("מכין תצוגה…", LOADING_WORK_WEIGHT.rebuild, 5000, async () => {
      await rebuildAsync(false);
    });
    flushPendingSplashWheelDelta();

    if (currentLayout) {
      runLoadingSegment("מכין תצוגה…", LOADING_WORK_WEIGHT.titleRow, 500, () => {
        updateTitleRowImage(currentLayout);
      });
      await runLoadingSegmentAsync("מכין תצוגה…", LOADING_WORK_WEIGHT.warmImage, 800, () =>
        warmInitialViewImages(currentLayout)
      );
    } else {
      advanceLoadingWork(LOADING_WORK_WEIGHT.titleRow + LOADING_WORK_WEIGHT.warmImage, "מכין תצוגה…");
    }

    initLetterShuffle();
    initFontScrambleTransitions();
    await finishLoadingWithScramble();

    // Defer bulk image preloading until the UI is interactive.
    if (imageUrls.length) {
      window.setTimeout(() => startBackgroundTermImagePreload(imageUrls, activeIndex), 0);
    }

    consumeSessionNavIntent();
    bindLetterShuffleDelegation(viewport, LETTER_SHUFFLE_DELEGATION_SELECTOR);
    bindLetterShuffleDelegation(backFixedEl, LETTER_SHUFFLE_DELEGATION_SELECTOR);
    bindLetterShuffleDelegation(
      document.getElementById("sun-filter-test-wrap"),
      ".sun-filter-bar__label, .sun-filter-bar__option:not(.is-disabled)"
    );

    bindWheelScroll();
    bindTermPageScroll();
    bindOverviewHover();
    bindIdleRotate();
    bindTermHover();
    bindTermClick();
    bindBackNavigation();
    bindMentionNavigation();
    bindMetaFilterNavigation();
    bindTermPageLabelNav();
    bindSameObjectMentionNavigation();
    bindSameObjectMentionHover();
    bindTitleRowTermHover();
    bindTitleRowTermClick();
    bindGridToggle();

    exposeBleedTextLabApi();
    exposeFold3CentreTuner();

    new ResizeObserver(() => {
      syncGridCssVars(viewport);
      if (isFocusActive()) {
        rebuildFocusLayout();
      } else {
        rebuild(true);
      }
      syncIdleBleedPixelation();
    }).observe(viewport);
  } catch (err) {
    stopLoadingDisplayTick();
    loadingEl.classList.add("hidden");
    revealSiteNav();
    errorEl.textContent = err.message || "שגיאה בטעינת הנתונים";
    errorEl.classList.remove("hidden");
    console.error(err);
  }
}

init();
