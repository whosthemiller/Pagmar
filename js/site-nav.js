import {
  initLetterShuffle,
  startLetterShuffle,
  stopLetterShuffle,
} from "./letter-shuffle.js";
import { syncGridCssVars } from "./grid-metrics.js";

export const NAV_STORAGE_KEY = "sun-nav-target";
export const TERM_STORAGE_KEY = "sun-open-term";

/** @type {HTMLElement | null} */
let navEl = null;
/** @type {"map"} */
let currentPage = "map";
/** @type {{ navigate: (target: string) => boolean, getActiveNav: () => string | null } | null} */
let mapController = null;

const NAV_LINK_SELECTOR =
  ".site-nav__brand, .site-nav__link:not(.site-nav__link--disabled), .site-nav__about";

/** @type {string | null | undefined} */
let lastActiveNav;

/** @param {Element} link */
function getNavLabel(link) {
  return link.querySelector(".site-nav__label");
}

function bindNavLinkHover(nav) {
  nav.addEventListener("mouseover", (event) => {
    const link =
      event.target instanceof Element ? event.target.closest(NAV_LINK_SELECTOR) : null;
    if (!link || !nav.contains(link)) return;
    const related = event.relatedTarget;
    if (related instanceof Node && link.contains(related)) return;
    const label = getNavLabel(link);
    if (label) startLetterShuffle(label);
  });

  nav.addEventListener("mouseout", (event) => {
    const link =
      event.target instanceof Element ? event.target.closest(NAV_LINK_SELECTOR) : null;
    if (!link || !nav.contains(link)) return;
    const related = event.relatedTarget;
    if (related instanceof Node && link.contains(related)) return;
    const label = getNavLabel(link);
    if (label) stopLetterShuffle(label);
  });
}

function bindAboutHover(nav) {
  const aboutLabel = nav.querySelector(".site-nav__about .site-nav__label");
  if (!(aboutLabel instanceof HTMLElement)) return;

  aboutLabel.addEventListener("mouseenter", () => {
    startLetterShuffle(aboutLabel);
  });
  aboutLabel.addEventListener("mouseleave", () => {
    stopLetterShuffle(aboutLabel);
  });
}

function setSiteNavPending(pending) {
  if (!navEl) return;
  navEl.classList.toggle("is-pending", pending);
  navEl.setAttribute("aria-hidden", pending ? "true" : "false");
}

function buildNav() {
  const existing = document.getElementById("site-nav");
  if (existing) {
    navEl = existing;
    return navEl;
  }

  const nav = document.createElement("nav");
  nav.id = "site-nav";
  nav.className = "site-nav";
  nav.setAttribute("dir", "rtl");
  nav.setAttribute("aria-label", "ניווט ראשי");
  nav.innerHTML = `
    <div class="site-nav__grid">
      <a class="site-nav__brand" href="index.html" data-nav="home"><span class="site-nav__label">טרמינולוגיה פוליטית</span></a>
      <div class="site-nav__modes">
        <a class="site-nav__link site-nav__link--timeline" data-nav="timeline" href="index.html"><span class="site-nav__label">ציר זמן</span><span class="site-nav__sep" aria-hidden="true">, </span></a>
        <a class="site-nav__link site-nav__link--tags" data-nav="tags" href="index.html"><span class="site-nav__label">תגיות</span><span class="site-nav__sep" aria-hidden="true">, </span></a>
        <a class="site-nav__link site-nav__link--index" data-nav="index" href="index.html"><span class="site-nav__label">אינדקס</span></a>
      </div>
      <a class="site-nav__link site-nav__about" data-nav="about" href="index.html"><span class="site-nav__label" data-letter-shuffle-underline="off">אודות</span></a>
    </div>
  `;

  document.body.prepend(nav);
  navEl = nav;
  syncGridCssVars(document.getElementById("sun-viewport"));

  initLetterShuffle();
  bindNavLinkHover(nav);
  bindAboutHover(nav);
  nav.addEventListener("click", handleNavClick);
  return nav;
}

/**
 * @param {string | null} activeNav
 */
export function setSiteNavActive(activeNav) {
  if (!navEl) return;
  const navChanged = activeNav !== lastActiveNav;
  lastActiveNav = activeNav;

  for (const el of navEl.querySelectorAll("[data-nav]")) {
    const navKey = el.dataset.nav ?? "";
    const isActive = activeNav !== null && navKey === activeNav;
    el.classList.toggle("is-active", isActive);
    if (el instanceof HTMLAnchorElement) {
      if (isActive) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    }

    if (!navChanged) continue;

    const label = getNavLabel(el);
    if (label instanceof HTMLElement) {
      // Page-transition scramble leaves hover underlines on every nav label.
      stopLetterShuffle(label);
    }
  }
}

function handleNavClick(event) {
  const link = event.target instanceof Element ? event.target.closest("[data-nav]") : null;
  if (!link || link.classList.contains("site-nav__link--disabled")) return;

  const target = link.dataset.nav;
  if (!target) return;

  if (currentPage === "map" && mapController) {
    const handled = mapController.navigate(target);
    if (handled) event.preventDefault();
    return;
  }

  event.preventDefault();
  const storageTarget =
    target === "tags" ? "filter" : target === "home" ? "home" : target;
  sessionStorage.setItem(NAV_STORAGE_KEY, storageTarget);
  window.location.href = "index.html";
}

/**
 * @param {{
 *   controller?: { navigate: (target: string) => boolean, getActiveNav: () => string | null } | null,
 *   pending?: boolean,
 * }} [options]
 */
export function initSiteNav(options = {}) {
  const { controller = null, pending = false } = options;
  currentPage = "map";
  mapController = controller;
  buildNav();
  setSiteNavPending(pending);

  if (controller) {
    setSiteNavActive(controller.getActiveNav());
  }
}

export function revealSiteNav() {
  setSiteNavPending(false);
  syncGridCssVars(document.getElementById("sun-viewport"));
}

/** Remove hover/enter scramble state; active-page underline uses text-decoration in CSS. */
export function clearSiteNavShuffleUnderlines() {
  if (!navEl) return;
  for (const label of navEl.querySelectorAll(".site-nav__label")) {
    stopLetterShuffle(label);
  }
}

/**
 * @param {() => string | null} getActiveNav
 */
export function syncSiteNavFromMap(getActiveNav) {
  if (currentPage !== "map") return;
  setSiteNavActive(getActiveNav());
}

/** @param {string} termId */
export function stashOpenTerm(termId) {
  sessionStorage.setItem(TERM_STORAGE_KEY, termId);
}
