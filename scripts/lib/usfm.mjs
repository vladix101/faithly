// Minimal USFM reader for Bible text: books, chapters, verses and section headings.
// Verse text is kept exactly as in the source apart from removing markup, footnotes and cross-references.

const SKIP_LINE = new Set([
  'id',
  'ide',
  'rem',
  'h',
  'toc1',
  'toc2',
  'toc3',
  'mt',
  'mt1',
  'mt2',
  'mt3',
  'mt4',
  'imt',
  'imt1',
  'imt2',
  'is',
  'is1',
  'is2',
  'ip',
  'im',
  'ipi',
  'iot',
  'io1',
  'io2',
  'ie',
  'cl',
  'cp',
  'sts',
  'usfm',
  'r',
]);
const HEADINGS = new Set(['s', 's1', 's2', 's3', 'ms', 'ms1', 'ms2', 'mr', 'sr', 'd', 'sp', 'qa']);
const PARAGRAPH = new Set([
  'p',
  'm',
  'pi',
  'pi1',
  'pi2',
  'nb',
  'b',
  'q',
  'q1',
  'q2',
  'q3',
  'qr',
  'qc',
  'qm',
  'qm1',
  'li',
  'li1',
  'li2',
  'pc',
  'pm',
  'pmo',
  'mi',
  'cls',
  'tr',
  'tc1',
  'tc2',
]);

export function cleanInline(text) {
  return text
    .replace(/\\(f|fe|x|ef|ex)\s[\s\S]*?\\\1\*/g, '')
    .replace(/\\\+?w\s([^\\|]*?)(\|[^\\]*?)?\\\+?w\*/g, '$1')
    .replace(/\\\+?[a-z]+\d?\*?/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?»)])/g, '$1')
    .trim();
}

/**
 * @returns {{code:string, name:string, shortName:string, abbr:string,
 *   verses:{chapter:number, verse:number, text:string}[],
 *   headings:{chapter:number, beforeVerse:number, kind:string, text:string}[],
 *   unknownMarkers:Set<string>}}
 */
export function parseUsfmBook(source) {
  const book = { code: '', name: '', shortName: '', abbr: '', verses: [], headings: [], unknownMarkers: new Set() };
  let chapter = 0;
  let current = null;
  const flush = () => {
    if (current) {
      current.text = cleanInline(current.text);
      book.verses.push(current);
      current = null;
    }
  };
  for (const raw of source.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\\([a-z]+\d?)\*?(?:\s+([\s\S]*))?$/);
    if (!m) {
      if (current) current.text += ' ' + line;
      continue;
    }
    const [, marker, rest = ''] = m;
    if (marker === 'id') book.code = rest.split(/\s+/)[0];
    else if (marker === 'h') book.name = rest.trim();
    else if (marker === 'toc1' && !book.name) book.name = rest.trim();
    else if (marker === 'toc2') book.shortName = rest.trim();
    else if (marker === 'toc3') book.abbr = rest.trim();
    if (SKIP_LINE.has(marker)) continue;
    if (marker === 'c') {
      flush();
      chapter = Number(rest.trim().split(/\s+/)[0]);
      continue;
    }
    if (marker === 'v') {
      flush();
      const vm = rest.match(/^(\d+)(?:-(\d+))?[a-z]?\s*([\s\S]*)$/);
      if (!vm) throw new Error(`Bad verse marker in ${book.code} ${chapter}: ${line}`);
      if (vm[2]) throw new Error(`Verse ranges are not supported (${book.code} ${chapter}:${vm[1]}-${vm[2]})`);
      current = { chapter, verse: Number(vm[1]), text: vm[3] };
      continue;
    }
    if (HEADINGS.has(marker)) {
      flush();
      const text = cleanInline(rest);
      const last = book.verses[book.verses.length - 1];
      const beforeVerse = last && last.chapter === chapter ? last.verse + 1 : 1;
      if (text) book.headings.push({ chapter, beforeVerse, kind: marker === 'd' ? 'title' : 'section', text });
      continue;
    }
    if (PARAGRAPH.has(marker)) {
      if (current && rest) current.text += ' ' + rest;
      continue;
    }
    book.unknownMarkers.add(marker);
    if (current && rest) current.text += ' ' + rest;
  }
  flush();
  return book;
}
