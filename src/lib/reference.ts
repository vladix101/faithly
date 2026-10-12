import { normalizeForSearch } from './text/translit';

export interface BookAlias {
  bookId: number;
  norm: string;
}

export interface ParsedReference {
  bookId: number;
  chapter: number | null;
  verseStart: number | null;
  verseEnd: number | null;
}

/**
 * Parses references such as "Jn 3:16", "1. Kor 13", "Пс 23,1-3", "jovan 3 16-18".
 * Works on the normalized form, so script, case and diacritics do not matter.
 */
export function parseReference(query: string, aliases: BookAlias[]): ParsedReference | null {
  const tokens = normalizeForSearch(query).split(' ').filter(Boolean);
  if (!tokens.length) return null;

  // Longest leading run of tokens that names a book: exact alias first, then unique prefix.
  for (let take = tokens.length; take >= 1; take--) {
    const name = tokens.slice(0, take).join(' ');
    const rest = tokens.slice(take);
    if (!rest.every((t) => /^\d+$/.test(t)) || rest.length > 3) continue;
    if (/^\d+$/.test(name)) continue;
    let bookId = aliases.find((a) => a.norm === name)?.bookId;
    if (bookId === undefined && name.replace(/\d|\s/g, '').length >= 2) {
      const ids = new Set(aliases.filter((a) => a.norm.startsWith(name)).map((a) => a.bookId));
      if (ids.size === 1) bookId = [...ids][0];
    }
    if (bookId === undefined) continue;
    const [c, v1, v2] = rest.map(Number);
    if (c === 0 || v1 === 0) return null;
    const verseStart = v1 ?? null;
    const verseEnd = v2 !== undefined && v1 !== undefined && v2 >= v1 ? v2 : verseStart;
    return { bookId, chapter: c ?? null, verseStart, verseEnd };
  }
  return null;
}

/** FTS5 query: every token as a prefix term, all required. Returns null for queries too short to search. */
export function ftsQuery(query: string): string | null {
  const tokens = normalizeForSearch(query)
    .split(' ')
    .filter((t) => t.length >= 2);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"*`).join(' ');
}
