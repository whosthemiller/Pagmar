import { createEmptyExport, normalizeTextMode } from "./bleed-text-prefs.js";

/** @type {import("./sun-map.js")} */
let mapApi = null;

/** @type {Array<{ id: string, name: string }>} */
let allTerms = [];

/** @type {string | null} */
let selectedTermId = null;

/** @type {string | null} */
let selectedImageUrl = null;

const uiPrefs = {
  navText: "auto",
  titleRowText: "auto",
};

/** @type {Map<string, { termName: string, imageUrl: string | null, navText: string, titleRowText: string }>} */
const queuedByTermName = new Map();

const termSearchEl = document.getElementById("bleed-lab-term-search");
const termSelectEl = document.getElementById("bleed-lab-term-select");
const imagesEl = document.getElementById("bleed-lab-images");
const statusEl = document.getElementById("bleed-lab-status");
const queueEl = document.getElementById("bleed-lab-queue");
const applyHintEl = document.getElementById("bleed-lab-apply-hint");

function resolveImageSrc(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(`../${url.replace(/^\//, "")}`, import.meta.url).href;
}

function getSelectedTerm() {
  return allTerms.find((term) => term.id === selectedTermId) ?? null;
}

function getSelectedTermName() {
  return getSelectedTerm()?.name ?? null;
}

function setSegmentValue(prefKey, value) {
  uiPrefs[prefKey] = normalizeTextMode(value);
  document.querySelectorAll(`.bleed-text-lab-segment[data-pref="${prefKey}"] button`).forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.value === uiPrefs[prefKey]);
  });
}

function loadPrefsIntoUi(termName) {
  if (!mapApi || !termName) return;
  const saved = mapApi.getTermTextPrefs(termName);
  const queued = queuedByTermName.get(termName);
  setSegmentValue("navText", queued?.navText ?? saved.navText);
  setSegmentValue("titleRowText", queued?.titleRowText ?? saved.titleRowText);
}

function renderTermOptions(filter = "") {
  if (!termSelectEl) return;
  const query = filter.trim().toLowerCase();
  const matches = allTerms.filter((term) => !query || term.name.toLowerCase().includes(query));
  termSelectEl.innerHTML = matches
    .map(
      (term) =>
        `<option value="${escapeAttr(term.id)}"${term.id === selectedTermId ? " selected" : ""}>${escapeHtml(term.name)}</option>`
    )
    .join("");
  if (!matches.length) {
    termSelectEl.innerHTML = '<option disabled>לא נמצאו מונחים</option>';
  }
}

function renderImageGrid() {
  if (!imagesEl || !mapApi) return;
  const termName = getSelectedTermName();
  if (!termName) {
    imagesEl.innerHTML = "";
    return;
  }

  const images = mapApi.getBleedEligibleImages(termName);
  if (!images.length) {
    imagesEl.innerHTML = '<p style="grid-column:1/-1;font-size:12px;color:rgba(17,17,17,.45)">אין תמונות למונח זה</p>';
    return;
  }

  if (!selectedImageUrl) {
    const queued = queuedByTermName.get(termName);
    selectedImageUrl =
      queued?.imageUrl ??
      mapApi.getCurrentBleedImageUrl(termName) ??
      images.find((image) => image.bleedEligible)?.url ??
      images[0]?.url ??
      null;
  }

  imagesEl.innerHTML = images
    .map((image, index) => {
      const caption = image.caption || image.url?.split("/").pop() || `תמונה ${index + 1}`;
      const ineligible = !image.bleedEligible;
      return (
        `<button type="button" class="bleed-text-lab-image-btn${selectedImageUrl === image.url ? " is-active" : ""}${ineligible ? " is-ineligible" : ""}" ` +
        `data-url="${escapeAttr(image.url)}" title="${escapeAttr(caption)}">` +
        `<img src="${escapeAttr(resolveImageSrc(image.url))}" alt="" loading="lazy" decoding="async" />` +
        `<span>${escapeHtml(caption)}${ineligible ? " (לא מתאים לפול בליד)" : ""}</span>` +
        `</button>`
      );
    })
    .join("");
}

function updateStatus() {
  if (!statusEl) return;
  const termName = getSelectedTermName();
  if (!termName) {
    statusEl.textContent = "בחרי מונח מהרשימה";
    statusEl.classList.remove("is-queued");
    return;
  }
  if (queuedByTermName.has(termName)) {
    statusEl.textContent = `«${termName}» — שמור בתור, ממתין להחלה על האתר`;
    statusEl.classList.add("is-queued");
    return;
  }
  statusEl.textContent = `«${termName}» — מציג הגדרות נוכחיות של האתר`;
  statusEl.classList.remove("is-queued");
}

function updateQueueSummary() {
  if (!queueEl) return;
  const count = queuedByTermName.size;
  queueEl.innerHTML = count
    ? `<strong>${count}</strong> מונחים בתור להחלה`
    : "אין מונחים בתור";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function applyPreview() {
  if (!mapApi || !selectedTermId) return;
  mapApi.previewTermBleed(selectedTermId, selectedImageUrl, {
    navText: uiPrefs.navText,
    titleRowText: uiPrefs.titleRowText,
  });
}

function onTermSelected(termId) {
  selectedTermId = termId;
  selectedImageUrl = null;
  const term = getSelectedTerm();
  if (term) {
    loadPrefsIntoUi(term.name);
    renderImageGrid();
    updateStatus();
    applyPreview();
  }
}

function saveCurrentTerm() {
  const term = getSelectedTerm();
  if (!term) return;
  queuedByTermName.set(term.name, {
    termName: term.name,
    imageUrl: selectedImageUrl,
    navText: uiPrefs.navText,
    titleRowText: uiPrefs.titleRowText,
  });
  updateStatus();
  updateQueueSummary();
}

function downloadExportFile(exportData) {
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "bleed-text-lab-export.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function applyToSite() {
  if (!queuedByTermName.size) {
    window.alert("אין מונחים בתור. לחצי «שמור מונח» לפחות פעם אחת.");
    return;
  }

  const exportData = createEmptyExport();
  for (const entry of queuedByTermName.values()) {
    exportData.terms[entry.termName] = {
      imageUrl: entry.imageUrl,
      navText: entry.navText,
      titleRowText: entry.titleRowText,
    };
  }

  downloadExportFile(exportData);

  if (applyHintEl) {
    applyHintEl.hidden = false;
    applyHintEl.textContent =
      "הקובץ bleed-text-lab-export.json הורד. הריצי בטרמינל: node scripts/apply-bleed-text-prefs.js data/bleed-text-lab-export.json";
  }
}

function bindUi() {
  document.querySelectorAll(".bleed-text-lab-segment").forEach((segment) => {
    const prefKey = segment.dataset.pref;
    segment.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-value]");
      if (!btn || !prefKey) return;
      setSegmentValue(prefKey, btn.dataset.value);
      applyPreview();
    });
  });

  termSearchEl?.addEventListener("input", () => {
    renderTermOptions(termSearchEl.value);
  });

  termSelectEl?.addEventListener("change", () => {
    const termId = termSelectEl.value;
    if (termId) onTermSelected(termId);
  });

  imagesEl?.addEventListener("click", (event) => {
    const btn = event.target.closest(".bleed-text-lab-image-btn[data-url]");
    if (!btn) return;
    selectedImageUrl = btn.dataset.url || null;
    renderImageGrid();
    applyPreview();
  });

  document.getElementById("bleed-lab-show")?.addEventListener("click", applyPreview);
  document.getElementById("bleed-lab-save-term")?.addEventListener("click", saveCurrentTerm);
  document.getElementById("bleed-lab-apply")?.addEventListener("click", applyToSite);
}

function bootLab(api) {
  mapApi = api;
  allTerms = api.listAllTerms().sort((a, b) => a.name.localeCompare(b.name, "he"));
  renderTermOptions();
  bindUi();
  updateQueueSummary();

  if (allTerms.length) {
    onTermSelected(allTerms[0].id);
    if (termSelectEl) termSelectEl.value = allTerms[0].id;
  } else {
    updateStatus();
  }
}

function waitForMapApi() {
  if (globalThis.__SUN_BLEED_LAB_API__) {
    bootLab(globalThis.__SUN_BLEED_LAB_API__);
    return;
  }
  document.addEventListener(
    "sun-map-ready",
    (event) => {
      bootLab(event.detail);
    },
    { once: true }
  );
}

waitForMapApi();
