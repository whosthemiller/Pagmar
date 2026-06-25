/**
 * Splash image picker lab.
 *
 * Gathers every full-bleed-suitable image from data/term-images.json, lets you
 * pick + order them for the splash slideshow and choose per-image Secolo quote
 * color, then exports data/splash-images.json.
 */

import { applyBlockTypography } from "./typography.js";
import {
  initLetterShuffle,
  startLetterShuffle,
  stopLetterShuffle,
} from "./letter-shuffle.js";

const BLEED = {
  minShortEdge: 560,
  maxUpscale: 1.65,
  measureConcurrency: 8,
};

const TERM_IMAGES_URL = "../data/term-images.json";
const SPLASH_CONFIG_URL = "../data/splash-images.json";

const INTRO_LINK_TEXT = "טרמינולוגיה פוליטית";
const INTRO_REST_TEXT =
  "הוא אינדקס אינטראקטיבי של מושגים בעלי פרשנויות לשוניות שונות בשיח הפוליטי בישראל. האתר בוחן כיצד מילים שונות המתייחסות לאותה מציאות יכולות לעצב תפיסות שונות שלה, וכיצד המאבק על הנרטיב מתנהל גם דרך השפה עצמה.";

/** @type {Array<{ url: string, caption: string }>} */
let eligibleImages = [];

/** @type {Map<string, string>} url -> caption */
const captionByUrl = new Map();

/** @type {string[]} ordered selection */
let selectedUrls = [];

/** @type {Map<string, 'dark' | 'light'>} */
const quoteColorByUrl = new Map();

/** @type {string | null} */
let previewUrl = null;

const panelStatusEl = document.getElementById("splash-lab-status");
const progressEl = document.getElementById("splash-lab-progress");
const gridEl = document.getElementById("splash-lab-grid");
const selectedListEl = document.getElementById("splash-lab-selected");
const selectedEmptyEl = document.getElementById("splash-lab-selected-empty");
const selectedCountEl = document.getElementById("splash-lab-selected-count");
const applyBtnEl = document.getElementById("splash-lab-apply");
const hintEl = document.getElementById("splash-lab-hint");

const panelEl = document.querySelector(".splash-lab-panel");
const collapseBtnEl = document.getElementById("splash-lab-collapse");
const previewWrapEl = document.getElementById("splash-lab-preview");
const previewSplashEl = document.getElementById("splash-lab-preview-splash");
const previewImgEl = previewSplashEl?.querySelector(".splash__image");
const previewIntroEl = document.getElementById("splash-lab-preview-intro");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeQuoteColor(value) {
  return value === "light" ? "light" : "dark";
}

function getQuoteColorForUrl(url) {
  return quoteColorByUrl.get(url) ?? "dark";
}

function setQuoteColorForUrl(url, color) {
  quoteColorByUrl.set(url, normalizeQuoteColor(color));
}

/** Resolve a repo-relative image URL to one usable from prototypes/. */
function resolveImageSrc(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(`../${url.replace(/^\//, "")}`, import.meta.url).href;
}

function captionFor(url) {
  return captionByUrl.get(url) || url.split("/").pop() || url;
}

function renderColorSegment(url, compact = false) {
  const color = getQuoteColorForUrl(url);
  const compactClass = compact ? " splash-lab-segment--compact" : "";
  return (
    `<div class="splash-lab-segment${compactClass}" data-color-url="${escapeHtml(url)}" role="group" aria-label="צבע ציטוט">` +
    `<button type="button" data-value="dark"${color === "dark" ? ' class="is-active"' : ""}>כהה</button>` +
    `<button type="button" data-value="light"${color === "light" ? ' class="is-active"' : ""}>בהיר</button>` +
    `</div>`
  );
}

/* ----------------------------- data loading ----------------------------- */

async function fetchTermImageCatalog() {
  const response = await fetch(TERM_IMAGES_URL);
  if (!response.ok) throw new Error(`Failed to load ${TERM_IMAGES_URL}`);
  const data = await response.json();
  const seen = new Set();
  /** @type {Array<{ url: string, caption: string }>} */
  const unique = [];
  for (const term of Object.values(data.terms ?? {})) {
    for (const image of term.images ?? []) {
      if (!image?.url || seen.has(image.url)) continue;
      seen.add(image.url);
      const caption = image.caption || image.url.split("/").pop() || image.url;
      captionByUrl.set(image.url, caption);
      unique.push({ url: image.url, caption });
    }
  }
  return unique;
}

async function fetchExistingSelection() {
  try {
    const response = await fetch(SPLASH_CONFIG_URL);
    if (!response.ok) return;
    const data = await response.json();
    const fallback = data.quoteTextColor === "light" ? "light" : "dark";
    selectedUrls = [];
    quoteColorByUrl.clear();
    for (const entry of data.images ?? []) {
      if (!entry?.url) continue;
      selectedUrls.push(entry.url);
      setQuoteColorForUrl(entry.url, entry.quoteTextColor ?? fallback);
    }
  } catch {
    /* no existing config — fine */
  }
}

/** @param {{ url: string, caption: string }} item */
function measureEligibility(item) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const shortEdge = Math.min(w, h);
      const coverScale = Math.max(
        window.innerWidth / w,
        window.innerHeight / h
      );
      const eligible =
        shortEdge >= BLEED.minShortEdge && coverScale <= BLEED.maxUpscale;
      resolve({ item, eligible });
    };
    img.onerror = () => resolve({ item, eligible: false });
    img.src = resolveImageSrc(item.url);
  });
}

/** Measure a list with bounded concurrency; report progress per result. */
async function measureAll(items, onResult) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      const result = await measureEligibility(current);
      onResult(result);
    }
  }
  const workers = Array.from(
    { length: Math.min(BLEED.measureConcurrency, items.length) },
    worker
  );
  await Promise.all(workers);
}

/* ----------------------------- rendering ----------------------------- */

function setStatus(text) {
  if (panelStatusEl) panelStatusEl.textContent = text;
}

function renderGrid() {
  if (!gridEl) return;
  if (!eligibleImages.length) {
    gridEl.innerHTML = "";
    return;
  }
  gridEl.innerHTML = eligibleImages
    .map((image) => {
      const selectedIndex = selectedUrls.indexOf(image.url);
      const isSelected = selectedIndex >= 0;
      const isPreview = previewUrl === image.url;
      const caption = captionFor(image.url);
      return (
        `<div class="splash-lab-grid-item${isSelected ? " is-selected" : ""}${isPreview ? " is-preview" : ""}">` +
        `<button type="button" class="splash-lab-image-btn" data-url="${escapeHtml(image.url)}" title="${escapeHtml(caption)}">` +
        `<span class="splash-lab-image-btn__badge">${isSelected ? selectedIndex + 1 : ""}</span>` +
        `<img src="${escapeHtml(resolveImageSrc(image.url))}" alt="" loading="lazy" decoding="async" />` +
        `<span>${escapeHtml(caption)}</span>` +
        `</button>` +
        (isSelected ? renderColorSegment(image.url, true) : "") +
        `</div>`
      );
    })
    .join("");
}

function renderSelected() {
  if (!selectedListEl) return;
  if (selectedCountEl) selectedCountEl.textContent = `(${selectedUrls.length})`;
  if (selectedEmptyEl) selectedEmptyEl.hidden = selectedUrls.length > 0;
  if (applyBtnEl) applyBtnEl.disabled = selectedUrls.length === 0;

  selectedListEl.innerHTML = selectedUrls
    .map((url, i) => {
      const caption = captionFor(url);
      return (
        `<li class="splash-lab-selected-item" data-url="${escapeHtml(url)}">` +
        `<span class="splash-lab-selected-item__order">${i + 1}</span>` +
        `<img class="splash-lab-selected-item__thumb" src="${escapeHtml(resolveImageSrc(url))}" alt="" loading="lazy" />` +
        `<div class="splash-lab-selected-item__main">` +
        `<span class="splash-lab-selected-item__name" title="${escapeHtml(caption)}">${escapeHtml(caption)}</span>` +
        renderColorSegment(url) +
        `</div>` +
        `<span class="splash-lab-selected-item__btns">` +
        `<button type="button" data-move="up" ${i === 0 ? "disabled" : ""} title="העלה" aria-label="העלה">↑</button>` +
        `<button type="button" data-move="down" ${i === selectedUrls.length - 1 ? "disabled" : ""} title="הורד" aria-label="הורד">↓</button>` +
        `<button type="button" data-remove title="הסר" aria-label="הסר">✕</button>` +
        `</span>` +
        `</li>`
      );
    })
    .join("");
}

function setPreview(url) {
  previewUrl = url;
  if (previewImgEl) previewImgEl.src = url ? resolveImageSrc(url) : "";
  if (previewWrapEl) previewWrapEl.classList.toggle("has-image", Boolean(url));
  applyQuoteColorToPreview();
  renderGrid();
}

function applyQuoteColorToPreview() {
  if (!previewSplashEl) return;
  const color = previewUrl ? getQuoteColorForUrl(previewUrl) : "dark";
  previewSplashEl.classList.toggle("is-quote-light", color === "light");
  previewSplashEl.classList.toggle("is-quote-dark", color !== "light");
}

function handleColorSegmentClick(event) {
  const btn = event.target.closest('[data-color-url] button[data-value]');
  if (!btn) return false;
  event.stopPropagation();
  const segment = btn.closest("[data-color-url]");
  const url = segment?.dataset.colorUrl;
  if (!url) return true;
  setQuoteColorForUrl(url, btn.dataset.value);
  renderSelected();
  renderGrid();
  if (previewUrl === url) applyQuoteColorToPreview();
  return true;
}

/* ----------------------------- actions ----------------------------- */

function toggleSelected(url) {
  const index = selectedUrls.indexOf(url);
  if (index >= 0) {
    selectedUrls.splice(index, 1);
  } else {
    selectedUrls.push(url);
    if (!quoteColorByUrl.has(url)) setQuoteColorForUrl(url, "dark");
  }
  renderSelected();
  renderGrid();
}

function moveSelected(url, direction) {
  const index = selectedUrls.indexOf(url);
  if (index < 0) return;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= selectedUrls.length) return;
  [selectedUrls[index], selectedUrls[target]] = [
    selectedUrls[target],
    selectedUrls[index],
  ];
  renderSelected();
  renderGrid();
}

function removeSelected(url) {
  const index = selectedUrls.indexOf(url);
  if (index < 0) return;
  selectedUrls.splice(index, 1);
  renderSelected();
  renderGrid();
}

function buildExport() {
  return {
    meta: {
      version: 1,
      exportedAt: new Date().toISOString(),
      note: "רשימת תמונות לעמוד הפתיחה. הסדר בקובץ הוא לנוחות עריכה בלבד — באתר המעבר הוא אקראי. נוצר/מתעדכן דרך prototypes/splash-lab.html.",
    },
    images: selectedUrls.map((url) => ({
      url,
      quoteTextColor: getQuoteColorForUrl(url),
    })),
  };
}

function downloadExport() {
  if (!selectedUrls.length) {
    window.alert("בחרי לפחות תמונה אחת לעמוד הפתיחה.");
    return;
  }
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "splash-images.json";
  link.click();
  URL.revokeObjectURL(link.href);

  if (hintEl) {
    hintEl.hidden = false;
    hintEl.textContent =
      "הקובץ splash-images.json הורד. החליפי בו את data/splash-images.json כדי לעדכן את עמוד הפתיחה.";
  }
}

/* ----------------------------- wiring ----------------------------- */

function bindUi() {
  gridEl?.addEventListener("click", (event) => {
    if (handleColorSegmentClick(event)) return;
    const btn = event.target.closest(".splash-lab-image-btn[data-url]");
    if (!btn) return;
    const url = btn.dataset.url;
    setPreview(url);
    toggleSelected(url);
  });

  selectedListEl?.addEventListener("click", (event) => {
    if (handleColorSegmentClick(event)) return;
    const item = event.target.closest(".splash-lab-selected-item[data-url]");
    if (!item) return;
    const url = item.dataset.url;
    const moveBtn = event.target.closest("[data-move]");
    if (moveBtn) {
      moveSelected(url, moveBtn.dataset.move);
      return;
    }
    if (event.target.closest("[data-remove]")) {
      removeSelected(url);
      return;
    }
    setPreview(url);
  });

  applyBtnEl?.addEventListener("click", downloadExport);

  collapseBtnEl?.addEventListener("click", () => {
    panelEl?.classList.toggle("is-collapsed");
  });
}

async function boot() {
  if (previewIntroEl) {
    const restTyped = applyBlockTypography(INTRO_REST_TEXT, { ensurePeriod: false });
    const link = document.createElement("span");
    link.className = "splash__intro-link";
    link.textContent = INTRO_LINK_TEXT;
    link.addEventListener("mouseenter", () => startLetterShuffle(link));
    link.addEventListener("mouseleave", () => stopLetterShuffle(link));
    const monoSpace = document.createElement("span");
    monoSpace.className = "splash__intro-space";
    monoSpace.textContent = " ";
    previewIntroEl.textContent = "";
    previewIntroEl.append(link, monoSpace, document.createTextNode(restTyped));
  }

  initLetterShuffle();
  bindUi();
  await fetchExistingSelection();
  renderSelected();

  let catalog;
  try {
    catalog = await fetchTermImageCatalog();
  } catch (error) {
    console.error("[splash-lab]", error);
    setStatus("שגיאה בטעינת קטלוג התמונות");
    return;
  }

  setStatus(`נמצאו ${catalog.length} תמונות. בודק התאמה לפול בליד…`);

  let measured = 0;
  let eligibleCount = 0;
  await measureAll(catalog, ({ item, eligible }) => {
    measured++;
    if (eligible) {
      eligibleCount++;
      eligibleImages.push(item);
      renderGrid();
    }
    if (progressEl) {
      progressEl.textContent = `${eligibleCount} מתאימות / ${measured} מתוך ${catalog.length}`;
    }
  });

  eligibleImages.sort((a, b) => a.caption.localeCompare(b.caption, "he"));
  renderGrid();
  setStatus(`${eligibleCount} תמונות מתאימות לפול בליד (מתוך ${catalog.length}).`);

  if (!previewUrl) {
    setPreview(selectedUrls[0] ?? eligibleImages[0]?.url ?? null);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
