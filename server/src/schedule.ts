// Time-zone aware daily scheduling with Intl only (full ICU is available in Workers and Node).

export interface LocalParts {
  date: string; // YYYY-MM-DD
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function localParts(utcMs: number, timeZone: string): LocalParts {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  return { y, m, d, hour: Number(parts.hour) % 24, minute: Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Offset of the zone from UTC at an instant, in ms (Europe/Belgrade: +1 h in winter, +2 h in summer). */
function offsetAt(utcMs: number, timeZone: string): number {
  const p = localParts(utcMs, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute) - Math.floor(utcMs / 60000) * 60000;
}

/**
 * UTC instant of a local wall-clock time. A time skipped by a DST change (e.g. 02:30 on the
 * spring-forward night) maps to the moment after the gap; a repeated time maps to its first occurrence.
 */
export function zonedTimeToUtc(y: number, m: number, d: number, hour: number, minute: number, timeZone: string): number {
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  // The offsets in force half a day before and after cover both sides of any DST change.
  const candidates = [...new Set([wall - offsetAt(wall - 43_200_000, timeZone), wall - offsetAt(wall + 43_200_000, timeZone)])];
  const valid = candidates.filter((t) => {
    const p = localParts(t, timeZone);
    return p.hour === hour && p.minute === minute && p.d === d;
  });
  return valid.length ? Math.min(...valid) : Math.max(...candidates);
}

function addDays(y: number, m: number, d: number, days: number): [number, number, number] {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

/**
 * Next time the daily reminder is due, strictly after `nowMs`, skipping the local day
 * `lastSentDate` so the same day is never sent twice (also across time-zone changes).
 */
export function nextSendAt(nowMs: number, hour: number, minute: number, timeZone: string, lastSentDate: string | null): number {
  const today = localParts(nowMs, timeZone);
  for (let i = 0; i < 3; i++) {
    const [y, m, d] = addDays(today.y, today.m, today.d, i);
    const at = zonedTimeToUtc(y, m, d, hour, minute, timeZone);
    const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (at > nowMs && date !== lastSentDate) return at;
  }
  throw new Error('unreachable');
}
