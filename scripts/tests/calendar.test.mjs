import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { fastingForDay, gregorianFromJdn, isoFromJdn, jdnFromGregorian, jdnFromJulian, julianFromJdn, paschaJdn } from '../lib/church-calendar.mjs';
import { parseMenaion } from '../lib/menaion-wikitext.mjs';

const menaion = parseMenaion(fs.readFileSync(new URL('../../content/sources/calendar/sr-wikipedia-pravoslavni-liturgijski-kalendar.wikitext', import.meta.url), 'utf8'));
const isRedFixed = (jm, jd) => (menaion.get(`${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`)?.saints ?? []).some((s) => s.red);
const fastOn = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return fastingForDay({ jdn: jdnFromGregorian(y, m, d), pascha: paschaJdn(y), isRedFixed });
};

test('Orthodox Pascha dates', () => {
  const known = { 2024: '2024-05-05', 2025: '2025-04-20', 2026: '2026-04-12', 2027: '2027-05-02', 2028: '2028-04-16', 2029: '2029-04-08' };
  for (const [y, iso] of Object.entries(known)) assert.equal(isoFromJdn(paschaJdn(Number(y))), iso);
});

test('Julian ↔ Gregorian conversion uses the per-century difference', () => {
  assert.deepEqual(julianFromJdn(jdnFromGregorian(2026, 1, 7)), [2025, 12, 25]); // 13 days
  assert.deepEqual(gregorianFromJdn(jdnFromJulian(1899, 12, 25)), [1900, 1, 6]); // 12 days
  assert.deepEqual(gregorianFromJdn(jdnFromJulian(2100, 12, 25)), [2101, 1, 8]); // 14 days
  assert.deepEqual(julianFromJdn(jdnFromGregorian(2100, 3, 14)), [2100, 2, 29]); // Julian leap day in 2100
  for (let jdn = jdnFromGregorian(1990, 1, 1); jdn < jdnFromGregorian(2110, 1, 1); jdn += 17) {
    assert.equal(jdnFromGregorian(...gregorianFromJdn(jdn)), jdn);
    assert.equal(jdnFromJulian(...julianFromJdn(jdn)), jdn);
  }
});

test('fasting rules for 2026', () => {
  const cases = {
    '2026-01-07': 'none', // Christmas
    '2026-01-14': 'none', // Wednesday in the Christmas–Theophany fast-free days
    '2026-01-02': 'water', // Friday in the last week of the Christmas fast
    '2026-01-21': 'water', // ordinary Wednesday
    '2026-02-04': 'none', // Wednesday of the week after the Publican and the Pharisee
    '2026-02-18': 'dairy', // Cheesefare Wednesday
    '2026-02-23': 'water', // Clean Monday
    '2026-02-28': 'oil', // Lent Saturday
    '2026-04-05': 'fish', // Palm Sunday
    '2026-04-07': 'fish', // Annunciation in Lent
    '2026-04-10': 'water', // Great Friday
    '2026-04-15': 'none', // Bright Wednesday
    '2026-04-22': 'oil', // Wednesday after Thomas Sunday
    '2026-05-06': 'fish', // Mid-Pentecost
    '2026-06-03': 'none', // Wednesday of Pentecost week
    '2026-06-10': 'water', // Apostles' fast Wednesday
    '2026-06-13': 'fish', // Apostles' fast Saturday
    '2026-07-12': 'none', // Petrovdan on Sunday
    '2026-08-14': 'water', // Dormition fast Friday
    '2026-08-19': 'fish', // Transfiguration
    '2026-08-28': 'fish', // Dormition on Friday
    '2026-09-11': 'water', // Beheading of St John
    '2026-09-27': 'oil', // Exaltation of the Cross on Sunday
    '2026-11-28': 'fish', // Christmas fast Saturday
    '2026-12-02': 'water', // Christmas fast Wednesday
    '2026-12-04': 'fish', // Entry of the Theotokos
    '2026-12-19': 'fish', // St Nicholas
  };
  for (const [iso, type] of Object.entries(cases)) assert.equal(fastOn(iso).type, type, iso);
});

test('red-letter days parsed from the source table', () => {
  const red = [...menaion].filter(([, v]) => v.saints.some((s) => s.red)).map(([k]) => k);
  for (const k of ['12-25', '01-06', '01-14', '04-23', '06-15', '06-29', '08-15', '11-08', '12-06']) assert.ok(red.includes(k), k);
  assert.ok(!red.includes('01-05'));
  assert.equal(menaion.size, 365);
});

test('generated yearly packages are complete and versioned', () => {
  for (const year of [2026, 2027]) {
    const pkg = JSON.parse(fs.readFileSync(new URL(`../../content/calendar/${year}.json`, import.meta.url), 'utf8'));
    assert.equal(pkg.format, 1);
    assert.equal(pkg.year, year);
    assert.equal(pkg.days.length, 365);
    assert.equal(new Set(pkg.days.map((d) => d.date)).size, 365);
    assert.ok(pkg.days.every((d) => d.available && d.events.length > 0));
  }
});
