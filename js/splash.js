/**
 * Splash entry overlay — small pixelated image slideshow with pixel transitions,
 * scroll-to-dismiss (any direction) into the main sun-map site.
 */

import { syncGridCssVars } from "./grid-metrics.js";
import {
  abortLetterShuffle,
  initLetterShuffle,
  startContinuousScramble,
} from "./letter-shuffle.js";
import {
  drawPixelatedCover,
  getGlitchOpenProgress,
  getPixelFactor,
} from "./pixel-glitch.js";
import { loadImageCacheVersions, resolveAssetImageUrl } from "./asset-url.js";

const CONFIG = {
  dataUrl: "data/splash-images.json",
  intervalMs: 3000,
  transitionMs: 380,
  maxFactor: 24,
  /** Resting pixelation strength — image stays pixelated between transitions. */
  restPixelFactor: 16,
  glitchHold: 0.38,
  dismissDurationMs: 550,
  /** Fallback wheel delta when dismiss is triggered without a wheel event. */
  dismissScrollDelta: 100,
};

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
const scrollHintTextEl = splashEl?.querySelector(".splash__scroll-hint-text");

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

function getImageDimensions() {
  const container = imageBandEl;
  if (!container) return { width: 0, height: 0 };
  return { width: container.clientWidth, height: container.clientHeight };
}

/** @param {HTMLImageElement | null | undefined} [sourceImg] */
function applyRestingPixelation(sourceImg) {
  applyPixelation(1, { sourceImg: sourceImg ?? imageEl });
}

/** @param {number} openProgress @param {{ maxFactor?: number, sourceImg?: HTMLImageElement | null }} [options] */
function applyPixelation(openProgress, options = {}) {
  const maxFactor = options.maxFactor ?? CONFIG.maxFactor;
  const factor = getPixelFactor(openProgress, {
    maxFactor,
    restFactor: CONFIG.restPixelFactor,
  });
  const img = options.sourceImg ?? imageEl;
  const { width, height } = getImageDimensions();

  if (!img || !canvasEl || !width || !height) {
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
    options.onHold?.();
    applyRestingPixelation(toImg ?? fromImg);
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
    if (t < 1) {
      const openProgress = getGlitchOpenProgress(t, CONFIG.glitchHold);
      const sourceImg = holdFired ? toImg ?? fromImg : fromImg ?? toImg;
      applyPixelation(openProgress, { maxFactor, sourceImg });
      animFrame = requestAnimationFrame(frame);
    } else {
      animFrame = null;
      applyRestingPixelation(toImg ?? fromImg);
      options.onComplete?.();
    }
  }

  animFrame = requestAnimationFrame(frame);
}

/** @param {string} url */
function resolveSplashImageUrl(url) {
  return resolveAssetImageUrl(url);
}

/** @param {string} url */
function preloadImage(url) {
  const src = resolveSplashImageUrl(url);
  if (preloaded.has(src)) {
    return Promise.resolve(preloaded.get(src));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      preloaded.set(src, img);
      if (typeof img.decode === "function") {
        img.decode().then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load splash image: ${src}`));
    img.src = src;
  });
}

function getCurrentSlideImage() {
  const slide = splashSlides[currentIndex];
  if (!slide) return imageEl;
  return preloaded.get(resolveSplashImageUrl(slide.url)) ?? imageEl;
}

function runInitialReveal() {
  if (!splashSlides.length || !imageEl) return;
  const slide = splashSlides[0];
  imageEl.src = resolveSplashImageUrl(slide.url);

  const start = () => {
    if (!active) return;
    const img = preloaded.get(resolveSplashImageUrl(slide.url)) ?? imageEl;
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

  const fromImg = preloaded.get(resolveSplashImageUrl(currentSlide.url)) ?? null;

  runPixelGlitchAnimation({
    fromImg,
    toImg,
    onHold: () => {
      if (imageEl) imageEl.src = resolveSplashImageUrl(nextSlide.url);
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
  if (!deltaY) return;
  globalThis.dispatchEvent(
    new CustomEvent("splash-wheel-handoff", {
      detail: { deltaY, fromSplashHandoff: true },
    })
  );
}

function beginScrollHandoff(initialDeltaY = 0) {
  removeScrollListeners();
  document.body.classList.remove("is-splash-active");

  if (initialDeltaY !== 0) {
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
 * @param {{ scrollDeltaY?: number }} [options]
 */
export function dismissSplash(options = {}) {
  if (!splashEl || dismissing || !active) return;
  dismissing = true;
  active = false;
  stopGallery();
  beginScrollHandoff(options.scrollDeltaY ?? 0);

  startContinuousScramble(scrollHintTextEl);

  splashEl.classList.add("is-dismissed");
  splashEl.setAttribute("aria-hidden", "true");

  window.setTimeout(() => {
    endScrollHandoff();
    abortLetterShuffle(scrollHintTextEl);
    splashEl.hidden = true;
    globalThis.__SPLASH_DISMISSED__ = true;
    globalThis.dispatchEvent(new CustomEvent("splash-dismissed"));
  }, CONFIG.dismissDurationMs);
}

function isScrollDismissIntent(event) {
  if (event.type === "keydown") {
    return ["ArrowDown", "PageDown", "Space", "ArrowUp", "PageUp"].includes(event.key);
  }
  return false;
}

function onWheel(event) {
  if (!active) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.deltaY !== 0) dismissSplash({ scrollDeltaY: event.deltaY });
}

function onWheelHandoff(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.deltaY !== 0) {
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
  if (Math.abs(deltaY) > 24) {
    dismissSplash({
      scrollDeltaY:
        Math.sign(deltaY) * Math.max(Math.abs(deltaY), CONFIG.dismissScrollDelta),
    });
  }
}

function onTouchHandoff(event) {
  if (!event.touches.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const deltaY = touchStartY - event.touches[0].clientY;
  if (deltaY !== 0) {
    handoffScrollToSite(deltaY);
  }
  touchStartY = event.touches[0].clientY;
}

function onKeyDown(event) {
  if (!active) return;
  if (isScrollDismissIntent(event)) {
    event.preventDefault();
    const scrollDeltaY =
      event.key === "ArrowUp" || event.key === "PageUp"
        ? -CONFIG.dismissScrollDelta
        : CONFIG.dismissScrollDelta;
    dismissSplash({ scrollDeltaY });
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
  if (!splashEl) return;

  syncGridCssVars();
  initLetterShuffle();
  addScrollListeners();
  await loadImageCacheVersions();

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
      if (!active) return;
      applyRestingPixelation(getCurrentSlideImage());
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
