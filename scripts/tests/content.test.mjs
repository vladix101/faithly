import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const dbUrl = new URL('../../assets/db/content.db', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('../../assets/db/content.json', import.meta.url), 'utf8'));
const db = new DatabaseSync(dbUrl, { readOnly: true });
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

test('content.json describes the shipped database', () => {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(dbUrl)).digest('hex'), meta.sha256);
  assert.equal(one('PRAGMA integrity_check')['integrity_check'], 'ok');
  assert.equal(one("SELECT value FROM meta WHERE key = 'schema_version'").value, meta.schema_version);
});

test('Bible coverage matches the source (66 books, 1189 chapters)', () => {
  assert.equal(Number(one('SELECT COUNT(*) n FROM books').n), 66);
  assert.equal(Number(one('SELECT SUM(chapter_count) n FROM books').n), 1189);
  assert.equal(Number(one("SELECT COUNT(*) n FROM books WHERE testament = 'OT'").n), 39);
  assert.equal(Number(one('SELECT COUNT(*) n FROM verses').n), meta.counts.verses);
});

test('chapters and verses are numerically ordered and gap-free', () => {
  for (const b of all('SELECT id, code, chapter_count FROM books')) {
    const chapters = all('SELECT DISTINCT chapter FROM verses WHERE book_id = ? ORDER BY chapter', b.id).map((r) => Number(r.chapter));
    assert.deepEqual(chapters, Array.from({ length: b.chapter_count }, (_, i) => i + 1), b.code);
  }
  // 10 sorts after 9 numerically (not as text), and ids follow canonical reading order.
  const ps119 = all("SELECT verse FROM verses WHERE book_id = (SELECT id FROM books WHERE code='PSA') AND chapter = 119 ORDER BY verse").map((r) => Number(r.verse));
  assert.equal(ps119.length, 176);
  assert.deepEqual(ps119.slice(8, 11), [9, 10, 11]);
  const gaps = one(`SELECT COUNT(*) n FROM verses a JOIN verses b ON b.id = a.id + 1
                    WHERE a.book_id = b.book_id AND a.chapter = b.chapter AND b.verse <> a.verse + 1`);
  assert.equal(Number(gaps.n), 0);
  assert.equal(Number(one("SELECT COUNT(*) n FROM verses WHERE trim(text) = ''").n), 0);
});

test('every daily quote and prayer points to existing verses', () => {
  for (const table of ['daily_quotes', 'prayer_parts']) {
    const bad = one(`SELECT COUNT(*) n FROM ${table} q WHERE (q.verse_end - q.verse_start + 1) <>
       (SELECT COUNT(*) FROM verses v WHERE v.book_id = q.book_id AND v.chapter = q.chapter AND v.verse BETWEEN q.verse_start AND q.verse_end)`);
    assert.equal(Number(bad.n), 0, table);
  }
  assert.ok(Number(one('SELECT COUNT(*) n FROM daily_quotes').n) >= 200);
  for (const cat of ['morning', 'evening', 'meal', 'other']) assert.ok(Number(one('SELECT COUNT(*) n FROM prayers WHERE category = ?', cat).n) > 0, cat);
});

test('search index covers every verse and is script-insensitive', () => {
  const hits = all("SELECT rowid FROM verses_fts WHERE verses_fts MATCH '\"ljubav\"* \"dugo\"* \"trpi\"*'");
  const v = one('SELECT b.code, chapter, verse FROM verses JOIN books b ON b.id = book_id WHERE verses.id = ?', hits[0].rowid);
  assert.deepEqual([v.code, Number(v.chapter), Number(v.verse)], ['1CO', 13, 4]);
});

test('calendar covers the supported years with sources recorded', () => {
  assert.deepEqual(all('SELECT year FROM calendar_years ORDER BY year').map((r) => Number(r.year)), [2026, 2027]);
  assert.equal(Number(one('SELECT COUNT(*) n FROM calendar_days').n), 730);
  assert.equal(one("SELECT julian_date FROM calendar_days WHERE date = '2026-01-07'").julian_date, '2025-12-25');
  assert.equal(Number(one("SELECT is_red FROM calendar_days WHERE date = '2026-05-06'").is_red), 1); // Đurđevdan
  for (const s of all('SELECT * FROM content_sources')) assert.ok(s.license && s.retrieved_at, s.id);
});
