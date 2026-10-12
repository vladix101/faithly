// Web (PWA) content adapter: same functions as content.ts, backed by versioned JSON packages
// (scripts/build-web-content.mjs) cached in IndexedDB. Nothing is promised offline until it is stored.
import contentMeta from '@/assets/db/content.json';
import { openIdb, promisify, tx } from '@/lib/idb';
import type { BookAlias } from '@/lib/reference';
import { normalizeForSearch } from '@/lib/text/translit';

import type { Book, CalendarDay, CalendarEvent, ContentSource, Heading, Prayer, PrayerPart, Verse, VerseRange } from './types';

export type { Book, CalendarDay, CalendarEvent, ContentSource, FastType, Heading, Prayer, PrayerPart, Verse, VerseRange } from './types';

export const WEB_CONTENT_VERSION = contentMeta.sha256.slice(0, 10);
const BASE = `/content/${WEB_CONTENT_VERSION}`;
const STORE = 'packages';

type Range = [number, number, number, number];
interface Core {
  version: string;
  meta: Record<string, string>;
  books: Book[];
  bookSizes: Record<string, number>;
  aliases: [number, string][];
  quotes: Range[];
  prayers: (Prayer & { norm: string; parts: Range[] })[];
  calendarYears: { year: number; version: string; format: number; pascha: string }[];
  days: CalendarDay[];
  events: [string, number, CalendarEvent['kind'], string, number, number][];
  sources: ContentSource[];
}
interface BookPackage {
  id: number;
  verses: [number, number, number, string][]; // id, chapter, verse, text
  headings: [number, number, Heading['kind'], string][];
}

export interface WebContentDb {
  version: string;
  core: Core;
  idb: IDBDatabase;
  books: Map<number, BookPackage>;
  pending: Map<number, Promise<BookPackage>>;
  search?: { id: number; book_id: number; chapter: number; verse: number; text: string; norm: string }[];
}
export type ContentDb = WebContentDb;

const key = (name: string) => `${WEB_CONTENT_VERSION}:${name}`;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Preuzimanje nije uspelo (${res.status})`);
  return (await res.json()) as T;
}

/** Opens the content cache; downloads the core package (≈0.8 MB) on first start of a content version. */
export async function openWebContent(): Promise<WebContentDb> {
  const idb = await openIdb('faithly-content', 1, (db) => {
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
  });
  let core = await tx(idb, STORE, 'readonly', (t) => promisify(t.objectStore(STORE).get(key('core')) as IDBRequest<Core | undefined>));
  if (!core) {
    try {
      core = await fetchJson<Core>(`${BASE}/core.json`);
    } catch {
      throw new Error('Za prvo pokretanje potreban je internet. Otvorite Faithly ponovo kada budete na mreži.');
    }
    if (core.version !== WEB_CONTENT_VERSION) throw new Error('Neočekivana verzija sadržaja; osvežite stranicu.');
    const fresh = core;
    await tx(idb, STORE, 'readwrite', (t) => promisify(t.objectStore(STORE).put(fresh, key('core'))));
  }
  // Content update: drop packages of older versions (user data lives in a separate database).
  await tx(idb, STORE, 'readwrite', async (t) => {
    const keys = (await promisify(t.objectStore(STORE).getAllKeys())) as string[];
    for (const k of keys) if (!k.startsWith(`${WEB_CONTENT_VERSION}:`)) t.objectStore(STORE).delete(k);
  });
  return { version: WEB_CONTENT_VERSION, core, idb, books: new Map(), pending: new Map() };
}

async function loadBook(db: WebContentDb, id: number): Promise<BookPackage> {
  const cached = db.books.get(id);
  if (cached) return cached;
  let p = db.pending.get(id);
  if (!p) {
    p = (async () => {
      const stored = await tx(db.idb, STORE, 'readonly', (t) =>
        promisify(t.objectStore(STORE).get(key(`book:${id}`)) as IDBRequest<BookPackage | undefined>),
      );
      if (stored) return stored;
      let pkg: BookPackage;
      try {
        pkg = await fetchJson<BookPackage>(`${BASE}/books/${id}.json`);
      } catch {
        throw new Error('Ova knjiga još nije preuzeta za čitanje bez interneta.');
      }
      await tx(db.idb, STORE, 'readwrite', (t) => promisify(t.objectStore(STORE).put(pkg, key(`book:${id}`))));
      return pkg;
    })();
    db.pending.set(id, p);
  }
  try {
    const pkg = await p;
    db.books.set(id, pkg);
    return pkg;
  } finally {
    db.pending.delete(id);
  }
}

// ---------- offline download ----------
export interface OfflineStatus {
  downloadedBooks: number;
  totalBooks: number;
  bytes: number;
  totalBytes: number;
}

export async function getOfflineStatus(db: WebContentDb): Promise<OfflineStatus> {
  const keys = (await tx(db.idb, STORE, 'readonly', (t) => promisify(t.objectStore(STORE).getAllKeys()))) as string[];
  const have = new Set(keys.filter((k) => k.startsWith(key('book:'))).map((k) => Number(k.split(':')[2])));
  const sizes = db.core.bookSizes;
  return {
    downloadedBooks: db.core.books.filter((b) => have.has(b.id)).length,
    totalBooks: db.core.books.length,
    bytes: db.core.books.filter((b) => have.has(b.id)).reduce((s, b) => s + (sizes[b.id] ?? 0), 0),
    totalBytes: Object.values(sizes).reduce((s, n) => s + n, 0),
  };
}

/** Downloads every Bible book into IndexedDB, reporting progress after each book. */
export async function downloadAll(db: WebContentDb, onProgress: (s: OfflineStatus) => void): Promise<void> {
  try {
    await navigator.storage?.persist?.(); // ask the browser not to evict offline content
  } catch {
    /* optional */
  }
  for (const b of db.core.books) {
    await loadBook(db, b.id);
    onProgress(await getOfflineStatus(db));
  }
}

// ---------- same API as content.ts ----------
export const getBooks = async (db: WebContentDb): Promise<Book[]> => db.core.books;
export const getBook = async (db: WebContentDb, id: number): Promise<Book | null> => db.core.books.find((b) => b.id === id) ?? null;
export const getBookAliases = async (db: WebContentDb): Promise<BookAlias[]> => db.core.aliases.map(([bookId, norm]) => ({ bookId, norm }));

const toVerse = (bookId: number, [id, chapter, verse, text]: BookPackage['verses'][number]): Verse => ({
  id,
  book_id: bookId,
  chapter,
  verse,
  text,
});

export async function getChapter(db: WebContentDb, bookId: number, chapter: number): Promise<Verse[]> {
  const pkg = await loadBook(db, bookId);
  return pkg.verses.filter((v) => v[1] === chapter).map((v) => toVerse(bookId, v));
}

export async function getHeadings(db: WebContentDb, bookId: number, chapter: number): Promise<Heading[]> {
  const pkg = await loadBook(db, bookId);
  return pkg.headings.filter((h) => h[0] === chapter).map(([, before_verse, kind, text]) => ({ before_verse, kind, text }));
}

export async function getVerses(db: WebContentDb, r: VerseRange): Promise<Verse[]> {
  const pkg = await loadBook(db, r.bookId);
  return pkg.verses.filter((v) => v[1] === r.chapter && v[2] >= r.verseStart && v[2] <= r.verseEnd).map((v) => toVerse(r.bookId, v));
}

/**
 * Same semantics as the FTS5 query built by ftsQuery(): every quoted token must be the
 * prefix of a word in the normalized verse. Needs the whole Bible (downloads what is missing).
 */
export async function searchVerses(db: WebContentDb, fts: string, limit = 100) {
  const tokens = [...fts.matchAll(/"([^"]+)"\*/g)].map((m) => ` ${m[1]}`);
  if (!db.search) {
    const index: NonNullable<WebContentDb['search']> = [];
    for (const b of db.core.books) {
      const pkg = await loadBook(db, b.id);
      for (const v of pkg.verses) index.push({ ...toVerse(b.id, v), norm: ` ${normalizeForSearch(v[3])}` });
    }
    db.search = index;
  }
  const shortName = new Map(db.core.books.map((b) => [b.id, b.short_name]));
  const out: (Verse & { book_short: string })[] = [];
  for (const v of db.search) {
    if (tokens.every((t) => v.norm.includes(t))) {
      out.push({
        id: v.id,
        book_id: v.book_id,
        chapter: v.chapter,
        verse: v.verse,
        text: v.text,
        book_short: shortName.get(v.book_id) ?? '',
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export const getQuoteCount = async (db: WebContentDb) => db.core.quotes.length;

export async function getQuote(db: WebContentDb, id: number): Promise<VerseRange | null> {
  const q = db.core.quotes[id - 1];
  return q ? { bookId: q[0], chapter: q[1], verseStart: q[2], verseEnd: q[3] } : null;
}

const prayerRow = ({ id, category, title, note }: Prayer): Prayer => ({ id, category, title, note });
export const getPrayers = async (db: WebContentDb) => db.core.prayers.map(prayerRow);
export const searchPrayers = async (db: WebContentDb, norm: string) => db.core.prayers.filter((p) => p.norm.includes(norm)).map(prayerRow);
export async function getPrayer(db: WebContentDb, id: string): Promise<Prayer | null> {
  const p = db.core.prayers.find((x) => x.id === id);
  return p ? prayerRow(p) : null;
}

export async function getPrayerParts(db: WebContentDb, id: string): Promise<PrayerPart[]> {
  const p = db.core.prayers.find((x) => x.id === id);
  if (!p) return [];
  return Promise.all(
    p.parts.map(async ([bookId, chapter, verseStart, verseEnd]) => {
      const range = { bookId, chapter, verseStart, verseEnd };
      return { ...range, verses: await getVerses(db, range) };
    }),
  );
}

export const getCalendarDay = async (db: WebContentDb, date: string) => db.core.days.find((d) => d.date === date) ?? null;
export const getCalendarRange = async (db: WebContentDb, from: string, to: string) =>
  db.core.days.filter((d) => d.date >= from && d.date <= to);

const toEvent = ([date, ord, kind, title, is_red, is_bold]: Core['events'][number]): CalendarEvent => ({
  date,
  ord,
  kind,
  title,
  is_red,
  is_bold,
});
export const getCalendarEvents = async (db: WebContentDb, date: string) => db.core.events.filter((e) => e[0] === date).map(toEvent);
export const getRedEvents = async (db: WebContentDb, from: string, to: string) =>
  db.core.events.filter((e) => e[0] >= from && e[0] <= to && e[4] === 1).map(toEvent);

export const getCalendarYears = async (db: WebContentDb) => db.core.calendarYears.map((y) => y.year);
export const getSources = async (db: WebContentDb) => db.core.sources;
export const getMeta = async (db: WebContentDb) => db.core.meta;

export async function verifyContent(db: WebContentDb, expectedSchema: string): Promise<void> {
  if (db.core.meta.schema_version !== expectedSchema) throw new Error('Neočekivana verzija sadržaja');
}
