/**
 * Stagger loading the heavy sun-map module so splash + CSS can load first.
 * On GitHub Pages this avoids dozens of parallel requests blocking the main thread.
 */
function startSunMap() {
  import("./sun-map.js").catch((err) => {
    console.error("[boot-map] failed to load sun-map.js:", err);
  });
}

if ("requestIdleCallback" in window) {
  requestIdleCallback(startSunMap, { timeout: 1500 });
} else {
  window.setTimeout(startSunMap, 80);
}
