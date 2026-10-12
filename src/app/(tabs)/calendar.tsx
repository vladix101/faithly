import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FastBadge, FAST_DISCLAIMER } from '@/components/fast-badge';
import { Button, IconButton, Screen, T } from '@/components/ui';
import {
  getCalendarDay,
  getCalendarEvents,
  getCalendarRange,
  getCalendarYears,
  getSources,
  type CalendarDay,
  type FastType,
} from '@/db/content';
import { useLoader, useToday } from '@/hooks/use-content';
import { daysInMonth, formatLongDate, MONTHS, parseKey, weekday, WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/dates';
import { formatChurchDate } from '@/lib/format';
import { useApp } from '@/state/app';
import { fonts, radius, space } from '@/theme/tokens';

const pad = (n: number) => String(n).padStart(2, '0');
/** Monday-first week, as in Serbian calendars */
const COLUMNS = [1, 2, 3, 4, 5, 6, 0];

function FastMark({ type, color }: { type: FastType; color: string }) {
  if (type === 'none') return <View style={styles.markSpace} />;
  if (type === 'fish') return <Ionicons name="fish" size={10} color={color} />;
  if (type === 'water') return <View style={[styles.dot, { borderColor: color, borderWidth: 1.3 }]} />;
  if (type === 'dairy') return <View style={[styles.dot, { borderColor: color, borderWidth: 1.3, borderRadius: 1 }]} />;
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

export default function CalendarScreen() {
  const { content, colors, ui, c } = useApp();
  const today = useToday();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(() => {
    const { y, m } = parseKey(today);
    return { y, m };
  });

  const first = `${month.y}-${pad(month.m)}-01`;
  const count = daysInMonth(month.y, month.m);
  const last = `${month.y}-${pad(month.m)}-${pad(count)}`;
  const [monthDays] = useLoader(
    useCallback(async () => {
      const rows = await getCalendarRange(content, first, last);
      return new Map<string, CalendarDay>(rows.map((r) => [r.date, r]));
    }, [content, first, last]),
  );
  const [years] = useLoader(useCallback(() => getCalendarYears(content), [content]));
  const [detail] = useLoader(
    useCallback(async () => {
      const day = await getCalendarDay(content, selected);
      return { day, events: day ? await getCalendarEvents(content, selected) : [] };
    }, [content, selected]),
  );
  const [sources] = useLoader(useCallback(() => getSources(content), [content]));

  const shift = (delta: number) =>
    setMonth(({ y, m }) => {
      const idx = y * 12 + (m - 1) + delta;
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    });
  const goToday = () => {
    const { y, m } = parseKey(today);
    setMonth({ y, m });
    setSelected(today);
  };

  const lead = COLUMNS.indexOf(weekday(first));
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: count }, (_, i) => `${month.y}-${pad(month.m)}-${pad(i + 1)}`),
  ];
  while (cells.length % 7) cells.push(null);

  const range = years?.length ? `${years[0]}–${years[years.length - 1]}` : '';
  const d = detail?.day;
  const calendarSources = sources?.filter((s) => s.kind === 'calendar') ?? [];

  return (
    <Screen>
      <View style={styles.titleRow}>
        <T variant="display" accessibilityRole="header" style={{ flex: 1 }}>
          {ui('Kalendar')}
        </T>
        <Button label={ui('Danas')} kind="secondary" onPress={goToday} />
      </View>

      <View style={styles.monthRow}>
        <IconButton icon="chevron-back" label={ui('Prethodni mesec')} onPress={() => shift(-1)} />
        <T variant="title" style={{ flex: 1, textAlign: 'center', textTransform: 'capitalize' }} accessibilityLiveRegion="polite">
          {ui(`${MONTHS[month.m - 1]} ${month.y}.`)}
        </T>
        <IconButton icon="chevron-forward" label={ui('Sledeći mesec')} onPress={() => shift(1)} />
      </View>

      <View style={styles.week}>
        {COLUMNS.map((wd) => (
          <T key={wd} variant="caption" muted style={styles.weekday} color={wd === 0 ? colors.red : undefined}>
            {ui(WEEKDAYS_SHORT[wd])}
          </T>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((key, i) => {
          if (!key) return <View key={`e${i}`} style={styles.cell} />;
          const info = monthDays?.get(key);
          const isSelected = key === selected;
          const isToday = key === today;
          const sunday = weekday(key) === 0;
          const red = info?.is_red === 1;
          const dayNum = parseKey(key).d;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${ui(formatLongDate(key))}${red ? `, ${ui('crveno slovo')}` : ''}`}
              onPress={() => setSelected(key)}
              style={[
                styles.cell,
                isSelected && { backgroundColor: colors.ink },
                !isSelected && isToday && { borderColor: colors.gold, borderWidth: 1.5 },
              ]}>
              <T
                variant="body"
                style={{ fontFamily: red ? fonts.serifBold : fonts.serif, fontSize: 18, fontVariant: ['tabular-nums'] }}
                color={isSelected ? colors.bg : red ? colors.red : sunday ? colors.red : !info ? colors.inkMuted : colors.ink}>
                {dayNum}
              </T>
              {info?.available ? (
                <FastMark type={info.fast_type} color={isSelected ? colors.bg : colors.gold} />
              ) : (
                <View style={styles.markSpace} />
              )}
            </Pressable>
          );
        })}
      </View>

      <View
        style={styles.legend}
        accessible
        accessibilityLabel={ui('Legenda: kružić post na vodi, tačka post na ulju, riba, kvadrat bez mesa; crveni broj je crveno slovo.')}>
        {(['water', 'oil', 'fish', 'dairy'] as const).map((t) => (
          <View key={t} style={styles.legendItem}>
            <FastMark type={t} color={colors.gold} />
            <T variant="caption" muted>
              {ui({ water: 'voda', oil: 'ulje', fish: 'riba', dairy: 'bez mesa' }[t])}
            </T>
          </View>
        ))}
        <View style={styles.legendItem}>
          <T variant="caption" color={colors.red} style={{ fontFamily: fonts.sansBold }}>
            12
          </T>
          <T variant="caption" muted>
            {ui('crveno slovo')}
          </T>
        </View>
      </View>

      <View style={[styles.detail, { borderTopColor: colors.line }]}>
        <T variant="caption" muted style={{ textTransform: 'capitalize' }}>
          {ui(WEEKDAYS[weekday(selected)])}
        </T>
        <T variant="heading">{ui(formatLongDate(selected))}</T>
        {d ? (
          <T variant="small" muted>
            {ui(`Po crkvenom (julijanskom) kalendaru: ${formatChurchDate(d.julian_date)} ${parseKey(d.julian_date).y}.`)}
          </T>
        ) : null}

        {!d || !d.available ? (
          <T variant="body" muted style={{ marginTop: space.l }}>
            {ui('Podaci za ovaj datum nisu dostupni.')}
          </T>
        ) : (
          <>
            {d.folk ? (
              <T variant="label" color={d.is_red ? colors.red : colors.gold} style={{ marginTop: space.m }}>
                {c(d.folk)}
              </T>
            ) : null}
            <View style={{ marginTop: space.m, gap: space.s }}>
              {detail?.events.map((e, i) => (
                <T
                  key={i}
                  variant={e.is_red || e.is_bold || e.kind !== 'fixed' ? 'title' : 'body'}
                  color={e.is_red ? colors.red : undefined}
                  style={e.is_red || e.is_bold || e.kind !== 'fixed' ? { fontSize: 19 } : { fontFamily: fonts.serif }}>
                  {c(e.title)}
                </T>
              ))}
            </View>
            <View style={{ marginTop: space.l, gap: space.s }}>
              <FastBadge type={d.fast_type} name={d.fast_name} />
              <T variant="caption" muted>
                {ui(FAST_DISCLAIMER)}
              </T>
            </View>
          </>
        )}
      </View>

      <View style={[styles.sources, { backgroundColor: colors.sunk }]}>
        <T variant="caption" muted>
          {ui(`Podržane godine: ${range}. Faithly nije zvanična aplikacija Srpske pravoslavne crkve.`)}
        </T>
        {calendarSources.map((s) => (
          <T key={s.id} variant="caption" muted>
            {c(`${s.title} — ${s.author_publisher ?? ''}`)}
          </T>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.s },
  monthRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.m },
  week: { flexDirection: 'row', marginTop: space.s },
  weekday: { width: `${100 / 7}%`, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.m,
    gap: 2,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  markSpace: { height: 7 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.l, marginTop: space.m },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  detail: { marginTop: space.l, paddingTop: space.l, borderTopWidth: StyleSheet.hairlineWidth },
  sources: { marginTop: space.xl, padding: space.l, borderRadius: radius.m, gap: space.xs },
});
