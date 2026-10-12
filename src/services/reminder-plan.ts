// Pure planning of local reminders. The notification service turns this plan into
// scheduled notifications; keeping it pure makes cancel/reschedule behaviour testable.
import { addDays, type DateKey } from '@/lib/dates';
import type { CalendarDay, CalendarEvent } from '@/db/content';

export const DAILY_ID = 'faithly-daily';
export const FEAST_PREFIX = 'faithly-feast-';
export const FAST_PREFIX = 'faithly-fast-';
export const HORIZON_DAYS = 30;
/** Hour of the evening before a feast or fast at which the "tomorrow" reminder fires. */
export const EVE_HOUR = 18;

export const DAILY_TITLE = 'Faithly 🤍';
export const DAILY_BODY = 'Tvoj današnji biblijski citat je spreman.';

export interface ReminderSettings {
  dailyEnabled: boolean;
  hour: number;
  minute: number;
  feastsEnabled: boolean;
}

export type PlannedReminder =
  | { id: string; kind: 'daily'; hour: number; minute: number; title: string; body: string }
  | { id: string; kind: 'date'; fireAt: Date; title: string; body: string };

/** Multi-day fasts whose first day gets a reminder. */
const SEASON_FASTS = ['Божићни пост', 'Велики (Часни) пост', 'Петровски пост', 'Госпојински пост'];

function seasonOf(day: CalendarDay | undefined): string | null {
  const name = day?.fast_name ?? '';
  return SEASON_FASTS.find((s) => name.startsWith(s)) ?? null;
}

/**
 * @param days        calendar days covering [today - 1, today + HORIZON_DAYS]
 * @param redEvents   red-letter events of those days, most important first
 * @param toDisplay   converts stored Cyrillic text to the user's script
 * @param ui          converts app-authored Latin strings to the user's script
 */
export function planReminders(
  settings: ReminderSettings,
  today: DateKey,
  now: Date,
  days: CalendarDay[],
  redEvents: CalendarEvent[],
  toDisplay: (s: string) => string = (s) => s,
  ui: (s: string) => string = (s) => s,
): PlannedReminder[] {
  const plan: PlannedReminder[] = [];
  if (settings.dailyEnabled) {
    plan.push({ id: DAILY_ID, kind: 'daily', hour: settings.hour, minute: settings.minute, title: ui(DAILY_TITLE), body: ui(DAILY_BODY) });
  }
  if (!settings.feastsEnabled) return plan;

  const byDate = new Map(days.map((d) => [d.date, d]));
  const eventByDate = new Map<string, CalendarEvent>();
  for (const e of redEvents) if (!eventByDate.has(e.date)) eventByDate.set(e.date, e);
  for (let i = 1; i <= HORIZON_DAYS; i++) {
    const date = addDays(today, i);
    const day = byDate.get(date);
    if (!day || !day.available) continue; // only verified data
    const eve = addDays(date, -1);
    const [y, m, d] = eve.split('-').map(Number);
    const fireAt = new Date(y, m - 1, d, EVE_HOUR, 0, 0);
    if (fireAt.getTime() <= now.getTime()) continue;

    const event = eventByDate.get(date);
    if (event) {
      plan.push({ id: `${FEAST_PREFIX}${date}`, kind: 'date', fireAt, title: ui('Sutra je praznik'), body: toDisplay(event.title) });
    }
    const season = seasonOf(day);
    if (season && seasonOf(byDate.get(eve)) !== season) {
      plan.push({ id: `${FAST_PREFIX}${date}`, kind: 'date', fireAt, title: ui('Sutra počinje post'), body: toDisplay(season) });
    }
  }
  return plan;
}

export const isFaithlyReminder = (id: string) => id === DAILY_ID || id.startsWith(FEAST_PREFIX) || id.startsWith(FAST_PREFIX);
