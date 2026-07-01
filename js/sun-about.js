import {
  bindLetterShuffleDelegation,
  playAnnotatedSettleScrambleTo,
  abortLetterShuffle,
} from "./letter-shuffle.js";
import { syncGridCssVars } from "./grid-metrics.js";
import { applyTypographyRules } from "./typography.js";

const BRAND_PHRASE = "טרמינולוגיה פוליטית";

const INTRO_PARAGRAPHS = [
  `${BRAND_PHRASE} הוא אינדקס אינטראקטיבי של מושגים בעלי משמעויות פרשנויות לשוניות שונות בשיח הפוליטי בישראל. הוא בוחן כיצד מילים אינן רק מתארות מציאות, אלא גם מעצבות אותה.`,
  `בשיח הציבורי קיימים מונחים שונים המתייחסים לאותם אירועים, מקומות או רעיונות, אך כל אחד מהם נושא עמו מטען היסטורי, רגשי ופוליטי אחר. הבחירה בין מונחים כמו "יהודה ושומרון", "הגדה המערבית" או "השטחים הכבושים", למשל, אינה רק בחירה לשונית, אלא גם בחירה באופן שבו המציאות ממוסגרת ומתפרשת.`,
  `האתר אוסף, ממפה ומציג מונחים אלו לצד הגדרתם, מידע על משמעותם, הקשרי השימוש שלהם, תקופת השימוש בהם והמסגרות הלשוניות שהם מבטאים. מטרתו אינה לקבוע איזו פרשנות נכונה יותר, אלא לעודד התבוננות ביקורתית באופן שבו השפה משפיעה על הדרך שבה אנו מבינים את העולם.`,
  `הפרויקט נולד מתוך שאיפה לבחון את השפה באופן פתוח ככל האפשר, אך גם מתוך ההכרה שכל פעולת מיון, הגדרה ועריכה היא פעולה פרשנית. לכן, הוא אינו מבקש לעמוד מחוץ לשפה שהוא חוקר, אלא להפנות את תשומת הלב לכוחה של השפה עצמה ולתפקידה בעיצוב נרטיבים, תפיסות וזיכרון.`,
];

/** @type {{ heading: string, value: string, valueClass?: string, link?: string }[]} */
const CREDITS = [
  { heading: "בהנחיית", value: "אורי סוכרי ואלי מגזינר" },
  { heading: "תודה מיוחדת", value: "ניר שקד" },
  {
    heading: "פונטים",
    value: "Roobert — Displaay Type Foundry\nסקולו — הגילדה",
    valueClass: "sun-about__credit-value--fonts",
  },
  { heading: "עריכת תוכן", value: "אבי בולוטינסקי" },
  { heading: "עיצוב מחקר ופיתוח", value: "מיה מילר" },
];

/** @type {HTMLElement | null} */
let rootEl = null;
/** @type {HTMLElement | null} */
let viewportEl = null;
let isVisible = false;
let domBuilt = false;

/** Self-censor interaction: one black bar at a time, cleared by a plain click. */
/** @type {HTMLElement[]} */
let censorBars = [];
let censorEventsBound = false;
/** Timestamp of the last censor render — guards against the click that ends the drag. */
let lastCensorAt = 0;
let isSelectingCensor = false;
let censorRafId = 0;

function clearCensor() {
  for (const bar of censorBars) bar.remove();
  censorBars = [];
}

/** @param {Range} range */
function getTextRectsInRange(range) {
  if (!rootEl) return [];

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const rects = [];
  let node = walker.nextNode();

  while (node) {
    const textNode = node;
    const textRange = document.createRange();
    const start = textNode === range.startContainer ? range.startOffset : 0;
    const end = textNode === range.endContainer ? range.endOffset : textNode.textContent?.length ?? 0;

    if (end > start) {
      textRange.setStart(textNode, start);
      textRange.setEnd(textNode, end);
      rects.push(
        ...[...textRange.getClientRects()].filter(
          (rect) => rect.width >= 1 && rect.height >= 1
        )
      );
    }

    textRange.detach();
    node = walker.nextNode();
  }

  return rects;
}

/**
 * The native selection highlight fills the full line box (lines touch), while the
 * censor bars are built from the range's client rects (tighter, with a gap between
 * lines). Painting our own bars both during the drag and on release keeps that gap
 * consistent the whole time.
 * @param {Range} range
 */
function paintCensorFromRange(range) {
  if (!rootEl) return false;
  const rects = getTextRectsInRange(range);
  clearCensor();
  if (!rects.length) return false;

  const rootRect = rootEl.getBoundingClientRect();
  for (const rect of rects) {
    const bar = document.createElement("span");
    bar.className = "sun-about__censor-bar";
    bar.setAttribute("aria-hidden", "true");
    bar.style.left = `${rect.left - rootRect.left + rootEl.scrollLeft}px`;
    bar.style.top = `${rect.top - rootRect.top + rootEl.scrollTop}px`;
    bar.style.width = `${rect.width}px`;
    bar.style.height = `${rect.height}px`;
    rootEl.appendChild(bar);
    censorBars.push(bar);
  }
  return censorBars.length > 0;
}

/** @returns {{ selection: Selection, range: Range } | null} */
function currentAboutRange() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!rootEl || !rootEl.contains(range.commonAncestorContainer)) return null;
  return { selection, range };
}

function updateLiveCensor() {
  censorRafId = 0;
  if (!isVisible || !isSelectingCensor) return;
  const current = currentAboutRange();
  if (!current || current.selection.isCollapsed) {
    clearCensor();
    return;
  }
  paintCensorFromRange(current.range);
}

function handleSelectionChange() {
  if (!isSelectingCensor || censorRafId) return;
  censorRafId = requestAnimationFrame(updateLiveCensor);
}

/** @param {MouseEvent} event */
function handleCensorMouseDown(event) {
  if (!isVisible || event.button !== 0) return;
  isSelectingCensor = true;
}

function handleCensorMouseUp() {
  if (!isVisible || !isSelectingCensor) return;
  isSelectingCensor = false;
  if (censorRafId) {
    cancelAnimationFrame(censorRafId);
    censorRafId = 0;
  }

  const current = currentAboutRange();
  if (current && !current.selection.isCollapsed) {
    paintCensorFromRange(current.range);
    current.selection.removeAllRanges();
    lastCensorAt = performance.now();
  }
}

function handleDocumentClickForCensor() {
  if (!isVisible || !censorBars.length) return;
  // Ignore the click that completes the selecting drag.
  if (performance.now() - lastCensorAt < 350) return;
  clearCensor();
}

function bindCensorInteraction() {
  if (censorEventsBound || !rootEl) return;
  censorEventsBound = true;
  rootEl.addEventListener("mousedown", handleCensorMouseDown);
  document.addEventListener("mouseup", handleCensorMouseUp);
  document.addEventListener("selectionchange", handleSelectionChange);
  document.addEventListener("click", handleDocumentClickForCensor);
  window.addEventListener("resize", () => {
    clearCensor();
    clearLogoReveal();
    alignAboutLogo();
  });
}

/**
 * @param {string} text
 * @param {string} brandPhrase
 */
function buildIntroParagraph(text, brandPhrase) {
  const p = document.createElement("p");
  p.className = "sun-about__intro";

  if (!text.startsWith(brandPhrase)) {
    p.textContent = applyTypographyRules(text);
    return p;
  }

  const rest = text.slice(brandPhrase.length);
  const link = document.createElement("span");
  link.className = "sun-about__brand-link";
  link.textContent = brandPhrase;
  p.appendChild(link);

  const spaceMatch = rest.match(/^\s+/);
  const leadingSpace = spaceMatch ? spaceMatch[0] : "";
  const remainder = rest.slice(leadingSpace.length);

  if (leadingSpace) {
    const space = document.createElement("span");
    space.className = "sun-about__brand-space";
    space.textContent = leadingSpace;
    p.appendChild(space);
  }

  p.appendChild(document.createTextNode(applyTypographyRules(remainder)));
  return p;
}

function buildDom() {
  if (!rootEl || domBuilt) return;

  const grid = document.createElement("div");
  grid.className = "sun-about__grid";

  const introWrap = document.createElement("div");
  introWrap.className = "sun-about__intro-wrap";
  for (const paragraph of INTRO_PARAGRAPHS) {
    introWrap.appendChild(buildIntroParagraph(paragraph, BRAND_PHRASE));
  }
  grid.appendChild(introWrap);

  const sideWrap = document.createElement("div");
  sideWrap.className = "sun-about__side";

  const project = document.createElement("p");
  project.className = "sun-about__project";
  project.innerHTML = `${applyTypographyRules("פרויקט גמר במחלקה לתקשורת חזותית,")}<br />${applyTypographyRules("בצלאל אקדמיה לאמנות ועיצוב, ירושלים")}`;
  sideWrap.appendChild(project);

  const credits = document.createElement("div");
  credits.className = "sun-about__credits";
  for (const row of CREDITS) {
    const rowEl = document.createElement("div");
    rowEl.className = "sun-about__credit-row";

    const heading = document.createElement("p");
    heading.className = "sun-about__credit-heading";
    heading.textContent = row.heading;

    const value = document.createElement("p");
    value.className = `sun-about__credit-value${row.valueClass ? ` ${row.valueClass}` : ""}`;
    if (row.link) {
      const link = document.createElement("a");
      link.className = "sun-about__credit-link";
      link.href = row.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = applyTypographyRules(row.value);
      value.appendChild(link);
    } else {
      value.textContent = applyTypographyRules(row.value);
    }

    rowEl.append(heading, value);
    credits.appendChild(rowEl);
  }
  sideWrap.appendChild(credits);

  const logo = document.createElement("img");
  logo.className = "sun-about__logo";
  logo.src = "assets/Bezalel_academy_of_arts_and_design_new_logo.svg";
  logo.alt = "בצלאל אקדמיה לאמנות ועיצוב, ירושלים";
  logo.decoding = "async";
  logo.addEventListener("load", alignAboutLogo);
  sideWrap.appendChild(logo);

  grid.appendChild(sideWrap);

  rootEl.appendChild(grid);
  bindLetterShuffleDelegation(rootEl, ".sun-about__brand-link");
  bindLetterShuffleDelegation(rootEl, ".sun-about__credit-link");
  bindCensorInteraction();
  domBuilt = true;
}

/**
 * The text-bearing About elements, in reading order. The intro paragraphs and the
 * project line carry inline markup (the brand-link span, the project `<br>`, the
 * credit link), so the scramble must preserve it — hence the annotated settle
 * reveal rather than the markup-flattening continuous-settle used by the page
 * transition.
 * @returns {HTMLElement[]}
 */
function getAboutScrambleTargets() {
  if (!rootEl) return [];
  return [
    ...rootEl.querySelectorAll(
      ".sun-about__intro, .sun-about__project, .sun-about__credit-heading, .sun-about__credit-value"
    ),
  ].filter((el) => el instanceof HTMLElement);
}

/**
 * Entrance scramble: reveal each block with the index-entrance settle scramble
 * (all characters scramble, then settle in random order). Each block's box is
 * pinned to its settled height (overflow hidden) for the duration so the varying
 * widths of the random glyphs can't reflow the column and shift the logo or scroll.
 */
function playAboutEnterScramble() {
  for (const el of getAboutScrambleTargets()) {
    const html = el.innerHTML;
    const height = el.getBoundingClientRect().height;
    if (height > 0.5) {
      el.style.height = `${Math.ceil(height)}px`;
      el.style.overflow = "hidden";
    }
    playAnnotatedSettleScrambleTo(el, html, () => {
      el.style.removeProperty("height");
      el.style.removeProperty("overflow");
    });
  }
}

function abortAboutEnterScramble() {
  for (const el of getAboutScrambleTargets()) {
    abortLetterShuffle(el);
    el.style.removeProperty("height");
    el.style.removeProperty("overflow");
  }
}

/** Pixelation reveal for the Bezalel logo — mirrors the splash entrance glitch. */
const LOGO_REVEAL = { durationMs: 700, maxFactor: 18 };

/** @type {HTMLCanvasElement | null} */
let logoOffscreen = null;
/** @type {HTMLCanvasElement | null} */
let logoCanvas = null;
let logoRevealFrame = 0;
let logoRevealPending = false;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getLogoOffscreen() {
  if (!logoOffscreen) logoOffscreen = document.createElement("canvas");
  return logoOffscreen;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} destW
 * @param {number} destH
 * @param {number} factor
 */
function drawPixelatedLogo(ctx, img, destW, destH, factor) {
  const f = Math.max(1, factor);
  const lowW = Math.max(1, Math.round(destW / f));
  const lowH = Math.max(1, Math.round(destH / f));
  const off = getLogoOffscreen();
  off.width = lowW;
  off.height = lowH;
  const offCtx = off.getContext("2d");
  if (!offCtx) return;
  offCtx.imageSmoothingEnabled = false;
  offCtx.clearRect(0, 0, lowW, lowH);
  offCtx.drawImage(img, 0, 0, lowW, lowH);

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, destW, destH);
  ctx.drawImage(off, 0, 0, lowW, lowH, 0, 0, destW, destH);
}

function clearLogoReveal() {
  logoRevealPending = false;
  if (logoRevealFrame) {
    cancelAnimationFrame(logoRevealFrame);
    logoRevealFrame = 0;
  }
  if (logoCanvas) {
    logoCanvas.remove();
    logoCanvas = null;
  }
  const logo = rootEl?.querySelector(".sun-about__logo");
  if (logo instanceof HTMLElement) logo.style.removeProperty("visibility");
}

/** @param {HTMLImageElement} logo */
function startLogoReveal(logo) {
  if (!rootEl || !isVisible) return;
  const parent = logo.parentElement;
  if (!(parent instanceof HTMLElement)) return;

  const parentRect = parent.getBoundingClientRect();
  const logoRect = logo.getBoundingClientRect();
  if (logoRect.width < 1 || logoRect.height < 1) return;
  if (!logo.complete || logo.naturalWidth < 1) return;

  clearLogoReveal();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.className = "sun-about__logo-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = Math.round(logoRect.width * dpr);
  canvas.height = Math.round(logoRect.height * dpr);
  canvas.style.left = `${logoRect.left - parentRect.left}px`;
  canvas.style.top = `${logoRect.top - parentRect.top}px`;
  canvas.style.width = `${logoRect.width}px`;
  canvas.style.height = `${logoRect.height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  parent.appendChild(canvas);
  logoCanvas = canvas;
  logo.style.visibility = "hidden";

  const start = performance.now();
  const frame = (now) => {
    if (!isVisible || logoCanvas !== canvas) return;
    const t = Math.min(1, (now - start) / LOGO_REVEAL.durationMs);
    const eased = t * (2 - t);
    const factor = Math.max(1, Math.round(1 + (LOGO_REVEAL.maxFactor - 1) * (1 - eased)));
    drawPixelatedLogo(ctx, logo, canvas.width, canvas.height, factor);
    if (t < 1) {
      logoRevealFrame = requestAnimationFrame(frame);
    } else {
      logoRevealFrame = 0;
      clearLogoReveal();
    }
  };
  logoRevealFrame = requestAnimationFrame(frame);
}

/**
 * Reveal the logo with the splash-style pixelation glitch on entrance. Waits for
 * the SVG to decode (first show) and for layout/alignment to settle so the canvas
 * overlay lands exactly on the logo's box.
 */
function playLogoPixelReveal() {
  if (!rootEl || prefersReducedMotion()) return;
  const logo = rootEl.querySelector(".sun-about__logo");
  if (!(logo instanceof HTMLImageElement)) return;

  logoRevealPending = true;
  const begin = () => {
    if (!isVisible || !logoRevealPending) return;
    logoRevealPending = false;
    requestAnimationFrame(() => startLogoReveal(logo));
  };

  if (logo.complete && logo.naturalWidth > 0) {
    begin();
  } else {
    logo.addEventListener("load", begin, { once: true });
  }
}

/** Align the logo's top edge with the top of the last intro paragraph. */
function alignAboutLogo() {
  if (!rootEl || !isVisible) return;
  const logo = rootEl.querySelector(".sun-about__logo");
  const lastParagraph = rootEl.querySelector(
    ".sun-about__intro-wrap .sun-about__intro:last-child"
  );
  if (!(logo instanceof HTMLElement) || !(lastParagraph instanceof HTMLElement)) {
    return;
  }

  logo.style.marginTop = "0px";
  const logoTop = logo.getBoundingClientRect().top;
  const lastParagraphTop = lastParagraph.getBoundingClientRect().top;
  const delta = lastParagraphTop - logoTop;
  logo.style.marginTop = `${Math.max(0, Math.round(delta))}px`;
}

function setVisibleState(visible) {
  if (!rootEl) {
    isVisible = false;
    return;
  }

  rootEl.hidden = !visible;

  if (viewportEl) {
    viewportEl.classList.toggle("is-about-active", visible);
    viewportEl.closest(".sun-app")?.classList.toggle("is-about-active", visible);
  }

  isVisible = visible;

  if (visible) {
    syncGridCssVars(viewportEl);
    rootEl.scrollTop = 0;
    playAboutEnterScramble();
    requestAnimationFrame(() => {
      alignAboutLogo();
      playLogoPixelReveal();
    });
  } else {
    isSelectingCensor = false;
    clearCensor();
    clearLogoReveal();
    abortAboutEnterScramble();
  }
}

export function isSunAboutVisible() {
  return isVisible;
}

/**
 * Exit scramble: re-run the markup-preserving block scramble on the About text
 * so it visibly scrambles out before the page transition hides it. Mirrors the
 * entrance ({@link playAboutEnterScramble}) for the reverse direction. The hide
 * (setVisibleState(false) → abortAboutEnterScramble) cleans up if it's still
 * running when the swap happens.
 */
export function playSunAboutExitScramble() {
  if (!isVisible) return;
  playAboutEnterScramble();
}

export function showSunAbout() {
  if (!rootEl) return;
  buildDom();
  setVisibleState(true);
}

export function hideSunAbout() {
  if (!rootEl) return;
  setVisibleState(false);
}

/**
 * The About content is intentionally excluded from the page-transition (continuous
 * + settle) scramble: that heavy letter-shuffle attaches lingering underlines and
 * flattens markup (the brand-link span and the project line break). Its entrance
 * scramble is instead driven by {@link playAboutEnterScramble} on show, using the
 * markup-preserving annotated settle reveal.
 * @returns {HTMLElement[]}
 */
export function getSunAboutScrambleTargets() {
  return [];
}

/**
 * @param {{
 *   rootEl: HTMLElement | null,
 *   viewportEl?: HTMLElement | null,
 * }} options
 */
export function initSunAbout({ rootEl: root, viewportEl: viewport }) {
  rootEl = root;
  viewportEl = viewport ?? root?.closest(".sun-viewport") ?? null;
  if (!rootEl) return;
  buildDom();
}
