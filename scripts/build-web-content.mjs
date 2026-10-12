#!/usr/bin/env node
// Builds the PWA's content packages from the same content database the APK ships:
//   public/content/<version>/core.json        books, quotes, prayers, calendar, sources (loaded at start)
//   public/content/<version>/books/<id>.json  Bible text per book (downloaded for offline use)
// <version> is the content.db sha256 prefix, so every content change gets new, immutable URLs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(root, 'assets/db/content.db');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'assets/db/content.json'), 'utf8'));
const actual = crypto.createHash('sha256').update(fs.readFileSync(dbFile)).digest('hex');
if (actual !== meta.sha256) throw new Error('assets/db/content.json does not match content.db – run npm run build:content');

export const WEB_CONTENT_VERSION = meta.sha256.slice(0, 10);
const outRoot = path.join(root, 'public/content');
const out = path.join(outRoot, WEB_CONTENT_VERSION);
fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'books'), { recursive: true });

const db = new DatabaseSync(dbFile, { readOnly: true });
const all = (sql, ...p) =>
  db
    .prepare(sql)
    .all(...p)
    .map((r) => ({ ...r }));
const rows = (sql, ...p) =>
  db
    .prepare(sql)
    .all(...p)
    .map((r) => Object.values(r));

const books = all('SELECT id, code, testament, name, short_name, abbr, chapter_count FROM books ORDER BY id');
const bookSizes = {};
for (const b of books) {
  const verses = rows('SELECT id, chapter, verse, text FROM verses WHERE book_id = ? ORDER BY chapter, verse', b.id);
  const headings = rows(
    'SELECT chapter, before_verse, kind, text FROM headings WHERE book_id = ? ORDER BY chapter, before_verse, rowid',
    b.id,
  );
  const json = JSON.stringify({ id: b.id, verses, headings });
  fs.writeFileSync(path.join(out, 'books', `${b.id}.json`), json);
  bookSizes[b.id] = Buffer.byteLength(json);
}

const prayers = all('SELECT id, category, title, note, norm FROM prayers ORDER BY sort').map((p) => ({
  ...p,
  parts: rows('SELECT book_id, chapter, verse_start, verse_end FROM prayer_parts WHERE prayer_id = ? ORDER BY ord', p.id),
}));

const core = {
  version: WEB_CONTENT_VERSION,
  meta: Object.fromEntries(rows('SELECT key, value FROM meta')),
  books,
  bookSizes,
  aliases: rows('SELECT book_id, norm FROM book_aliases'),
  quotes: rows('SELECT book_id, chapter, verse_start, verse_end FROM daily_quotes ORDER BY id'),
  prayers,
  calendarYears: all('SELECT year, version, format, pascha FROM calendar_years ORDER BY year'),
  days: all('SELECT * FROM calendar_days ORDER BY date'),
  events: rows('SELECT date, ord, kind, title, is_red, is_bold FROM calendar_events ORDER BY date, ord'),
  sources: all('SELECT * FROM content_sources ORDER BY kind, id'),
};
fs.writeFileSync(path.join(out, 'core.json'), JSON.stringify(core));
const total = Object.values(bookSizes).reduce((a, b) => a + b, 0);
console.log(
  `web content ${WEB_CONTENT_VERSION}: core ${(fs.statSync(path.join(out, 'core.json')).size / 1e3).toFixed(0)} kB, Bible ${(total / 1e6).toFixed(1)} MB in ${books.length} files`,
);
