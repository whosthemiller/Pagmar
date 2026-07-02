/**
 * Shared pixelation / glitch reveal utilities.
 * Used by splash.js.
 */

/** @type {HTMLCanvasElement | null} */
let sharedOffscreen = null;

function getOffscreen() {
  if (!sharedOffscreen) {
    sharedOffscreen = document.createElement("canvas");
  }
  return sharedOffscreen;
}

/** @param {HTMLImageElement} img @param {number} boxWidth @param {number} boxHeight */
export function getCoverSourceRect(img, boxWidth, boxHeight) {
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
  return { sx: 0, sy: (img.naturalHeight - sHeight) / 2, sWidth, sHeight };
}

/** @param {HTMLImageElement} img @param {number} boxWidth @param {number} boxHeight */
export function getContainSourceRect(img, boxWidth, boxHeight) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = boxWidth / boxHeight;
  if (imgRatio > boxRatio) {
    const dWidth = boxWidth;
    const dHeight = boxWidth / imgRatio;
    return { sx: 0, sy: 0, sWidth: img.naturalWidth, sHeight: img.naturalHeight, dx: 0, dy: (boxHeight - dHeight) / 2, dWidth, dHeight };
  }
  const dHeight = boxHeight;
  const dWidth = boxHeight * imgRatio;
  return { sx: 0, sy: 0, sWidth: img.naturalWidth, sHeight: img.naturalHeight, dx: (boxWidth - dWidth) / 2, dy: 0, dWidth, dHeight };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} img
 * @param {number} destWidth
 * @param {number} destHeight
 * @param {number} pixelFactor
 * @param {'cover' | 'contain'} [fit]
 */
export function drawPixelatedImage(ctx, img, destWidth, destHeight, pixelFactor, fit = "cover") {
  const factor = Math.max(1, pixelFactor);
  if (fit === "contain") {
    const { sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight } = getContainSourceRect(img, destWidth, destHeight);
    const lowW = Math.max(1, Math.round(dWidth / factor));
    const lowH = Math.max(1, Math.round(dHeight / factor));
    const offscreen = getOffscreen();
    offscreen.width = lowW;
    offscreen.height = lowH;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;
    offCtx.imageSmoothingEnabled = false;
    offCtx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, lowW, lowH);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, destWidth, destHeight);
    ctx.drawImage(offscreen, 0, 0, lowW, lowH, dx, dy, dWidth, dHeight);
    return;
  }
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

/** @alias */
export const drawPixelatedCover = drawPixelatedImage;

/**
 * @param {number} openProgress 0 = max pixelation, 1 = min/rest
 * @param {{ maxFactor?: number, restFactor?: number }} [options]
 */
export function getPixelFactor(openProgress, options = {}) {
  const maxFactor = options.maxFactor ?? 24;
  const minFactor = options.restFactor ?? 16;
  if (openProgress >= 1) return minFactor;
  if (openProgress <= 0) {
    const extra = Math.abs(openProgress);
    return Math.max(minFactor, Math.round(maxFactor + (maxFactor - minFactor) * extra));
  }
  const eased = Math.max(0, Math.min(1, openProgress));
  return Math.max(minFactor, Math.round(minFactor + (maxFactor - minFactor) * (1 - eased)));
}

/** @param {number} t @param {number} [hold] */
export function getGlitchOpenProgress(t, hold = 0.38) {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= hold) return 0;
  const revealT = (clamped - hold) / Math.max(1e-6, 1 - hold);
  return revealT * (2 - revealT);
}

/**
 * Run pixel reveal animation on a canvas.
 * @param {{
 *   ctx: CanvasRenderingContext2D,
 *   img: HTMLImageElement,
 *   width: number,
 *   height: number,
 *   durationMs?: number,
 *   maxFactor?: number,
 *   restFactor?: number,
 *   glitchHold?: number,
 *   fit?: 'cover' | 'contain',
 *   onFrame?: (t: number) => void,
 *   onComplete?: () => void,
 * }} options
 * @returns {() => void} cancel function
 */
export function runPixelRevealAnimation(options) {
  const {
    ctx,
    img,
    width,
    height,
    durationMs = 600,
    maxFactor = 24,
    restFactor = 16,
    glitchHold = 0.38,
    fit = "cover",
    onFrame,
    onComplete,
  } = options;

  let frameId = null;
  const start = performance.now();

  function drawAtProgress(openProgress) {
    const factor = getPixelFactor(openProgress, { maxFactor, restFactor });
    drawPixelatedImage(ctx, img, width, height, factor, fit);
  }

  function frame(now) {
    const t = Math.min(1, (now - start) / durationMs);
    const openProgress = getGlitchOpenProgress(t, glitchHold);
    drawAtProgress(openProgress);
    onFrame?.(t);
    if (t < 1) {
      frameId = requestAnimationFrame(frame);
    } else {
      frameId = null;
      onComplete?.();
    }
  }

  drawAtProgress(0);
  frameId = requestAnimationFrame(frame);

  return () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };
}
