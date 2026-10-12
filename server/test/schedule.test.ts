import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isValidTimeZone, localParts, nextSendAt, zonedTimeToUtc } from '../src/schedule.ts';

const iso = (ms: number) => new Date(ms).toISOString();
const BG = 'Europe/Belgrade';

test('Belgrade winter (UTC+1) and summer (UTC+2) time', () => {
  assert.equal(iso(zonedTimeToUtc(2026, 1, 15, 9, 0, BG)), '2026-01-15T08:00:00.000Z');
  assert.equal(iso(zonedTimeToUtc(2026, 7, 15, 9, 0, BG)), '2026-07-15T07:00:00.000Z');
});

test('DST change days in Belgrade (29 Mar and 25 Oct 2026)', () => {
  // 09:00 is unaffected on both days
  assert.equal(iso(zonedTimeToUtc(2026, 3, 29, 9, 0, BG)), '2026-03-29T07:00:00.000Z');
  assert.equal(iso(zonedTimeToUtc(2026, 10, 25, 9, 0, BG)), '2026-10-25T08:00:00.000Z');
  // 02:30 does not exist on 29 Mar: it moves to just after the gap (03:30 local = 01:30 UTC)
  assert.equal(iso(zonedTimeToUtc(2026, 3, 29, 2, 30, BG)), '2026-03-29T01:30:00.000Z');
  // 02:30 happens twice on 25 Oct: the first one (still summer time) is used
  assert.equal(iso(zonedTimeToUtc(2026, 10, 25, 2, 30, BG)), '2026-10-25T00:30:00.000Z');
});

test('next reminder: today if still ahead, otherwise tomorrow, across the DST switch', () => {
  const before = Date.parse('2026-03-28T07:30:00Z'); // 08:30 in Belgrade (winter)
  assert.equal(iso(nextSendAt(before, 9, 0, BG, null)), '2026-03-28T08:00:00.000Z');
  const after = Date.parse('2026-03-28T08:30:00Z'); // 09:30 local
  assert.equal(iso(nextSendAt(after, 9, 0, BG, null)), '2026-03-29T07:00:00.000Z'); // summer time next day
  // Month and year boundaries
  assert.equal(iso(nextSendAt(Date.parse('2026-12-31T20:00:00Z'), 9, 0, BG, null)), '2027-01-01T08:00:00.000Z');
});

test('the same local day is never scheduled twice', () => {
  const now = Date.parse('2026-10-12T05:00:00Z'); // 07:00 local, 09:00 still ahead
  assert.equal(iso(nextSendAt(now, 9, 0, BG, '2026-10-12')), '2026-10-13T07:00:00.000Z');
  // Changing the time to later today after today's reminder was sent also waits for tomorrow
  assert.equal(iso(nextSendAt(Date.parse('2026-10-12T08:00:00Z'), 20, 0, BG, '2026-10-12')), '2026-10-13T18:00:00.000Z');
});

test('other zones and zone changes', () => {
  const now = Date.parse('2026-10-12T10:00:00Z');
  assert.equal(iso(nextSendAt(now, 9, 0, 'America/New_York', null)), '2026-10-12T13:00:00.000Z');
  assert.equal(iso(nextSendAt(now, 9, 0, 'Asia/Tokyo', null)), '2026-10-13T00:00:00.000Z');
  assert.equal(iso(nextSendAt(now, 9, 0, 'UTC', null)), '2026-10-13T09:00:00.000Z');
  assert.equal(localParts(Date.parse('2026-10-12T22:30:00Z'), BG).date, '2026-10-13');
});

test('time zone validation', () => {
  assert.ok(isValidTimeZone('Europe/Belgrade'));
  assert.ok(!isValidTimeZone('Mars/Olympus'));
  assert.ok(!isValidTimeZone(''));
  assert.ok(!isValidTimeZone(42));
  assert.ok(!isValidTimeZone('x'.repeat(100)));
});
