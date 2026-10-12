// Parses the fixed-feast table of the Serbian Wikipedia article
// "Православни литургијски календар" (CC BY-SA 4.0) into Julian-dated entries.
// Formatting in that table: '''''x''''' (bold italic) = red-letter feast, '''x''' = bold (important).

const ROW = /^\| (\d{1,2})\.(\d{1,2})\.\s*\n\| \((\d{1,2})\.(\d{1,2})\.\)\s*\n([\s\S]*)$/;

// The source sometimes mixes Latin look-alike letters into Cyrillic words ("Пpeпoдобни").
// Inside words that already contain Cyrillic they are mapped to Cyrillic, so that Latin
// display transliterates correctly, as are words made only of look-alikes ("Mojcej").
// Roman numerals (I, II, V) are untouched.
const HOMOGLYPHS = {
  a: 'а',
  e: 'е',
  o: 'о',
  p: 'р',
  c: 'с',
  x: 'х',
  y: 'у',
  j: 'ј',
  i: 'и',
  A: 'А',
  B: 'В',
  E: 'Е',
  K: 'К',
  M: 'М',
  H: 'Н',
  O: 'О',
  P: 'Р',
  C: 'С',
  T: 'Т',
  X: 'Х',
};
export function fixHomoglyphs(text) {
  return text.replace(/\p{L}+/gu, (word) => (/[Ѐ-ӿ]/.test(word) || (/[a-z]/.test(word) && [...word].every((ch) => HOMOGLYPHS[ch])) ? word.replace(/[a-zA-Z]/g, (ch) => HOMOGLYPHS[ch] ?? ch) : word));
}

function stripLinks(s) {
  return s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
}

function clean(s) {
  return stripLinks(s)
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;?/g, ' ')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.)])/g, '$1')
    .replace(/^[\s,;:]+|[\s,;:]+$/g, '')
    .trim();
}

/** Split on ';' that are outside [[...]] links. */
function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('[[', i)) {
      depth++;
      cur += '[[';
      i++;
      continue;
    }
    if (s.startsWith(']]', i)) {
      depth = Math.max(0, depth - 1);
      cur += ']]';
      i++;
      continue;
    }
    if (s[i] === ';' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += s[i];
  }
  parts.push(cur);
  return parts;
}

const spanTexts = (text, re) => [...text.matchAll(re)].flatMap((x) => splitTopLevel(x[1]).map(clean)).filter(Boolean);
const inSpans = (title, spans) => spans.some((sp) => title === sp || title.startsWith(sp));

/**
 * @returns {Map<string, {gregorianRef: string, saints: {title:string, red:boolean, bold:boolean}[], folk: string[]}>}
 *   keyed by Julian "MM-DD"
 */
export function parseMenaion(wikitext) {
  const rows = wikitext.split(/\n\|-\s*\n/);
  const out = new Map();
  for (const row of rows) {
    const m = row.match(ROW);
    if (!m) continue;
    const [, gd, gm, jd, jm, rest] = m;
    // Columns after the dates: image | saints | folk name; each starts with "|" at line start.
    const cols = rest.split(/\n\|/).map((c) => c.replace(/^\|/, ''));
    const saintsCol = cols.find((c) => !/^\s*\[\[(Датотека|File|Слика):/.test(c) && c.trim() !== '') ?? '';
    const saintsIdx = cols.indexOf(saintsCol);
    const folkCol = saintsIdx >= 0 ? cols.slice(saintsIdx + 1).join(' ') : '';

    // Formatting spans can cross ';' separators, so collect span texts on the whole column first.
    const redSpans = spanTexts(saintsCol, /'''''([\s\S]*?)'''''/g);
    const boldSpans = spanTexts(saintsCol.replace(/'''''[\s\S]*?'''''/g, ''), /'''([\s\S]*?)'''/g);

    const saints = [];
    for (const rawLine of saintsCol.split('\n')) {
      for (const part of splitTopLevel(rawLine)) {
        const plain = clean(part);
        const red = inSpans(plain, redSpans);
        const bold = !red && inSpans(plain, boldSpans);
        for (const piece of plain.split(/;\s*/)) {
          const title = fixHomoglyphs(piece.trim());
          if (title.length > 1) saints.push({ title, red, bold });
        }
      }
    }
    const folk = splitTopLevel(folkCol)
      .flatMap((x) => x.split(/<br\s*\/?>|,/))
      .map((x) => fixHomoglyphs(clean(x)))
      .filter((x) => x.length > 1);
    const key = `${jm.padStart(2, '0')}-${jd.padStart(2, '0')}`;
    out.set(key, { gregorianRef: `${gd}.${gm}.`, saints, folk });
  }
  return out;
}
