#!/usr/bin/env node
// Generates versioned yearly calendar packages: content/calendar/<year>.json
//   node scripts/generate-calendar.mjs 2026 2027
// Inputs: the fixed-feast table from sr.wikipedia (saved wikitext, see content/sources/calendar),
// the Julian Paschalion for movable feasts, and the fasting rule in scripts/lib/church-calendar.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FAST,
  MOVABLE,
  fastingForDay,
  isoFromJdn,
  isoFromParts,
  jdnFromGregorian,
  julianFromJdn,
  mitrovdanMemorialJdn,
  paschaJdn,
  weekdayFromJdn,
} from './lib/church-calendar.mjs';
import { parseMenaion } from './lib/menaion-wikitext.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKITEXT = path.join(root, 'content/sources/calendar/sr-wikipedia-pravoslavni-liturgijski-kalendar.wikitext');
export const PACKAGE_FORMAT = 1;

export function buildYear(year, menaion) {
  const pascha = paschaJdn(year);
  const movableByJdn = new Map(MOVABLE.map((f) => [pascha + f.offset, f]));
  const isRedFixed = (jm, jd) =>
    (menaion.get(`${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`)?.saints ?? []).some((s) => s.red);
  const memorials = new Set([mitrovdanMemorialJdn(year)]);

  const days = [];
  const start = jdnFromGregorian(year, 1, 1);
  const end = jdnFromGregorian(year + 1, 1, 1);
  for (let jdn = start; jdn < end; jdn++) {
    const [jy, jm, jd] = julianFromJdn(jdn);
    const entry = menaion.get(`${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`);
    const events = [];
    const movable = movableByJdn.get(jdn);
    if (movable) events.push({ kind: movable.kind ?? 'movable', title: movable.title, red: !!movable.red, bold: !!movable.major });
    if (memorials.has(jdn)) events.push({ kind: 'memorial', title: 'Митровске задушнице', red: false, bold: false });
    const fixed = (entry?.saints ?? []).map((s) => ({ kind: 'fixed', title: s.title, red: s.red, bold: s.bold }));
    const rank = (e) => (e.red ? 0 : e.bold ? 1 : 2);
    events.push(
      ...fixed
        .map((e, i) => ({ e, i }))
        .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
        .map((x) => x.e),
    );
    const fast = fastingForDay({ jdn, pascha, isRedFixed });
    days.push({
      date: isoFromJdn(jdn),
      julian: isoFromParts(jy, jm, jd),
      weekday: weekdayFromJdn(jdn),
      available: !!entry,
      red: events.some((e) => e.red),
      fast: { type: fast.type, name: fast.name },
      folk: entry?.folk ?? [],
      events,
    });
  }
  return { format: PACKAGE_FORMAT, year, version: `${year}.1`, pascha: isoFromJdn(pascha), days };
}

function main() {
  const years = process.argv.slice(2).map(Number).filter(Boolean);
  if (!years.length) throw new Error('Usage: node scripts/generate-calendar.mjs <year> [year...]');
  const menaion = parseMenaion(fs.readFileSync(WIKITEXT, 'utf8'));
  for (const year of years) {
    const pkg = buildYear(year, menaion);
    const missing = pkg.days.filter((d) => !d.available).map((d) => d.date);
    const counts = Object.fromEntries(Object.values(FAST).map((t) => [t, pkg.days.filter((d) => d.fast.type === t).length]));
    const file = path.join(root, 'content/calendar', `${year}.json`);
    fs.writeFileSync(file, JSON.stringify(pkg, null, 1) + '\n');
    console.log(
      `${year}: Pascha ${pkg.pascha}, ${pkg.days.length} days, missing ${missing.length}`,
      counts,
      '→',
      path.relative(root, file),
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
