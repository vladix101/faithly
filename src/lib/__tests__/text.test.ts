import { ftsQuery, parseReference, type BookAlias } from '../reference';
import { cyrToLat, latToCyr, normalizeForSearch } from '../text/translit';

describe('script conversion', () => {
  it('transliterates Serbian Cyrillic including digraphs and capitals', () => {
    expect(cyrToLat('Љубав дуго трпи, милокрвна је')).toBe('Ljubav dugo trpi, milokrvna je');
    expect(cyrToLat('ЉУБАВ')).toBe('LJUBAV');
    expect(cyrToLat('Ђурђевдан, Џак, Ћирило')).toBe('Đurđevdan, Džak, Ćirilo');
  });

  it('converts Latin UI text to Cyrillic', () => {
    expect(latToCyr('Pročitaj u Bibliji')).toBe('Прочитај у Библији');
    expect(latToCyr('Ljubav i Njegoš, džep')).toBe('Љубав и Његош, џеп');
  });

  it('normalizes script, case and diacritics identically for search', () => {
    const n = normalizeForSearch('Ђаво');
    expect(n).toBe('djavo');
    expect(normalizeForSearch('đavo')).toBe(n);
    expect(normalizeForSearch('DJAVO')).toBe(n);
    expect(normalizeForSearch('Čudo, čudesa!')).toBe('cudo cudesa');
    expect(normalizeForSearch('чудо')).toBe('cudo');
  });
});

describe('reference parsing', () => {
  const alias = (bookId: number, ...names: string[]): BookAlias[] => names.map((n) => ({ bookId, norm: normalizeForSearch(n) }));
  const aliases = [
    ...alias(26, 'Псалми', 'Пс'),
    ...alias(59, 'Јован', 'Јн'),
    ...alias(64, '1 Јованова', '1 Јн'),
    ...alias(69, '1 Коринћанима', '1 Кор'),
    ...alias(56, 'Матеј', 'Мт'),
  ];

  it('parses book, chapter and verse ranges in either script', () => {
    expect(parseReference('Jn 3:16', aliases)).toEqual({ bookId: 59, chapter: 3, verseStart: 16, verseEnd: 16 });
    expect(parseReference('Пс 23,1-3', aliases)).toEqual({ bookId: 26, chapter: 23, verseStart: 1, verseEnd: 3 });
    expect(parseReference('1. Kor 13', aliases)).toEqual({ bookId: 69, chapter: 13, verseStart: null, verseEnd: null });
    expect(parseReference('1 jn 4 8', aliases)).toEqual({ bookId: 64, chapter: 4, verseStart: 8, verseEnd: 8 });
    expect(parseReference('mat', aliases)).toEqual({ bookId: 56, chapter: null, verseStart: null, verseEnd: null });
  });

  it('does not treat ordinary words as references', () => {
    expect(parseReference('ljubav dugo trpi', aliases)).toBeNull();
    expect(parseReference('3 16', aliases)).toBeNull();
  });

  it('builds safe FTS prefix queries', () => {
    expect(ftsQuery('Љубав "дуго"')).toBe('"ljubav"* "dugo"*');
    expect(ftsQuery('a')).toBeNull();
  });
});
