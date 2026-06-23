/**
 * Overview arc geometry — shared by sun-map and sun-timeline.
 */

import { getGridAlignAnchorX } from "./grid-metrics.js";

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function pointOnArc(cx, cy, radius, angle) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function getGroupCharCount(group) {
  if (!group?.terms?.length) return 0;
  return group.terms.reduce((sum, term) => sum + (term.name?.length ?? 0), 0);
}

/**
 * Rotate the overview circle (keeping ray order) so character-heavy rows
 * sit on the left/right sides instead of top/bottom.
 * Returns a scroll-equivalent offset in group-index units.
 */
export function computeOverviewSpinOffset(groups) {
  const count = groups?.length ?? 0;
  if (!count) return 0;

  const charCounts = groups.map((group) => getGroupCharCount(group));
  let bestOffset = 0;
  let bestScore = -Infinity;

  for (let offset = 0; offset < count; offset++) {
    let score = 0;
    for (let groupIndex = 0; groupIndex < count; groupIndex++) {
      const slot = ((groupIndex - offset) % count + count) % count;
      const sideScore = Math.abs(Math.sin((2 * Math.PI * slot) / count));
      score += charCounts[groupIndex] * sideScore;
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  return bestOffset;
}

/** Readable rotation while keeping term chain on the outward side of the outline. */
export function rayFrame(radialAngle) {
  let deg = (radialAngle * 180) / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg <= -180) deg += 360;

  let outwardSign = 1;
  if (deg > 90) {
    deg -= 180;
    outwardSign = -1;
  } else if (deg < -90) {
    deg += 180;
    outwardSign = -1;
  }

  return { rotation: deg, outwardSign };
}

export function createOverviewGeometry({
  layout,
  grid,
  getGridContainer,
  getGroups,
  getRayCount,
  getScrollOffset,
  getOverviewProgress,
  getOverviewSpinOffset,
  getOverviewCxOffset,
  getOverviewCyOffset,
  getOverviewRadiusScale,
}) {
  const resolveOverviewCxOffset = () =>
    getOverviewCxOffset?.() ?? layout.overviewCxOffset ?? 0;
  const resolveOverviewCyOffset = () =>
    getOverviewCyOffset?.() ?? layout.overviewCyOffset ?? 0;
  const resolveOverviewRadiusScale = () =>
    getOverviewRadiusScale?.() ?? layout.overviewRadiusScale ?? 1;
  let overviewFitCacheKey = "";
  let overviewFitCache = { radius: 0, contentScale: 1 };

  function resetFitCache() {
    overviewFitCacheKey = "";
    overviewFitCache = { radius: 0, contentScale: 1 };
  }

  function getFitCache() {
    return overviewFitCache;
  }

  function setFitCacheContentScale(contentScale) {
    overviewFitCache = { ...overviewFitCache, contentScale };
  }

  function estimateTermWidth(name) {
    return Math.max(name.length * layout.charWidth, 56);
  }

  function getOverviewSpinUnits(arc, extraSpinOffset = 0) {
    const overview = arc?.overview ?? getOverviewProgress?.() ?? 0;
    const overviewSpin = getOverviewSpinOffset?.() ?? 0;
    const count = getRayCount() || 1;
    const extraSpin = ((layout.overviewSpinExtraDeg ?? 0) / 360) * count * overview;
    return lerp(getScrollOffset(), overviewSpin, overview) + extraSpinOffset + extraSpin;
  }

  function overviewGroupAngle(groupIndex, arc, extraSpinOffset = 0) {
    const count = getRayCount() || 1;
    const spin = (getOverviewSpinUnits(arc, extraSpinOffset) / count) * 2 * Math.PI;
    return -Math.PI / 2 + (groupIndex / count) * 2 * Math.PI - spin;
  }

  function computeOverviewMinRadiusForRaySpacing() {
    const count = getRayCount() || 1;
    return (layout.overviewMinRayArcPx * count) / (2 * Math.PI);
  }

  function getOverviewFontSize(overview, contentScale = 1) {
    const target = layout.overviewFontSize * contentScale;
    return lerp(layout.fontSize, target, overview);
  }

  function getOverviewTermGap(overview, contentScale = 1) {
    const fontSize = getOverviewFontSize(overview, contentScale);
    return layout.termGap * (fontSize / layout.fontSize);
  }

  function getOverviewTypography(overview, contentScale = 1) {
    const fontSize = getOverviewFontSize(overview, contentScale);
    const fontScale = fontSize / layout.fontSize;
    return {
      fontSize,
      fontHeight: fontSize * 1.15,
      termGap: getOverviewTermGap(overview, contentScale),
      termWidth: (name) => estimateTermWidth(name) * fontScale,
    };
  }

  function expandBounds(bounds, x, y) {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  }

  function addOverviewTermCornersToBounds(
    bounds,
    anchor,
    rotationDeg,
    localX,
    width,
    textAnchor,
    fontHeight
  ) {
    const rotRad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);
    const left = textAnchor === "end" ? localX - width : localX;
    const right = textAnchor === "end" ? localX : localX + width;
    const top = -fontHeight / 2;
    const bottom = fontHeight / 2;

    for (const lx of [left, right]) {
      for (const ly of [top, bottom]) {
        expandBounds(
          bounds,
          anchor.x + lx * cos - ly * sin,
          anchor.y + lx * sin + ly * cos
        );
      }
    }
  }

  function computeOverviewContentBounds(
    viewportWidth,
    viewportHeight,
    radius,
    overview = 1,
    contentScale = 1,
    spinOffset = 0
  ) {
    const groups = getGroups();
    const cx = viewportWidth / 2 + resolveOverviewCxOffset();
    const cy = viewportHeight / 2 + resolveOverviewCyOffset();
    const count = getRayCount() || 0;
    const { fontHeight, termGap, termWidth } = getOverviewTypography(overview, contentScale);
    const bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    };

    for (let groupIndex = 0; groupIndex < count; groupIndex++) {
      const group = groups[groupIndex];
      if (!group?.terms.length) continue;

      const angle = overviewGroupAngle(groupIndex, null, spinOffset);
      const anchor = pointOnArc(cx, cy, radius, angle);
      const { rotation, outwardSign } = rayFrame(angle);
      let dist = 0;

      for (let i = 0; i < group.terms.length; i++) {
        const width = termWidth(group.terms[i].name);
        const localX = outwardSign === 1 ? dist : -dist;
        const textAnchor = outwardSign === 1 ? "end" : "start";
        addOverviewTermCornersToBounds(
          bounds,
          anchor,
          rotation,
          localX,
          width,
          textAnchor,
          fontHeight
        );
        dist += width + termGap;
      }
    }

    return bounds;
  }

  function overviewContentFits(
    viewportWidth,
    viewportHeight,
    radius,
    contentScale = 1,
    margin = layout.overviewMargin
  ) {
    const count = getRayCount() || 1;
    const samples = Math.max(1, Math.min(count, 24));
    const overviewSpin = getOverviewSpinOffset?.() ?? 0;
    const extraSpin = ((layout.overviewSpinExtraDeg ?? 0) / 360) * count;

    for (let sample = 0; sample < samples; sample++) {
      const spinOffset = overviewSpin + extraSpin + (sample / samples) * count;
      const bounds = computeOverviewContentBounds(
        viewportWidth,
        viewportHeight,
        radius,
        1,
        contentScale,
        spinOffset
      );
      if (
        bounds.minX < margin ||
        bounds.maxX > viewportWidth - margin ||
        bounds.minY < margin ||
        bounds.maxY > viewportHeight - margin
      ) {
        return false;
      }
    }

    return true;
  }

  function computeOverviewFit(viewportWidth, viewportHeight) {
    const cacheKey = `${viewportWidth}x${viewportHeight}:${resolveOverviewCxOffset()}:${resolveOverviewCyOffset()}:${resolveOverviewRadiusScale()}`;
    if (cacheKey === overviewFitCacheKey) return overviewFitCache;

    const minDim = Math.min(viewportWidth, viewportHeight);
    const radiusScale = resolveOverviewRadiusScale();
    const maxRadius = minDim * layout.overviewRadiusFactor * radiusScale;
    const minRadius = computeOverviewMinRadiusForRaySpacing() * radiusScale;

    for (
      let contentScale = 1;
      contentScale >= layout.overviewMinContentScale;
      contentScale = Math.round((contentScale - 0.03) * 100) / 100
    ) {
      if (overviewContentFits(viewportWidth, viewportHeight, maxRadius, contentScale)) {
        overviewFitCacheKey = cacheKey;
        overviewFitCache = { radius: maxRadius, contentScale };
        return overviewFitCache;
      }

      if (!overviewContentFits(viewportWidth, viewportHeight, minRadius, contentScale)) {
        continue;
      }

      let lo = minRadius;
      let hi = maxRadius;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (overviewContentFits(viewportWidth, viewportHeight, mid, contentScale)) {
          lo = mid;
        } else {
          hi = mid;
        }
      }

      overviewFitCacheKey = cacheKey;
      overviewFitCache = { radius: lo, contentScale };
      return overviewFitCache;
    }

    overviewFitCacheKey = cacheKey;
    overviewFitCache = { radius: minRadius, contentScale: layout.overviewMinContentScale };
    return overviewFitCache;
  }

  function getGeometryEndpoints(viewportWidth, viewportHeight) {
    const cy = viewportHeight / 2;
    const baseInset = viewportHeight / 2;
    const normalRadius = Math.hypot(viewportHeight / 2, baseInset) * layout.arcRadiusScale;
    const normalCx = getGridAlignAnchorX(getGridContainer?.() ?? null) + normalRadius;

    const cosRight = (viewportWidth - normalCx) / normalRadius;
    const alpha =
      cosRight <= -1
        ? Math.PI / 2
        : cosRight >= 1
          ? 0
          : Math.acos(Math.max(-1, Math.min(1, cosRight)));

    return {
      normal: {
        cx: normalCx,
        cy,
        radius: normalRadius,
        angleTop: Math.PI + alpha,
        angleBottom: Math.PI - alpha,
        angleCenter: Math.PI,
      },
      overview: {
        cx: viewportWidth / 2 + resolveOverviewCxOffset(),
        cy: cy + resolveOverviewCyOffset(),
        ...computeOverviewFit(viewportWidth, viewportHeight),
        angleTop: Math.PI + alpha,
        angleBottom: Math.PI - alpha,
        angleCenter: Math.PI,
      },
    };
  }

  /** Arc segment visible along the right edge; lerps to centered full circle in overview. */
  function computeArcGeometry(viewportWidth, viewportHeight, overview = getOverviewProgress()) {
    const { normal, overview: overviewGeo } = getGeometryEndpoints(
      viewportWidth,
      viewportHeight
    );

    return {
      viewportWidth,
      viewportHeight,
      cx: lerp(normal.cx, overviewGeo.cx, overview),
      cy: lerp(normal.cy, overviewGeo.cy, overview),
      radius: lerp(normal.radius, overviewGeo.radius, overview),
      angleTop: normal.angleTop,
      angleBottom: normal.angleBottom,
      angleCenter: normal.angleCenter,
      angleSpan: normal.angleTop - normal.angleBottom,
      overview,
      contentScale: lerp(1, overviewGeo.contentScale ?? 1, overview),
    };
  }

  function layoutTermsOnRay(transform, terms, arcLayout, widths) {
    const { anchor, rotation, outwardSign } = transform;
    const overview = arcLayout.overview ?? 0;
    const contentScale = arcLayout.contentScale ?? 1;
    const termGap = getOverviewTermGap(overview, contentScale);
    let dist = 0;
    const placed = [];

    for (let i = 0; i < terms.length; i++) {
      const width = widths?.[i] ?? estimateTermWidth(terms[i].name);
      placed.push({
        term: terms[i],
        localX: outwardSign === 1 ? dist : -dist,
        textAnchor: outwardSign === 1 ? "end" : "start",
        width,
      });
      dist += width + termGap;
    }

    return { anchor, rotation, outwardSign, placed, termGap };
  }

  function getOverviewHitRadius(arcLayout) {
    const t = arcLayout.overview ?? 0;
    const factor = lerp(
      layout.overviewHitRadiusNormal,
      layout.overviewHitRadiusOverview,
      t
    );
    return arcLayout.radius * factor;
  }

  function getOverviewGroupTransform(groupIndex, arcLayout) {
    const angle = overviewGroupAngle(groupIndex, arcLayout);
    const anchor = pointOnArc(arcLayout.cx, arcLayout.cy, arcLayout.radius, angle);
    const { rotation, outwardSign } = rayFrame(angle);
    return { anchor, rotation, outwardSign, radialAngle: angle };
  }

  return {
    estimateTermWidth,
    overviewGroupAngle,
    getOverviewFontSize,
    getOverviewTermGap,
    getOverviewTypography,
    computeOverviewFit,
    getGeometryEndpoints,
    computeArcGeometry,
    layoutTermsOnRay,
    getOverviewHitRadius,
    getOverviewGroupTransform,
    resetFitCache,
    getFitCache,
    setFitCacheContentScale,
    pointOnArc,
    rayFrame,
    computeOverviewSpinOffset,
    getGroupCharCount,
    lerp,
  };
}
