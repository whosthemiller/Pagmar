/**
 * Shared scramble glyph pool for letter/font scramble.
 * Pool: Hebrew letters, digits/shapes, and punctuation — no Latin.
 */

/** Hebrew + digits/shapes + punctuation (no Latin). */
export const SCRAMBLE_CHARSET =
  "אבגדהוזחטיכלמנסעפצקרשתךםןףץ0123456789!@#$%&*?׳״.,;:־-()[]";

export function randomScrambleGlyph() {
  return SCRAMBLE_CHARSET[Math.floor(Math.random() * SCRAMBLE_CHARSET.length)];
}
