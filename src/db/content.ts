// Read-only queries against the bundled content database (Bible, quotes, prayers, calendar).
import type { SQLiteDatabase } from 'expo-sqlite';

import type { BookAlias } from '@/lib/reference';

import type { Book, CalendarDay, CalendarEvent, ContentSource, Heading, Prayer, PrayerPart, Verse, VerseRange } from './types';

export type { Book, CalendarDay, CalendarEvent, ContentSource, FastType, Heading, Prayer, PrayerPart, Verse, VerseRange } from './types';

/** Handle passed to every query; the web adapter (content.web.ts) defines its own. */
export type ContentDb = SQLiteDatabase;

const BOOK_COLUMNS = 'id, code, testament, name, short_name, abbr, chapter_count';

export const getBooks = (db: SQLiteDatabase) => db.getAllAsync<Book>(`SELECT ${BOOK_COLUMNS} FROM books ORDER BY id`);

export const getBook = (db: SQLiteDatabase, id: number) => db.getFirstAsync<Book>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = ?`, id);

export const getBookAliases = async (db: SQLiteDatabase): Promise<BookAlias[]> =>
  (await db.getAllAsync<{ book_id: number; norm: string }>('SELECT book_id, norm FROM book_aliases')).map((r) => ({
    bookId: r.book_id,
    norm: r.norm,
  }));

export const getChapter = (db: SQLiteDatabase, bookId: number, chapter: number) =>
  db.getAllAsync<Verse>(
    'SELECT id, book_id, chapter, verse, text FROM verses WHERE book_id = ? AND chapter = ? ORDER BY verse',
    bookId,
    chapter,
  );

export const getHeadings = (db: SQLiteDatabase, bookId: number, chapter: number) =>
  db.getAllAsync<Heading>(
    'SELECT before_verse, kind, text FROM headings WHERE book_id = ? AND chapter = ? ORDER BY before_verse, rowid',
    bookId,
    chapter,
  );

export const getVerses = (db: SQLiteDatabase, r: VerseRange) =>
  db.getAllAsync<Verse>(
    'SELECT id, book_id, chapter, verse, text FROM verses WHERE book_id = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse',
    r.bookId,
    r.chapter,
    r.verseStart,
    r.verseEnd,
  );

export async function searchVerses(db: SQLiteDatabase, fts: string, limit = 100) {
  return db.getAllAsync<Verse & { book_short: string }>(
    `SELECT v.id, v.book_id, v.chapter, v.verse, v.text, b.short_name AS book_short
       FROM verses_fts f JOIN verses v ON v.id = f.rowid JOIN books b ON b.id = v.book_id
      WHERE verses_fts MATCH ? ORDER BY v.id LIMIT ?`,
    fts,
    limit,
  );
}

export async function getQuoteCount(db: SQLiteDatabase): Promise<number> {
  return (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM daily_quotes'))?.n ?? 0;
}

export async function getQuote(db: SQLiteDatabase, id: number): Promise<VerseRange | null> {
  const row = await db.getFirstAsync<{ book_id: number; chapter: number; verse_start: number; verse_end: number }>(
    'SELECT book_id, chapter, verse_start, verse_end FROM daily_quotes WHERE id = ?',
    id,
  );
  return row ? { bookId: row.book_id, chapter: row.chapter, verseStart: row.verse_start, verseEnd: row.verse_end } : null;
}

export const getPrayers = (db: SQLiteDatabase) => db.getAllAsync<Prayer>('SELECT id, category, title, note FROM prayers ORDER BY sort');

export const searchPrayers = (db: SQLiteDatabase, norm: string) =>
  db.getAllAsync<Prayer>("SELECT id, category, title, note FROM prayers WHERE norm LIKE '%' || ? || '%' ORDER BY sort", norm);

export const getPrayer = (db: SQLiteDatabase, id: string) =>
  db.getFirstAsync<Prayer>('SELECT id, category, title, note FROM prayers WHERE id = ?', id);

export async function getPrayerParts(db: SQLiteDatabase, id: string): Promise<PrayerPart[]> {
  const parts = await db.getAllAsync<{ book_id: number; chapter: number; verse_start: number; verse_end: number }>(
    'SELECT book_id, chapter, verse_start, verse_end FROM prayer_parts WHERE prayer_id = ? ORDER BY ord',
    id,
  );
  return Promise.all(
    parts.map(async (p) => {
      const range = { bookId: p.book_id, chapter: p.chapter, verseStart: p.verse_start, verseEnd: p.verse_end };
      return { ...range, verses: await getVerses(db, range) };
    }),
  );
}

export const getCalendarDay = (db: SQLiteDatabase, date: string) =>
  db.getFirstAsync<CalendarDay>('SELECT * FROM calendar_days WHERE date = ?', date);

export const getCalendarRange = (db: SQLiteDatabase, from: string, to: string) =>
  db.getAllAsync<CalendarDay>('SELECT * FROM calendar_days WHERE date BETWEEN ? AND ? ORDER BY date', from, to);

export const getCalendarEvents = (db: SQLiteDatabase, date: string) =>
  db.getAllAsync<CalendarEvent>('SELECT date, ord, kind, title, is_red, is_bold FROM calendar_events WHERE date = ? ORDER BY ord', date);

/** Red-letter events in a date range, most important first within each day. */
export const getRedEvents = (db: SQLiteDatabase, from: string, to: string) =>
  db.getAllAsync<CalendarEvent>(
    'SELECT date, ord, kind, title, is_red, is_bold FROM calendar_events WHERE date BETWEEN ? AND ? AND is_red = 1 ORDER BY date, ord',
    from,
    to,
  );

export async function getCalendarYears(db: SQLiteDatabase): Promise<number[]> {
  return (await db.getAllAsync<{ year: number }>('SELECT year FROM calendar_years ORDER BY year')).map((r) => r.year);
}

export const getSources = (db: SQLiteDatabase) => db.getAllAsync<ContentSource>('SELECT * FROM content_sources ORDER BY kind, id');

export async function getMeta(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM meta');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Basic integrity check run once after opening a (newly imported) content database. */
export async function verifyContent(db: SQLiteDatabase, expectedSchema: string): Promise<void> {
  const meta = await getMeta(db);
  if (meta.schema_version !== expectedSchema) throw new Error(`Neočekivana verzija sadržaja (${meta.schema_version ?? 'nema'})`);
  const counts = JSON.parse(meta.counts ?? '{}') as Record<string, number>;
  const verses = (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM verses'))?.n;
  if (!verses || verses !== counts.verses) throw new Error('Baza sadržaja je oštećena (broj stihova se ne slaže)');
}
