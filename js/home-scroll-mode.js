/**
 * Home-view mouse-wheel scroll modes (debug / A-B-C comparison).
 *
 * POST-CHOICE CLEANUP (after picking one mode):
 * 1. Delete `<div id="home-scroll-debug">` from index.html
 * 2. Delete `.home-scroll-debug` rules from css/sun-map.css
 * 3. Delete this file OR keep only: export const HOME_SCROLL_MODE_DEFAULT = "…";
 * 4. In sun-map.js: remove import + initHomeScrollDebugPanel; inline the chosen mode
 * 5. Remove localStorage key "homeScrollMode" if desired
 */

const STORAGE_KEY = "homeScrollMode";

export const HOME_SCROLL_MODES = {
  discrete: {
    id: "discrete",
    label: "A דיסקרטי",
    mouseHandling: "discrete",
  },
  glide: {
    id: "glide",
    label: "B גלישה",
    mouseHandling: "glide",
    layoutOverrides: {
      scrollSensitivity: 0.009,
      scrollMomentumMaxVelocity: 0.85,
      scrollDragLinear: 18,
      scrollBurstBoost: 1.2,
    },
  },
  roll: {
    id: "roll",
    label: "C גלגול",
    mouseHandling: "roll",
    rollSensitivity: 0.012,
  },
};

/** After choosing: set this to the winning mode id, then remove debug UI. */
export const HOME_SCROLL_MODE_DEFAULT = "discrete";

let activeModeId = HOME_SCROLL_MODE_DEFAULT;

function readStoredModeId() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && HOME_SCROLL_MODES[stored]) return stored;
  } catch {
    /* ignore */
  }
  return HOME_SCROLL_MODE_DEFAULT;
}

activeModeId = readStoredModeId();

export function getActiveHomeScrollMode() {
  return HOME_SCROLL_MODES[activeModeId] ?? HOME_SCROLL_MODES[HOME_SCROLL_MODE_DEFAULT];
}

export function getActiveHomeScrollModeId() {
  return activeModeId;
}

export function setActiveHomeScrollMode(id) {
  if (!HOME_SCROLL_MODES[id]) return false;
  activeModeId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  document.dispatchEvent(
    new CustomEvent("home-scroll-mode-change", { detail: { id } })
  );
  return true;
}

/**
 * @param {{ isHomeView?: () => boolean }} [options]
 */
export function initHomeScrollDebugPanel(options = {}) {
  const root = document.getElementById("home-scroll-debug");
  if (!root) return;

  const isHomeView = options.isHomeView ?? (() => true);
  const buttons = [...root.querySelectorAll("[data-scroll-mode]")];
  const statusEl = root.querySelector(".home-scroll-debug__status");

  const syncActiveButton = () => {
    const active = getActiveHomeScrollModeId();
    for (const button of buttons) {
      const selected = button.dataset.scrollMode === active;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
    if (statusEl) {
      statusEl.textContent = `נבחר: ${getActiveHomeScrollMode().label}`;
    }
  };

  let lastVisible = null;

  const syncVisibility = () => {
    const visible = isHomeView();
    if (visible === lastVisible) return;
    lastVisible = visible;
    root.hidden = !visible;
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const id = button.dataset.scrollMode;
      if (!id) return;
      setActiveHomeScrollMode(id);
      syncActiveButton();
    });
  }

  document.addEventListener("home-scroll-mode-change", syncActiveButton);
  window.addEventListener("resize", syncVisibility);

  syncActiveButton();
  syncVisibility();

  return { syncVisibility, syncActiveButton };
}
