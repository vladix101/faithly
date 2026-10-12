// Web (PWA) user data in IndexedDB: same functions as user.ts (SQLite on Android).
// Kept in its own database, so content updates never touch it. Includes JSON backup/restore,
// because browsers may evict site data.
import { openIdb, promisify, tx } from '@/lib/idb';

import type { Favorite, Note, ReadingPosition, VerseRange } from './types';

export type { Favorite, Note, ReadingPosition } from './types';

export type UserDb = IDBDatabase;
export const USER_DB_NAME = 'faithly-user';
/** IndexedDB schema version; each step in upgrade() is a migration. */
export const USER_DB_VERSION = 1;

export function openUserDb(): Promise<IDBDatabase> {
  return openIdb(USER_DB_NAME, USER_DB_VERSION, (db, oldVersion) => {
    if (oldVersion < 1) {
      db.createObjectStore('settings', { keyPath: 'key' });
      const fav = db.createObjectStore('favorites', { keyPath: 'id', autoIncrement: true });
      fav.createIndex('ref', 'ref', { unique: true });
      db.createObjectStore('notes', { keyPath: 'key' });
      db.createObjectStore('reading_history', { keyPath: 'date' });
      db.createObjectStore('reading_position', { keyPath: 'id' });
    }
  });
}

const now = () => new Date().toISOString();
const store = (t: IDBTransaction, name: string) => t.objectStore(name);
const read = <T>(db: IDBDatabase, name: string, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
  tx(db, name, 'readonly', (t) => promisify(fn(store(t, name))));
const write = <T>(db: IDBDatabase, name: string, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
  tx(db, name, 'readwrite', (t) => promisify(fn(store(t, name))));

type StoredFavorite = Favorite & { ref: string };
const verseRef = (r: VerseRange) => `v:${r.bookId}:${r.chapter}:${r.verseStart}:${r.verseEnd}`;
const prayerRef = (id: string) => `p:${id}`;
const noteKey = (b: number, c: number, v: number) => `${b}:${c}:${v}`;

// ---------- settings ----------
export async function getAllSettings(db: IDBDatabase): Promise<Record<string, string>> {
  const rows = await read<{ key: string; value: string }[]>(db, 'settings', (s) => s.getAll());
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(db: IDBDatabase, key: string, value: string): Promise<void> {
  await write(db, 'settings', (s) => s.put({ key, value }));
}

// ---------- reading history ----------
/** Marks a local day as read. Repeated calls on the same day keep the first record. */
export async function markDayRead(db: IDBDatabase, dateKey: string): Promise<void> {
  await tx(db, 'reading_history', 'readwrite', async (t) => {
    const s = store(t, 'reading_history');
    if (!(await promisify(s.get(dateKey)))) await promisify(s.put({ date: dateKey, read_at: now() }));
  });
}

export async function getReadDays(db: IDBDatabase): Promise<string[]> {
  return ((await read(db, 'reading_history', (s) => s.getAllKeys())) as string[]).sort();
}

// ---------- reading position ----------
export async function getReadingPosition(db: IDBDatabase): Promise<ReadingPosition | null> {
  const row = await read<(ReadingPosition & { id: number }) | undefined>(db, 'reading_position', (s) => s.get(1));
  return row ? { book_id: row.book_id, chapter: row.chapter, verse: row.verse } : null;
}

export async function saveReadingPosition(db: IDBDatabase, p: ReadingPosition): Promise<void> {
  await write(db, 'reading_position', (s) => s.put({ id: 1, ...p, updated_at: now() }));
}

// ---------- favorites ----------
async function findByRef(db: IDBDatabase, ref: string): Promise<StoredFavorite | undefined> {
  return tx(db, 'favorites', 'readonly', (t) =>
    promisify(store(t, 'favorites').index('ref').get(ref) as IDBRequest<StoredFavorite | undefined>),
  );
}

async function toggle(db: IDBDatabase, ref: string, row: Omit<StoredFavorite, 'id'>): Promise<boolean> {
  return tx(db, 'favorites', 'readwrite', async (t) => {
    const s = store(t, 'favorites');
    const existing = (await promisify(s.index('ref').get(ref))) as StoredFavorite | undefined;
    if (existing) {
      await promisify(s.delete(existing.id));
      return false;
    }
    await promisify(s.add(row));
    return true;
  });
}

export const isVerseFavorite = async (db: IDBDatabase, r: VerseRange) => !!(await findByRef(db, verseRef(r)));

export const toggleVerseFavorite = (db: IDBDatabase, r: VerseRange) =>
  toggle(db, verseRef(r), {
    ref: verseRef(r),
    kind: 'verse',
    book_id: r.bookId,
    chapter: r.chapter,
    verse_start: r.verseStart,
    verse_end: r.verseEnd,
    prayer_id: null,
    created_at: now(),
  });

export async function getFavoriteVerseKeys(db: IDBDatabase, bookId: number, chapter: number): Promise<Set<number>> {
  const set = new Set<number>();
  for (const f of await getFavorites(db)) {
    if (f.kind !== 'verse' || f.book_id !== bookId || f.chapter !== chapter) continue;
    for (let v = f.verse_start ?? 0; v <= (f.verse_end ?? -1); v++) set.add(v);
  }
  return set;
}

export const isPrayerFavorite = async (db: IDBDatabase, prayerId: string) => !!(await findByRef(db, prayerRef(prayerId)));

export const togglePrayerFavorite = (db: IDBDatabase, prayerId: string) =>
  toggle(db, prayerRef(prayerId), {
    ref: prayerRef(prayerId),
    kind: 'prayer',
    book_id: null,
    chapter: null,
    verse_start: null,
    verse_end: null,
    prayer_id: prayerId,
    created_at: now(),
  });

export async function getFavorites(db: IDBDatabase): Promise<Favorite[]> {
  const rows = await read<StoredFavorite[]>(db, 'favorites', (s) => s.getAll());
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export const deleteFavorite = (db: IDBDatabase, id: number) => write(db, 'favorites', (s) => s.delete(id));

// ---------- notes ----------
export async function getNote(db: IDBDatabase, bookId: number, chapter: number, verse: number): Promise<Note | null> {
  return (await read<Note | undefined>(db, 'notes', (s) => s.get(noteKey(bookId, chapter, verse)))) ?? null;
}

export async function getNotedVerses(db: IDBDatabase, bookId: number, chapter: number): Promise<Set<number>> {
  return new Set((await getNotes(db)).filter((n) => n.book_id === bookId && n.chapter === chapter).map((n) => n.verse));
}

/** Saves a note; an empty text deletes it. */
export async function saveNote(db: IDBDatabase, bookId: number, chapter: number, verse: number, text: string): Promise<void> {
  const trimmed = text.trim();
  const key = noteKey(bookId, chapter, verse);
  if (!trimmed) await write(db, 'notes', (s) => s.delete(key));
  else await write(db, 'notes', (s) => s.put({ key, book_id: bookId, chapter, verse, text: trimmed, updated_at: now() }));
}

export async function getNotes(db: IDBDatabase): Promise<Note[]> {
  const rows = await read<Note[]>(db, 'notes', (s) => s.getAll());
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

// ---------- backup ----------
export interface Backup {
  format: 'faithly-backup';
  version: 1;
  exported_at: string;
  favorites: Omit<Favorite, 'id'>[];
  notes: Note[];
  reading_history: string[];
}

export async function exportBackup(db: IDBDatabase): Promise<Backup> {
  return {
    format: 'faithly-backup',
    version: 1,
    exported_at: now(),
    favorites: (await getFavorites(db)).map(({ id: _id, ...f }) => f),
    notes: await getNotes(db),
    reading_history: await getReadDays(db),
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Merges a backup into the current data (existing items are kept). Returns how many items were added. */
export async function importBackup(db: IDBDatabase, data: unknown): Promise<number> {
  const b = data as Partial<Backup> | null;
  if (!b || b.format !== 'faithly-backup' || b.version !== 1) throw new Error('Ovo nije Faithly rezervna kopija.');
  let added = 0;
  for (const f of Array.isArray(b.favorites) ? b.favorites : []) {
    if (f?.kind === 'verse' && isNum(f.book_id) && isNum(f.chapter) && isNum(f.verse_start) && isNum(f.verse_end)) {
      const r = { bookId: f.book_id, chapter: f.chapter, verseStart: f.verse_start, verseEnd: f.verse_end };
      if (!(await isVerseFavorite(db, r))) added += Number(await toggleVerseFavorite(db, r));
    } else if (f?.kind === 'prayer' && typeof f.prayer_id === 'string' && f.prayer_id.length < 100) {
      if (!(await isPrayerFavorite(db, f.prayer_id))) added += Number(await togglePrayerFavorite(db, f.prayer_id));
    }
  }
  for (const n of Array.isArray(b.notes) ? b.notes : []) {
    if (!isNum(n?.book_id) || !isNum(n.chapter) || !isNum(n.verse) || typeof n.text !== 'string') continue;
    if (!(await getNote(db, n.book_id, n.chapter, n.verse))) {
      await saveNote(db, n.book_id, n.chapter, n.verse, n.text.slice(0, 10000));
      added++;
    }
  }
  for (const d of Array.isArray(b.reading_history) ? b.reading_history : []) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) await markDayRead(db, d);
  }
  return added;
}
