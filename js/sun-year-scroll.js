/** Shared year scroll controller — used by sun-timeline and sun-map overview timeline mode. */

export const DEFAULT_YEAR_SCROLL_CONFIG = {
  /** Fine (trackpad) scroll — continuous fractional years. */
  yearFineScrollSensitivity: 0.0042,
  yearFineScrollMaxStep: 0.28,
  yearScrollMinStep: 0.04,
  yearSnapDebounceMs: 180,
  yearSnapDurationMs: 820,
  yearSnapOvershoot: 1.1,
  /** Fast (mouse notch / flick) scroll — one integer year per impulse. */
  yearNotchDeltaMin: 48,
  yearNotchDeltaMax: 200,
  yearFastScrollCooldownMs: 40,
  yearPeakMarkerGap: 10,
  /** Legacy momentum tuning — kept for applyWheelDelta callers. */
  yearScrollSensitivity: 0.0026,
  yearMomentumGain: 0.0048,
  yearMomentumMax: 220,
  yearMomentumFriction: 0.9,
  yearMomentumIdleMs: 55,
  yearSnapVelocityThreshold: 1.8,
};

const WHEEL_HISTORY_SIZE = 9;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeYearSnap(t, distance, overshoot) {
  if (distance < 0.55) {
    return 1 - (1 - t) ** 3;
  }
  if (t >= 1) return 1;
  const c1 = overshoot;
  const c3 = c1 + 1;
  const back = 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  const wobble = Math.sin(t * Math.PI * 2.2) * Math.max(0, 1 - t * 0.95) ** 1.4 * 0.03;
  return back + wobble;
}

function wheelDragFactor(deltaY) {
  const magnitude = Math.abs(deltaY);
  if (magnitude < 35) return 2.4;
  return 1 + Math.pow(magnitude / 90, 1.55) * 10;
}

export function isWheelNotch(deltaY, cfg = DEFAULT_YEAR_SCROLL_CONFIG) {
  const abs = Math.abs(deltaY);
  return abs >= cfg.yearNotchDeltaMin && abs <= cfg.yearNotchDeltaMax;
}

/** Detect a sharp wheel flick (Future Library WheelPeakDetector). */
function isWheelPeak(history, peakMarker, cfg) {
  if (history[0] == null) return false;

  const abs = history.map((value) => Math.abs(value));
  const peak = abs[4];
  if (peak == null) return false;

  if (Math.abs(peakMarker.tick - peakMarker.lastTick) <= cfg.yearPeakMarkerGap) {
    return false;
  }

  const peaked =
    abs[0] < peak &&
    abs[1] <= peak &&
    abs[2] <= peak &&
    abs[3] <= peak &&
    abs[5] <= peak &&
    abs[6] <= peak &&
    abs[7] <= peak &&
    abs[8] < peak;

  if (peaked) {
    peakMarker.lastTick = peakMarker.tick;
  }

  return peaked;
}

function classifyWheelMode(deltaY, history, peakMarker, cfg) {
  if (isWheelPeak(history, peakMarker, cfg) || isWheelNotch(deltaY, cfg)) {
    return "fast";
  }
  return "fine";
}

/**
 * @param {{ minYear: number, maxYear: number, onChange?: () => void, config?: Partial<typeof DEFAULT_YEAR_SCROLL_CONFIG> }} options
 */
export function createYearScrollController({ minYear, maxYear, onChange, config = {} }) {
  const cfg = { ...DEFAULT_YEAR_SCROLL_CONFIG, ...config };

  let yearScrollOffset = maxYear;
  let yearVelocity = 0;
  let lastWheelAt = 0;
  let lastFastWheelAt = 0;
  let lastFastDirection = 0;
  let yearSnapFrame = null;
  let yearMomentumFrame = null;
  let yearSnapDebounceTimer = null;
  let boundsMin = minYear;
  let boundsMax = maxYear;
  const wheelHistory = Array(WHEEL_HISTORY_SIZE).fill(null);
  const peakMarker = { tick: 0, lastTick: -Infinity };

  function notifyChange() {
    onChange?.();
  }

  function pushWheelHistory(deltaY) {
    wheelHistory.shift();
    wheelHistory.push(deltaY);
    peakMarker.tick += 1;
  }

  function applyYearBounds() {
    const prev = yearScrollOffset;
    yearScrollOffset = clamp(yearScrollOffset, boundsMin, boundsMax);
    if (yearScrollOffset !== prev) {
      yearVelocity = 0;
    }
  }

  function cancelYearSnapAnimation() {
    if (yearSnapFrame) {
      cancelAnimationFrame(yearSnapFrame);
      yearSnapFrame = null;
    }
  }

  function cancelYearMomentum() {
    if (yearMomentumFrame) {
      cancelAnimationFrame(yearMomentumFrame);
      yearMomentumFrame = null;
    }
    yearVelocity = 0;
  }

  function getDisplayedYears() {
    const offset = clamp(yearScrollOffset, boundsMin, boundsMax);
    const fromYear = Math.floor(offset);
    const toYear = Math.min(Math.ceil(offset), boundsMax);
    const blend = offset - fromYear;
    return {
      fromYear,
      toYear: fromYear === toYear ? fromYear : toYear,
      blend: fromYear === toYear ? 0 : blend,
      labelYear: Math.round(offset),
    };
  }

  function getContinuousYear() {
    return clamp(yearScrollOffset, boundsMin, boundsMax);
  }

  function applyWheelDelta(deltaY) {
    const drag = wheelDragFactor(deltaY);
    let deltaYears = deltaY * cfg.yearScrollSensitivity * drag;

    if (Math.abs(deltaYears) < cfg.yearScrollMinStep) {
      deltaYears = Math.sign(deltaY || 1) * cfg.yearScrollMinStep;
    }

    yearScrollOffset -= deltaYears;
    yearVelocity += deltaY * cfg.yearMomentumGain;
    yearVelocity = clamp(yearVelocity, -cfg.yearMomentumMax, cfg.yearMomentumMax);
    applyYearBounds();
  }

  function applyFineWheelDelta(deltaY) {
    let deltaYears = deltaY * cfg.yearFineScrollSensitivity;

    if (Math.abs(deltaYears) > 0 && Math.abs(deltaYears) < cfg.yearScrollMinStep) {
      deltaYears = Math.sign(deltaY || 1) * cfg.yearScrollMinStep;
    }

    deltaYears = clamp(
      deltaYears,
      -cfg.yearFineScrollMaxStep,
      cfg.yearFineScrollMaxStep
    );

    yearScrollOffset -= deltaYears;
    applyYearBounds();
  }

  function scheduleYearSnap() {
    clearTimeout(yearSnapDebounceTimer);
    yearSnapDebounceTimer = setTimeout(() => {
      if (yearMomentumFrame || Math.abs(yearVelocity) > cfg.yearSnapVelocityThreshold) return;
      snapToNearestYear();
    }, cfg.yearSnapDebounceMs);
  }

  function animateYearSnapTo(targetYear) {
    const end = clamp(targetYear, boundsMin, boundsMax);
    const start = yearScrollOffset;
    const distance = Math.abs(end - start);

    if (distance < 0.0005) {
      yearScrollOffset = end;
      notifyChange();
      return;
    }

    cancelYearMomentum();
    const startTime = performance.now();
    const durationMs =
      distance < 0.55
        ? cfg.yearSnapDurationMs * 0.32
        : cfg.yearSnapDurationMs * Math.min(1.15, 0.45 + distance * 0.25);

    function frame(now) {
      const t = Math.min(1, (now - startTime) / durationMs);
      yearScrollOffset = start + (end - start) * easeYearSnap(t, distance, cfg.yearSnapOvershoot);
      notifyChange();

      if (t < 1) {
        yearSnapFrame = requestAnimationFrame(frame);
      } else {
        yearScrollOffset = end;
        yearSnapFrame = null;
        notifyChange();
      }
    }

    yearSnapFrame = requestAnimationFrame(frame);
  }

  function snapToNearestYear() {
    const offset = clamp(yearScrollOffset, boundsMin, boundsMax);
    const nearest = Math.round(offset);
    if (Math.abs(offset - nearest) < 0.1) {
      yearScrollOffset = nearest;
      notifyChange();
      return;
    }
    animateYearSnapTo(nearest);
  }

  function stepAdjacentYear(deltaY) {
    const direction = Math.sign(deltaY) || 1;
    const base = Math.round(yearScrollOffset);
    const target = clamp(base - direction, boundsMin, boundsMax);

    if (target === base && Math.abs(yearScrollOffset - base) < 0.001) {
      return false;
    }

    animateYearSnapTo(target);
    return true;
  }

  function handleFastWheel(deltaY) {
    const now = performance.now();
    const direction = Math.sign(deltaY) || 1;

    if (
      now - lastFastWheelAt < cfg.yearFastScrollCooldownMs &&
      direction === lastFastDirection
    ) {
      return;
    }

    cancelYearSnapAnimation();
    clearTimeout(yearSnapDebounceTimer);

    if (!stepAdjacentYear(deltaY)) return;

    lastFastWheelAt = now;
    lastFastDirection = direction;
    lastWheelAt = now;
  }

  function handleFineWheel(deltaY) {
    cancelYearSnapAnimation();
    clearTimeout(yearSnapDebounceTimer);
    applyFineWheelDelta(deltaY);
    lastWheelAt = performance.now();
    notifyChange();
    scheduleYearSnap();
  }

  function startYearMomentumLoop() {
    if (yearMomentumFrame) return;

    let lastFrame = performance.now();

    function tick(now) {
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      const idleMs = now - lastWheelAt;
      const coasting = idleMs >= cfg.yearMomentumIdleMs;

      if (Math.abs(yearVelocity) > 0.02) {
        yearScrollOffset -= yearVelocity * dt;
        applyYearBounds();

        if (coasting) {
          yearVelocity *= Math.pow(cfg.yearMomentumFriction, dt * 60);
          if (Math.abs(yearVelocity) < cfg.yearSnapVelocityThreshold) {
            yearVelocity = 0;
          }
        } else {
          yearVelocity *= Math.pow(0.975, dt * 60);
        }

        notifyChange();
      }

      const stillMoving =
        Math.abs(yearVelocity) > 0.02 || idleMs < cfg.yearMomentumIdleMs + 30;

      if (stillMoving) {
        yearMomentumFrame = requestAnimationFrame(tick);
      } else {
        yearMomentumFrame = null;
        yearVelocity = 0;
        scheduleYearSnap();
      }
    }

    yearMomentumFrame = requestAnimationFrame(tick);
  }

  function handleWheel(deltaY) {
    pushWheelHistory(deltaY);

    const mode = classifyWheelMode(deltaY, wheelHistory, peakMarker, cfg);
    if (mode === "fast") {
      handleFastWheel(deltaY);
      return;
    }

    handleFineWheel(deltaY);
  }

  function setBounds(min, max) {
    boundsMin = min;
    boundsMax = max;
    applyYearBounds();
  }

  function resetToMaxYear() {
    yearScrollOffset = boundsMax;
    yearVelocity = 0;
    cancelYearSnapAnimation();
    cancelYearMomentum();
    clearTimeout(yearSnapDebounceTimer);
    wheelHistory.fill(null);
    peakMarker.tick = 0;
    peakMarker.lastTick = -Infinity;
    lastFastWheelAt = 0;
    lastFastDirection = 0;
  }

  return {
    applyWheelDelta,
    handleWheel,
    getDisplayedYears,
    getContinuousYear,
    setBounds,
    resetToMaxYear,
    cancelYearSnapAnimation,
    cancelYearMomentum,
  };
}
