/**
 * Temporary test filter panels — self-contained, easy to remove.
 * Delete this file and remove hooks from sun-map.js to uninstall.
 */

import { FRAMING_TYPES } from "./data-model.js";
import { COALITION_TAG_DEFS, extractCoalitionTags } from "./term-coalition-tags.js";
import { restartCensorExpand } from "./censor-scramble-rgb.js";
import {
  abortLetterShuffle,
  playLightLetterShuffleTo,
  startContinuousScramble,
} from "./letter-shuffle.js";
import { getGridSpanBounds } from "./grid-metrics.js";
import { applyBlockTypography } from "./typography.js";
import { applyFilterCensorToGrid } from "./sun-overview-terms-grid.js";

const FILTER_DIMS = [
  { key: "termType", label: "סוג מונח" },
  { key: "framing", label: "מסגור לשוני" },
  { key: "connotation", label: "פעולה רגשית" },
  { key: "coalition", label: "קבוצות שימוש" },
];

const PANEL_DEF = { id: "sun-filter-test-censor" };
const FILTER_SUFFIX_CLEAR = "×";
/** Roobert glyph guilsinglright (U+203A), rotated in CSS to point down. */
const FILTER_SUFFIX_CHEVRON = "›";

const FILTER_DIM_HINTS = {
  coalition:
    "לא כולם קוראים לאותו דבר באותו שם. השדה הזה מזהה מי משתמש בכל מונח — ממשלות ישראל, ארגוני זכויות אדם, תקשורת בינלאומית, ארגונים פלסטיניים, שיח אקדמי ועוד. בחירת המונח חושפת לא רק איך מישהו מתאר מציאות, אלא מאיזו עמדה הוא מדבר.",
  termType:
    'מאיפה מגיע המונח? האם הוא נטבע בחקיקה ובהצהרות ממשלתיות (רשמי), בשפת הצבא והפקודות (צבאי), בשיח המשפטי הבינלאומי (משפטי), בכיסוי התקשורתי (תקשורתי), בשיח האידיאולוגי של תנועה (אידיאולוגי), או בפה העם (עממי)? לאותה פעולה יכולה להיות "כניסה קרקעית" בצבאי, "כיבוש צבאי" במשפטי, ו"פלישה" באידיאולוגי.',
  framing:
    'כל מונח בוחר זווית אחת להסתכל ממנה על המציאות. "גדר הביטחון" מסגרת את הגדר דרך עדשה ביטחונית, "גדר ההפרדה" דרך עדשה גיאוגרפית־לאומית, ו"חומת ההפרדה" מוסיפה עדשה מוסרית. המסגור חושף איזו שאלה המונח מזמין לשאול — ואיזו הוא מסתיר.',
  connotation:
    "מונחים לא רק מתארים — הם גם פועלים. יש מונחים שמצדיקים, כאלה שמאשימים, כאלה שמרככים וכאלה שמסלימים. זיהוי הקונוטציה עוזר להבין מה מונח עושה לקורא — לא רק מה הוא אומר.",
};
const FILTER_DIM_HINT_COLUMNS = 6;
const FILTER_DIM_HINT_HIDE_MS = 120;

let getGroups = () => [];
let getSvg = () => null;
let isInOverview = () => false;
/**
 * Whether the tags page is the *target* view (true while opening / staying,
 * false the moment a close starts). Tied to the overview target — not the
 * zoom progress — so the filter bar disappears in lockstep with the terms
 * grid instead of lingering until the zoom-out finishes.
 */
let isTagsPageOpen = () => false;
let overviewSubMode = "filter";
let wrapperEl = null;
let filterDimHintEl = null;
let filterDimHintHideTimer = null;
let filterDimHintHoverBound = false;
let filterDimHintResizeBound = false;
const activeFilters = {};
let censoredTermIds = new Set();
let filterDropdownListenersBound = false;

function clearFilterDimHintHideTimer() {
  if (filterDimHintHideTimer == null) return;
  clearTimeout(filterDimHintHideTimer);
  filterDimHintHideTimer = null;
}

function isTagsPageActive() {
  return isInOverview() && overviewSubMode !== "timeline";
}

function positionFilterDimHint() {
  if (!filterDimHintEl) return;
  const viewportEl = document.getElementById("sun-viewport");
  const span = getGridSpanBounds(FILTER_DIM_HINT_COLUMNS, 1, viewportEl || undefined);
  filterDimHintEl.style.left = `${span.left}px`;
  filterDimHintEl.style.width = `${span.width}px`;
  filterDimHintEl.style.maxWidth = `${span.width}px`;
}

function hideFilterDimHint({ immediate = false } = {}) {
  if (!filterDimHintEl) return;
  clearFilterDimHintHideTimer();
  if (immediate) {
    abortLetterShuffle(filterDimHintEl);
    filterDimHintEl.hidden = true;
    filterDimHintEl.textContent = "";
    return;
  }
  if (isTagsPageActive()) {
    abortLetterShuffle(filterDimHintEl);
    filterDimHintEl.hidden = true;
    filterDimHintEl.textContent = "";
    return;
  }
  if (filterDimHintEl.hidden) return;
  startContinuousScramble(filterDimHintEl);
  filterDimHintHideTimer = window.setTimeout(() => {
    if (!filterDimHintEl) return;
    abortLetterShuffle(filterDimHintEl);
    filterDimHintEl.hidden = true;
    filterDimHintEl.textContent = "";
    filterDimHintHideTimer = null;
  }, FILTER_DIM_HINT_HIDE_MS);
}

function showFilterDimHint(dimKey) {
  const text = FILTER_DIM_HINTS[dimKey];
  if (!filterDimHintEl || !text) return;
  if (!isInOverview() || overviewSubMode === "timeline" || isTagsPageActive()) return;
  clearFilterDimHintHideTimer();
  positionFilterDimHint();
  filterDimHintEl.hidden = false;
  playLightLetterShuffleTo(filterDimHintEl, applyBlockTypography(text));
}

function bindFilterDimHintHover() {
  if (!wrapperEl || filterDimHintHoverBound) return;
  filterDimHintHoverBound = true;

  wrapperEl.addEventListener("mouseover", (event) => {
    const labelEl =
      event.target instanceof Element
        ? event.target.closest(".sun-filter-bar__label[data-filter-key]")
        : null;
    if (!labelEl) return;
    const related = event.relatedTarget;
    if (related instanceof Node && labelEl.contains(related)) return;
    const dimKey = labelEl.getAttribute("data-filter-key");
    if (!dimKey) return;
    showFilterDimHint(dimKey);
  });

  wrapperEl.addEventListener("mouseout", (event) => {
    const labelEl =
      event.target instanceof Element
        ? event.target.closest(".sun-filter-bar__label[data-filter-key]")
        : null;
    if (!labelEl) return;
    const related = event.relatedTarget;
    if (related instanceof Node && labelEl.contains(related)) return;
    hideFilterDimHint();
  });
}

function bindFilterDimHintResize() {
  if (filterDimHintResizeBound) return;
  filterDimHintResizeBound = true;
  window.addEventListener("resize", () => {
    positionFilterDimHint();
  });
}

function normalizeOption(opt) {
  if (typeof opt === "string") return { value: opt, label: opt };
  return { value: opt.value, label: opt.label };
}

function updateFilterSuffixButton(wrap, hasValue) {
  const suffixBtn = wrap.querySelector(".sun-filter-bar__suffix");
  if (!suffixBtn) return;
  const dimLabel =
    wrap.querySelector(".sun-filter-bar__trigger")?.getAttribute("aria-label") || "";
  suffixBtn.classList.toggle("is-clear", hasValue);
  suffixBtn.classList.toggle("is-chevron", !hasValue);
  suffixBtn.textContent = hasValue ? FILTER_SUFFIX_CLEAR : FILTER_SUFFIX_CHEVRON;
  suffixBtn.setAttribute(
    "aria-label",
    hasValue ? `נקה ${dimLabel}` : `פתח ${dimLabel}`
  );
}

function setFilterValue(wrap, value, label, { animate = false } = {}) {
  const valueEl = wrap.querySelector(".sun-filter-bar__value");
  const menu = wrap.querySelector(".sun-filter-bar__menu");
  const displayLabel = label || "הכל";
  const hasValue = Boolean(value);
  wrap.classList.toggle("has-value", hasValue);
  updateFilterSuffixButton(wrap, hasValue);
  if (!menu) {
    if (valueEl) valueEl.textContent = displayLabel;
    return;
  }
  for (const option of menu.querySelectorAll(".sun-filter-bar__option")) {
    const isSelected = option.dataset.value === value;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", isSelected ? "true" : "false");
  }
  if (!valueEl) return;
  if (animate && valueEl.textContent !== displayLabel) {
    playLightLetterShuffleTo(valueEl, displayLabel);
    return;
  }
  valueEl.textContent = displayLabel;
}

function closeAllFilterMenus() {
  for (const wrap of document.querySelectorAll(".sun-filter-bar__select-wrap.is-open")) {
    wrap.classList.remove("is-open");
    const trigger = wrap.querySelector(".sun-filter-bar__trigger");
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.blur();
    const menu = wrap.querySelector(".sun-filter-bar__menu");
    if (menu) menu.hidden = true;
  }
}

function toggleFilterMenu(wrap) {
  const wasOpen = wrap.classList.contains("is-open");
  closeAllFilterMenus();
  if (wasOpen) return;
  wrap.classList.add("is-open");
  wrap.querySelector(".sun-filter-bar__trigger")?.setAttribute("aria-expanded", "true");
  const menu = wrap.querySelector(".sun-filter-bar__menu");
  if (menu) menu.hidden = false;
}

function bindFilterDropdownListeners() {
  if (filterDropdownListenersBound) return;
  filterDropdownListenersBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".sun-filter-bar__select-wrap")) return;
    closeAllFilterMenus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllFilterMenus();
  });
}

function applyFilterSelection(wrap, value, label) {
  const dimKey = wrap.dataset.filterKey;
  if (!dimKey) return;
  closeAllFilterMenus();
  activeFilters[dimKey] = value;
  setFilterValue(wrap, value, label, { animate: true });
  rebuildCensorSet();
  updateCensorFilterOptionStates();
  applySunFilterTestOpacity(getSvg());
}

function getCoalitionTags(term) {
  const tags = extractCoalitionTags(term.usedBy || "");
  if (!tags.length && term.discourseGroup) {
    return [`discourse:${term.discourseGroup}`];
  }
  return tags;
}

function collectUniqueValues(groups, field) {
  const values = new Set();
  for (const group of groups) {
    for (const term of group.terms) {
      const val = term[field];
      if (val) values.add(val);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b, "he"));
}

function getFilterOptions(groups, key) {
  if (key === "framing") return [...FRAMING_TYPES];
  if (key === "coalition") {
    return COALITION_TAG_DEFS.map((def) => ({ value: def.id, label: def.label }));
  }
  return collectUniqueValues(groups, key).map((v) => ({ value: v, label: v }));
}

function termMatchesFilter(term, key, value) {
  if (!value) return true;
  switch (key) {
    case "termType":
      return term.termType === value;
    case "framing":
      return (term.framingTags || []).includes(value);
    case "connotation":
      return term.connotation === value;
    case "coalition":
      return getCoalitionTags(term).includes(value);
    default:
      return false;
  }
}

function getActiveFilterList() {
  return FILTER_DIMS.map((dim) => ({
    key: dim.key,
    value: activeFilters[dim.key] || "",
  })).filter((f) => f.value);
}

function termMatchesAllFilters(term, filters) {
  return filters.every((filter) => termMatchesFilter(term, filter.key, filter.value));
}

function hasMatchingTerm(groups, filters) {
  for (const group of groups) {
    for (const term of group.terms) {
      if (termMatchesAllFilters(term, filters)) return true;
    }
  }
  return false;
}

function isCensorOptionAvailable(groups, dimKey, optionValue) {
  const otherFilters = getActiveFilterList().filter((f) => f.key !== dimKey);
  const testFilters = optionValue
    ? [...otherFilters, { key: dimKey, value: optionValue }]
    : otherFilters;
  return hasMatchingTerm(groups, testFilters);
}

function syncCensorPanelSelects() {
  const panel = document.getElementById("sun-filter-test-censor");
  if (!panel) return;
  for (const wrap of panel.querySelectorAll(".sun-filter-bar__select-wrap[data-filter-key]")) {
    const dimKey = wrap.dataset.filterKey;
    const value = activeFilters[dimKey] || "";
    const option = wrap.querySelector(
      `.sun-filter-bar__option[data-value="${CSS.escape(value)}"]`
    );
    setFilterValue(wrap, value, option?.dataset.optionLabel || option?.textContent || "הכל");
  }
}

/** Clear all tag-page filter selections and restore the full terms grid. */
export function resetSunFilters() {
  closeAllFilterMenus();
  hideFilterDimHint({ immediate: true });
  for (const dim of FILTER_DIMS) {
    activeFilters[dim.key] = "";
  }
  rebuildCensorSet();
  syncCensorPanelSelects();
  updateCensorFilterOptionStates();
  applySunFilterTestOpacity(getSvg());
}

/** Set a single censor dimension (clears the others) and apply to the map. */
export function applyCensorFilterDimension(key, value) {
  for (const dim of FILTER_DIMS) {
    activeFilters[dim.key] = dim.key === key ? value || "" : "";
  }
  rebuildCensorSet();
  updateCensorFilterOptionStates();
  syncCensorPanelSelects();
  applySunFilterTestOpacity(getSvg());
}

function updateCensorFilterOptionStates() {
  const panel = document.getElementById("sun-filter-test-censor");
  if (!panel) return;

  const groups = getGroups();
  const hasActiveFilters = getActiveFilterList().length > 0;

  for (const wrap of panel.querySelectorAll(".sun-filter-bar__select-wrap[data-filter-key]")) {
    const dimKey = wrap.dataset.filterKey;
    for (const option of wrap.querySelectorAll(".sun-filter-bar__option")) {
      const optionValue = option.dataset.value ?? "";
      const disabled =
        hasActiveFilters &&
        optionValue !== "" &&
        !isCensorOptionAvailable(groups, dimKey, optionValue);
      option.classList.toggle("is-disabled", disabled);
      option.setAttribute("aria-disabled", disabled ? "true" : "false");
    }
  }
}

function rebuildCensorSet() {
  const groups = getGroups();
  const filters = getActiveFilterList();
  const censored = new Set();

  if (filters.length) {
    for (const group of groups) {
      for (const term of group.terms) {
        if (!termMatchesAllFilters(term, filters)) {
          censored.add(term.id);
        }
      }
    }
  }

  censoredTermIds = censored;
}

function buildSelect(dim, options) {
  const field = document.createElement("div");
  field.className = "sun-filter-bar__field";

  const label = document.createElement("label");
  label.className = "sun-filter-bar__control";

  const span = document.createElement("span");
  span.className = "sun-filter-bar__label";
  span.dataset.letterShuffleUnderline = "off";
  span.dataset.filterKey = dim.key;
  span.textContent = dim.label;

  const selectWrap = document.createElement("span");
  selectWrap.className = "sun-filter-bar__select-wrap";
  selectWrap.dataset.filterKey = dim.key;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "sun-filter-bar__trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", dim.label);

  const valueEl = document.createElement("span");
  valueEl.className = "sun-filter-bar__value";
  valueEl.dataset.letterShuffleUnderline = "off";
  valueEl.textContent = "הכל";
  trigger.appendChild(valueEl);

  const menu = document.createElement("ul");
  menu.className = "sun-filter-bar__menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", dim.label);
  menu.hidden = true;

  const menuItems = [{ value: "", label: "הכל" }, ...options.map(normalizeOption)];
  for (const opt of menuItems) {
    const option = document.createElement("li");
    option.className = "sun-filter-bar__option";
    option.dataset.letterShuffleUnderline = "off";
    option.setAttribute("role", "option");
    option.dataset.value = opt.value;
    option.dataset.optionLabel = opt.label;
    option.textContent = opt.label;
    option.setAttribute("aria-selected", opt.value === "" ? "true" : "false");
    if (opt.value === "") option.classList.add("is-selected");
    option.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (option.classList.contains("is-disabled")) return;
      applyFilterSelection(
        selectWrap,
        option.dataset.value ?? "",
        option.dataset.optionLabel || "הכל"
      );
    });
    menu.appendChild(option);
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFilterMenu(selectWrap);
  });

  const suffixBtn = document.createElement("button");
  suffixBtn.type = "button";
  suffixBtn.className = "sun-filter-bar__suffix is-chevron";
  suffixBtn.setAttribute("aria-label", `פתח ${dim.label}`);
  suffixBtn.textContent = FILTER_SUFFIX_CHEVRON;
  suffixBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (suffixBtn.classList.contains("is-clear")) {
      applyFilterSelection(selectWrap, "", "הכל");
      return;
    }
    toggleFilterMenu(selectWrap);
  });

  selectWrap.appendChild(trigger);
  selectWrap.appendChild(suffixBtn);
  selectWrap.appendChild(menu);

  label.appendChild(span);
  label.appendChild(selectWrap);
  field.appendChild(label);
  return field;
}

function buildPanel({ id }, groups) {
  const panel = document.createElement("div");
  panel.id = id;
  panel.className = "sun-filter-bar__panel";

  for (const dim of FILTER_DIMS) {
    activeFilters[dim.key] = "";
    panel.appendChild(buildSelect(dim, getFilterOptions(groups, dim.key)));
  }

  return panel;
}

function updatePanelVisibility() {
  if (!wrapperEl) return;
  const overviewVisible = isTagsPageOpen();
  const timelineMode = overviewSubMode === "timeline";
  wrapperEl.classList.toggle("is-visible", overviewVisible);
  wrapperEl.classList.toggle("is-timeline-hidden", timelineMode);
  hideFilterDimHint({ immediate: true });
}

export function setOverviewSubMode(mode) {
  overviewSubMode = mode === "timeline" ? "timeline" : "filter";
  updatePanelVisibility();
}

export function initSunFilterTest({
  getGroups: getGroupsFn,
  getSvg: getSvgFn,
  isInOverview: isInOverviewFn,
  isTagsPageOpen: isTagsPageOpenFn,
}) {
  if (document.getElementById("sun-filter-test-wrap")) return;

  getGroups = getGroupsFn;
  getSvg = getSvgFn;
  isInOverview = isInOverviewFn || (() => false);
  isTagsPageOpen = isTagsPageOpenFn || isInOverview;

  const wrapper = document.createElement("div");
  wrapper.id = "sun-filter-test-wrap";
  wrapper.className = "sun-filter-bar";
  wrapper.setAttribute("dir", "rtl");

  const grid = document.createElement("div");
  grid.className = "sun-filter-bar__grid";

  const groups = getGroups();
  grid.appendChild(buildPanel(PANEL_DEF, groups));
  wrapper.appendChild(grid);
  const hint = document.createElement("p");
  hint.id = "sun-filter-dim-hint";
  hint.className = "sun-filter-dim-hint";
  hint.hidden = true;
  hint.setAttribute("aria-hidden", "true");

  document.body.appendChild(wrapper);
  document.body.appendChild(hint);
  wrapperEl = wrapper;
  filterDimHintEl = hint;
  bindFilterDropdownListeners();
  bindFilterDimHintResize();
  positionFilterDimHint();
  rebuildCensorSet();
  updateCensorFilterOptionStates();
  updatePanelVisibility();
}

export function applySunFilterTestOpacity(svgEl) {
  if (!svgEl) return;

  updatePanelVisibility();

  const wraps = svgEl.querySelectorAll(".sun-term-wrap[data-term-id]");
  const tagsGridActive = isInOverview() && overviewSubMode !== "timeline";

  if (!tagsGridActive) {
    for (const wrap of wraps) {
      wrap.classList.remove("is-filter-censored");
    }
    applyFilterCensorToGrid(new Set());
    return;
  }

  for (const wrap of wraps) {
    const termId = wrap.getAttribute("data-term-id");
    const shouldCensor = censoredTermIds.has(termId);
    const wasCensored = wrap.classList.contains("is-filter-censored");
    wrap.classList.toggle("is-filter-censored", shouldCensor);
    if (shouldCensor && !wasCensored) {
      restartCensorExpand(wrap.querySelector(".sun-term-censor"));
    } else if (!shouldCensor) {
      wrap.querySelector(".sun-term-censor")?.classList.remove("is-censor-scramble");
    }
  }

  applyFilterCensorToGrid(censoredTermIds);
}
