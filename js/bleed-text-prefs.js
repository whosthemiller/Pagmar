/**
 * Bleed text preferences — per-term nav / title-row text color overrides.
 */

const DATA_DIR = new URL("../data/", import.meta.url);

export const TEXT_MODES = ["auto", "dark", "light"];

const DEFAULT_TERM_PREFS = {
  navText: "auto",
  titleRowText: "auto",
};

/** @type {{ meta: { version: number }, terms: Record<string, { navText?: string, titleRowText?: string }> }} */
let loadedPrefs = {
  meta: { version: 1 },
  terms: {},
};

export function normalizeTextMode(value) {
  return TEXT_MODES.includes(value) ? value : "auto";
}

export function normalizeTermPrefs(entry = {}) {
  return {
    navText: normalizeTextMode(entry.navText),
    titleRowText: normalizeTextMode(entry.titleRowText),
  };
}

export async function loadBleedTextPrefs(url = new URL("bleed-text-prefs.json", DATA_DIR).href) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      loadedPrefs = { meta: { version: 1 }, terms: {} };
      return loadedPrefs;
    }
    const data = await res.json();
    const terms = {};
    for (const [name, entry] of Object.entries(data.terms || {})) {
      terms[name] = normalizeTermPrefs(entry);
    }
    loadedPrefs = {
      meta: data.meta || { version: 1 },
      terms,
    };
    return loadedPrefs;
  } catch {
    loadedPrefs = { meta: { version: 1 }, terms: {} };
    return loadedPrefs;
  }
}

export function getLoadedBleedTextPrefs() {
  return loadedPrefs;
}

export function getTermTextPrefs(termName) {
  if (!termName) return { ...DEFAULT_TERM_PREFS };
  return {
    ...DEFAULT_TERM_PREFS,
    ...normalizeTermPrefs(loadedPrefs.terms[termName]),
  };
}

/**
 * Merge export payload into the in-memory prefs shape.
 * @param {{ terms?: Record<string, { navText?: string, titleRowText?: string, imageUrl?: string }> }} exportData
 */
export function mergeBleedTextPrefsExport(exportData) {
  const merged = {
    meta: { version: 1 },
    terms: { ...loadedPrefs.terms },
  };
  for (const [name, entry] of Object.entries(exportData?.terms || {})) {
    const prev = merged.terms[name] || {};
    merged.terms[name] = normalizeTermPrefs({
      navText: entry.navText ?? prev.navText,
      titleRowText: entry.titleRowText ?? prev.titleRowText,
    });
  }
  return merged;
}

export function resolveTextInvert(mode, autoInvert) {
  const normalized = normalizeTextMode(mode);
  if (normalized === "light") return true;
  if (normalized === "dark") return false;
  return Boolean(autoInvert);
}

export function createEmptyExport() {
  return {
    meta: {
      version: 1,
      exportedAt: new Date().toISOString(),
    },
    terms: {},
  };
}
