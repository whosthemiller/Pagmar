/** Grid metrics aligned to `.site-nav__grid` — the layout reference. */

import {
  getLargeDesktopTypographyTrim,
  getMapTypographyScale,
  getResponsiveGridLayout,
  getViewportHeightScale,
} from "./viewport-layout.js";

export const GRID = {
  columns: 24,
  gutter: 10,
  margin: 10,
  /** Active horizontal ray anchor aligns to this column (counting from the right). */
  alignColumnFromRight: 4,
};

function getGridContainer() {
  return document.getElementById("sun-viewport");
}

/**
 * @returns {{
 *   viewportWidth: number,
 *   gridLeft: number,
 *   gridWidth: number,
 *   colWidth: number,
 *   gutter: number,
 *   columns: number,
 *   margin: number,
 * }}
 */
export function getGridMetrics() {
  const viewportWidth = document.documentElement.clientWidth;
  const layout = getResponsiveGridLayout(viewportWidth);
  const navGrid = document.querySelector(".site-nav__grid");

  if (navGrid && navGrid.clientWidth > 0) {
    const rect = navGrid.getBoundingClientRect();
    const { columns, gutter } = layout;
    const colWidth = (rect.width - (columns - 1) * gutter) / columns;
    if (Math.abs(rect.width - layout.gridWidth) < 4) {
      return {
        viewportWidth,
        gridLeft: rect.left,
        gridWidth: rect.width,
        colWidth,
        gutter,
        columns,
        margin: rect.left,
      };
    }
  }

  return {
    viewportWidth,
    gridLeft: layout.gridLeft,
    gridWidth: layout.gridWidth,
    colWidth: layout.colWidth,
    gutter: layout.gutter,
    columns: layout.columns,
    margin: layout.margin,
  };
}

function getContainerLeft(containerEl) {
  return containerEl?.getBoundingClientRect().left ?? 0;
}

export function getGridColumnLeft(columnIndexFromLeft, containerEl = getGridContainer()) {
  const metrics = getGridMetrics();
  const absoluteLeft =
    metrics.gridLeft + columnIndexFromLeft * (metrics.colWidth + metrics.gutter);
  return absoluteLeft - getContainerLeft(containerEl);
}

export function getGridColumnRight(columnIndexFromLeft, containerEl = getGridContainer()) {
  return getGridColumnLeft(columnIndexFromLeft, containerEl) + getGridMetrics().colWidth;
}

export function getGridAlignAnchorX(containerEl = getGridContainer()) {
  const columnFromLeft = GRID.columns - GRID.alignColumnFromRight;
  return getGridColumnRight(columnFromLeft, containerEl);
}

export function getGridSpanBounds(
  columnCount,
  alignColumnFromRight,
  containerEl = getGridContainer()
) {
  const endColFromLeft = GRID.columns - alignColumnFromRight;
  const startColFromLeft = endColFromLeft - columnCount + 1;
  return {
    left: getGridColumnLeft(startColFromLeft, containerEl),
    width:
      getGridColumnRight(endColFromLeft, containerEl) -
      getGridColumnLeft(startColFromLeft, containerEl),
  };
}

export function getGridSpanFromLeft(
  columnCount,
  columnFromLeftEnd,
  containerEl = getGridContainer()
) {
  const endColFromLeft = columnFromLeftEnd - 1;
  const startColFromLeft = endColFromLeft - columnCount + 1;
  return {
    left: getGridColumnLeft(startColFromLeft, containerEl),
    width:
      getGridColumnRight(endColFromLeft, containerEl) -
      getGridColumnLeft(startColFromLeft, containerEl),
  };
}

/**
 * Span across CSS grid column numbers (1 = brand side, 24 = about side).
 * `endCssColumn` is the inline-start-most column in the span (e.g. 21 in cols 21–24).
 */
export function getGridCssColumnSpan(
  columnCount,
  endCssColumn,
  containerEl = getGridContainer()
) {
  const endPixelIndex = GRID.columns - endCssColumn;
  const startPixelIndex = endPixelIndex - columnCount + 1;
  return {
    left: getGridColumnLeft(startPixelIndex, containerEl),
    width:
      getGridColumnRight(endPixelIndex, containerEl) -
      getGridColumnLeft(startPixelIndex, containerEl),
  };
}

/**
 * Measure a column span from the live `.sun-grid` overlay (RTL-safe).
 * `startCssColumn` / `endCssColumn` use site grid numbers (24 = physical left).
 */
export function measureGridCssColumnSpan(
  startCssColumn,
  endCssColumn,
  containerEl = getGridContainer()
) {
  const grid = document.getElementById("sun-grid");
  const cols = grid?.querySelectorAll(".sun-grid__col");
  if (!cols?.length || !containerEl) return null;

  const startEl = cols[startCssColumn - 1];
  const endEl = cols[endCssColumn - 1];
  if (!startEl || !endEl) return null;

  const containerRect = containerEl.getBoundingClientRect();
  const startRect = startEl.getBoundingClientRect();
  const endRect = endEl.getBoundingClientRect();
  const left = Math.min(startRect.left, endRect.left) - containerRect.left;
  const right = Math.max(startRect.right, endRect.right) - containerRect.left;

  return { left, width: Math.max(0, right - left) };
}

export function syncGridCssVars(containerEl = getGridContainer()) {
  const metrics = getGridMetrics();
  const containerLeft = containerEl?.getBoundingClientRect().left ?? 0;
  const viewportHeight = window.innerHeight;
  const root = document.documentElement;

  root.style.setProperty("--grid-margin", `${metrics.margin}px`);
  root.style.setProperty("--grid-gutter", `${metrics.gutter}px`);
  root.style.setProperty("--grid-content-width", `${metrics.gridWidth}px`);
  root.style.setProperty("--grid-content-left", `${metrics.gridLeft}px`);
  root.style.setProperty("--grid-column-width", `${metrics.colWidth}px`);
  root.style.setProperty("--grid-content-offset", `${metrics.gridLeft - containerLeft}px`);
  root.style.setProperty("--map-typography-scale", String(getMapTypographyScale(metrics.viewportWidth)));
  root.style.setProperty(
    "--large-desktop-typography-trim",
    String(getLargeDesktopTypographyTrim(metrics.viewportWidth))
  );
  root.style.setProperty(
    "--viewport-height-scale",
    String(getViewportHeightScale(viewportHeight))
  );

  updateTypographyDebugBadge(metrics.viewportWidth);
}

/**
 * TEMP debug badge — confirms the live typography scale per viewport width so we
 * can verify the deployed build (not a cached one) is running. Remove once the
 * large-desktop sizing is dialed in.
 */
function updateTypographyDebugBadge(viewportWidth) {
  if (typeof document === "undefined") return;
  let badge = document.getElementById("type-scale-debug-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "type-scale-debug-badge";
    badge.style.cssText = [
      "position:fixed",
      "bottom:8px",
      "right:8px",
      "z-index:99999",
      "padding:4px 8px",
      "font:12px/1.3 ui-monospace,Menlo,monospace",
      "color:#fff",
      "background:rgba(200,0,0,0.85)",
      "border-radius:4px",
      "pointer-events:none",
      "white-space:pre",
    ].join(";");
    document.body.appendChild(badge);
  }
  const scale = getMapTypographyScale(viewportWidth);
  badge.textContent = `w:${Math.round(viewportWidth)} scale:${scale.toFixed(3)} nav:${(18 * scale).toFixed(1)}px`;
}
