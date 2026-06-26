/**
 * Splash entry overlay — full-bleed image slideshow with pixel transitions,
 * scroll-to-dismiss into the main sun-map site.
 */

import { applyBlockTypography } from "./typography.js";
import { syncGridCssVars } from "./grid-metrics.js";
import {
  initLetterShuffle,
  startLetterShuffle,
  stopLetterShuffle,
} from "./letter-shuffle.js";

const CONFIG = {
  dataUrl: "data/splash-images.json",
  intervalMs: 4000,
  transitionMs: 380,
  maxFactor: 24,
  glitchHold: 0.38,
  dismissDurationMs: 550,
  /** Fallback wheel delta when dismiss is triggered without a wheel event. */
  dismissScrollDelta: 100,
};

/** @type {HTMLCanvasElement | null} */
let sharedOffscreen = null;

/** @type {number | null} */
let animFrame = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let galleryTimer = null;

/** @type {boolean} */
let active = true;

/** @type {boolean} */
let dismissing = false;

/** @type {number} */
let currentIndex = 0;

/** @type {Array<{ url: string, quoteTextColor: 'dark' | 'light' }>} */
let splashSlides = [];

/** @type {Map<string, HTMLImageElement>} */
const preloaded = new Map();

const splashEl = document.getElementById("splash");
const imageBandEl = splashEl?.querySelector(".splash__image-band");
const imageEl = splashEl?.querySelector(".splash__image");
const canvasEl = splashEl?.querySelector(".splash__pixel-canvas");
const introEl = splashEl?.querySelector(".splash__intro");
const scrollHintEl = splashEl?.querySelector(".splash__scroll-hint");

/** Matches --splash-margin (10px) + the extra 8px bottom offset of the text. */
const SPLASH_TEXT_BOTTOM_OFFSET = 18;
/** Breathing space kept between the top of the bottom text and the image edge. */
const SPLASH_BAND_GAP = 16;

/**
 * Size the bottom band to the actual height of the bottom text so the image's
 * lower edge always clears the intro paragraph and scroll hint — on any screen
 * size, however many lines the text wraps to. The band never shrinks below the
 * design value (clamp(110px, 15vh, 360px)).
 */
function updateSplashBand() {
  if (!splashEl) return;
  const introHeight = introEl?.offsetHeight ?? 0;
  const hintHeight = scrollHintEl?.offsetHeight ?? 0;
  const textHeight = Math.max(introHeight, hintHeight);

  const designBand = Math.min(360, Math.max(110, window.innerHeight * 0.15));
  const needed = SPLASH_TEXT_BOTTOM_OFFSET + textHeight + SPLASH_BAND_GAP;
  const band = Math.max(designBand, needed);
  splashEl.style.setProperty("--splash-band", `${Math.round(band)}px`);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getOffscreen() {
  if (!sharedOffscreen) {
    sharedOffscreen = document.createElement("canvas");
  }
  return sharedOffscreen;
}

/** @param {HTMLImageElement} img @param {number} boxWidth @param {number} boxHeight */
function getCoverSourceRect(img, boxWidth, boxHeight) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = boxWidth / boxHeight;
  if (imgRatio > boxRatio) {
    const sHeight = img.naturalHeight;
    const sWidth = img.naturalHeight * boxRatio;
    return {
      sx: (img.naturalWidth - sWidth) / 2,
      sy: 0,
      sWidth,
      sHeight,
    };
  }
  const sWidth = img.naturalWidth;
  const sHeight = img.naturalWidth / boxRatio;
  return { sx: 0, sy: 0, sWidth, sHeight };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} img
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} pixelFactor
 */
function drawPixelatedCover(ctx, img, destWidth, destHeight, pixelFactor) {
  const factor = Math.max(1, pixelFactor);
  const lowW = Math.max(1, Math.round(destWidth / factor));
  const lowH = Math.max(1, Math.round(destHeight / factor));
  const { sx, sy, sWidth, sHeight } = getCoverSourceRect(img, lowW, lowH);
  const offscreen = getOffscreen();

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

/** @param {number} openProgress @param {number} maxFactor */
function getPixelFactor(openProgress, maxFactor = CONFIG.maxFactor) {
  if (openProgress >= 1) return 1;
  if (openProgress <= 0) {
    const extra = Math.abs(openProgress);
    return Math.max(1, Math.round(maxFactor + (maxFactor - 1) * extra));
  }
  const eased = Math.max(0, Math.min(1, openProgress));
  return Math.max(1, Math.round(1 + (maxFactor - 1) * (1 - eased)));
}

function clearPixelation() {
  if (canvasEl) {
    canvasEl.hidden = true;
    const ctx = canvasEl.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  }
  imageEl?.classList.remove("is-pixelation-hidden");
}

function stopAnimation() {
  if (animFrame !== null) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
}

function getBandDimensions() {
  const container = imageBandEl;
  if (!container) return { width: 0, height: 0 };
  return { width: container.clientWidth, height: container.clientHeight };
}

/** @param {number} openProgress @param {{ maxFactor?: number, sourceImg?: HTMLImageElement | null }} [options] */
function applyPixelation(openProgress, options = {}) {
  const maxFactor = options.maxFactor ?? CONFIG.maxFactor;
  const factor = getPixelFactor(openProgress, maxFactor);
  const img = options.sourceImg ?? imageEl;
  const { width, height } = getBandDimensions();

  if (!img || !canvasEl || factor <= 1 || !width || !height) {
    clearPixelation();
    return;
  }
  if (!img.complete || img.naturalWidth <= 0) return;

  canvasEl.width = width;
  canvasEl.height = height;
  canvasEl.hidden = false;
  imageEl.classList.add("is-pixelation-hidden");

  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;
  drawPixelatedCover(ctx, img, width, height, factor);
}

/** @param {number} t @param {number} [hold] */
function getGlitchOpenProgress(t, hold = CONFIG.glitchHold) {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= hold) return 0;
  const revealT = (clamped - hold) / Math.max(1e-6, 1 - hold);
  return revealT * (2 - revealT);
}

/**
 * @param {{
 *   durationMs?: number,
 *   fromImg?: HTMLImageElement | null,
 *   toImg?: HTMLImageElement | null,
 *   onHold?: () => void,
 *   onComplete?: () => void,
 * }} [options]
 */
function runPixelGlitchAnimation(options = {}) {
  stopAnimation();
  const durationMs = options.durationMs ?? CONFIG.transitionMs;
  const maxFactor = CONFIG.maxFactor;
  const fromImg = options.fromImg ?? null;
  const toImg = options.toImg ?? null;
  const reducedMotion = prefersReducedMotion();
  const duration = reducedMotion ? 0 : durationMs;

  if (duration <= 0) {
    // Still perform the swap so the image actually advances without motion.
    options.onHold?.();
    clearPixelation();
    options.onComplete?.();
    return;
  }

  let holdFired = false;
  applyPixelation(0, { maxFactor, sourceImg: fromImg ?? toImg });
  const start = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    if (!holdFired && t >= CONFIG.glitchHold) {
      holdFired = true;
      options.onHold?.();
    }
    const openProgress = getGlitchOpenProgress(t);
    // Before the hold, reveal the outgoing image; after it, the incoming one.
    // Drawing from the decoded preloaded image (not imageEl) guarantees the
    // new photo is painted during the reveal instead of snapping in at the end.
    const sourceImg = holdFired ? toImg ?? fromImg : fromImg ?? toImg;
    applyPixelation(openProgress, { maxFactor, sourceImg });
    if (t < 1) {
      animFrame = requestAnimationFrame(frame);
    } else {
      animFrame = null;
      clearPixelation();
      options.onComplete?.();
    }
  }

  animFrame = requestAnimationFrame(frame);
}

/** @param {string} url */
function preloadImage(url) {
  if (preloaded.has(url)) {
    return Promise.resolve(preloaded.get(url));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      preloaded.set(url, img);
      if (typeof img.decode === "function") {
        img.decode().then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load splash image: ${url}`));
    img.src = url;
  });
}

function showSharpImage(url) {
  if (!imageEl) return;
  imageEl.src = url;
  clearPixelation();
}

function runInitialReveal() {
  if (!splashSlides.length || !imageEl) return;
  const slide = splashSlides[0];
  applyQuoteColor(slide.quoteTextColor);
  imageEl.src = slide.url;

  const start = () => {
    if (!active) return;
    const img = preloaded.get(slide.url) ?? imageEl;
    runPixelGlitchAnimation({
      durationMs: 600,
      fromImg: img,
      toImg: img,
      onComplete: scheduleGalleryAdvance,
    });
  };

  if (imageEl.complete && imageEl.naturalWidth > 0) {
    start();
  } else {
    imageEl.onload = start;
  }
}

function clearGalleryTimer() {
  if (galleryTimer !== null) {
    clearTimeout(galleryTimer);
    galleryTimer = null;
  }
}

function scheduleGalleryAdvance() {
  clearGalleryTimer();
  if (!active || splashSlides.length < 2) return;
  galleryTimer = setTimeout(advanceGallery, CONFIG.intervalMs);
}

async function advanceGallery() {
  galleryTimer = null;
  if (!active || splashSlides.length < 2) return;

  const nextIndex = (currentIndex + 1) % splashSlides.length;
  const nextSlide = splashSlides[nextIndex];
  const currentSlide = splashSlides[currentIndex];

  let toImg;
  try {
    toImg = await preloadImage(nextSlide.url);
  } catch {
    scheduleGalleryAdvance();
    return;
  }

  const fromImg = preloaded.get(currentSlide.url) ?? null;

  runPixelGlitchAnimation({
    fromImg,
    toImg,
    onHold: () => {
      applyQuoteColor(nextSlide.quoteTextColor);
      if (imageEl) imageEl.src = nextSlide.url;
    },
    onComplete: () => {
      currentIndex = nextIndex;
      scheduleGalleryAdvance();
    },
  });
}

function stopGallery() {
  clearGalleryTimer();
  stopAnimation();
  clearPixelation();
}

/** @type {boolean} */
let scrollHandoffActive = false;

function handoffScrollToSite(deltaY) {
  if (!deltaY || deltaY <= 0) return;
  globalThis.dispatchEvent(
    new CustomEvent("splash-wheel-handoff", {
      detail: { deltaY, fromSplashHandoff: true },
    })
  );
}

function beginScrollHandoff(initialDeltaY = 0) {
  removeScrollListeners();
  document.body.classList.remove("is-splash-active");

  if (initialDeltaY > 0) {
    handoffScrollToSite(initialDeltaY);
  }

  if (scrollHandoffActive) return;
  scrollHandoffActive = true;

  window.addEventListener("wheel", onWheelHandoff, { passive: false, capture: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  window.addEventListener("touchmove", onTouchHandoff, { passive: false, capture: true });
}

function endScrollHandoff() {
  if (!scrollHandoffActive) return;
  scrollHandoffActive = false;
  window.removeEventListener("wheel", onWheelHandoff, { capture: true });
  window.removeEventListener("touchstart", onTouchStart, { capture: true });
  window.removeEventListener("touchmove", onTouchHandoff, { capture: true });
}

/**
 * Dismiss the splash overlay and reveal the site.
 * Hook for future entry animations — replace the CSS transition here.
 * @param {{ scrollDeltaY?: number }} [options]
 */
export function dismissSplash(options = {}) {
  if (!splashEl || dismissing || !active) return;
  dismissing = true;
  active = false;
  stopGallery();
  beginScrollHandoff(options.scrollDeltaY ?? 0);

  splashEl.classList.add("is-dismissed");
  splashEl.setAttribute("aria-hidden", "true");

  window.setTimeout(() => {
    endScrollHandoff();
    splashEl.hidden = true;
    globalThis.dispatchEvent(new CustomEvent("splash-dismissed"));
  }, CONFIG.dismissDurationMs);
}

function isDownwardScrollIntent(event) {
  if (event.type === "wheel") {
    return event.deltaY > 0;
  }
  if (event.type === "keydown") {
    return ["ArrowDown", "PageDown", "Space"].includes(event.key);
  }
  return false;
}

function onWheel(event) {
  if (!active) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.deltaY > 0) dismissSplash({ scrollDeltaY: event.deltaY });
}

function onWheelHandoff(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.deltaY > 0) {
    handoffScrollToSite(event.deltaY);
  }
}

let touchStartY = 0;

function onTouchStart(event) {
  if (!active || !event.touches.length) return;
  touchStartY = event.touches[0].clientY;
}

function onTouchMove(event) {
  if (!active || !event.touches.length) return;
  event.preventDefault();
  event.stopPropagation();
  const deltaY = touchStartY - event.touches[0].clientY;
  if (deltaY > 24) {
    dismissSplash({
      scrollDeltaY: Math.max(deltaY, CONFIG.dismissScrollDelta),
    });
  }
}

function onTouchHandoff(event) {
  if (!event.touches.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const deltaY = touchStartY - event.touches[0].clientY;
  if (deltaY > 0) {
    handoffScrollToSite(deltaY);
  }
  touchStartY = event.touches[0].clientY;
}

function onKeyDown(event) {
  if (!active) return;
  if (isDownwardScrollIntent(event)) {
    event.preventDefault();
    dismissSplash({ scrollDeltaY: CONFIG.dismissScrollDelta });
  }
}

function addScrollListeners() {
  document.body.classList.add("is-splash-active");
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("keydown", onKeyDown);
}

function removeScrollListeners() {
  window.removeEventListener("wheel", onWheel);
  window.removeEventListener("touchstart", onTouchStart);
  window.removeEventListener("touchmove", onTouchMove);
  window.removeEventListener("keydown", onKeyDown);
}

function applyIntroTypography() {
  if (!introEl) return;
  const linkText = "טרמינולוגיה פוליטית";
  const rest =
    "הוא אינדקס אינטראקטיבי של מושגים בעלי פרשנויות לשוניות שונות בשיח הפוליטי בישראל. האתר בוחן כיצד מילים שונות המתייחסות לאותה מציאות יכולות לעצב תפיסות שונות שלה, וכיצד המאבק על הנרטיב מתנהל גם דרך השפה עצמה.";
  const restTyped = applyBlockTypography(rest, { ensurePeriod: false });

  const link = document.createElement("span");
  link.className = "splash__intro-link";
  link.textContent = linkText;
  link.addEventListener("mouseenter", () => startLetterShuffle(link));
  link.addEventListener("mouseleave", () => stopLetterShuffle(link));

  const monoSpace = document.createElement("span");
  monoSpace.className = "splash__intro-space";
  monoSpace.textContent = " ";

  introEl.textContent = "";
  introEl.append(link, monoSpace, document.createTextNode(restTyped));
}

function applyQuoteColor(mode) {
  if (!splashEl) return;
  const normalized = mode === "light" ? "light" : "dark";
  splashEl.classList.toggle("is-quote-light", normalized === "light");
  splashEl.classList.toggle("is-quote-dark", normalized === "dark");
}

/** Fisher–Yates shuffle — random playback order on each page load. */
function shuffleSlides(slides) {
  const result = slides.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function loadSplashConfig() {
  const response = await fetch(CONFIG.dataUrl);
  if (!response.ok) throw new Error(`Failed to load ${CONFIG.dataUrl}`);
  const data = await response.json();
  const fallback = data.quoteTextColor === "light" ? "light" : "dark";
  const slides = (data.images ?? [])
    .filter((entry) => entry?.url)
    .map((entry) => ({
      url: entry.url,
      quoteTextColor:
        entry.quoteTextColor === "light"
          ? "light"
          : entry.quoteTextColor === "dark"
            ? "dark"
            : fallback,
    }));
  return { slides };
}

async function initSplash() {
  if (!splashEl || !imageEl) return;

  syncGridCssVars();
  initLetterShuffle();
  applyIntroTypography();
  updateSplashBand();
  addScrollListeners();

  // Fonts change the wrapped line count, so re-measure once they're ready.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => updateSplashBand()).catch(() => {});
  }

  try {
    const config = await loadSplashConfig();
    splashSlides = shuffleSlides(config.slides);
    currentIndex = 0;
  } catch (error) {
    console.warn("[splash] Could not load splash config:", error);
    splashSlides = [];
  }

  if (splashSlides.length) {
    await Promise.allSettled(splashSlides.slice(0, 3).map((slide) => preloadImage(slide.url)));
    runInitialReveal();
  } else {
    scheduleGalleryAdvance();
  }

  window.addEventListener(
    "resize",
    () => {
      syncGridCssVars();
      updateSplashBand();
      if (!active) return;
      clearPixelation();
    },
    { passive: true }
  );
}

globalThis.dismissSplash = dismissSplash;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSplash);
} else {
  initSplash();
}
