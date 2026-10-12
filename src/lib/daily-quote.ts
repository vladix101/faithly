import { dayNumber, type DateKey } from './dates';

const EPOCH = dayNumber('2000-01-01');

/**
 * Deterministic 1-based quote id for a local calendar day: the same all day,
 * the next one the next day, cycling through the editorial list.
 */
export function quoteIdForDate(key: DateKey, quoteCount: number): number {
  if (quoteCount <= 0) throw new Error('No daily quotes');
  const n = dayNumber(key) - EPOCH;
  return (((n % quoteCount) + quoteCount) % quoteCount) + 1;
}
