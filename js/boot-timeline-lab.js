/**
 * Boots the sun-map directly into timeline mode for timeline-lab.html.
 * The lab flag (set inline in the HTML head) makes sun-map.js snap straight
 * into the timeline with no splash, loading UI, or home-page beat.
 */
globalThis.__SUN_TIMELINE_LAB__ = true;

function startSunMap() {
  void import("./sun-map.js");
}

if ("requestIdleCallback" in window) {
  requestIdleCallback(startSunMap, { timeout: 1500 });
} else {
  window.setTimeout(startSunMap, 80);
}
