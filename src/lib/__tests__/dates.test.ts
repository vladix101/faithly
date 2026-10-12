import { quoteIdForDate } from '../daily-quote';
import { addDays, computeStreak, dayNumber, daysInMonth, keyFromDayNumber, localDateKey, weekday } from '../dates';

describe('date keys', () => {
  it('round-trips day numbers across centuries', () => {
    for (const key of ['1900-03-01', '1999-12-31', '2000-02-29', '2026-10-12', '2100-02-28', '2100-03-01']) {
      expect(keyFromDayNumber(dayNumber(key))).toBe(key);
    }
    expect(dayNumber('1970-01-01')).toBe(0);
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('knows weekdays', () => {
    expect(weekday('2026-10-12')).toBe(1); // Monday
    expect(weekday('2026-04-12')).toBe(0); // Pascha, Sunday
  });

  it('uses the local calendar day, not UTC', () => {
    expect(localDateKey(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
    expect(localDateKey(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31');
  });
});

describe('reading streak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-10-10', '2026-10-11', '2026-10-12'], '2026-10-12')).toBe(3);
  });

  it('keeps yesterday’s streak alive until today ends', () => {
    expect(computeStreak(['2026-10-10', '2026-10-11'], '2026-10-12')).toBe(2);
    expect(computeStreak(['2026-10-09', '2026-10-10'], '2026-10-12')).toBe(0);
  });

  it('works across month and year boundaries', () => {
    expect(computeStreak(['2026-09-29', '2026-09-30', '2026-10-01'], '2026-10-01')).toBe(3);
    expect(computeStreak(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'], '2027-01-02')).toBe(4);
    expect(computeStreak(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01')).toBe(3);
  });

  it('is not inflated by duplicate marks on the same day', () => {
    expect(computeStreak(['2026-10-12', '2026-10-12', '2026-10-12'], '2026-10-12')).toBe(1);
  });
});

describe('daily quote', () => {
  it('is stable for a day and changes the next day', () => {
    const a = quoteIdForDate('2026-10-12', 232);
    expect(quoteIdForDate('2026-10-12', 232)).toBe(a);
    expect(quoteIdForDate('2026-10-13', 232)).not.toBe(a);
  });

  it('stays within 1..N, also across year boundaries and before the epoch', () => {
    for (const key of ['1999-12-31', '2000-01-01', '2026-12-31', '2027-01-01', '2100-03-01']) {
      const id = quoteIdForDate(key, 232);
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(232);
    }
    expect(quoteIdForDate('2000-01-01', 10)).toBe(1);
    expect(quoteIdForDate('2000-01-11', 10)).toBe(1);
    expect(quoteIdForDate('1999-12-31', 10)).toBe(10);
  });

  it('advances by exactly one per day, including over 31 December', () => {
    const dec31 = quoteIdForDate('2026-12-31', 232);
    expect(quoteIdForDate('2027-01-01', 232)).toBe((dec31 % 232) + 1);
  });
});
