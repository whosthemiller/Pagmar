/**
 * Overview arc geometry — shared by sun-map and sun-timeline.
 */

import { getGridAlignAnchorX } from "./grid-metrics.js";
import { VIEWPORT_DESIGN, clampScalar } from "./viewport-layout.js";

/** Smaller dimension of the reference viewport — the overview ring's design basis. */
const DESIGN_MIN_DIM = Math.min(VIEWPORT_DESIGN.width, VIEWPORT_DESIGN.height);
/**
 * Direct, linear size control for the locked ring (the timeline) on big screens.
 *
 * The radius target is `minDim * overviewRadiusFactor * radiusScale * scale`,
 * where `scale` ramps from 1 at the MacBook reference (so the reference never
 * changes) up to `..._MAX` on a 4K-class screen. Unlike a plain cap, the
 * locked fit *forces* this radius and shrinks only the font (contentScale) if
 * the labels would otherwise overflow — so nudging `..._MAX` moves the circle
 * smoothly and predictably instead of snapping at the label limit.
 */
const LOCKED_RING_RADIUS_SCALE_GAIN = 0.6;
const LOCKED_RING_RADIUS_SCALE_MAX = 1.12;

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
  getOverviewRotationLocked,
  getOverviewFitKey,
  getOverviewTermVisible,
  getTypographyScale,
  getOverviewTypographyScale,
}) {
  const resolveOverviewCxOffset = () =>
    getOverviewCxOffset?.() ?? layout.overviewCxOffset ?? 0;
  const resolveOverviewCyOffset = () =>
    getOverviewCyOffset?.() ?? layout.overviewCyOffset ?? 0;
  const resolveOverviewRadiusScale = () =>
    getOverviewRadiusScale?.() ?? layout.overviewRadiusScale ?? 1;
  // When the overview can't be spun freely (e.g. the timeline, where scrolling
  // changes the year instead of rotating the ring), the fit only needs to
  // clear the single rotation that's actually shown — not every possible one.
  // That lets the circle grow to use the real available space on wide screens.
  const resolveOverviewRotationLocked = () =>
    getOverviewRotationLocked?.() ?? false;
  const resolveOverviewSpinOffset = () => getOverviewSpinOffset?.() ?? 0;
  const resolveOverviewFitKey = () => getOverviewFitKey?.() ?? "";
  const isOverviewTermVisible = (term) => getOverviewTermVisible?.(term) ?? true;
  const resolveTypographyScale = (viewportWidth) =>
    getTypographyScale?.(viewportWidth) ?? 1;
  // Labels around the ring scale with the ring (min-dimension), not the
  // width-based map scale, so the text stays proportional to the circle.
  const resolveOverviewTypographyScale = (viewportWidth, viewportHeight) =>
    getOverviewTypographyScale?.(viewportWidth, viewportHeight) ??
    resolveTypographyScale(viewportWidth);
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

  function estimateTermWidth(name, typographyScale = 1) {
    return Math.max(name.length * layout.charWidth, 56) * typographyScale;
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

  function getOverviewFontSize(
    overview,
    contentScale = 1,
    typographyScale = 1,
    overviewTypographyScale = typographyScale
  ) {
    const base = layout.fontSize * typographyScale;
    const target = layout.overviewFontSize * contentScale * overviewTypographyScale;
    return lerp(base, target, overview);
  }

  function getOverviewTermGap(
    overview,
    contentScale = 1,
    typographyScale = 1,
    overviewTypographyScale = typographyScale
  ) {
    const fontSize = getOverviewFontSize(
      overview,
      contentScale,
      typographyScale,
      overviewTypographyScale
    );
    return layout.termGap * (fontSize / layout.fontSize);
  }

  function getOverviewTypography(
    overview,
    contentScale = 1,
    typographyScale = 1,
    overviewTypographyScale = typographyScale
  ) {
    const fontSize = getOverviewFontSize(
      overview,
      contentScale,
      typographyScale,
      overviewTypographyScale
    );
    const fontScale = fontSize / (layout.fontSize * typographyScale);
    return {
      fontSize,
      fontHeight: fontSize * 1.15,
      termGap: getOverviewTermGap(
        overview,
        contentScale,
        typographyScale,
        overviewTypographyScale
      ),
      termWidth: (name) => estimateTermWidth(name, typographyScale) * fontScale,
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
    const typographyScale = resolveTypographyScale(viewportWidth);
    const overviewTypographyScale = resolveOverviewTypographyScale(
      viewportWidth,
      viewportHeight
    );
    const { fontHeight, termGap, termWidth } = getOverviewTypography(
      overview,
      contentScale,
      typographyScale,
      overviewTypographyScale
    );
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
        const term = group.terms[i];
        if (!isOverviewTermVisible(term)) continue;

        const width = termWidth(term.name);
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
    // A locked ring only ever displays one rotation, so checking the single
    // live spin offset is enough; sampling all rotations would shrink it for
    // orientations that never appear.
    const samples = resolveOverviewRotationLocked()
      ? 1
      : Math.max(1, Math.min(count, 24));
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
    const typographyScale = resolveTypographyScale(viewportWidth);
    const cacheKey = `${viewportWidth}x${viewportHeight}:${resolveOverviewCxOffset()}:${resolveOverviewCyOffset()}:${resolveOverviewRadiusScale()}:${resolveOverviewRotationLocked()}:${resolveOverviewSpinOffset()}:${resolveOverviewFitKey()}:${typographyScale}`;
    if (cacheKey === overviewFitCacheKey) return overviewFitCache;

    const minDim = Math.min(viewportWidth, viewportHeight);
    const radiusScale = resolveOverviewRadiusScale();
    const locked = resolveOverviewRotationLocked();
    // Direct linear size control for a locked ring: ramps from 1 at the
    // reference up to its cap on big screens (reference never changes).
    const lockedRadiusScale = locked
      ? clampScalar(
          1 + (minDim / DESIGN_MIN_DIM - 1) * LOCKED_RING_RADIUS_SCALE_GAIN,
          1,
          LOCKED_RING_RADIUS_SCALE_MAX
        )
      : 1;
    const maxRadius =
      minDim * layout.overviewRadiusFactor * radiusScale * lockedRadiusScale;
    const minRadius = computeOverviewMinRadiusForRaySpacing() * radiusScale;

    const cacheAndReturn = (result) => {
      overviewFitCacheKey = cacheKey;
      overviewFitCache = result;
      return result;
    };

    // Locked ring (timeline): hold the chosen radius and shrink only the font
    // to fit, so the size knob responds linearly instead of snapping.
    if (locked) {
      for (
        let contentScale = 1;
        contentScale >= layout.overviewMinContentScale;
        contentScale = Math.round((contentScale - 0.03) * 100) / 100
      ) {
        if (overviewContentFits(viewportWidth, viewportHeight, maxRadius, contentScale)) {
          return cacheAndReturn({ radius: maxRadius, contentScale });
        }
      }

      // Labels don't fit even at the smallest font — shrink the radius too.
      let lo = minRadius;
      let hi = maxRadius;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (
          overviewContentFits(
            viewportWidth,
            viewportHeight,
            mid,
            layout.overviewMinContentScale
          )
        ) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return cacheAndReturn({
        radius: lo,
        contentScale: layout.overviewMinContentScale,
      });
    }

    for (
      let contentScale = 1;
      contentScale >= layout.overviewMinContentScale;
      contentScale = Math.round((contentScale - 0.03) * 100) / 100
    ) {
      if (overviewContentFits(viewportWidth, viewportHeight, maxRadius, contentScale)) {
        return cacheAndReturn({ radius: maxRadius, contentScale });
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

      return cacheAndReturn({ radius: lo, contentScale });
    }

    return cacheAndReturn(
      { radius: minRadius, contentScale: layout.overviewMinContentScale }
    );
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
      typographyScale: resolveTypographyScale(viewportWidth),
      overviewTypographyScale: resolveOverviewTypographyScale(
        viewportWidth,
        viewportHeight
      ),
    };
  }

  function layoutTermsOnRay(transform, terms, arcLayout, widths) {
    const { anchor, rotation, outwardSign } = transform;
    const overview = arcLayout.overview ?? 0;
    const contentScale = arcLayout.contentScale ?? 1;
    const typographyScale = arcLayout.typographyScale ?? 1;
    const overviewTypographyScale =
      arcLayout.overviewTypographyScale ?? typographyScale;
    const termGap = getOverviewTermGap(
      overview,
      contentScale,
      typographyScale,
      overviewTypographyScale
    );
    const fontSize = getOverviewFontSize(
      overview,
      contentScale,
      typographyScale,
      overviewTypographyScale
    );
    const fontScale = fontSize / (layout.fontSize * typographyScale);
    let dist = 0;
    const placed = [];

    for (let i = 0; i < terms.length; i++) {
      const width =
        widths?.[i] ??
        estimateTermWidth(terms[i].name, typographyScale) * fontScale;
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
