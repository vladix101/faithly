// The user's own data (favorites, notes, reading history, settings).
// Kept in a separate database so content updates can never overwrite it.
import type { SQLiteDatabase } from 'expo-sqlite';

import type { VerseRange } from './content';

export const USER_DB_NAME = 'user.db';

/** Ordered migrations; index + 1 is the schema version stored in PRAGMA user_version. */
export const MIGRATIONS: string[] = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
   CREATE TABLE favorites (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL CHECK (kind IN ('verse', 'prayer')),
     book_id INTEGER, chapter INTEGER, verse_start INTEGER, verse_end INTEGER,
     prayer_id TEXT,
     created_at TEXT NOT NULL);
   CREATE UNIQUE INDEX favorites_verse ON favorites(book_id, chapter, verse_start, verse_end) WHERE kind = 'verse';
   CREATE UNIQUE INDEX favorites_prayer ON favorites(prayer_id) WHERE kind = 'prayer';
   CREATE TABLE notes (
     book_id INTEGER NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
     text TEXT NOT NULL, updated_at TEXT NOT NULL,
     PRIMARY KEY (book_id, chapter, verse));
   CREATE TABLE reading_history (date TEXT PRIMARY KEY NOT NULL, read_at TEXT NOT NULL);
   CREATE TABLE reading_position (id INTEGER PRIMARY KEY CHECK (id = 1), book_id INTEGER NOT NULL,
     chapter INTEGER NOT NULL, verse INTEGER NOT NULL, updated_at TEXT NOT NULL);`,
];

export async function migrateUserDb(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version > MIGRATIONS.length) throw new Error(`Korisnička baza je novija od aplikacije (v${version})`);
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

const now = () => new Date().toISOString();

// ---------- settings ----------
export async function getAllSettings(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

// ---------- reading history ----------
/** Marks a local day as read. Repeated calls on the same day are no-ops. */
export async function markDayRead(db: SQLiteDatabase, dateKey: string): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO reading_history (date, read_at) VALUES (?, ?)', dateKey, now());
}

export async function getReadDays(db: SQLiteDatabase): Promise<string[]> {
  return (await db.getAllAsync<{ date: string }>('SELECT date FROM reading_history ORDER BY date')).map((r) => r.date);
}

// ---------- reading position ----------
export interface ReadingPosition {
  book_id: number;
  chapter: number;
  verse: number;
}

export const getReadingPosition = (db: SQLiteDatabase) =>
  db.getFirstAsync<ReadingPosition>('SELECT book_id, chapter, verse FROM reading_position WHERE id = 1');

export async function saveReadingPosition(db: SQLiteDatabase, p: ReadingPosition): Promise<void> {
  await db.runAsync(
    `INSERT INTO reading_position (id, book_id, chapter, verse, updated_at) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET book_id = excluded.book_id, chapter = excluded.chapter, verse = excluded.verse, updated_at = excluded.updated_at`,
    p.book_id,
    p.chapter,
    p.verse,
    now(),
  );
}

// ---------- favorites ----------
export interface Favorite {
  id: number;
  kind: 'verse' | 'prayer';
  book_id: number | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  prayer_id: string | null;
  created_at: string;
}

export async function isVerseFavorite(db: SQLiteDatabase, r: VerseRange): Promise<boolean> {
  const row = await db.getFirstAsync(
    "SELECT 1 FROM favorites WHERE kind = 'verse' AND book_id = ? AND chapter = ? AND verse_start = ? AND verse_end = ?",
    r.bookId,
    r.chapter,
    r.verseStart,
    r.verseEnd,
  );
  return !!row;
}

/** Toggles a verse (or verse range) favorite; returns the new state. */
export async function toggleVerseFavorite(db: SQLiteDatabase, r: VerseRange): Promise<boolean> {
  if (await isVerseFavorite(db, r)) {
    await db.runAsync(
      "DELETE FROM favorites WHERE kind = 'verse' AND book_id = ? AND chapter = ? AND verse_start = ? AND verse_end = ?",
      r.bookId,
      r.chapter,
      r.verseStart,
      r.verseEnd,
    );
    return false;
  }
  await db.runAsync(
    "INSERT OR IGNORE INTO favorites (kind, book_id, chapter, verse_start, verse_end, created_at) VALUES ('verse', ?, ?, ?, ?, ?)",
    r.bookId,
    r.chapter,
    r.verseStart,
    r.verseEnd,
    now(),
  );
  return true;
}

export async function getFavoriteVerseKeys(db: SQLiteDatabase, bookId: number, chapter: number): Promise<Set<number>> {
  const rows = await db.getAllAsync<{ verse_start: number; verse_end: number }>(
    "SELECT verse_start, verse_end FROM favorites WHERE kind = 'verse' AND book_id = ? AND chapter = ?",
    bookId,
    chapter,
  );
  const set = new Set<number>();
  for (const r of rows) for (let v = r.verse_start; v <= r.verse_end; v++) set.add(v);
  return set;
}

export async function isPrayerFavorite(db: SQLiteDatabase, prayerId: string): Promise<boolean> {
  return !!(await db.getFirstAsync("SELECT 1 FROM favorites WHERE kind = 'prayer' AND prayer_id = ?", prayerId));
}

export async function togglePrayerFavorite(db: SQLiteDatabase, prayerId: string): Promise<boolean> {
  if (await isPrayerFavorite(db, prayerId)) {
    await db.runAsync("DELETE FROM favorites WHERE kind = 'prayer' AND prayer_id = ?", prayerId);
    return false;
  }
  await db.runAsync("INSERT OR IGNORE INTO favorites (kind, prayer_id, created_at) VALUES ('prayer', ?, ?)", prayerId, now());
  return true;
}

export const getFavorites = (db: SQLiteDatabase) => db.getAllAsync<Favorite>('SELECT * FROM favorites ORDER BY created_at DESC');

export const deleteFavorite = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM favorites WHERE id = ?', id);

// ---------- notes ----------
export interface Note {
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
  updated_at: string;
}

export const getNote = (db: SQLiteDatabase, bookId: number, chapter: number, verse: number) =>
  db.getFirstAsync<Note>('SELECT * FROM notes WHERE book_id = ? AND chapter = ? AND verse = ?', bookId, chapter, verse);

export async function getNotedVerses(db: SQLiteDatabase, bookId: number, chapter: number): Promise<Set<number>> {
  const rows = await db.getAllAsync<{ verse: number }>('SELECT verse FROM notes WHERE book_id = ? AND chapter = ?', bookId, chapter);
  return new Set(rows.map((r) => r.verse));
}

/** Saves a note; an empty text deletes it. */
export async function saveNote(db: SQLiteDatabase, bookId: number, chapter: number, verse: number, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    await db.runAsync('DELETE FROM notes WHERE book_id = ? AND chapter = ? AND verse = ?', bookId, chapter, verse);
    return;
  }
  await db.runAsync(
    `INSERT INTO notes (book_id, chapter, verse, text, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(book_id, chapter, verse) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    bookId,
    chapter,
    verse,
    trimmed,
    now(),
  );
}

export const getNotes = (db: SQLiteDatabase) => db.getAllAsync<Note>('SELECT * FROM notes ORDER BY updated_at DESC');
