import { MONTHS, parseKey } from './dates';

/** "Јован 3:16", "Псалми 23:1–3" (book name in stored script) */
export function formatRef(bookName: string, chapter: number, verseStart?: number | null, verseEnd?: number | null): string {
  if (!verseStart) return `${bookName} ${chapter}`;
  return verseEnd && verseEnd !== verseStart ? `${bookName} ${chapter}:${verseStart}–${verseEnd}` : `${bookName} ${chapter}:${verseStart}`;
}

/** Church (Julian) date, e.g. "29. septembar" */
export function formatChurchDate(julianKey: string): string {
  const { m, d } = parseKey(julianKey);
  return `${d}. ${MONTHS[m - 1]}`;
}

export const TRANSLATION_LABEL = 'Daničić-Karadžić';

export function shareMessage(text: string, reference: string): string {
  return `„${text}”\n— ${reference} (${TRANSLATION_LABEL})\n\nFaithly`;
}
