// Serbian script conversion and search normalization.
// This file has no imports so the Node content build (scripts/build-content.mjs)
// can load it directly; the search index and the app must normalize identically.

const CYR_TO_LAT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  ђ: 'đ',
  е: 'e',
  ж: 'ž',
  з: 'z',
  и: 'i',
  ј: 'j',
  к: 'k',
  л: 'l',
  љ: 'lj',
  м: 'm',
  н: 'n',
  њ: 'nj',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  ћ: 'ć',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'č',
  џ: 'dž',
  ш: 'š',
};

const LAT_TO_CYR: Record<string, string> = {
  a: 'а',
  b: 'б',
  v: 'в',
  g: 'г',
  d: 'д',
  đ: 'ђ',
  e: 'е',
  ž: 'ж',
  z: 'з',
  i: 'и',
  j: 'ј',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  r: 'р',
  s: 'с',
  t: 'т',
  ć: 'ћ',
  u: 'у',
  f: 'ф',
  h: 'х',
  c: 'ц',
  č: 'ч',
  š: 'ш',
};
const LAT_DIGRAPHS: Record<string, string> = { lj: 'љ', nj: 'њ', dž: 'џ' };

function isUpper(ch: string): boolean {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

/** Cyrillic → Latin (display only; stored texts stay in their original script). */
export function cyrToLat(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const lower = ch.toLowerCase();
    const mapped = CYR_TO_LAT[lower];
    if (mapped === undefined) {
      out += ch;
    } else if (!isUpper(ch)) {
      out += mapped;
    } else if (mapped.length === 1) {
      out += mapped.toUpperCase();
    } else {
      // Љ → "Lj", but "ЉУБАВ" → "LJUBAV"
      const next = text[i + 1] ?? '';
      const prev = text[i - 1] ?? '';
      const allCaps = (next && isUpper(next)) || (!next && prev && isUpper(prev));
      out += allCaps ? mapped.toUpperCase() : mapped[0].toUpperCase() + mapped.slice(1);
    }
  }
  return out;
}

/** Latin → Cyrillic, used for app-authored UI strings. */
export function latToCyr(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    const digraph = LAT_DIGRAPHS[pair.toLowerCase()];
    if (digraph) {
      out += isUpper(pair[0]) ? digraph.toUpperCase() : digraph;
      i++;
      continue;
    }
    const ch = text[i];
    const mapped = LAT_TO_CYR[ch.toLowerCase()];
    if (mapped === undefined) out += ch;
    else out += isUpper(ch) ? mapped.toUpperCase() : mapped;
  }
  return out;
}

const STRIP: Record<string, string> = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'dj' };

/**
 * Script-, case- and diacritic-insensitive form used for the search index and queries.
 * "Љубав", "ljubav" and "LJUBAV" all become "ljubav"; "đavo" and "djavo" become "djavo".
 */
export function normalizeForSearch(text: string): string {
  const latin = cyrToLat(text.toLowerCase());
  let out = '';
  for (const ch of latin) out += STRIP[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, ' ').trim();
}
