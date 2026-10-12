import type { CalendarDay, CalendarEvent } from '@/db/content';

import { applyPlan } from '../notifications';
import { DAILY_ID, planReminders, type ReminderSettings } from '../reminder-plan';

// In-memory fake of the scheduler, so tests see what is actually left scheduled.
const mockStore = new Map<string, unknown>();
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { DEFAULT: 3 },
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockStore.keys()].map((identifier) => ({ identifier }))),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => void mockStore.delete(id)),
  scheduleNotificationAsync: jest.fn(async (req: { identifier: string; trigger: unknown }) => {
    mockStore.set(req.identifier, req.trigger);
    return req.identifier;
  }),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  setNotificationChannelAsync: jest.fn(async () => null),
}));

const settings = (over: Partial<ReminderSettings> = {}): ReminderSettings => ({ dailyEnabled: true, hour: 9, minute: 0, feastsEnabled: false, ...over });

const day = (date: string, over: Partial<CalendarDay> = {}): CalendarDay => ({
  date,
  year: Number(date.slice(0, 4)),
  julian_date: date,
  weekday: 0,
  available: 1,
  is_red: 0,
  fast_type: 'none',
  fast_name: null,
  folk: null,
  ...over,
});

describe('planReminders', () => {
  const now = new Date(2026, 10, 20, 10, 0); // 20 Nov 2026, 10:00

  it('plans one daily reminder at the chosen time, or none when off', () => {
    expect(planReminders(settings({ hour: 7, minute: 30 }), '2026-11-20', now, [], [])).toEqual([
      expect.objectContaining({ id: DAILY_ID, kind: 'daily', hour: 7, minute: 30, title: 'Faithly 🤍', body: 'Tvoj današnji biblijski citat je spreman.' }),
    ]);
    expect(planReminders(settings({ dailyEnabled: false }), '2026-11-20', now, [], [])).toEqual([]);
  });

  it('adds eve-of reminders for red-letter feasts and the first day of a fast, within the horizon', () => {
    const days = [
      day('2026-11-20'),
      day('2026-11-21', { is_red: 1 }),
      day('2026-11-27'),
      day('2026-11-28', { fast_type: 'fish', fast_name: 'Божићни пост' }),
      day('2026-11-29', { fast_type: 'fish', fast_name: 'Божићни пост' }),
      day('2027-01-07', { is_red: 1 }), // beyond the 30-day horizon
    ];
    const events: CalendarEvent[] = [
      { date: '2026-11-21', ord: 0, kind: 'fixed', title: 'Сабор светог Архангела Михаила', is_red: 1, is_bold: 0 },
      { date: '2027-01-07', ord: 0, kind: 'fixed', title: 'Рождество Христово', is_red: 1, is_bold: 0 },
    ];
    const plan = planReminders(settings({ dailyEnabled: false, feastsEnabled: true }), '2026-11-20', now, days, events);
    expect(plan.map((p) => p.id)).toEqual(['faithly-feast-2026-11-21', 'faithly-fast-2026-11-28']);
    const feast = plan[0];
    expect(feast.kind === 'date' && feast.fireAt).toEqual(new Date(2026, 10, 20, 18, 0, 0));
    expect(feast.body).toBe('Сабор светог Архангела Михаила');
  });

  it('skips days without verified data and eves already in the past', () => {
    const late = new Date(2026, 10, 20, 19, 0);
    const days = [day('2026-11-21', { is_red: 1 }), day('2026-11-22', { is_red: 1, available: 0 })];
    const events: CalendarEvent[] = [
      { date: '2026-11-21', ord: 0, kind: 'fixed', title: 'A', is_red: 1, is_bold: 0 },
      { date: '2026-11-22', ord: 0, kind: 'fixed', title: 'B', is_red: 1, is_bold: 0 },
    ];
    expect(planReminders(settings({ dailyEnabled: false, feastsEnabled: true }), '2026-11-20', late, days, events)).toEqual([]);
  });
});

describe('applyPlan', () => {
  beforeEach(() => mockStore.clear());

  it('replaces the old schedule when the time changes, without duplicates', async () => {
    await applyPlan(planReminders(settings({ hour: 9 }), '2026-11-20', new Date(), [], []));
    await applyPlan(planReminders(settings({ hour: 9 }), '2026-11-20', new Date(), [], []));
    expect([...mockStore.keys()]).toEqual([DAILY_ID]);
    await applyPlan(planReminders(settings({ hour: 21, minute: 15 }), '2026-11-20', new Date(), [], []));
    expect(mockStore.size).toBe(1);
    expect(mockStore.get(DAILY_ID)).toEqual(expect.objectContaining({ type: 'daily', hour: 21, minute: 15 }));
  });

  it('cancels Faithly reminders when turned off but leaves others alone', async () => {
    mockStore.set('someone-else', {});
    await applyPlan(planReminders(settings(), '2026-11-20', new Date(), [], []));
    mockStore.set('faithly-feast-2026-11-21', {});
    await applyPlan(planReminders(settings({ dailyEnabled: false }), '2026-11-20', new Date(), [], []));
    expect([...mockStore.keys()]).toEqual(['someone-else']);
  });
});
