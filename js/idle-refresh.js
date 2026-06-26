const IDLE_MS = 2 * 60 * 1000;
const HOST = window.location.hostname;
const IS_LOCAL =
  HOST === "localhost" || HOST === "127.0.0.1" || HOST.endsWith(".local");

// Auto-refresh is a local-dev convenience only — skip on the live site.
if (!IS_LOCAL) {
  // no-op
} else {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let idleRefreshTimer = null;

  function refreshPage() {
    // location.reload is blocked in index.html to stop Live Server loops.
    window.location.assign(window.location.href);
  }

  function resetIdleRefreshTimer() {
    if (idleRefreshTimer !== null) clearTimeout(idleRefreshTimer);
    idleRefreshTimer = window.setTimeout(refreshPage, IDLE_MS);
  }

  const ACTIVITY_EVENTS = [
    "mousemove",
    "mousedown",
    "keydown",
    "touchstart",
    "touchmove",
    "scroll",
    "wheel",
    "click",
    "pointerdown",
  ];

  for (const type of ACTIVITY_EVENTS) {
    window.addEventListener(type, resetIdleRefreshTimer, { passive: true, capture: true });
  }

  resetIdleRefreshTimer();
}
