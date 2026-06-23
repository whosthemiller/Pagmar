/**
 * Data layer: load sheet-data.json and build graph structures.
 */

import {
  applyCoalitionTags,
  buildCoalitionLinks,
  buildUsedByIndex,
} from "./term-coalition-tags.js";
import {
  DISCOURSE_GROUP_LEGEND_COLORS,
  getDiscourseGroup,
} from "./term-discourse-map.js";
import {
  collectKeywordPhrases,
  collectDefinitionPhrases,
  collectMentionPhrases,
  findBoundedPhrases,
  parseCsv,
  parseVariantCell,
  rangesOverlap,
  WIKI_LINK_TYPES,
} from "./wiki-keywords.js";

const DATA_DIR = new URL("../data/", import.meta.url);

function dataUrl(filename) {
  return new URL(filename, DATA_DIR).href;
}

/** Flat, simple hues — keep link strokes in styles.css in sync */
export const CATEGORY_COLORS = {
  אוכלוסייה: "#dc2626",
  אירוע: "#ea580c",
  בטחון: "#2563eb",
  מדיניות: "#7c3aed",
  שטח: "#16a34a",
  תשתית: "#64748b",
  default: "#475569",
};

export const LINK_TYPES = {
  spatial: {
    key: "מושגים עם זיקה מרחבית",
    label: "זיקה מרחבית",
    color: "#2563eb",
  },
  event: {
    key: "מושגים עם זיקה אירועית",
    label: "זיקה אירועית",
    color: "#dc2626",
  },
  associative: {
    key: "מושגים עם זיקה אסוציאטיבית",
    label: "זיקה אסוציאטיבית",
    color: "#000000",
  },
};

export const MAIN_CATEGORIES = [
  "אוכלוסייה",
  "אירוע",
  "בטחון",
  "מדיניות",
  "שטח",
  "תשתית",
];

export const TERM_LINK_TYPES = {
  discourse: {
    key: "discourse",
    label: "קבוצת דיבור משותפת",
    color: "rgba(100, 116, 139, 0.45)",
  },
  mention: {
    key: "mention",
    label: "הזכרה בהגדרה",
    color: "rgba(100, 116, 139, 0.45)",
  },
  coalition: {
    key: "coalition",
    label: "קואליציות משתמשים",
    color: "rgba(100, 116, 139, 0.45)",
  },
};

/** Framing-type hues — keep term-map-view link strokes in sync */
export const FRAMING_TYPE_COLORS = {
  בטחוני: "rgba(37, 99, 235, 0.55)",
  בירוקרטי: "rgba(100, 116, 139, 0.55)",
  גיאוגרפי: "rgba(22, 163, 74, 0.55)",
  היסטורי: "rgba(180, 83, 9, 0.55)",
  לאומי: "rgba(220, 38, 38, 0.55)",
  מוסרי: "rgba(124, 58, 237, 0.55)",
  משפטי: "rgba(8, 145, 178, 0.55)",
};

export const FRAMING_TYPES = Object.keys(FRAMING_TYPE_COLORS);

/** Solid hues for legend swatches (map links use FRAMING_TYPE_COLORS above) */
export const FRAMING_TYPE_LEGEND_COLORS = {
  בטחוני: "#2563eb",
  בירוקרטי: "#64748b",
  גיאוגרפי: "#16a34a",
  היסטורי: "#b45309",
  לאומי: "#dc2626",
  מוסרי: "#7c3aed",
  משפטי: "#0891b2",
};

export function getFramingColor(framingType) {
  return FRAMING_TYPE_COLORS[framingType] || TERM_LINK_TYPES.discourse.color;
}

export function getDiscourseColor(discourseGroup) {
  return DISCOURSE_GROUP_LEGEND_COLORS[discourseGroup] || "#64748b";
}

function pickPrimaryFramingTag(shared, tagFrequency) {
  if (!shared?.length) return null;
  return shared.reduce((best, tag) => {
    const freq = tagFrequency.get(tag) ?? 999;
    const bestFreq = tagFrequency.get(best) ?? 999;
    return freq < bestFreq ? tag : best;
  }, shared[0]);
}

/** @deprecated use TERM_LINK_TYPES.discourse */
export const TERM_LINK_TYPE = TERM_LINK_TYPES.discourse;

const MAX_FRAMING_LINKS_PER_TERM = 5;
const MAX_DISCOURSE_LINKS_PER_TERM = 5;

function parseIdList(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^OBJ-\d+$/.test(s));
}

function parseSubcategories(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildObjectNodes(objectRows) {
  return objectRows
    .map((row) => {
      const id = (row["מזהה אובייקט"] || "").trim();
      if (!id) return null;
      const category = (row["קטגוריה ראשית"] || "").trim() || "default";
      return {
        id,
        name: (row["שם אובייקט נייטרלי"] || "").trim(),
        category,
        subcategories: parseSubcategories(row["קטגוריות משנה"]),
        description: (row["תיאור אובייקט קצר"] || "").trim(),
        raw: row,
      };
    })
    .filter(Boolean);
}

export function buildObjectLinks(objectRows, validIds) {
  const links = [];
  const idSet = validIds instanceof Set ? validIds : new Set(validIds);

  for (const row of objectRows) {
    const sourceId = (row["מזהה אובייקט"] || "").trim();
    if (!sourceId || !idSet.has(sourceId)) continue;

    for (const [type, meta] of Object.entries(LINK_TYPES)) {
      const targets = parseIdList(row[meta.key]);
      for (const targetId of targets) {
        if (!idSet.has(targetId) || targetId === sourceId) continue;
        links.push({
          source: sourceId,
          target: targetId,
          type,
        });
      }
    }
  }
  return links;
}

function mapTermRow(row, objectId, objectNode) {
  return {
    id: (row["מזהה מונח"] || "").trim(),
    name: (row["שם מונח"] || "").trim(),
    objectId,
    objectName: objectNode?.name || "",
    category: objectNode?.category || "default",
    definition: (row["הגדרה קצרה של המונח"] || "").trim(),
    termType: (row["סוג מונח"] || "").trim(),
    framing: (row["סוג מסגור"] || "").trim(),
    framingTags: parseSubcategories(row["סוג מסגור"]),
    emphasizes: (row["מה המונח מדגיש"] || "").trim(),
    obscures: (row["מה המונח מטשטש"] || "").trim(),
    connotation: (row["קונוטציה רגשית"] || "").trim(),
    usedBy: (row["מי משתמש במונח"] || "").trim(),
    contexts: (row["באילו הקשרים נפוץ"] || "").trim(),
    period: (row["תקופת שימוש בולטת"] || "").trim(),
    relatedNames: parseSubcategories(row["מונחים לאותו מושג"]),
    discourseGroup: getDiscourseGroup(
      (row["שם מונח"] || "").trim(),
      (row["מי משתמש במונח"] || "").trim()
    ),
    raw: row,
  };
}

export function buildTermsForObject(termsRows, objectId) {
  return termsRows
    .filter((row) => (row["מזהה אובייקט משויך"] || "").trim() === objectId)
    .map((row) => mapTermRow(row, objectId, null))
    .filter((t) => t.name);
}

export function buildAllTermNodes(termsRows, nodeById) {
  return termsRows
    .map((row) => {
      const objectId = (row["מזהה אובייקט משויך"] || "").trim();
      const term = mapTermRow(row, objectId, nodeById.get(objectId));
      return term.name ? term : null;
    })
    .filter(Boolean);
}

export function buildSynonymLinks(terms) {
  const nameToTerm = new Map(terms.map((t) => [t.name, t]));
  const links = [];
  const seen = new Set();

  for (const term of terms) {
    for (const relatedName of term.relatedNames) {
      const other = nameToTerm.get(relatedName);
      if (!other || other.id === term.id) continue;
      const key = [term.id, other.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        source: term.id,
        target: other.id,
        type: "synonym",
      });
    }
  }
  return links;
}

function framingLinkScore(term, other, tagFrequency) {
  const shared = term.framingTags.filter((tag) => other.framingTags.includes(tag));
  if (!shared.length) return null;
  const rarity = Math.min(...shared.map((tag) => tagFrequency.get(tag) || 999));
  return { shared, rarity, weight: shared.length * 1000 - rarity };
}

export function buildFramingLinks(terms) {
  const tagFrequency = new Map();
  for (const term of terms) {
    for (const tag of term.framingTags) {
      tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1);
    }
  }

  const chosen = new Set();
  const links = [];

  for (const term of terms) {
    if (!term.framingTags.length) continue;

    const candidates = [];
    for (const other of terms) {
      if (other.id === term.id || other.objectId === term.objectId) continue;
      const score = framingLinkScore(term, other, tagFrequency);
      if (!score) continue;
      candidates.push({ other, ...score });
    }

    candidates.sort((a, b) => b.weight - a.weight);
    for (const { other, shared } of candidates.slice(0, MAX_FRAMING_LINKS_PER_TERM)) {
      const key = [term.id, other.id].sort().join("|");
      if (chosen.has(key)) continue;
      chosen.add(key);
      links.push({
        source: term.id,
        target: other.id,
        type: "framing",
        framingType: pickPrimaryFramingTag(shared, tagFrequency),
        sharedFraming: shared,
      });
    }
  }

  return links;
}

function discourseLinkWeight(term, other, groupFrequency) {
  if (!term.discourseGroup || term.discourseGroup !== other.discourseGroup) return null;
  const freq = groupFrequency.get(term.discourseGroup) || 999;
  return { weight: 1000 - freq };
}

export function buildDiscourseLinks(terms) {
  const groupFrequency = new Map();
  for (const term of terms) {
    if (!term.discourseGroup) continue;
    groupFrequency.set(
      term.discourseGroup,
      (groupFrequency.get(term.discourseGroup) || 0) + 1
    );
  }

  const chosen = new Set();
  const links = [];

  for (const term of terms) {
    if (!term.discourseGroup) continue;

    const candidates = [];
    for (const other of terms) {
      if (other.id === term.id || other.objectId === term.objectId) continue;
      const score = discourseLinkWeight(term, other, groupFrequency);
      if (!score) continue;
      candidates.push({ other, ...score });
    }

    candidates.sort(
      (a, b) =>
        b.weight - a.weight || a.other.name.localeCompare(b.other.name, "he")
    );
    for (const { other } of candidates.slice(0, MAX_DISCOURSE_LINKS_PER_TERM)) {
      const key = [term.id, other.id].sort().join("|");
      if (chosen.has(key)) continue;
      chosen.add(key);
      links.push({
        source: term.id,
        target: other.id,
        type: "discourse",
        discourseGroup: term.discourseGroup,
      });
    }
  }

  return links;
}

/** All cross-neighborhood links within the same discourse group (no per-term cap). */
export function buildFullDiscourseLinks(terms) {
  const chosen = new Set();
  const links = [];

  for (const term of terms) {
    if (!term.discourseGroup) continue;

    for (const other of terms) {
      if (other.id === term.id || other.objectId === term.objectId) continue;
      if (other.discourseGroup !== term.discourseGroup) continue;

      const key = [term.id, other.id].sort().join("|");
      if (chosen.has(key)) continue;
      chosen.add(key);
      links.push({
        source: term.id,
        target: other.id,
        type: "discourse",
        discourseGroup: term.discourseGroup,
      });
    }
  }

  return links;
}

export function buildTermLinks(terms) {
  return buildDiscourseLinks(terms);
}

/** Bare הרג/ההרג/… → מונח נהרג; הרג אזרחים נשאר ביטוי נפרד. */
const TERM_EXTRA_DEFINITION_PHRASES = {
  נהרג: ["הרג", "ההרג", "בהרג", "והרג"],
};

/**
 * When a multi-word catalog term inherits a shorter keyword row (e.g. הרג אזרחים ← row הרג),
 * keep only phrases that carry the full compound — not the bare prefix alone.
 */
function filterKeywordPhrasesForTerm(term, keywordRow, phrases) {
  const termName = (term.name || "").trim();
  const rowKeyword = (keywordRow["מילת_מפתח"] || "").trim();
  if (!termName.includes(" ") || rowKeyword === termName) return phrases;

  const suffix = termName.slice(rowKeyword.length).trim();
  const suffixStem = suffix.replace(/ים$/, "");
  return phrases.filter((phrase) => {
    const p = (phrase || "").trim();
    if (p === termName) return true;
    if (!p.includes(" ")) return false;
    return p.includes(suffix) || (suffixStem.length >= 3 && p.includes(suffixStem));
  });
}

export function resolveKeywordRowForTerm(term, keywordRows) {
  const byName = keywordRows.find((row) => row["מילת_מפתח"] === term.name);
  if (byName) return byName;

  const byVariant = keywordRows.find((row) => {
    const phrases = collectMentionPhrases(row);
    return phrases.includes(term.name);
  });
  if (byVariant) return byVariant;

  const groupRows = keywordRows.filter(
    (row) => row["קבוצת_מושג"] === term.objectName
  );
  return (
    groupRows.find((row) => row["מילת_מפתח"] === term.name) ||
    groupRows.find((row) => collectMentionPhrases(row).includes(term.name)) ||
    null
  );
}

/**
 * Wiki/catalog term link patterns — exact term names only (no CSV inflections).
 * Matches the full catalog name or a synonym listed in מונחים לאותו מושג.
 */
export function buildWikiTermLinkPatterns(terms) {
  const catalogNames = new Set(
    terms.map((term) => (term.name || "").trim()).filter(Boolean)
  );
  /** @type {Map<string, { phrase: string, termId: string }>} */
  const byPhrase = new Map();

  for (const term of terms) {
    const phrases = new Set([(term.name || "").trim()]);
    for (const related of term.relatedNames || []) {
      const name = (related || "").trim();
      if (name && catalogNames.has(name)) phrases.add(name);
    }

    for (const phrase of phrases) {
      if (phrase.length < 2) continue;
      const existing = byPhrase.get(phrase);
      if (!existing || term.name === phrase) {
        byPhrase.set(phrase, { phrase, termId: term.id, objectId: term.objectId });
      }
    }
  }

  return [...byPhrase.values()].sort((a, b) => b.phrase.length - a.phrase.length);
}

/**
 * Definition mention patterns from keyword-frequency inflections + catalog synonyms.
 * Related compounds (e.g. "מלחמה עזה 2023" under מלחמה) are excluded so bare
 * "מלחמה" maps to the generic term, not longer war names.
 */
export function buildDefinitionMentionPatterns(terms, keywordRows = []) {
  const catalogNames = new Set(
    terms.map((term) => (term.name || "").trim()).filter(Boolean)
  );
  /** @type {Map<string, { phrase: string, termId: string, objectId: string }>} */
  const byPhrase = new Map();

  const addPhrase = (phrase, term) => {
    const p = (phrase || "").trim();
    if (p.length < 2) return;
    const existing = byPhrase.get(p);
    if (!existing || term.name === p) {
      byPhrase.set(p, { phrase: p, termId: term.id, objectId: term.objectId });
    }
  };

  for (const term of terms) {
    const phrases = new Set([(term.name || "").trim()]);
    for (const related of term.relatedNames || []) {
      const name = (related || "").trim();
      if (name && catalogNames.has(name)) phrases.add(name);
    }

    const keywordRow = resolveKeywordRowForTerm(term, keywordRows);
    if (keywordRow) {
      for (const phrase of filterKeywordPhrasesForTerm(
        term,
        keywordRow,
        collectDefinitionPhrases(keywordRow)
      )) {
        phrases.add(phrase);
      }
    }

    for (const extra of TERM_EXTRA_DEFINITION_PHRASES[term.name] || []) {
      phrases.add(extra);
    }

    for (const phrase of phrases) {
      addPhrase(phrase, term);
    }
  }

  return [...byPhrase.values()].sort((a, b) => b.phrase.length - a.phrase.length);
}

function findMentionedTermIds(text, patterns, excludeTermId) {
  if (!text?.trim()) return [];

  const occupied = [];
  const found = new Set();

  for (const { phrase, termId } of patterns) {
    if (termId === excludeTermId || found.has(termId)) continue;

    for (const { start, end } of findBoundedPhrases(text, phrase)) {
      const range = { start, end };
      if (occupied.some((r) => rangesOverlap(r, range))) continue;
      occupied.push(range);
      found.add(termId);
      break;
    }
  }

  return [...found];
}

/**
 * Directed links: host term → mentioned known term (short definition only).
 * Only matches catalog terms from known-terms — not generic corpus words.
 */
export function buildMentionLinks(terms, keywordRows = []) {
  void keywordRows;
  const patterns = buildWikiTermLinkPatterns(terms);
  const links = [];
  const seen = new Set();

  for (const host of terms) {
    const mentioned = findMentionedTermIds(host.definition, patterns, host.id);
    for (const targetId of mentioned) {
      const key = `${host.id}|${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        source: host.id,
        target: targetId,
        type: "mention",
      });
    }
  }

  return links;
}

/**
 * Group term nodes by parent object (sheet order), terms sorted in Hebrew per object.
 */
export function groupTermsByObject(termNodes, objectRows) {
  const termsByObject = new Map();
  for (const term of termNodes) {
    if (!term.objectId) continue;
    if (!termsByObject.has(term.objectId)) termsByObject.set(term.objectId, []);
    termsByObject.get(term.objectId).push(term);
  }

  const groups = [];
  const seen = new Set();

  for (const row of objectRows) {
    const objectId = (row["מזהה אובייקט"] || "").trim();
    if (!objectId || seen.has(objectId)) continue;
    const terms = termsByObject.get(objectId);
    if (!terms?.length) continue;
    seen.add(objectId);
    terms.sort((a, b) => a.name.localeCompare(b.name, "he"));
    groups.push({
      objectId,
      objectName: (row["שם אובייקט נייטרלי"] || "").trim() || terms[0].objectName,
      category: (row["קטגוריה ראשית"] || "").trim() || terms[0].category || "default",
      terms,
    });
  }

  for (const [objectId, terms] of termsByObject) {
    if (seen.has(objectId)) continue;
    terms.sort((a, b) => a.name.localeCompare(b.name, "he"));
    groups.push({
      objectId,
      objectName: terms[0].objectName || objectId,
      category: terms[0].category || "default",
      terms,
    });
  }

  return groups;
}

/**
 * Swap ray positions by object id pairs without changing terms inside each row.
 * @param {ReturnType<typeof groupTermsByObject>} groups
 * @param {[string, string][]} swaps
 */
export function swapGroupsByObjectId(groups, swaps) {
  const indexById = new Map(groups.map((group, index) => [group.objectId, index]));
  for (const [idA, idB] of swaps) {
    const indexA = indexById.get(idA);
    const indexB = indexById.get(idB);
    if (indexA == null || indexB == null) continue;
    const groupA = groups[indexA];
    groups[indexA] = groups[indexB];
    groups[indexB] = groupA;
    indexById.set(idA, indexB);
    indexById.set(idB, indexA);
  }
  return groups;
}

export function getRelatedObjects(objectId, objectRows, validIds) {
  const row = objectRows.find((r) => (r["מזהה אובייקט"] || "").trim() === objectId);
  if (!row) return { spatial: [], event: [], associative: [] };

  const idSet = validIds instanceof Set ? validIds : new Set(validIds);
  const result = {};

  for (const [type, meta] of Object.entries(LINK_TYPES)) {
    result[type] = parseIdList(row[meta.key])
      .filter((id) => idSet.has(id) && id !== objectId)
      .map((id) => ({ id }));
  }
  return result;
}

function mapKnownTermRow(row) {
  const name = (row["שם_מונח"] || "").trim();
  if (!name) return null;

  const objectName = (row["קבוצת_מושג"] || "").trim();
  const count = parseInt(row["ספירה"], 10) || 0;

  const variantsCol =
    row["וариантים"] || row["variants"] || row["וריאנטים"] || "";

  return {
    id: name,
    name,
    count,
    objectId: objectName || `solo:${name}`,
    objectName,
    category: "default",
    definition: (row["הגדרה_קצרה"] || "").trim(),
    matchPhrases: parseVariantCell(variantsCol),
    discourseGroup: getDiscourseGroup(name),
    raw: row,
  };
}

export function buildKnownTermNodes(rows) {
  return rows.map(mapKnownTermRow).filter(Boolean);
}

export async function loadKnownTermsMapData(
  termsUrl = dataUrl("known-terms.csv"),
  keywordsUrl = dataUrl("keyword-frequency.csv"),
  sheetUrl = dataUrl("sheet-data.json")
) {
  const [termsRes, keywordsRes, sheetRes] = await Promise.all([
    fetch(termsUrl),
    fetch(keywordsUrl),
    fetch(sheetUrl),
  ]);
  if (!termsRes.ok) throw new Error(`Failed to load known terms: ${termsRes.status}`);
  if (!keywordsRes.ok) {
    throw new Error(`Failed to load keyword frequency: ${keywordsRes.status}`);
  }
  if (!sheetRes.ok) {
    throw new Error(`Failed to load sheet data: ${sheetRes.status}`);
  }

  const rows = parseCsv(await termsRes.text());
  const keywordRows = parseCsv(await keywordsRes.text());
  const sheetData = await sheetRes.json();
  const termNodes = buildKnownTermNodes(rows);
  const usedByByName = buildUsedByIndex(sheetData.sheets?.terms || []);
  applyCoalitionTags(termNodes, usedByByName);

  for (const term of termNodes) {
    const usedBy = usedByByName.get(term.name) || term.usedBy || "";
    term.discourseGroup = getDiscourseGroup(term.name, usedBy);
  }

  const mentionLinks = buildMentionLinks(termNodes, keywordRows);
  const coalitionLinks = buildCoalitionLinks(termNodes);
  const discourseLinks = buildFullDiscourseLinks(termNodes);
  const termById = new Map(termNodes.map((t) => [t.id, t]));

  return {
    termNodes,
    termLinks: mentionLinks,
    mentionLinks,
    coalitionLinks,
    discourseLinks,
    termById,
  };
}

const TERM_IMAGE_SOURCE_LABELS = {
  local: "",
  "commons.wikimedia": "ויקימדיה קומונס",
  "he.wikipedia": "ויקיפדיה",
  "en.wikipedia": "Wikipedia",
};

function normalizeTermImage(entry) {
  if (typeof entry === "string") {
    return { url: entry, caption: "", source: "commons.wikimedia" };
  }
  const url = entry?.url || "";
  if (!url) return null;
  const source = entry?.source || "commons.wikimedia";
  return {
    url,
    source,
    caption: entry?.caption || "",
    sourceLabel: TERM_IMAGE_SOURCE_LABELS[source] || source,
  };
}

export async function loadTermImages(url = dataUrl("term-images.json")) {
  try {
    const res = await fetch(url);
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map();
    for (const [name, entry] of Object.entries(data.terms || {})) {
      const images = (entry?.images || [])
        .map(normalizeTermImage)
        .filter(Boolean)
        .slice(0, 3);
      if (images.length) map.set(name, images);
    }
    return map;
  } catch {
    return new Map();
  }
}

/** @type {Map<string, HTMLImageElement>} */
const preloadedImageCache = new Map();

export function getPreloadedTermImage(url) {
  return preloadedImageCache.get(url) ?? null;
}

/** Unique image URLs from a term-images map. */
export function collectTermImageUrls(termImages) {
  const urls = new Set();
  for (const images of termImages.values()) {
    for (const image of images) {
      const url = image?.url;
      if (url) urls.add(url);
    }
  }
  return [...urls];
}

function loadImageElementOnce(url, { decode = true } = {}) {
  return new Promise((resolve) => {
    if (preloadedImageCache.has(url)) {
      resolve({ ok: true, url });
      return;
    }

    const img = new Image();
    let settled = false;

    const finish = async (ok) => {
      if (settled) return;
      settled = true;
      if (ok && img.naturalWidth > 0) {
        if (decode) {
          try {
            await img.decode();
          } catch {
            // decoded bitmap may still be usable
          }
        }
        preloadedImageCache.set(url, img);
        resolve({ ok: true, url });
        return;
      }
      resolve({ ok: false, url });
    };

    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("load", () => finish(true), { once: true });
    img.addEventListener("error", () => finish(false), { once: true });
    img.src = url;
    if (img.complete) {
      void finish(img.naturalWidth > 0);
    }
  });
}

async function loadImageElement(url, retries = 3, options = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await loadImageElementOnce(url, options);
    if (result.ok) return result;
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  return { ok: false, url };
}

async function preloadTermImagesBatch(urls, onBatchProgress, options = {}) {
  const total = urls.length;
  if (!total) return { loaded: 0, failedUrls: [] };

  let loaded = 0;
  const failedUrls = [];
  const concurrency = options.concurrency ?? 12;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < total) {
      const url = urls[nextIndex++];
      const result = await loadImageElement(url, options.retries ?? 3, options);
      if (result.ok) loaded += 1;
      else failedUrls.push(url);
      onBatchProgress?.(loaded + failedUrls.length, total);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker())
  );

  return { loaded, failedUrls };
}

/**
 * Preload term images with optional progress callback.
 * Retries failed URLs until all succeed or retry rounds are exhausted.
 * onProgress(ratio, doneCount, totalCount)
 * @param {{ decode?: boolean, concurrency?: number, maxRounds?: number, retries?: number }} [options]
 */
export async function preloadTermImages(urls, onProgress, options = {}) {
  const total = urls.length;
  if (!total) {
    onProgress?.(1, 0, 0);
    return { loaded: 0, failed: 0, total: 0 };
  }

  const maxRounds = options.maxRounds ?? 4;
  let loaded = 0;
  let pending = [...urls];

  for (let round = 0; round < maxRounds && pending.length; round += 1) {
    if (round > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600 * round));
    }

    const roundResult = await preloadTermImagesBatch(pending, (doneInRound, roundTotal) => {
      const doneOverall = loaded + doneInRound;
      onProgress?.(doneOverall / total, doneOverall, total);
    }, options);

    loaded += roundResult.loaded;
    pending = roundResult.failedUrls;
  }

  onProgress?.(loaded / total, loaded, total);

  return { loaded, failed: pending.length, total, failedUrls: pending };
}

export async function loadSemanticData(url = dataUrl("sheet-data.json")) {
  const [res, keywordsRes] = await Promise.all([
    fetch(url),
    fetch(dataUrl("keyword-frequency.csv")),
  ]);
  if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
  const data = await res.json();
  const keywordRows = keywordsRes.ok ? parseCsv(await keywordsRes.text()) : [];

  const objectRows = data.sheets?.objects || [];
  const termsRows = data.sheets?.terms || [];
  const nodes = buildObjectNodes(objectRows);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const links = buildObjectLinks(objectRows, nodeIds);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const termNodes = buildAllTermNodes(termsRows, nodeById);
  const termLinks = buildTermLinks(termNodes);
  const termById = new Map(termNodes.map((t) => [t.id, t]));

  return {
    meta: data.meta,
    nodes,
    links,
    nodeById,
    termNodes,
    termLinks,
    termById,
    objectRows,
    termsRows,
    keywordRows,
    categories: MAIN_CATEGORIES,
  };
}
