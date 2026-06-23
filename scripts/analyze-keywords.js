#!/usr/bin/env node
/**
 * ניתוח מילות מפתח בערכי המונחים — סורק sheet-data.json ומייצא keyword-frequency.csv
 * הרצה: node scripts/analyze-keywords.js
 */

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "sheet-data.json");
const OUT_PATH = path.join(__dirname, "..", "data", "keyword-frequency.csv");
const KNOWN_TERMS_PATH = path.join(__dirname, "..", "data", "known-terms.csv");

const TERM_TEXT_FIELDS = [
  "שם מונח",
  "הגדרה קצרה של המונח",
  "מה המונח מדגיש",
  "מה המונח מטשטש",
  "מי משתמש במונח",
  "באילו הקשרים נפוץ",
  "תקופת שימוש בולטת",
];

const MIN_NGRAM_COUNT = 2;
const MIN_WORD_COUNT = 3;
const MIN_OUTPUT_COUNT = 5;
const MAX_RELATED = 8;

const PHRASE_EXTRA = [
  "הקו הירוק",
  "קו הירוק",
  "החוק הבינלאומי",
  "משפט בינלאומי",
  "משפט הבין-לאומי",
  "משפט הבינלאומי",
  "משפט ההומניטרי",
  "המשפט ההומניטרי",
  "זכויות אדם",
  "שטחים כבושים",
  "יהודה ושומרון",
  "רצועת עזה",
  "עוטף עזה",
  "הרפורמה המשפטית",
  "שלטון החוק",
  "גבולות 67",
  "גבול שביתת הנשק",
  "חרבות ברזל",
  "חרבות רזל",
  "מלחמת חרבות ברזל",
  "מלחמת חרבות רזל",
  "סיוע הומניטרי",
  "סיוע ניטרי",
  "האצ״ל",
  "לח״י",
];

const PHRASE_EXTRA_ALIASES = {
  "לח״י": ["והלח״י"],
};

const TERM_VARIANT_ALIASES = {
  "סיוע הומניטרי": ["סיוע ניטרי"],
  "חרבות ברזל": ["חרבות רזל", "מלחמת חרבות רזל"],
  "הפגנות": ["פגנות"],
  "הרתעה": ["רתעה"],
  "הסברה": ["סברה"],
  "הרג": ["רג"],
  "הגנה": ["גנה"],
  "הגירה": ["גירה"],
  "ביביסטים": ["יביסטים"],
  "ביטחון": ["יטחון"],
  "ביקורת": ["יקורת"],
  "תגובה": ["כתגובה"],
  "משטר": ["כמשטר"],
  "שטח": ["לשטח", "השטח"],
  "מלחמה": ["מלחמת"],
  "משטרת": ["שטרת"],
  "הקו הירוק": ["קו ירוק", "קו הירוק"],
  "גדה המערבית": ["גדה מערבית", "גדה"],
  "מחאות": ["מחאה"],
  "7 באוקטובר": ["7.10", "7/10", "אוקטובר 2023", "באוקטובר 2023"],
  "מלחמת העצמאות": ["מלחמה העצמאות"],
  "שמאלנים": ["0מאלנים"],
};

const PROTECTED_LEMMAS = new Set([
  "ביטחון", "ביקורת", "ביביסטים", "בחירה", "בחינה", "בני", "בנימין",
  "הומניטרי", "הומניטריים", "הומניטרית", "הגנה", "הגירה", "הרג", "הרתעה",
  "הסברה", "הפגנות", "מדיניות", "משנות", "שנות", "כינוי", "שינוי", "מינוי",
  "ביטחוני", "ביטחוניים", "ביטחונית", "ביטחוניות",
  "האצ״ל", "לח״י",
  "בינלאומי", "בינלאומיים", "בינלאומית",
  "בין-לאומי", "בין-לאומיים", "בין-לאומית",
  "לבנון", "למעשה", "משטרה", "משטרת",
]);

const LEMMA_MAP = new Map([
  ["יטחון", "ביטחון"], ["יקורת", "ביקורת"], ["יביסטים", "ביביסטים"],
  ["פגנות", "הפגנות"], ["גנה", "הגנה"], ["גירה", "הגירה"],
  ["רתעה", "הרתעה"], ["רג", "הרג"], ["סברה", "הסברה"],
  ["כתגובה", "תגובה"], ["כמשטר", "משטר"], ["לשטח", "שטח"],
  ["השטח", "שטח"], ["מלחמת", "מלחמה"],
  ["שטרת", "משטרת"], ["ניטרי", "הומניטרי"], ["ניטריים", "הומניטריים"],
  ["ניטרית", "הומניטרית"], ["חנה", "בחינה"], ["חירה", "בחירה"],
  ["ני", "בני"], ["דל", "הבדל"], ["ינוי", "כינוי"],
  ["קום", "מקום"], ["שטחה", "שטח"],
  ["לאויב", "אויב"], ["האחריות", "אחריות"], ["המחאה", "מחאה"],
  ["הנשק", "נשק"], ["באחריות", "אחריות"],
]);

const PHRASE_LEMMA_MAP = new Map([
  ["חרבות רזל", "חרבות ברזל"],
  ["סיוע ניטרי", "סיוע הומניטרי"],
  ["מלחמת חרבות רזל", "מלחמת חרבות ברזל"],
  ["משפט ניטרי", "משפט הומניטרי"],
  ["דין ניטרי", "דין הומניטרי"],
  ["קו ירוק", "קו הירוק"],
  ["הקו הירוק", "קו הירוק"],
  ["גדה מערבית", "גדה המערבית"],
  ["הגדה המערבית", "גדה המערבית"],
  ["מדינת ישראל", "ישראל"],
  ["אוקטובר 2023", "7 באוקטובר"],
  ["באוקטובר 2023", "7 באוקטובר"],
  ["מלחמה העצמאות", "מלחמת העצמאות"],
  ["שמאל רדיקלי", "שמאל"],
  ["והלח״י", "לח״י"],
]);

/** Multi-word phrases counted and linked only via their prefix word. */
const PHRASE_PREFIX_ABSORPTION = new Map([
  ["שמאל רדיקלי", "שמאל"],
]);

/** Combined phrases that should not appear as rows — count each part separately. */
const PHRASE_CONJUNCTION_SPLIT = new Set([
  "האצ״ל והלח״י",
]);

/** Generic time phrases — not research keywords. */
const PHRASE_GENERIC_EXCLUDED = new Set([
  "בעשור האחרון",
  "בעשורים האחרונים",
  "העשור האחרון",
]);

const PLURAL_TO_SINGULAR = new Map([
  ["מלחמות", "מלחמה"], ["שטחים", "שטח"], ["ארגונים", "ארגון"],
  ["אירועים", "אירוע"], ["גורמים", "גורם"], ["משטרים", "משטר"],
  ["חלטות", "החלטה"], ["עמדות", "עמדה"], ["נקודות", "נקודה"],
  ["פגנות", "הפגנות"], ["החלטות", "החלטה"], ["שנות", "שנה"],
  ["אזרחים", "אזרח"], ["פלסטינים", "פלסטיני"], ["יהודים", "יהודי"],
  ["יישובים", "יישוב"], ["מתנחלים", "מתנחל"], ["פליטים", "פליט"],
  ["חיילים", "חייל"], ["אנשים", "אדם"], ["ילדים", "ילד"],
  ["נשים", "אישה"], ["גבולות", "גבול"], ["זכויות", "זכות"],
  ["פעולות", "פעולה"], ["החלטות", "החלטה"], ["דוחות", "דוח"],
  ["דיונים", "דיון"], ["מסמכים", "מסמך"], ["חוקים", "חוק"],
  ["פשעים", "פשע"], ["פשעי", "פשע"], ["אמנות", "אמנה"],
  ["סכמים", "סכם"], ["מונחים", "מונח"], ["מילים", "מילה"],
  ["עמדות", "עמדה"], ["עובדות", "עובדה"], ["אפשרויות", "אפשרות"],
  ["נקודות", "נקודה"], ["מצבים", "מצב"], ["גורמים", "גורם"],
  ["משתמשים", "משתמש"], ["פועלים", "פועל"],
  ["מחאות", "מחאה"], ["פגיעות", "פגיעה"],
  ["אוכלוסיות", "אוכלוסייה"], ["אוכלוסין", "אוכלוסייה"],
  ["פיגועים", "פיגוע"], ["פיכוע", "פיגוע"],
  ["לוחמים", "לוחם"], ["ויכוחים", "ויכוח"],
  ["מוסדות", "מוסד"], ["אויבים", "אויב"],
  ["שמאלנים", "שמאל"], ["שמאלני", "שמאל"],
]);

function buildCanonicalMergeMap(groups) {
  const map = new Map();
  for (const [canonical, variants] of groups) {
    const canonNorm = normalizeForSearch(canonical);
    map.set(canonNorm, canonNorm);
    for (const variant of variants) {
      map.set(normalizeForSearch(variant), canonNorm);
    }
  }
  return map;
}

const CANONICAL_MERGE_MAP = buildCanonicalMergeMap([
  ["קו הירוק", ["הקו הירוק", "קו ירוק"]],
  ["גדה המערבית", ["גדה", "גדה מערבית", "הגדה המערבית"]],
  ["מחאות", ["מחאה", "מחאות", "המחאה"]],
  ["אחריות", ["האחריות", "באחריות"]],
  ["נשק", ["הנשק"]],
  ["פיגוע", ["פיגועים", "פיכוע"]],
  ["פליט", ["פליטים"]],
  ["אויב", ["לאויב", "אויבים"]],
  ["לוחם", ["לוחמים"]],
  ["שמאלנים", ["שמאל", "שמאלנים", "שמאלני", "0מאלנים"]],
  ["ארץ", ["בארץ"]],
  ["ויכוח", ["ויכוחים"]],
  ["מוסד", ["מוסדות"]],
  ["7 באוקטובר", ["אוקטובר", "באוקטובר", "7 באוקטובר", "7 אוקטובר", "אוקטובר 2023", "באוקטובר 2023"]],
]);

const ABSORBED_KNOWN_ORIGINALS = new Set([
  "0מאלנים",
]);

const KNOWN_LEMMAS = new Set([
  ...PROTECTED_LEMMAS,
  ...LEMMA_MAP.values(),
  ...PLURAL_TO_SINGULAR.values(),
  ...Object.keys(TERM_VARIANT_ALIASES),
  "ישראל", "כיבוש", "מדינה", "עזה", "חוק", "מלחמה", "סכסוך", "תקשורת",
  "אוכלוסייה", "פגיעה", "צה״ל", "טבח", "אלימות", "טרור", "פלסטינים",
  "זכויות", "אדם", "גבול", "ימין", "ארגון", "אירוע", "משטר", "שטח",
  "הפגנות", "ביטחון", "ביקורת", "הגנה", "הגירה", "הרג", "הרתעה",
  "הסברה", "תגובה", "ביביסטים", "חרבות", "ברזל", "סיוע", "הומניטרי",
  "אפרטהייד", "כיבוש", "ירושלים", "עזה", "חמאס", "נתניהו", "גדה",
  "צפון", "דרום", "לבנון", "סיוע", "ממשלה", "כנסת", "עולם",
  "מחאה", "אחריות", "נשק", "פיגוע", "פליט", "אויב", "לוחם", "שמאל",
  "ארץ", "ויכוח", "מוסד", "אוכלוסייה", "האצ״ל", "לח״י",
]);

const FUNCTIONAL_PREFIXES = ["וב", "וה", "ול", "וכ", "ומ", "וש", "ו", "ב", "ל", "מ", "כ", "ש", "ה"];

const VERB_WORDS = new Set([
  "להיות", "להדגיש", "למסגר", "להורג", "נעשה", "נמצא", "נתפס", "משמש",
  "מאפשר", "נתפסים", "נתפסת", "משמשים", "משמשת", "לשמש", "לאפשר",
  "ונמצא", "שנמצא", "ונתפס", "שנתפס", "ומשמש", "ממשיך", "עשויה",
  "מבקשים", "רוצים", "דגיש", "מדגישים", "מציגים", "מופיעים",
  "משתמשים", "משתמש", "נעשה", "נמצאים", "נמצאת", "נמצא שימוש",
]);

const META_NGRAM_STARTERS = new Set(["מדגיש", "מטשטש", "מציג", "מופיע", "לטשטש"]);

const EXCLUDE_WORDS = new Set([
  "מדגיש", "מדגישים", "מדגישה", "מטשטש", "לטשטש",
  "בשיח", "השיח", "המונח", "לעיתים", "מאז", "ארגוני",
  "דיון", "דיונים", "השימוש", "שימוש", "סביב",
  "הקו", "קו", "לצד", "צד", "בעיקר", "צבאי", "הצבאי",
  "המשפט", "משנו", "במיוחד", "בשטח", "האירוע",
  "פוליטי", "פוליטיים", "דוחות", "דינוי", "ידי",
  "בהקשר", "בלי", "אותו", "אותה", "המרחב", "מדובר",
  "במקום", "תחת", "מערכת", "הירוק", "ירוק",
  "פעולות", "פעולה", "אינו", "במחלוקת", "רחב",
  "באופן", "רשמיים", "מופיע", "מציג", "בשפה",
  "שביתת", "בכוח", "ואילך", "ובעולם", "בלתי",
  "האזור", "השאלה", "השליטה", "רצועת", "למדיניות", "הדין",
  "מונח", "מונחים", "שיח",
  "משנות", "שנות", "כינוי", "שינוי", "מינוי", "לתיאור", "תיאור", "עיתים",
  "פועל", "פועלים", "אחרים", "דל", "הבדל", "משמש", "משמשים", "משמשת",
  "משפט", "קבוצה", "חנה", "הבחנה", "כמעט", "מילה", "לאורך", "אורך",
  "שונים", "אותם", "אפשרות", "ככינוי", "כקטגוריה", "קטגוריה", "שאינם",
  "אינם", "למקום", "מקום", "מאפשר", "נתפס", "נתפסים", "נתפסת", "עצם",
  "להיות", "כסיפור", "סיפור", "קשר", "הקשר", "מאה", "מצב", "נקודות",
  "נקודה", "אלה", "גורמים", "גורם", "חדש", "להדגיש", "למסגר", "מהלך",
  "חירה", "בחירה", "להורג", "ני", "בני", "נעשה", "עמדות", "עמדה",
  "שנוי", "אזור", "אמנת", "גלי", "גדול", "דיר", "חלטות", "החלטות",
  "יעד", "כאתר", "אתר", "כמעשה", "מעשה", "משום", "נמצא", "נמצאים",
  "משתמשים", "משתמש", "עובדה", "אפשר", "כולל", "כפי", "כוח", "ירי",
  "מפני", "כמשטר", "כוךך", "לשמש", "לאפשר", "ממשיך", "עשויה",
  "ביטוי", "גופים", "פיתוח", "כוחות", "ממוקדים", "מדינת", "השנייה",
  "מדינות", "אחרות", "אינה", "הממד", "שמבקשים", "בא", "יסוד", "כלל",
  "מאורעות", "עצמאות", "העצמאות",
  "בעשור", "בעשורים", "האחרון", "האחרונים",
]);

const DESCRIPTIVE_ADJECTIVES = new Set([
  "ישראלי", "ישראלית", "ישראליים", "ישראליות",
  "פלסטיני", "פלסטינית", "פלסטיניים", "פלסטיניות",
  "צבאי", "צבאית", "צבאיים", "צבאיות",
  "פוליטי", "פוליטית", "פוליטיים", "פוליטיות",
  "יהודי", "יהודית", "יהודיים", "יהודיות",
  "ערבי", "ערבית", "ערביים", "ערביות",
  "משפטי", "משפטית", "משפטיים", "משפטיות",
  "ציבורי", "ציבורית", "ציבוריים", "ציבוריות",
  "ינלאומי", "ינלאומית", "ינלאומיים", "ינלאומיות",
  "בינלאומי", "בינלאומית", "בינלאומיים", "בינלאומיות",
  "ין-לאומי", "ין-לאומית", "ין-לאומיים", "ין-לאומיות",
  "ביטחוני", "ביטחונית", "ביטחוניים", "ביטחוניות",
  "יטחוני", "יטחונית", "יטחוניים", "יטחוניות",
  "אזרחי", "אזרחית", "אזרחיים",
  "לאומי", "לאומית", "לאומיים", "לאומיות",
  "מקומי", "מקומית", "מקומיים",
  "רשמי", "רשמית", "רשמיות",
  "מוסרי", "מוסרית",
  "כללי", "כללית",
  "מדיני", "מדינית",
  "מרכזי", "מרכזית",
  "גופי", "גופיים",
  "חוקי", "חוקית", "חוקיות",
  "יקורתי", "יקורתית",
  "יסטורי", "יסטורית", "יסטוריים",
  "לגיטימי", "לגיטימית", "לגיטימיות",
  "חברתי", "חברתית",
  "תקשורתי", "תקשורתית",
  "ציוני", "ציונית",
  "דמוקרטי", "דמוקרטית",
  "ליברלי", "ליברלית",
  "משטרתי", "משטרתית",
  "פלילי", "פלילית",
  "מערבי", "מערבית",
  "מזרחי", "מזרחית",
  "ספרי",
  "טכני", "טכנית",
  "תיאורי",
  "זמני", "זמנית",
  "פנימי", "פנימיים", "פנימית",
  "עצמי", "עצמית",
  "דתי", "דתית",
  "אנשי",
  "פעילי",
  "אידיאולוגי", "אידיאולוגית",
  "הומניטרי", "הומניטרית",
  "סוציאלי", "סוציאלית",
  "קיצוני", "קיצונית",
  "קשה", "קשות", "קשים",
  "קרקעי", "קרקעית", "קרקעיים",
  "שמאלי", "שמאלית",
  "ימני", "ימנית",
  "כלכלי", "כלכלית",
  "עיוני", "עיונית",
  "פיזי", "פיזית",
  "אישי", "אישית",
  "יומיומי", "יומיומית",
  "חווייתי",
  "משרדי",
  "אזורי",
  "יישובי",
  "סכמי",
  "מסמכי",
  "אירועי",
  "יחסי",
  "פשעי",
  "עברי", "עברית",
]);

const STOPWORDS = new Set([
  "את", "של", "על", "עם", "או", "גם", "כי", "אם", "לא", "זה", "זאת", "זו", "הוא", "היא", "הם", "הן",
  "אני", "אתה", "אנחנו", "אתם", "יש", "אין", "כל", "כמו", "עד", "בין", "אחרי", "לפני", "אצל", "אל",
  "מה", "מי", "איך", "כך", "כזה", "כאשר", "אך", "רק", "כבר", "עוד", "אבל", "אלא", "כדי", "שלא",
  "היה", "היו", "תהיה", "יהיה", "הייתה", "הינו", "הנה", "עצמו", "עצמה", "עצמם", "יותר", "מאוד",
  "פחות", "כאן", "שם", "כן", "לו", "לה", "להם", "לנו", "בו", "בה", "בהם", "בהן", "ממנו", "ממנה",
  "מהם", "מהן", "שלו", "שלה", "שלהם", "שלהן", "אשר", "ולכן", "לכן", "כגון", "למשל", "בנוסף", "מלבד",
  "בכל", "מכל", "מתחת", "מעל", "אחר", "אחרת", "דבר", "דברים", "זמן", "שנה", "שנים", "יום", "ימים",
  "פעם", "פעמים", "חלק", "רוב", "קצת", "מסוים", "מסוימת", "מסוימים", "וכו", "וכו׳", "וכו'", "ללא",
  "עמה", "איתו", "איתה", "איתם", "נגד", "למרות", "בגלל", "בשל", "דרך", "תוך", "לאחר", "מול", "לעומת",
  "ביחס", "לגבי", "לפי", "במסגרת", "בעקבות", "בסוף", "בתחילת", "במהלך", "בעת", "כאמור", "כלומר",
  "יכול", "יכולה", "יכולים", "צריך", "צריכה", "צריכים", "זהו", "זוהי",
  "אומר", "אומרת", "אמר", "אמרו", "איזה", "איזו", "אילו", "כמה", "מדי", "מאד", "טוב", "טובה",
  "טובים", "רב", "רבה", "רבים", "רבות", "אחד", "אחת", "שני", "שתי", "שלוש", "שלושה", "ארבע", "חמש",
  "שש", "שבע", "שמונה", "תשע", "עשר", "מאות", "אלפים", "מיליונים", "וכן", "וגם", "ולא", "ואם", "וש",
  "וב", "וכ", "ול", "ומ", "וה", "ו", "מ", "ב", "ל", "כ", "ש",
]);

const PREFIXES = ["וש", "וב", "וכ", "ול", "ומ", "וה", "ו", "ה", "ב", "כ", "ל", "מ", "ש"];
const DISPLAY_PREFIXES = ["וש", "וב", "וכ", "ול", "ומ", "וה", "ו", "ה", "ב"];

// --- utilities ---

function normalizeText(text) {
  return (text || "")
    .replace(/[\u2018\u2019\u05F3\u0027]/g, "׳")
    .replace(/[\u201C\u201D\u05F4\u0022]/g, "״")
    .replace(/\u05BE/g, "-")
    .replace(/\u200F|\u200E|\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForSearch(text) {
  return normalizeText(text).toLowerCase();
}

function isWordChar(ch) {
  if (!ch) return false;
  const code = ch.codePointAt(0);
  return (
    (code >= 0x5d0 && code <= 0x5ea) ||
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

function isLeftBoundary(text, index) {
  return index <= 0 || !isWordChar(text[index - 1]);
}

function isRightBoundary(text, index) {
  return index >= text.length || !isWordChar(text[index]);
}

function findOccurrences(text, phrase) {
  if (!phrase || phrase.length < 2) return [];
  const haystack = normalizeForSearch(text);
  const needle = normalizeForSearch(phrase);
  if (!needle) return [];

  const positions = [];
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    const end = pos + needle.length;
    if (
      isLeftBoundary(haystack, pos) &&
      isRightBoundary(haystack, end) &&
      !isMilhamaConstructBeforeTerm(haystack, pos, end)
    ) {
      positions.push({ start: pos, end });
    }
    pos += 1;
  }
  return positions;
}

/** Prepositional prefixes only — not מ, which is part of מלחמת. */
const PREPOSITIONAL_PREFIXES = ["וש", "וב", "וכ", "ול", "ומ", "וה", "ו", "ה", "ב", "כ", "ל", "ש"];

function isMilhamaConstructForm(word) {
  let w = (word || "").trim();
  for (const prefix of PREPOSITIONAL_PREFIXES) {
    if (w.startsWith(prefix) && w.length > prefix.length + 2) {
      w = w.slice(prefix.length);
      break;
    }
  }
  if (w.startsWith("מ") && w.length > 2 && w.slice(1) === "מלחמת") return true;
  return w === "מלחמת";
}

/** מלחמת + שם מלחמה — שייך למונח המורכב, לא ל«מלחמה» הגנרית. */
function isMilhamaConstructBeforeTerm(text, start, end) {
  if (!isMilhamaConstructForm(text.slice(start, end))) return false;
  let i = end;
  while (i < text.length && text[i] === " ") i++;
  return i < text.length && isWordChar(text[i]);
}

/**
 * "מעבר" is homographic: only border-crossing facility senses count as the term.
 * Excludes מעבר ל…, מעבר משלב, מעבר ממעמד, מעבר אל, המעבר ל"…", etc.
 */
function isMaavarPassagewayContext(text, start, end) {
  const after = text.slice(end).trimStart();
  const word = text.slice(start, end);

  if (/^ל(קו|גבול|זירת|כך|מותר|שיקולים)/.test(after)) return false;
  if (/^לו(?:[,.\s]|$)/.test(after)) return false;
  if (/^ל["״]/.test(after)) return false;
  if (/^אל\s/.test(after)) return false;
  if (/^(משלב|ממעמד|מדינה)/.test(after)) return false;
  if (/^חלקי\s+ל/.test(after)) return false;
  if (word === "המעבר" && /^ל["״]/.test(after)) return false;
  return true;
}

function isMilhamaOccurrenceContext(text, start, end) {
  return !isMilhamaConstructBeforeTerm(text, start, end);
}

const TERM_OCCURRENCE_FILTERS = new Map([
  ["מעבר", isMaavarPassagewayContext],
  ["מלחמה", isMilhamaOccurrenceContext],
]);

function getTermOccurrenceFilter(keyword) {
  return TERM_OCCURRENCE_FILTERS.get(normalizeForSearch(canonicalDisplayKeyword(keyword)));
}

function countGroupOccurrences(text, variants, options = {}) {
  const { acceptOccurrence } = options;
  const haystack = normalizeForSearch(text);
  const sorted = [...variants].sort(
    (a, b) => normalizeForSearch(b).length - normalizeForSearch(a).length
  );
  const occupied = [];

  function overlaps(start, end) {
    return occupied.some((r) => start < r.end && end > r.start);
  }

  const variantCounts = new Map();
  let total = 0;

  for (const variant of sorted) {
    const positions = findOccurrences(haystack, variant);
    let variantTotal = 0;
    for (const { start, end } of positions) {
      if (acceptOccurrence && !acceptOccurrence(haystack, start, end)) continue;
      if (!overlaps(start, end)) {
        occupied.push({ start, end });
        variantTotal++;
        total++;
      }
    }
    if (variantTotal > 0) {
      variantCounts.set(variant, variantTotal);
    }
  }

  return { total, variantCounts };
}

function tokenize(text) {
  const normalized = normalizeText(text);
  const tokens = [];
  const re = /[\u0590-\u05FFa-zA-Z0-9]+(?:['׳-][\u0590-\u05FFa-zA-Z0-9]+)*/g;
  let match;
  while ((match = re.exec(normalized)) !== null) {
    const cleaned = cleanTokenSurface(match[0]);
    if (cleaned.length >= 1) tokens.push(cleaned);
  }
  return tokens;
}

function stripPrefix(word) {
  for (const prefix of PREFIXES) {
    if (word.startsWith(prefix) && word.length > prefix.length + 1) {
      return word.slice(prefix.length);
    }
  }
  return word;
}

function stripAllPrefixes(word) {
  let w = normalizeForSearch(word);
  let prev;
  do {
    prev = w;
    w = stripPrefix(w);
  } while (w !== prev && w.length >= 2);
  return w;
}

function stripOneDisplayPrefix(word) {
  for (const prefix of DISPLAY_PREFIXES) {
    if (word.startsWith(prefix) && word.length > prefix.length + 1) {
      return word.slice(prefix.length);
    }
  }
  return word;
}

function stripDisplayPrefixes(word) {
  let w = normalizeForSearch(word);
  let prev;
  do {
    prev = w;
    w = stripOneDisplayPrefix(w);
  } while (w !== prev && w.length >= 2);
  return w;
}

function cleanTokenSurface(token) {
  return (token || "")
    .replace(/^[״׳"']+/, "")
    .replace(/[״׳"']+$/, "");
}

function cleanToken(word) {
  return normalizeForSearch(cleanTokenSurface(word));
}

function tryStripOneFunctionalPrefix(word) {
  for (const prefix of FUNCTIONAL_PREFIXES) {
    if (word.startsWith(prefix) && word.length > prefix.length + 1) {
      const stripped = word.slice(prefix.length);
      if (PROTECTED_LEMMAS.has(stripped)) return stripped;
      if (LEMMA_MAP.has(stripped)) return LEMMA_MAP.get(stripped);
      if (KNOWN_LEMMAS.has(stripped)) return stripped;
      if (PLURAL_TO_SINGULAR.has(stripped)) return PLURAL_TO_SINGULAR.get(stripped);
    }
  }
  return null;
}

function applyPluralSingular(word) {
  return PLURAL_TO_SINGULAR.get(word) || word;
}

function canonicalLemma(word) {
  let w = cleanToken(word);
  if (!w || w.length < 2) return w;

  if (LEMMA_MAP.has(w)) w = LEMMA_MAP.get(w);
  if (PROTECTED_LEMMAS.has(w)) return applyPluralSingular(w);

  const stripped = tryStripOneFunctionalPrefix(w);
  if (stripped) w = stripped;

  if (LEMMA_MAP.has(w)) w = LEMMA_MAP.get(w);
  if (PROTECTED_LEMMAS.has(w)) return applyPluralSingular(w);

  return applyPluralSingular(w);
}

/** Multi-word catalog terms that must not be lemmatized (e.g. אזרחים → אזרח). */
const PROTECTED_PHRASES = new Set([
  "הרג אזרחים",
]);

function canonicalDisplayKeyword(keyword) {
  const trimmed = (keyword || "").trim();
  if (PROTECTED_PHRASES.has(normalizeForSearch(trimmed))) return trimmed;

  const phraseKey = normalizeForSearch(keyword);
  if (PHRASE_LEMMA_MAP.has(phraseKey)) {
    const mapped = PHRASE_LEMMA_MAP.get(phraseKey);
    const mappedKey = normalizeForSearch(mapped);
    return CANONICAL_MERGE_MAP.get(mappedKey) || mapped;
  }
  if (CANONICAL_MERGE_MAP.has(phraseKey)) {
    return CANONICAL_MERGE_MAP.get(phraseKey);
  }

  const words = tokenize(keyword);
  if (!words.length) return (keyword || "").trim();
  if (words.length === 1) {
    const lemmatized = canonicalLemma(words[0]);
    const lemKey = normalizeForSearch(lemmatized);
    return CANONICAL_MERGE_MAP.get(lemKey) || lemmatized;
  }

  const lemmatized = words.map((w) => canonicalLemma(w)).join(" ");
  const lemKey = normalizeForSearch(lemmatized);
  if (PHRASE_LEMMA_MAP.has(lemKey)) {
    const mapped = PHRASE_LEMMA_MAP.get(lemKey);
    const mappedKey = normalizeForSearch(mapped);
    return CANONICAL_MERGE_MAP.get(mappedKey) || mapped;
  }
  return CANONICAL_MERGE_MAP.get(lemKey) || lemmatized;
}

function unifiedMergeKey(keyword) {
  return normalizeForSearch(canonicalDisplayKeyword(keyword));
}

function canonicalMergeDisplay(keyword) {
  return canonicalDisplayKeyword(keyword);
}

function isNoiseToken(word) {
  const w = cleanToken(word);
  if (!w) return true;
  if (/^\d+$/.test(w)) return true;
  if (/^[\d-]+$/.test(w)) return true;
  if (/^h?\d+$/.test(w.replace(/^ה-?/, ""))) return true;
  return false;
}

function isVerb(word) {
  const w = cleanToken(word);
  if (VERB_WORDS.has(w)) return true;
  if (w.startsWith("לה") && w.length >= 5 && !PROTECTED_LEMMAS.has(w)) return true;
  if (w.startsWith("ול") && w.length >= 6 && !PROTECTED_LEMMAS.has(w.slice(1))) return true;
  return false;
}

function isStopword(word) {
  const w = normalizeForSearch(word);
  if (STOPWORDS.has(w)) return true;
  return STOPWORDS.has(stripPrefix(w));
}

function isExcludedWord(word) {
  const w = cleanToken(word);
  if (!w || w.length < 2) return true;
  if (isNoiseToken(w)) return true;
  if (isVerb(w)) return true;
  if (EXCLUDE_WORDS.has(w)) return true;
  const lemma = canonicalLemma(w);
  if (EXCLUDE_WORDS.has(lemma)) return true;
  if (DESCRIPTIVE_ADJECTIVES.has(w)) return true;
  if (DESCRIPTIVE_ADJECTIVES.has(lemma)) return true;
  for (const prefix of FUNCTIONAL_PREFIXES) {
    if (w.startsWith(prefix) && w.length > prefix.length + 1) {
      const stripped = w.slice(prefix.length);
      if (DESCRIPTIVE_ADJECTIVES.has(stripped)) return true;
      if (EXCLUDE_WORDS.has(stripped)) return true;
    }
  }
  return false;
}

const PHRASE_START_EXCLUDED = new Set([
  ...META_NGRAM_STARTERS,
  "בשיח", "שיח", "השיח", "מונח", "המונח", "במונח", "למונח", "כמונח", "מונחים", "המונחים",
]);

function phraseStartsExcluded(firstWord) {
  let w = normalizeForSearch(firstWord);
  const forms = new Set([w]);
  let prev;
  do {
    prev = w;
    w = stripPrefix(w);
    forms.add(w);
  } while (w !== prev && w.length >= 2);

  for (const form of forms) {
    if (PHRASE_START_EXCLUDED.has(form)) return true;
  }
  return false;
}

function isPrefixAbsorbedPhrase(keyword) {
  return PHRASE_PREFIX_ABSORPTION.has(normalizeForSearch(keyword));
}

function isConjunctionSplitPhrase(keyword) {
  return PHRASE_CONJUNCTION_SPLIT.has(normalizeForSearch(keyword));
}

function isGenericExcludedPhrase(keyword) {
  return PHRASE_GENERIC_EXCLUDED.has(normalizeForSearch(keyword));
}

function isCombinedPhraseExcluded(keyword) {
  return (
    isPrefixAbsorbedPhrase(keyword) ||
    isConjunctionSplitPhrase(keyword) ||
    isGenericExcludedPhrase(keyword)
  );
}

function isExcluded(keyword, depth = 0) {
  const words = tokenize(keyword);
  if (isCombinedPhraseExcluded(keyword)) return true;
  if (words.length === 1) {
    if (isNoiseToken(words[0])) return true;
    if (isVerb(words[0])) return true;
    return isExcludedWord(words[0]);
  }
  if (isMetaNgram(words)) return true;
  if (phraseStartsExcluded(words[0])) return true;
  if (depth >= 3) return false;
  const canonical = canonicalDisplayKeyword(keyword);
  if (canonical !== keyword && isExcluded(canonical, depth + 1)) return true;
  return false;
}

function addDefiniteArticleVariant(phrase) {
  const trimmed = phrase.trim();
  if (!trimmed) return [];
  const variants = new Set([trimmed]);
  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    const w = words[0];
    const base = canonicalLemma(w);
    if (base !== w && base.length >= 2) variants.add(base);
    if (!w.startsWith("ה") && base.length >= 2) {
      variants.add("ה" + base);
    }
    if (!w.startsWith("ו") && base.length >= 2) {
      variants.add("ו" + base);
      variants.add("וה" + base);
    }
    if (!w.startsWith("ב") && base.length >= 2) {
      variants.add("ב" + base);
    }
  } else {
    const first = words[0];
    const rest = words.slice(1).join(" ");
    const baseFirst = canonicalLemma(first);
    if (baseFirst !== first) {
      variants.add([baseFirst, rest].filter(Boolean).join(" "));
    }
    if (!first.startsWith("ה") && baseFirst.length >= 2) {
      variants.add(["ה" + baseFirst, rest].join(" "));
    }
    if (!first.startsWith("ו") && baseFirst.length >= 2) {
      variants.add(["ו" + baseFirst, rest].join(" "));
      variants.add(["וה" + baseFirst, rest].join(" "));
    }
    if (!first.startsWith("ב") && baseFirst.length >= 2) {
      variants.add(["ב" + baseFirst, rest].join(" "));
    }
  }
  return [...variants];
}

function buildTermVariants(termName) {
  const variants = new Set(addDefiniteArticleVariant(termName));
  for (const [term, aliases] of Object.entries(TERM_VARIANT_ALIASES)) {
    if (normalizeForSearch(termName) === normalizeForSearch(term)) {
      for (const alias of aliases) {
        for (const v of addDefiniteArticleVariant(alias)) {
          variants.add(v);
        }
      }
    }
  }
  return [...variants];
}

/** Corpus = term entries only (objects are excluded from frequency analysis). */
function collectCorpus(data) {
  const parts = [];
  for (const row of data.sheets?.terms || []) {
    for (const field of TERM_TEXT_FIELDS) {
      const val = (row[field] || "").trim();
      if (val && !/^TERM-\d+$/.test(val)) {
        parts.push(val);
      }
    }
  }
  return parts.join("\n\n");
}

function buildKnownTermEntries(data) {
  const seen = new Set();
  const entries = [];
  for (const row of data.sheets?.terms || []) {
    const termName = (row["שם מונח"] || "").trim();
    const objectName = (row["שם אובייקט משויך"] || "").trim();
    const shortDefinition = (row["הגדרה קצרה של המונח"] || "").trim();
    if (!termName || seen.has(termName) || ABSORBED_KNOWN_ORIGINALS.has(termName)) continue;
    seen.add(termName);
    const canonical = canonicalDisplayKeyword(termName);
    entries.push({
      keyword: canonical,
      originalName: termName,
      conceptGroup: objectName,
      shortDefinition,
      variants: buildTermVariants(termName),
    });
  }
  return entries;
}

function collectAllPhrasesForMasking(termEntries) {
  const phrases = new Set();
  for (const entry of termEntries) {
    phrases.add(entry.keyword);
  }
  for (const extra of PHRASE_EXTRA) {
    phrases.add(extra);
  }
  return [...phrases];
}

function buildTokenMask(corpus, phrases) {
  const tokens = tokenize(corpus);
  const masked = new Array(tokens.length).fill(false);
  const normTokens = tokens.map((t) => normalizeForSearch(t));

  const variantLists = [];
  for (const phrase of phrases) {
    const variants = addDefiniteArticleVariant(phrase);
    for (const v of variants) {
      const phraseTokens = tokenize(v).map((t) => normalizeForSearch(t));
      if (phraseTokens.length >= 2) {
        variantLists.push(phraseTokens);
      }
    }
  }

  variantLists.sort((a, b) => b.length - a.length);

  function tokenMatchesPhraseToken(tokenIndex, phraseToken) {
    const token = normTokens[tokenIndex];
    if (token === phraseToken) return true;
    if (phraseToken === "מלחמת" && isMilhamaConstructForm(token)) return true;
    return stripAllPrefixes(token) === phraseToken;
  }

  for (const phraseTokens of variantLists) {
    for (let i = 0; i <= normTokens.length - phraseTokens.length; i++) {
      let match = true;
      for (let j = 0; j < phraseTokens.length; j++) {
        if (!tokenMatchesPhraseToken(i + j, phraseTokens[j])) {
          match = false;
          break;
        }
      }
      if (match) {
        for (let j = 0; j < phraseTokens.length; j++) {
          masked[i + j] = true;
        }
      }
    }
  }

  return { tokens, masked };
}

function layerKnownTerms(corpus, entries, coveredPhrases) {
  const results = [];

  for (const entry of entries) {
    for (const variant of entry.variants) {
      coveredPhrases.add(normalizeForSearch(variant));
    }

    const { total, variantCounts } = countGroupOccurrences(corpus, entry.variants, {
      acceptOccurrence: getTermOccurrenceFilter(entry.keyword),
    });

    results.push({
      keyword: entry.keyword,
      count: total,
      type: "מונח_ידוע",
      variants: total > 0
        ? [...variantCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([v, c]) => `${v} (${c})`)
        : [],
      conceptGroup: entry.conceptGroup,
      coreWords: extractCoreWords(entry.keyword),
    });
  }

  return results;
}

function layerExtraPhrases(corpus, knownTermNames, coveredPhrases) {
  const knownSet = new Set(knownTermNames.map((n) => normalizeForSearch(n)));
  const results = [];

  for (const phrase of PHRASE_EXTRA) {
    if (knownSet.has(normalizeForSearch(phrase))) continue;

    const variants = new Set(addDefiniteArticleVariant(phrase));
    for (const alias of PHRASE_EXTRA_ALIASES[phrase] || []) {
      for (const v of addDefiniteArticleVariant(alias)) {
        variants.add(v);
      }
    }
    for (const v of variants) {
      coveredPhrases.add(normalizeForSearch(v));
    }

    const { total, variantCounts } = countGroupOccurrences(corpus, [...variants]);
    if (total <= 0) continue;

    results.push({
      keyword: canonicalDisplayKeyword(phrase),
      count: total,
      type: "ביטוי",
      variants: [...variantCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([v, c]) => `${v} (${c})`),
      conceptGroup: "",
      coreWords: extractCoreWords(phrase),
    });
  }

  return results;
}

function extractCoreWords(phrase) {
  return tokenize(phrase)
    .map((w) => canonicalLemma(w))
    .filter((w) => w.length >= 3 && !isStopword(w) && !isExcludedWord(w));
}

function isMetaNgram(words) {
  const first = stripPrefix(normalizeForSearch(words[0]));
  if (META_NGRAM_STARTERS.has(first)) return true;
  if (words.length >= 2) {
    const second = stripPrefix(normalizeForSearch(words[1]));
    if (first === "מדגיש" || first === "מטשטש" || first === "לטשטש") {
      if (second === "את" || second === "ש") return true;
    }
  }
  return false;
}

function isValidNgram(words) {
  if (!words.length) return false;
  if (isMetaNgram(words)) return false;
  if (isStopword(words[0]) || isStopword(words[words.length - 1])) return false;
  const contentWords = words.filter((w) => !isStopword(w) && !isExcludedWord(w));
  return contentWords.length >= Math.ceil(words.length / 2);
}

function layerNgrams(tokens, masked, coveredPhrases) {
  const counts = new Map();

  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      if (masked.slice(i, i + n).some(Boolean)) continue;

      const slice = tokens.slice(i, i + n);
      if (!isValidNgram(slice)) continue;

      const phrase = slice.join(" ");
      const key = normalizeForSearch(phrase);
      if (coveredPhrases.has(key)) continue;
      if (isExcluded(phrase)) continue;

      counts.set(key, { phrase, count: (counts.get(key)?.count || 0) + 1 });
    }
  }

  const results = [];
  for (const { phrase, count } of counts.values()) {
    if (count < MIN_NGRAM_COUNT) continue;
    results.push({
      keyword: canonicalDisplayKeyword(phrase),
      count,
      type: "ביטוי",
      variants: [phrase],
      conceptGroup: "",
      coreWords: extractCoreWords(phrase),
    });
  }

  return results;
}

function layerWords(tokens, masked) {
  const formCounts = new Map();

  for (let i = 0; i < tokens.length; i++) {
    if (masked[i]) continue;
    const token = tokens[i];
    if (isNoiseToken(token) || isVerb(token)) continue;
    if (isStopword(token) || isExcludedWord(token)) continue;

    const norm = normalizeForSearch(token);
    if (norm.length < 2) continue;
    if (!formCounts.has(norm)) formCounts.set(norm, new Map());
    const forms = formCounts.get(norm);
    forms.set(token, (forms.get(token) || 0) + 1);
  }

  const groups = new Map();
  for (const [norm, forms] of formCounts) {
    const root = canonicalLemma(norm);
    if (isStopword(root) || isExcludedWord(root) || root.length < 2) continue;
    if (!groups.has(root)) groups.set(root, { forms: new Map(), total: 0 });
    const g = groups.get(root);
    for (const [form, count] of forms) {
      g.forms.set(form, (g.forms.get(form) || 0) + count);
      g.total += count;
    }
  }

  const results = [];
  for (const [root, { forms, total }] of groups) {
    if (total < MIN_WORD_COUNT) continue;
    const sortedForms = [...forms.entries()].sort((a, b) => b[1] - a[1]);
    const keyword = root;
    if (isExcluded(keyword)) continue;

    results.push({
      keyword,
      count: total,
      type: "מילה",
      variants: sortedForms.map(([f, c]) => `${f} (${c})`),
      conceptGroup: "",
      coreWords: [root],
    });
  }

  return results;
}

function buildRelatedVariants(allRows) {
  const contentWordsCache = new Map();

  function getContentWords(keyword) {
    const key = normalizeForSearch(keyword);
    if (!contentWordsCache.has(key)) {
      contentWordsCache.set(key, extractCoreWords(keyword));
    }
    return contentWordsCache.get(key);
  }

  for (const row of allRows) {
    const related = [];
    const rowNorm = normalizeForSearch(row.keyword);
    const rowWords = new Set(getContentWords(row.keyword));

    for (const other of allRows) {
      if (other.keyword === row.keyword) continue;
      const otherNorm = normalizeForSearch(other.keyword);

      if (otherNorm.length >= 4 && rowNorm.includes(otherNorm)) {
        related.push({ kw: other.keyword, score: otherNorm.length + 100 });
        continue;
      }
      if (rowNorm.length >= 4 && otherNorm.includes(rowNorm)) {
        related.push({ kw: other.keyword, score: rowNorm.length + 100 });
        continue;
      }

      const otherWords = getContentWords(other.keyword);
      const shared = otherWords.filter((w) => rowWords.has(w));
      if (shared.length >= 2) {
        related.push({ kw: other.keyword, score: shared.length * 10 + shared.join("").length });
      }
    }

    const seen = new Set();
    row.relatedVariants = related
      .sort((a, b) => b.score - a.score || a.kw.localeCompare(b.kw, "he"))
      .filter((r) => {
        if (seen.has(r.kw)) return false;
        seen.add(r.kw);
        return true;
      })
      .slice(0, MAX_RELATED)
      .map((r) => r.kw);
  }
}

function mergeVariantStrings(a, b) {
  const counts = new Map();
  for (const list of [a, b]) {
    for (const entry of list) {
      const match = entry.match(/^(.+?) \((\d+)\)$/);
      if (match) {
        const form = match[1];
        counts.set(form, (counts.get(form) || 0) + parseInt(match[2], 10));
      } else if (entry) {
        counts.set(entry, (counts.get(entry) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([form, count]) => `${form} (${count})`);
}

function mergeRowsByLemma(rows, knownTermSurvivorKeys) {
  const priority = { מונח_ידוע: 3, ביטוי: 2, מילה: 1 };
  const byKey = new Map();

  for (const row of rows) {
    const mergeKey = unifiedMergeKey(row.keyword);
    const canonicalKeyword = canonicalMergeDisplay(row.keyword);

    const existing = byKey.get(mergeKey);
    if (!existing) {
      byKey.set(mergeKey, {
        ...row,
        keyword: canonicalKeyword,
        variants: Array.isArray(row.variants) ? [...row.variants] : [row.variants],
      });
      continue;
    }

    existing.count += row.count;
    existing.variants = mergeVariantStrings(existing.variants, row.variants);
    if (priority[row.type] > priority[existing.type]) {
      existing.type = row.type;
      if (row.conceptGroup) existing.conceptGroup = row.conceptGroup;
    }
  }

  for (const row of byKey.values()) {
    if (!knownTermSurvivorKeys.has(unifiedMergeKey(row.keyword)) && row.type === "מונח_ידוע") {
      row.type = "מילה";
    }
  }

  return [...byKey.values()];
}

function dedupeRows(rows) {
  const priority = { מונח_ידוע: 3, ביטוי: 2, מילה: 1 };
  const byKey = new Map();

  for (const row of rows) {
    const key = normalizeForSearch(row.keyword);
    const existing = byKey.get(key);
    if (
      !existing ||
      priority[row.type] > priority[existing.type] ||
      (priority[row.type] === priority[existing.type] && row.count > existing.count)
    ) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values()];
}

function dedupeByDisplayKeyword(rows, knownTermSurvivorKeys) {
  const knownDisplays = new Set(
    rows
      .filter((r) => r.type === "מונח_ידוע" && knownTermSurvivorKeys.has(unifiedMergeKey(r.keyword)))
      .map((r) => unifiedMergeKey(r.keyword))
  );

  const filtered = rows.filter((r) => {
    if (r.type === "מונח_ידוע" && knownTermSurvivorKeys.has(unifiedMergeKey(r.keyword))) {
      return true;
    }
    return !knownDisplays.has(unifiedMergeKey(r.keyword));
  });

  const priority = { מונח_ידוע: 3, ביטוי: 2, מילה: 1 };
  const byKey = new Map();

  for (const row of filtered) {
    const key = unifiedMergeKey(row.keyword);
    const existing = byKey.get(key);
    if (
      !existing ||
      priority[row.type] > priority[existing.type] ||
      (priority[row.type] === priority[existing.type] && row.count > existing.count)
    ) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values()];
}

function buildKnownTermSurvivorKeys(termEntries) {
  const keys = new Set();
  for (const entry of termEntries) {
    if (ABSORBED_KNOWN_ORIGINALS.has(entry.originalName)) continue;
    keys.add(unifiedMergeKey(entry.keyword));
  }
  return keys;
}

function tryDeriveSingular(word) {
  const w = normalizeForSearch(word);
  if (PLURAL_TO_SINGULAR.has(w)) return PLURAL_TO_SINGULAR.get(w);
  if (w.endsWith("ים") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("ות") && w.length > 4) return w.slice(0, -2) + "ה";
  if (w.endsWith("ין") && w.length > 4) return w.slice(0, -2) + "ייה";
  return null;
}

function autoMergePlurals(rows, knownTermSurvivorKeys) {
  const index = new Map();
  for (const row of rows) {
    index.set(unifiedMergeKey(row.keyword), row);
  }

  const absorb = new Set();
  for (const row of rows) {
    const words = tokenize(row.keyword);
    if (words.length !== 1) continue;
    const singular = tryDeriveSingular(words[0]);
    if (!singular) continue;
    const singularKey = normalizeForSearch(singular);
    const singularCanon = CANONICAL_MERGE_MAP.get(singularKey) || singularKey;
    const rowKey = unifiedMergeKey(row.keyword);
    if (singularCanon === rowKey) continue;
    const target = index.get(singularCanon);
    if (!target || target === row) continue;
    target.count += row.count;
    target.variants = mergeVariantStrings(target.variants, row.variants);
    absorb.add(rowKey);
  }

  return rows.filter((r) => !absorb.has(unifiedMergeKey(r.keyword)));
}

function collectMatchForms(row) {
  const forms = new Set([(row.keyword || "").trim()]);
  for (const entry of row.variants || []) {
    if (!entry) continue;
    const match = String(entry).match(/^(.+?) \((\d+)\)$/);
    forms.add((match ? match[1] : entry).trim());
  }
  return [...forms].filter(Boolean).filter((f) => !isCombinedPhraseExcluded(f));
}

/** Re-count from corpus so the count column matches non-overlapping phrase hits. */
function recalculateCountsFromCorpus(corpus, rows) {
  for (const row of rows) {
    const forms = collectMatchForms(row);
    const { total, variantCounts } = countGroupOccurrences(corpus, forms, {
      acceptOccurrence: getTermOccurrenceFilter(row.keyword),
    });
    row.count = total;
    row.variants =
      total > 0
        ? [...variantCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([v, c]) => `${v} (${c})`)
        : [];
  }
  return rows;
}

function applyMinCountFilter(rows) {
  return rows.filter(
    (r) => r.type === "מונח_ידוע" || r.count >= MIN_OUTPUT_COUNT
  );
}

function writeKnownTermsCsv(termEntries, corpus, outPath) {
  const headers = [
    "שם_מונח",
    "ספירה",
    "קבוצת_מושג",
    "הגדרה_קצרה",
    "וариантים",
  ];

  const lines = [headers.join(",")];
  for (const entry of termEntries) {
    const { total, variantCounts } = countGroupOccurrences(corpus, entry.variants, {
      acceptOccurrence: getTermOccurrenceFilter(entry.keyword),
    });
    const variants = total > 0
      ? [...variantCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([v, c]) => `${v} (${c})`)
          .join("; ")
      : "";

    lines.push(
      [
        escapeCsvField(entry.originalName),
        total,
        escapeCsvField(entry.conceptGroup),
        escapeCsvField(entry.shortDefinition),
        escapeCsvField(variants),
      ].join(",")
    );
  }

  const bom = "\uFEFF";
  fs.writeFileSync(outPath, bom + lines.join("\n") + "\n", "utf8");
}

function escapeCsvField(value) {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(rows, outPath) {
  const headers = [
    "מילת_מפתח",
    "ספירה",
    "סוג",
    "וариантים",
    "וариантים_קשורים",
    "קבוצת_מושג",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        escapeCsvField(row.keyword),
        row.count,
        escapeCsvField(row.type),
        escapeCsvField(row.variants.join("; ")),
        escapeCsvField((row.relatedVariants || []).join("; ")),
        escapeCsvField(row.conceptGroup),
      ].join(",")
    );
  }

  const bom = "\uFEFF";
  fs.writeFileSync(outPath, bom + lines.join("\n") + "\n", "utf8");
}

function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`Missing ${DATA_PATH}. Run: node sync-sheet.js`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const corpus = collectCorpus(data);

  const termEntries = buildKnownTermEntries(data);
  const knownTermSurvivorKeys = buildKnownTermSurvivorKeys(termEntries);
  const knownTermNames = termEntries.map((e) => e.keyword);
  const allPhrases = collectAllPhrasesForMasking(termEntries);
  const { tokens, masked } = buildTokenMask(corpus, allPhrases);

  writeKnownTermsCsv(termEntries, corpus, KNOWN_TERMS_PATH);

  const coveredPhrases = new Set();
  const layer1 = layerKnownTerms(corpus, termEntries, coveredPhrases);
  const layerPhrases = layerExtraPhrases(corpus, knownTermNames, coveredPhrases);
  const layer2 = layerNgrams(tokens, masked, coveredPhrases);
  const layer3 = layerWords(tokens, masked);

  let allRows = [...layer1, ...layerPhrases, ...layer2, ...layer3];
  allRows = allRows.filter((row) => !isExcluded(row.keyword));

  for (const row of allRows) {
    row.keyword = canonicalDisplayKeyword(row.keyword);
  }

  allRows = mergeRowsByLemma(allRows, knownTermSurvivorKeys);
  allRows = dedupeByDisplayKeyword(allRows, knownTermSurvivorKeys);
  allRows = autoMergePlurals(allRows, knownTermSurvivorKeys);
  allRows = mergeRowsByLemma(allRows, knownTermSurvivorKeys);
  allRows = recalculateCountsFromCorpus(corpus, allRows);
  allRows = applyMinCountFilter(allRows);

  buildRelatedVariants(allRows);
  allRows.sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword, "he"));

  writeCsv(allRows, OUT_PATH);

  const byType = {};
  for (const row of allRows) {
    byType[row.type] = (byType[row.type] || 0) + 1;
  }

  console.log(`Corpus: ~${tokens.length} tokens`);
  console.log(`Known terms: ${termEntries.length}`);
  console.log(`Results: ${allRows.length} rows`);
  console.log(`  מונח_ידוע: ${byType["מונח_ידוע"] || 0}`);
  console.log(`  ביטוי: ${byType["ביטוי"] || 0}`);
  console.log(`  מילה: ${byType["מילה"] || 0}`);
  console.log(`Written -> ${OUT_PATH}`);
  console.log(`Written -> ${KNOWN_TERMS_PATH}`);
}

main();
