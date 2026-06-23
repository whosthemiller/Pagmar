/**
 * Coalition tags extracted from "מי משתמש במונח" (sheet-data.json).
 * Each group is a discourse actor or camp (who uses the term), not a topic domain.
 * A term may belong to several; links connect shared tags.
 */

export const COALITION_TAG_DEFS = [
  {
    id: "politicians",
    label: "פוליטיקה",
    pattern:
      /ממשל(ות)? ישראל|ממשלה(?!\s*פלסטינ)|משרדי? ממשלה|אתרי מידע רשמיים|מסמכי מדיניות|רשויות רשמיות|משרד הביטחון|משטר(ת|ה) ישראל|כנסת|ועדות כנסת|ועדת|גופי תכנון|הלשכה המרכזית|מבקר המדינה|ביטוח לאומי|מוסדות רשמיים בישראל|מוסדות המדינה|ממשלות ופרלמנטים|פרלמנט|מוסדות ממלכתיים|גופים ממלכתיים|ייעוץ משפטי לממשלה|פרקליטות המדינה|פרקליט המדינה|הסברה|גופי מדינה|מערכת הביטחון|שב.?כ|פוליטיקאים|פעילים פוליטיים|רשויות מקומיות|ראשי עיר|מועצות עיר|קמפיינים ציבוריים/i,
  },
  {
    id: "idf",
    label: "צה״ל",
    pattern:
      /דובר(י)? צה.?ל|דוברי הצבא|צה.?ל|לוחמים|פרשנים ביטחוניים|פרשנות ביטחונית|כוחות צה/i,
  },
  {
    id: "media_israel",
    label: "תקשורת ישראלית",
    pattern:
      /תקשורת ישראלית מרכזית|תקשורת ישראלית|התקשורת הישראלית|בתקשורת הישראלית|תקשורת מרכזית|כלי תקשורת מרכזיים|רוב כלי התקשורת הישראליים|תקשורת ביקורתית|התקשורת הביקורתית|עיתונאים|כתבי חדשות|כתבים|עיתונות כלכלית|כלי תקשורת(?! בינלאומ)/i,
  },
  {
    id: "media_intl",
    label: "תקשורת בינלאומית",
    pattern: /תקשורת בינלאומית|תקשורת בין.?לאומית/i,
  },
  {
    id: "right_camp",
    label: "ימין והתיישבות",
    pattern:
      /הימין הפוליטי|מחנה ימין|מחנה הימין|פוליטיקאים מהימין|הקואליציה|מובילי התוכנית|ימין.?ביטחוני|מחנה הימין־ביטחוני|ציונות דתית|שיח דתי.?לאומי|השיח הדתי|תנועות התיישבות|ארגוני ימין|מועצות אזוריות ביהודה|ההתיישבותי|תומכי נתניהו|מעריצי נתניהו|ביביסט|נוער הגבעות|נערי גבעות|תנועות הגבעות|מתנחלים|פעולות תגמול|טרור יהודי|רבנים|מנהיגים דתיים|הרבנות/i,
  },
  {
    id: "left_center",
    label: "שמאל מרכז ואופוזיציה",
    pattern:
      /שמאל הישראלי|השמאל הישראלי|מחנה השמאל|פעילי שמאל|פוליטיקאים מהשמאל|מהשמאל|המרכז הישראלי|השמאל והמרכז|מהמרכז|מחאה|מחאות|אופוזיציה|מובילי המחאה|מבקרי נתניהו|אופוזיציה לנתניהו|שלטון הפקידים|דיפ סטייט|מערכת המשפט והפקידות|רפורמה משפטית|הרפורמה המשפטית|שינוי מבנה השלטון|ההפיכה המשטרית|פעילי מחאה|ארגוני מחאה/i,
  },
  {
    id: "human_rights",
    label: "זכויות אדם",
    pattern:
      /ארגוני זכויות אדם|ארגון זכויות אדם|שלום עכשיו|יש דין|HRW|אמנסטי|בצלם|ארגוני חברה אזרחית|חברה אזרחית|חרם|BDS|תנועות חרם|עמותות ישראליות ביקורתיות|זוכרות/i,
  },
  {
    id: "palestinian",
    label: "שיח פלסטיני",
    pattern:
      /פלסטינים בגדה|בעזה|בפזורה|במונח משתמשים פלסטינים|הנהגה פלסטינית|ההנהגה הפלסטינית|שיח פלסטיני|השיח הפלסטיני|ארגונים פוליטיים פלסטיניים|ארגונים פלסטיניים|תושבים פלסטינים|פעילים פלסטינים|חמאס|פתח|ג.?יהאד האסלאמי|הג׳יהאד|תנועות סולידריות|תומכים פלסטיניים|משטר הכיבוש|שטחים כבושים|כיבוש|פליטים|נקודת השקט|נכסים נטושים/i,
  },
  {
    id: "international",
    label: "שיח בינלאומי",
    pattern:
      /מוסדות בינלאומיים|מוסדות וגורמים בין.?לאומיים|גופים בינלאומיים|גופים של האו.?ם|גופי או.?ם|האו.?ם|אונר"א|שיח בינלאומי|דיפלומטי|מחוץ לישראל|נורמליזציה|הסכמי אברהם|שלום כלכלי|פשעי מלחמה|פשע תוקפנות|ICC|בית הדין/i,
  },
  {
    id: "academia",
    label: "אקדמיה ומחקר",
    pattern:
      /אקדמיה|אקדמאים|חוקרים|מכון מחקר|השיח האקדמי|שיח אקדמי|אקדמיה בינלאומית|חוקרים בינלאומיים|אקדמיה ביקורתית|חוקרים ביקורתיים|היסטוריונים|היסטוריוגרפיה|פרשנים המסכמים|ספרי לימוד|ספר לימוד|תוכנית לימודים|מכוני מחקר|גופי מחקר|גופים מחקריים|מכון מדיניות|מכון ל/i,
  },
  {
    id: "legal",
    label: "משפט ובתי משפט",
    pattern:
      /משפטנים|שיח משפטי|אקדמיה משפטית|בג.?ץ|מערכת המשפט|בית משפט|בתי משפט|פרקליט|תביעה|הסתדרות|התאחדות/i,
  },
];

const tagById = new Map(COALITION_TAG_DEFS.map((tag) => [tag.id, tag]));

export function getCoalitionTagLabel(tagId) {
  if (tagId.startsWith("discourse:")) {
    return tagId.slice("discourse:".length);
  }
  return tagById.get(tagId)?.label || tagId;
}

/** Stable muted colors for coalition chips. */
export function coalitionTagColor(tagId) {
  let hash = 0;
  for (let i = 0; i < tagId.length; i++) {
    hash = (hash * 31 + tagId.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 16% 86%)`;
}

export function extractCoalitionTags(usedByText) {
  if (!usedByText?.trim()) return [];
  const found = [];
  for (const { id, pattern } of COALITION_TAG_DEFS) {
    if (pattern.test(usedByText)) found.push(id);
  }
  return found;
}

export function buildUsedByIndex(sheetTermsRows) {
  const usedByByName = new Map();
  for (const row of sheetTermsRows) {
    const name = (row["שם מונח"] || "").trim();
    const usedBy = (row["מי משתמש במונח"] || "").trim();
    if (name && usedBy) usedByByName.set(name, usedBy);
  }
  return usedByByName;
}

export function applyCoalitionTags(termNodes, usedByByName) {
  for (const term of termNodes) {
    const usedBy = usedByByName.get(term.name) || "";
    term.coalitionTags = extractCoalitionTags(usedBy);
    term.usedBy = usedBy;
    if (!term.coalitionTags.length && term.discourseGroup) {
      term.coalitionTags = [`discourse:${term.discourseGroup}`];
    }
  }
}

export function buildCoalitionLinks(terms) {
  const chosen = new Set();
  const links = [];

  for (const term of terms) {
    const tags = term.coalitionTags;
    if (!tags?.length) continue;
    const tagSet = new Set(tags);

    for (const other of terms) {
      if (other.id === term.id || other.objectId === term.objectId) continue;
      if (!other.coalitionTags?.some((tag) => tagSet.has(tag))) continue;

      const key = [term.id, other.id].sort().join("|");
      if (chosen.has(key)) continue;
      chosen.add(key);

      const sharedCoalitions = tags.filter((tag) =>
        other.coalitionTags.includes(tag)
      );

      links.push({
        source: term.id,
        target: other.id,
        type: "coalition",
        sharedCoalitions,
      });
    }
  }

  return links;
}
