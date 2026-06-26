/**
 * Balanced column packing for the terms index and the overview tags grid.
 *
 * Every column is filled toward the same height so the columns read as an even
 * block, with one deliberate exception: all the leftover slack is pushed onto
 * the *last* column, which is the only column allowed to come out shorter. No
 * column is ever taller than the one before it, so the final column can only be
 * equal to or narrower (shorter) than the rest — never the tallest.
 *
 * Balancing is by row height (terms + per-letter legends + gaps), which is what
 * makes the columns visually even; the term *count* per column can differ a
 * little when some columns carry more legend rows than others.
 *
 * @param {{
 *   count: number,
 *   blockCount: number,
 *   rowsOf: (start: number, end: number, skipFirstLegend: boolean) => number,
 *   sameBoundary?: (prevEndIndex: number, startIndex: number) => boolean,
 * }} options
 * @returns {{ start: number, end: number }[]} Inclusive column ranges.
 */
export function packColumnsBalanced({ count, blockCount, rowsOf, sameBoundary }) {
  if (count <= 0) return [];

  const skipFor = (cols, start) =>
    cols.length > 0 && typeof sameBoundary === "function"
      ? sameBoundary(cols[cols.length - 1].end, start)
      : false;

  /** Largest end index whose column (start..end) stays within `limit` rows. */
  const maxEndWithin = (start, limit, skipFirstLegend) => {
    if (rowsOf(start, start, skipFirstLegend) > limit) return start - 1;
    let lo = start;
    let hi = count - 1;
    let best = start;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rowsOf(start, mid, skipFirstLegend) <= limit) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  };

  /**
   * Columns needed to pack atoms[start..] with no column above `limit` rows.
   * Legend-skip savings are ignored here (conservative): a layout that fits
   * under this estimate still fits once skipping actually shortens a column.
   */
  const columnsNeeded = (start, limit) => {
    let cols = 0;
    let i = start;
    while (i < count) {
      const end = maxEndWithin(i, limit, false);
      if (end < i) return Infinity;
      cols += 1;
      if (cols > blockCount) return Infinity;
      i = end + 1;
    }
    return cols;
  };

  // `bestH` is the smallest column height at which everything still fits in
  // `blockCount` columns — i.e. the shortest "equal" height the leading columns
  // can share. The all-in-one-column upper bound is always feasible, so this
  // never fails; on a short screen every column simply ends up taller (and
  // equally so).
  const totalRows = rowsOf(0, count - 1, false);
  let lo = 1;
  let hi = totalRows;
  let bestH = totalRows;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (columnsNeeded(0, mid) <= blockCount) {
      bestH = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  // Fill each leading column right up to `bestH` so they all come out the same
  // height, and let the final column hold only the remainder. Because `bestH`
  // is feasible for `blockCount` columns, that remainder is always <= `bestH`,
  // so the last column is the single column allowed to be shorter — never the
  // tallest.
  const cols = [];
  let start = 0;
  for (let c = 0; c < blockCount && start < count; c++) {
    const colsRemaining = blockCount - c;
    if (colsRemaining === 1) {
      cols.push({ start, end: count - 1 });
      start = count;
      break;
    }

    const skip = skipFor(cols, start);
    let end = maxEndWithin(start, bestH, skip);
    if (end < start) end = start;

    cols.push({ start, end });
    start = end + 1;
  }

  if (start < count && cols.length) {
    cols[cols.length - 1].end = count - 1;
  }

  return cols;
}
