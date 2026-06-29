/**
 * Timeline experiment sandbox — edit freely; production timeline (index.html) is untouched.
 *
 * Open timeline-lab.html to preview changes here. The page opens straight on the
 * timeline (no splash / loading / home beat) with an inert nav bar shown for looks.
 *
 * Delete this file and remove hooks from sun-map.js to uninstall.
 */

/** @type {object | null} */
let labApi = null;

/** Apply experimental timeline tweaks here. */
function applyTimelineExperiments(api) {
  // Example — uncomment to try a larger timeline ring:
  // api.setTimelineLayout({ timelineRadiusScale: 1.28, timelineCyOffset: 40 });
  void api;
}

/**
 * @param {{
 *   getTimelineLayout: () => Record<string, number>,
 *   setTimelineLayout: (patch: Record<string, number>) => void,
 *   rebuild: () => void,
 *   goToTimeline: () => void,
 * }} api
 */
export function initTimelineLab(api) {
  if (!globalThis.__SUN_TIMELINE_LAB__) return;
  labApi = api;
  applyTimelineExperiments(api);
}

export function getTimelineLabApi() {
  return labApi;
}
