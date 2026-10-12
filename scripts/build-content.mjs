#!/usr/bin/env node
// Builds the read-only content database shipped inside the APK: assets/db/content.db
//
//   node scripts/build-content.mjs                       # default sources
//   node scripts/build-content.mjs --bible <usfm-dir> --bible-source <source-id>
//
// Any legally obtained USFM text (e.g. a complete Orthodox edition with the
// deuterocanonical books) can be imported with --bible, as long as content/data/sources.json
// has a matching source record. User data lives in a separate database and is never touched.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { parseUsfmBook } from './lib/usfm.mjs';
import { normalizeForSearch } from '../src/lib/text/translit.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

export const CONTENT_SCHEMA_VERSION = 1;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const bibleDir = path.resolve(root, arg('--bible', 'content/sources/bible/srp1868'));
const bibleSource = arg('--bible-source', 'bible-srp1868');
const out = path.resolve(root, arg('--out', 'assets/db/content.db'));

// Canonical book order (USFM codes) with testament. Deuterocanonical codes are accepted
// so that a fuller Orthodox edition can be imported without code changes.
export const CANON = [
  ['GEN', 'OT'],
  ['EXO', 'OT'],
  ['LEV', 'OT'],
  ['NUM', 'OT'],
  ['DEU', 'OT'],
  ['JOS', 'OT'],
  ['JDG', 'OT'],
  ['RUT', 'OT'],
  ['1SA', 'OT'],
  ['2SA', 'OT'],
  ['1KI', 'OT'],
  ['2KI', 'OT'],
  ['1CH', 'OT'],
  ['2CH', 'OT'],
  ['EZR', 'OT'],
  ['NEH', 'OT'],
  ['1ES', 'OT'],
  ['TOB', 'OT'],
  ['JDT', 'OT'],
  ['EST', 'OT'],
  ['ESG', 'OT'],
  ['1MA', 'OT'],
  ['2MA', 'OT'],
  ['3MA', 'OT'],
  ['JOB', 'OT'],
  ['PSA', 'OT'],
  ['PS2', 'OT'],
  ['PRO', 'OT'],
  ['ECC', 'OT'],
  ['SNG', 'OT'],
  ['WIS', 'OT'],
  ['SIR', 'OT'],
  ['ISA', 'OT'],
  ['JER', 'OT'],
  ['LAM', 'OT'],
  ['BAR', 'OT'],
  ['LJE', 'OT'],
  ['EZK', 'OT'],
  ['DAN', 'OT'],
  ['DAG', 'OT'],
  ['HOS', 'OT'],
  ['JOL', 'OT'],
  ['AMO', 'OT'],
  ['OBA', 'OT'],
  ['JON', 'OT'],
  ['MIC', 'OT'],
  ['NAM', 'OT'],
  ['HAB', 'OT'],
  ['ZEP', 'OT'],
  ['HAG', 'OT'],
  ['ZEC', 'OT'],
  ['MAL', 'OT'],
  ['2ES', 'OT'],
  ['4MA', 'OT'],
  ['MAN', 'OT'],
  ['MAT', 'NT'],
  ['MRK', 'NT'],
  ['LUK', 'NT'],
  ['JHN', 'NT'],
  ['ACT', 'NT'],
  ['JAS', 'NT'],
  ['1PE', 'NT'],
  ['2PE', 'NT'],
  ['1JN', 'NT'],
  ['2JN', 'NT'],
  ['3JN', 'NT'],
  ['JUD', 'NT'],
  ['ROM', 'NT'],
  ['1CO', 'NT'],
  ['2CO', 'NT'],
  ['GAL', 'NT'],
  ['EPH', 'NT'],
  ['PHP', 'NT'],
  ['COL', 'NT'],
  ['1TH', 'NT'],
  ['2TH', 'NT'],
  ['1TI', 'NT'],
  ['2TI', 'NT'],
  ['TIT', 'NT'],
  ['PHM', 'NT'],
  ['HEB', 'NT'],
  ['REV', 'NT'],
];
const CANON_INDEX = new Map(CANON.map(([code], i) => [code, i + 1]));

const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE content_sources (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, edition TEXT, author_publisher TEXT,
  url TEXT, license TEXT NOT NULL, retrieved_at TEXT NOT NULL, coverage TEXT, notes TEXT);
CREATE TABLE translations (id TEXT PRIMARY KEY, name TEXT NOT NULL, language TEXT NOT NULL, script TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES content_sources(id));
CREATE TABLE books (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, translation_id TEXT NOT NULL REFERENCES translations(id),
  testament TEXT NOT NULL CHECK (testament IN ('OT','NT')), name TEXT NOT NULL, short_name TEXT NOT NULL,
  abbr TEXT NOT NULL, chapter_count INTEGER NOT NULL);
CREATE TABLE book_aliases (book_id INTEGER NOT NULL REFERENCES books(id), norm TEXT NOT NULL);
CREATE INDEX book_aliases_norm ON book_aliases(norm);
CREATE TABLE verses (
  id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES books(id), chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL, text TEXT NOT NULL, UNIQUE (book_id, chapter, verse));
CREATE TABLE headings (book_id INTEGER NOT NULL, chapter INTEGER NOT NULL, before_verse INTEGER NOT NULL,
  kind TEXT NOT NULL, text TEXT NOT NULL);
CREATE INDEX headings_chapter ON headings(book_id, chapter);
CREATE VIRTUAL TABLE verses_fts USING fts5(norm, content='', tokenize='unicode61');
CREATE TABLE daily_quotes (id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES books(id),
  chapter INTEGER NOT NULL, verse_start INTEGER NOT NULL, verse_end INTEGER NOT NULL);
CREATE TABLE prayers (id TEXT PRIMARY KEY, category TEXT NOT NULL, sort INTEGER NOT NULL, title TEXT NOT NULL,
  note TEXT, norm TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES content_sources(id));
CREATE TABLE prayer_parts (prayer_id TEXT NOT NULL REFERENCES prayers(id), ord INTEGER NOT NULL,
  book_id INTEGER NOT NULL, chapter INTEGER NOT NULL, verse_start INTEGER NOT NULL, verse_end INTEGER NOT NULL,
  PRIMARY KEY (prayer_id, ord));
CREATE TABLE calendar_years (year INTEGER PRIMARY KEY, version TEXT NOT NULL, format INTEGER NOT NULL, pascha TEXT NOT NULL);
CREATE TABLE calendar_days (
  date TEXT PRIMARY KEY, year INTEGER NOT NULL, julian_date TEXT NOT NULL, weekday INTEGER NOT NULL,
  available INTEGER NOT NULL, is_red INTEGER NOT NULL,
  fast_type TEXT NOT NULL CHECK (fast_type IN ('none','water','oil','fish','dairy')), fast_name TEXT, folk TEXT);
CREATE TABLE calendar_events (id INTEGER PRIMARY KEY, date TEXT NOT NULL REFERENCES calendar_days(date),
  ord INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, is_red INTEGER NOT NULL, is_bold INTEGER NOT NULL);
CREATE INDEX calendar_events_date ON calendar_events(date, ord);
`;

/** "JHN 3:16" | "MAT 6:9-13" → {code, chapter, start, end} */
export function parseRef(ref) {
  const m = ref.trim().match(/^([1-4]?[A-Z]{2,3}|PS2)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) throw new Error(`Bad reference "${ref}"`);
  return { code: m[1], chapter: +m[2], start: +m[3], end: m[4] ? +m[4] : +m[3] };
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function build() {
  const sources = readJson('content/data/sources.json');
  const sourceIds = new Set(sources.map((s) => s.id));
  if (!sourceIds.has(bibleSource)) throw new Error(`Unknown --bible-source ${bibleSource}; add it to content/data/sources.json`);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = out + '.tmp';
  fs.rmSync(tmp, { force: true });
  const db = new DatabaseSync(tmp);
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
  db.exec(SCHEMA);
  db.exec('BEGIN');

  const insSource = db.prepare('INSERT INTO content_sources VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const s of sources)
    insSource.run(
      s.id,
      s.kind,
      s.title,
      s.edition ?? null,
      s.author_publisher ?? null,
      s.url ?? null,
      s.license,
      s.retrieved_at,
      s.coverage ?? null,
      s.notes ?? null,
    );
  const translationId = bibleSource.replace(/^bible-/, '');
  db.prepare('INSERT INTO translations VALUES (?,?,?,?,?)').run(
    translationId,
    sources.find((s) => s.id === bibleSource).title,
    'sr',
    'Cyrl',
    bibleSource,
  );

  // --- Bible ---
  const aliases = readJson('content/data/book-aliases.json');
  const files = fs.readdirSync(bibleDir).filter((f) => f.toLowerCase().endsWith('.usfm') || f.toLowerCase().endsWith('.sfm'));
  const books = files.map((f) => parseUsfmBook(fs.readFileSync(path.join(bibleDir, f), 'utf8'))).filter((b) => CANON_INDEX.has(b.code));
  books.sort((a, b) => CANON_INDEX.get(a.code) - CANON_INDEX.get(b.code));
  const insBook = db.prepare('INSERT INTO books VALUES (?,?,?,?,?,?,?,?)');
  const insAlias = db.prepare('INSERT INTO book_aliases VALUES (?,?)');
  const insVerse = db.prepare('INSERT INTO verses VALUES (?,?,?,?,?)');
  const insFts = db.prepare('INSERT INTO verses_fts (rowid, norm) VALUES (?,?)');
  const insHeading = db.prepare('INSERT INTO headings VALUES (?,?,?,?,?)');
  const bookIdByCode = new Map();
  const problems = [];
  let verseId = 0;
  for (const b of books) {
    const id = CANON_INDEX.get(b.code);
    bookIdByCode.set(b.code, id);
    const chapters = [...new Set(b.verses.map((v) => v.chapter))];
    // Integrity: chapters 1..n, verses 1..n in each chapter, no duplicates, no empty text.
    chapters.forEach((c, i) => {
      if (c !== i + 1) problems.push(`${b.code}: chapter ${c} at position ${i + 1}`);
    });
    for (const c of chapters) {
      const vs = b.verses.filter((v) => v.chapter === c).map((v) => v.verse);
      vs.forEach((v, i) => {
        if (v !== i + 1) problems.push(`${b.code} ${c}: verse ${v} at position ${i + 1}`);
      });
    }
    for (const v of b.verses) if (!v.text) problems.push(`${b.code} ${v.chapter}:${v.verse} empty`);
    const testament = CANON.find(([code]) => code === b.code)[1];
    const shortName = aliases[b.code]?.[0] ?? b.shortName;
    insBook.run(id, b.code, translationId, testament, b.name, shortName, b.abbr || shortName, chapters.length);
    const names = new Set([b.name, b.shortName, b.abbr, ...(aliases[b.code] ?? [])].filter(Boolean).map(normalizeForSearch));
    for (const n of names) insAlias.run(id, n);
    for (const v of b.verses) {
      verseId++;
      insVerse.run(verseId, id, v.chapter, v.verse, v.text);
      insFts.run(verseId, normalizeForSearch(v.text));
    }
    for (const h of b.headings) insHeading.run(id, h.chapter, h.beforeVerse, h.kind, h.text);
  }
  if (problems.length) throw new Error('Bible integrity problems:\n' + problems.slice(0, 50).join('\n'));

  const verseExists = db.prepare('SELECT COUNT(*) AS n FROM verses WHERE book_id = ? AND chapter = ? AND verse BETWEEN ? AND ?');
  const resolve = (ref) => {
    const r = parseRef(ref);
    const bookId = bookIdByCode.get(r.code);
    if (!bookId) throw new Error(`Reference ${ref}: book ${r.code} not in imported Bible`);
    if (r.end < r.start) throw new Error(`Reference ${ref}: bad range`);
    const n = Number(verseExists.get(bookId, r.chapter, r.start, r.end).n);
    if (n !== r.end - r.start + 1) throw new Error(`Reference ${ref}: verses missing in Bible`);
    return { ...r, bookId };
  };

  // --- Daily quotes (references only) ---
  const quotes = readJson('content/data/daily-quotes.json').quotes;
  const seen = new Set();
  const insQuote = db.prepare('INSERT INTO daily_quotes VALUES (?,?,?,?,?)');
  quotes.forEach((ref, i) => {
    if (seen.has(ref)) throw new Error(`Duplicate daily quote ${ref}`);
    seen.add(ref);
    const r = resolve(ref);
    insQuote.run(i + 1, r.bookId, r.chapter, r.start, r.end);
  });

  // --- Prayers (composed only of Bible references) ---
  const prayers = readJson('content/data/prayers.json').prayers;
  const insPrayer = db.prepare('INSERT INTO prayers VALUES (?,?,?,?,?,?,?)');
  const insPart = db.prepare('INSERT INTO prayer_parts VALUES (?,?,?,?,?,?)');
  const versesText = db.prepare('SELECT text FROM verses WHERE book_id = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse');
  prayers.forEach((p, i) => {
    if (!sourceIds.has(p.source)) throw new Error(`Prayer ${p.id}: unknown source ${p.source}`);
    const parts = p.parts.map(resolve);
    const body = parts.flatMap((r) => versesText.all(r.bookId, r.chapter, r.start, r.end).map((x) => x.text)).join(' ');
    insPrayer.run(p.id, p.category, i + 1, p.title, p.note ?? null, normalizeForSearch(`${p.title} ${body}`), p.source);
    parts.forEach((r, ord) => insPart.run(p.id, ord, r.bookId, r.chapter, r.start, r.end));
  });

  // --- Calendar packages ---
  const calDir = path.join(root, 'content/calendar');
  const insYear = db.prepare('INSERT INTO calendar_years VALUES (?,?,?,?)');
  const insDay = db.prepare('INSERT INTO calendar_days VALUES (?,?,?,?,?,?,?,?,?)');
  const insEvent = db.prepare('INSERT INTO calendar_events (date, ord, kind, title, is_red, is_bold) VALUES (?,?,?,?,?,?)');
  const years = [];
  for (const f of fs
    .readdirSync(calDir)
    .filter((x) => /^\d{4}\.json$/.test(x))
    .sort()) {
    const pkgCal = JSON.parse(fs.readFileSync(path.join(calDir, f), 'utf8'));
    if (pkgCal.format !== 1) throw new Error(`${f}: unsupported calendar package format ${pkgCal.format}`);
    const expected = (Date.UTC(pkgCal.year + 1, 0, 1) - Date.UTC(pkgCal.year, 0, 1)) / 86400000;
    if (pkgCal.days.length !== expected) throw new Error(`${f}: expected ${expected} days, got ${pkgCal.days.length}`);
    insYear.run(pkgCal.year, pkgCal.version, pkgCal.format, pkgCal.pascha);
    years.push(pkgCal.year);
    for (const d of pkgCal.days) {
      insDay.run(
        d.date,
        pkgCal.year,
        d.julian,
        d.weekday,
        d.available ? 1 : 0,
        d.red ? 1 : 0,
        d.fast.type,
        d.fast.name,
        d.folk.join(', ') || null,
      );
      d.events.forEach((e, ord) => insEvent.run(d.date, ord, e.kind, e.title, e.red ? 1 : 0, e.bold ? 1 : 0));
    }
  }

  const counts = {
    books: Number(db.prepare('SELECT COUNT(*) n FROM books').get().n),
    chapters: Number(db.prepare('SELECT SUM(chapter_count) n FROM books').get().n),
    verses: Number(db.prepare('SELECT COUNT(*) n FROM verses').get().n),
    daily_quotes: quotes.length,
    prayers: prayers.length,
    calendar_days: Number(db.prepare('SELECT COUNT(*) n FROM calendar_days').get().n),
  };
  // The content version follows the app version; bump it whenever the asset changes.
  const meta = {
    schema_version: String(CONTENT_SCHEMA_VERSION),
    content_version: pkg.version,
    built_at: new Date().toISOString(),
    bible_source: bibleSource,
    bible_books: books.map((b) => b.code).join(','),
    calendar_years: years.join(','),
    counts: JSON.stringify(counts),
  };
  const insMeta = db.prepare('INSERT INTO meta VALUES (?,?)');
  for (const [k, v] of Object.entries(meta)) insMeta.run(k, v);
  db.exec('COMMIT');
  db.exec("INSERT INTO verses_fts(verses_fts) VALUES('optimize')");
  const check = db.prepare('PRAGMA integrity_check').get();
  if (Object.values(check)[0] !== 'ok') throw new Error('SQLite integrity_check failed');
  db.exec('VACUUM');
  db.close();
  fs.renameSync(tmp, out);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
  fs.writeFileSync(out.replace(/\.db$/, '.json'), JSON.stringify({ ...meta, counts, sha256: sha }, null, 2) + '\n');
  console.log(`content.db written (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`, counts, `calendar ${years.join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) build();
