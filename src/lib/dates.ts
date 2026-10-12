// Local calendar-day arithmetic. A "date key" is the local civil date "YYYY-MM-DD";
// all day math goes through day numbers so it never depends on time zones or DST.

export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function localDateKey(date: Date = new Date()): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseKey(key: DateKey): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Days since 1970-01-01 for a civil (proleptic Gregorian) date. */
export function dayNumber(key: DateKey): number {
  const { y, m, d } = parseKey(key);
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function keyFromDayNumber(n: number): DateKey {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function addDays(key: DateKey, days: number): DateKey {
  return keyFromDayNumber(dayNumber(key) + days);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(key: DateKey): number {
  return (((dayNumber(key) + 4) % 7) + 7) % 7;
}

export function daysInMonth(y: number, m: number): number {
  return dayNumber(m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`) - dayNumber(`${y}-${pad(m)}-01`);
}

/**
 * Consecutive read days ending today, or ending yesterday when today is not read yet
 * (the streak is still alive until the day ends).
 */
export function computeStreak(readKeys: Iterable<DateKey>, today: DateKey): number {
  const days = new Set<number>();
  for (const k of readKeys) days.add(dayNumber(k));
  let cursor = dayNumber(today);
  if (!days.has(cursor)) cursor -= 1;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor--;
  }
  return streak;
}

export const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
export const WEEKDAYS = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota'];
export const WEEKDAYS_SHORT = ['ned', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub'];

/** "12. oktobar 2026." (Latin; convert with the UI script helper) */
export function formatLongDate(key: DateKey, withYear = true): string {
  const { y, m, d } = parseKey(key);
  return `${d}. ${MONTHS[m - 1]}${withYear ? ` ${y}.` : ''}`;
}
