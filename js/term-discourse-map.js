/**
 * Discourse-group mapping for terms (who uses the word).
 * Primary source: sheet column "מי משתמש במונח".
 * Regenerate snapshot: node scripts/update-discourse-map.js
 */

import { extractCoalitionTags } from "./term-coalition-tags.js";

const COALITION_TO_DISCOURSE = [
  ["palestinian", "פלסטיני"],
  ["human_rights", "זכויות אדם"],
  ["left_center", "שמאל"],
  ["right_camp", "ימין"],
  ["idf", "ממשלה"],
  ["politicians", "ממשלה"],
  ["international", "בינלאומי"],
  ["media_intl", "בינלאומי"],
  ["academia", "אקדמיה"],
  ["legal", "אקדמיה"],
  ["media_israel", "ממשלה"],
];

function coalitionToDiscourse(tags) {
  for (const [id, group] of COALITION_TO_DISCOURSE) {
    if (tags.includes(id)) return group;
  }
  return null;
}

function detectLabelingCamp(text) {
  const labeling =
    /משתמשים בו|מכנים כך|מכנים אותו|מכנים את|כתיוג|מתארים בו|מתאר בו|נותן לו|המכנים כך/;
  if (!labeling.test(text)) return null;

  const idx = text.search(labeling);
  const before = text.slice(0, idx + 40);
  if (/מחנה הימין|הימין הישראלי|מחנה ימין|מהימין|תומכי נתניהו/i.test(before)) {
    return "ימין";
  }
  if (/מחנה השמאל|השמאל הישראלי|מחנה שמאל|מהשמאל|מבקרי נתניהו/i.test(before)) {
    return "שמאל";
  }
  return null;
}

/** Derive discourse camp from the sheet "מי משתמש במונח" field. */
export function deriveDiscourseGroup(usedByText) {
  if (!usedByText?.trim()) return null;
  const text = usedByText.trim();

  const labelCamp = detectLabelingCamp(text);
  if (labelCamp) return labelCamp;

  const firstClause = text.split(/[,;]/)[0]?.trim();
  if (firstClause) {
    const fromFirst = coalitionToDiscourse(extractCoalitionTags(firstClause));
    if (fromFirst) return fromFirst;
  }

  return coalitionToDiscourse(extractCoalitionTags(text));
}

export const DISCOURSE_GROUPS = [
  "ממשלה",
  "ימין",
  "שמאל",
  "זכויות אדם",
  "פלסטיני",
  "בינלאומי",
  "אקדמיה"
];

/** Solid hex for legend swatches */
export const DISCOURSE_GROUP_LEGEND_COLORS = {
  "ממשלה": "#3498db",
  "זכויות אדם": "#e91e63",
  "ימין": "#e74c3c",
  "שמאל": "#f39c12",
  "פלסטיני": "#1abc9c",
  "בינלאומי": "#2ecc71",
  "אקדמיה": "#9b59b6"
};

/** Soft pastel link strokes — Linked Jazz–style (#9ecae1 family) */
export const DISCOURSE_GROUP_LINK_COLORS = {
  "ממשלה": "#9ecae1",
  "ימין": "#fdae6b",
  "שמאל": "#bcbddc",
  "זכויות אדם": "#fcbba1",
  "פלסטיני": "#74c476",
  "בינלאומי": "#a1d99b",
  "אקדמיה": "#c7b9d9",
};

/** Semi-transparent strokes for map links */
export const DISCOURSE_GROUP_COLORS = {
  "ממשלה": "rgba(52, 152, 219, 0.55)",
  "זכויות אדם": "rgba(233, 30, 99, 0.55)",
  "ימין": "rgba(231, 76, 60, 0.55)",
  "שמאל": "rgba(243, 156, 18, 0.55)",
  "פלסטיני": "rgba(26, 188, 156, 0.55)",
  "בינלאומי": "rgba(46, 204, 113, 0.55)",
  "אקדמיה": "rgba(155, 89, 182, 0.55)"
};

export const TERM_DISCOURSE_GROUP = {
  "0מאלנים": "ימין",
  "אזור חיץ": "ממשלה",
  "אירוע ה־7 באוקטובר": "ממשלה",
  "אנרכיסטים": "ימין",
  "אסירים": "ממשלה",
  "אספקה לאויב": "ממשלה",
  "אפרטהייד": "זכויות אדם",
  "אש לא מידתית": "זכויות אדם",
  "בוגדים": "ימין",
  "ביביסטים": "שמאל",
  "בני ערובה": "שמאל",
  "ג׳יהאד": "פלסטיני",
  "גבול שביתת הנשק": "אקדמיה",
  "גבולות אושוויץ": "ימין",
  "גדר הבטחון": "ממשלה",
  "גדר ההפרדה": "בינלאומי",
  "גזירת הגיוס": "ימין",
  "גירוש": "בינלאומי",
  "דיפ סטייט": "ימין",
  "הגדה המערבית": "שמאל",
  "ההפיכה המשטרית": "זכויות אדם",
  "הוצאה להורג": "אקדמיה",
  "הכיבוש": "זכויות אדם",
  "המגזר הערבי": "ממשלה",
  "המרד הערבי הגדול": "אקדמיה",
  "הנכבה": "פלסטיני",
  "הסברה": "ממשלה",
  "הסכסוך": "אקדמיה",
  "הסלמה": "ממשלה",
  "הפגנות": "שמאל",
  "הפרעות סדר": "פלסטיני",
  "הקו הירוק": "בינלאומי",
  "הרג אזרחים": "זכויות אדם",
  "הרפורמה המשפטית": "ימין",
  "הרתעה": "ממשלה",
  "השטחים הכבושים": "זכויות אדם",
  "התיישבויות": "ממשלה",
  "התנחלויות": "בינלאומי",
  "התנקשות": "אקדמיה",
  "התנתקות": "ממשלה",
  "חומת ההפרדה": "פלסטיני",
  "חוסל": "ממשלה",
  "חוק הגיוס": "ממשלה",
  "חטופים": "ממשלה",
  "חיסול": "פלסטיני",
  "חסם הומניטרי": "זכויות אדם",
  "חרבות ברזל": "ממשלה",
  "טבח": "שמאל",
  "טבח דיר יאסין": "פלסטיני",
  "טבח ה־7 באוקטובר": "ממשלה",
  "טיהור אתני": "זכויות אדם",
  "טרור מתנחלים": "שמאל",
  "טרנספר": "ימין",
  "טרנספר מרצון": "ימין",
  "יהודה ושומרון": "ממשלה",
  "יודונאצים": "זכויות אדם",
  "ימנים": "ימין",
  "כיבוש": "ימין",
  "כיבוש דיר יאסין": "ימין",
  "כיבוש צבאי": "פלסטיני",
  "כליאה ללא משפט": "זכויות אדם",
  "כניסה קרקעית": "ממשלה",
  "מאורעות תרפ״ט": "ממשלה",
  "מאורעות תרצ״ו–תרצ”ט": "אקדמיה",
  "מאחזים": "ימין",
  "מאחזים בלתי חוקיים": "אקדמיה",
  "מבצע": "ממשלה",
  "מבקשי מקלט": "פלסטיני",
  "מהגרים": "ממשלה",
  "מחאות": "שמאל",
  "מחסום": "פלסטיני",
  "מלחמה": "ממשלה",
  "מלחמת ה־7 באוקטובר": "ממשלה",
  "מלחמת העצמאות": "ממשלה",
  "מלחמת השחרור": "ימין",
  "מלחמת התקומה": "ממשלה",
  "מלחמת עזה 2023": "זכויות אדם",
  "ממשל צבאי": "ממשלה",
  "מסתננים": "ממשלה",
  "מעבר": "ממשלה",
  "מעצר מנהלי": "ממשלה",
  "מפונים": "ממשלה",
  "מצור": "זכויות אדם",
  "מתקפת ה־7 באוקטובר": "ממשלה",
  "נהרג": "ממשלה",
  "נוטרל": "ממשלה",
  "נזק אגבי": "ממשלה",
  "נספה": "ממשלה",
  "נערי גבעות": "זכויות אדם",
  "נפל": "ממשלה",
  "נרצח": "שמאל",
  "סגר": "ממשלה",
  "סיוע הומניטרי": "בינלאומי",
  "סיכול ממוקד": "ממשלה",
  "סילוואן": "פלסטיני",
  "עולים": "ממשלה",
  "עיירות פיתוח": "ממשלה",
  "עיירות פריפריה": "ממשלה",
  "עיר דוד": "ממשלה",
  "ענישה": "אקדמיה",
  "עקורים": "אקדמיה",
  "עקירה": "זכויות אדם",
  "ערבים ישראליים": "ממשלה",
  "פגיעה בבלתי מעורבים": "ממשלה",
  "פיגוע": "ממשלה",
  "פינוי": "ממשלה",
  "פליטים": "זכויות אדם",
  "פלישה": "פלסטיני",
  "פלסטין": "פלסטיני",
  "פלסטינים אזרחי ישראל": "פלסטיני",
  "פעולה מבצעית": "ממשלה",
  "פעולת התנגדות": "פלסטיני",
  "פעולת טרור": "אקדמיה",
  "פרעות תרפ״ט": "ימין",
  "פרשת דיר יאסין": "אקדמיה",
  "פשיטה": "ממשלה",
  "פשיעה לאומנית": "ממשלה",
  "קו העימות": "ממשלה",
  "קפלניסטים": "ימין",
  "רצועת הבטחון": "ממשלה",
  "רצח עם": "בינלאומי",
  "שבויים": "ממשלה",
  "שוויון בנטל": "שמאל",
  "שטח כבוש": "פלסטיני",
  "שלטון החוק": "אקדמיה",
  "שלטון הפקידים": "ימין",
  "שמאלנים": "ימין",
  "תגובה": "ממשלה",
  "תמרון קרקעי": "ממשלה",
  "תעמולה": "שמאל",
};

/** Sheet spellings that omit י in הביטחון */
const DISCOURSE_ALIASES = {
  "גדר הבטחון": "ממשלה",
  "רצועת הבטחון": "ממשלה",
};

export function getDiscourseGroup(termName, usedByText) {
  if (!termName) return null;
  const name = termName.trim();

  if (usedByText?.trim()) {
    const derived = deriveDiscourseGroup(usedByText);
    if (derived) return derived;
  }

  const direct = TERM_DISCOURSE_GROUP[name] ?? DISCOURSE_ALIASES[name];
  if (direct) return direct;

  const normalized = name.replace(/הבטחון/g, "הביטחון");
  return normalized !== name ? TERM_DISCOURSE_GROUP[normalized] ?? null : null;
}

export function getDiscourseLinkColor(discourseGroup) {
  return DISCOURSE_GROUP_LINK_COLORS[discourseGroup] || "#c6dbef";
}
