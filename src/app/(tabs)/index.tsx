import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { FastBadge, FAST_DISCLAIMER } from '@/components/fast-badge';
import { Button, IconButton, Ornament, Screen, T } from '@/components/ui';
import { getCalendarDay, getCalendarEvents, getQuote, getQuoteCount, getVerses } from '@/db/content';
import { getReadDays, isVerseFavorite, markDayRead, toggleVerseFavorite } from '@/db/user';
import { useBooks, useLoader, useToday } from '@/hooks/use-content';
import { quoteIdForDate } from '@/lib/daily-quote';
import { computeStreak, formatLongDate, weekday, WEEKDAYS } from '@/lib/dates';
import { formatChurchDate, formatRef, shareMessage } from '@/lib/format';
import { useApp } from '@/state/app';
import { fonts, radius, space } from '@/theme/tokens';

function daysLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 === 1 && mod100 !== 11 ? 'dan' : 'dana';
}

export default function TodayScreen() {
  const { content, user, colors, ui, c, settings } = useApp();
  const today = useToday();
  const books = useBooks();

  const [quote] = useLoader(
    useCallback(async () => {
      const count = await getQuoteCount(content);
      const range = await getQuote(content, quoteIdForDate(today, count));
      if (!range) return null;
      return { range, verses: await getVerses(content, range) };
    }, [content, today]),
  );

  const [day] = useLoader(
    useCallback(async () => {
      const d = await getCalendarDay(content, today);
      return { day: d, events: d ? await getCalendarEvents(content, today) : [] };
    }, [content, today]),
  );

  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [state, reload] = useLoader(
    useCallback(async () => {
      const days = await getReadDays(user);
      const fav = quote ? await isVerseFavorite(user, quote.range) : false;
      setFavorite(fav);
      return { readToday: days.includes(today), streak: computeStreak(days, today) };
    }, [user, today, quote]),
  );

  const book = quote && books?.find((b) => b.id === quote.range.bookId);
  const reference = quote && book ? c(formatRef(book.short_name, quote.range.chapter, quote.range.verseStart, quote.range.verseEnd)) : '';
  const text = quote ? c(quote.verses.map((v) => v.text).join(' ')) : '';
  const [initial, rest] = [text.slice(0, 1), text.slice(1)];

  const weekdayName = WEEKDAYS[weekday(today)];
  const mainEvents = day?.events.filter((e) => e.is_red || e.is_bold || e.kind !== 'fixed').slice(0, 3) ?? [];
  const firstSaint = day?.events.find((e) => e.kind === 'fixed');
  const shownEvents = mainEvents.length ? mainEvents : firstSaint ? [firstSaint] : [];

  const openInBible = () => {
    if (!quote) return;
    const r = quote.range;
    router.push({
      pathname: '/read/[book]/[chapter]',
      params: { book: String(r.bookId), chapter: String(r.chapter), hl: `${r.verseStart}-${r.verseEnd}` },
    });
  };
  const share = () => {
    if (quote) Share.share({ message: shareMessage(text, reference) }).catch(() => undefined);
  };
  const toggleFavorite = async () => {
    if (quote) setFavorite(await toggleVerseFavorite(user, quote.range));
  };
  const markRead = async () => {
    await markDayRead(user, today);
    reload();
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T variant="caption" muted style={{ textTransform: 'capitalize' }}>
            {ui(weekdayName)}
          </T>
          <T variant="heading" accessibilityRole="header">
            {ui(formatLongDate(today))}
          </T>
          {day?.day ? (
            <T variant="small" muted>
              {ui(`${formatChurchDate(day.day.julian_date)} po crkvenom kalendaru`)}
            </T>
          ) : null}
        </View>
        <IconButton icon="settings-outline" label={ui('Podešavanja')} onPress={() => router.push('/settings')} />
      </View>

      <View style={[styles.page, { backgroundColor: colors.surface, borderColor: colors.goldSoft }]}>
        <View style={[styles.pageInner, { borderColor: colors.line }]}>
          <T variant="label" color={colors.gold}>
            {ui('Reč za danas')}
          </T>
          {quote ? (
            <T
              variant="reading"
              accessibilityLabel={`${text}. ${reference}`}
              style={{ fontSize: 21 * settings.readingScale, lineHeight: 21 * settings.readingScale * 1.55, marginTop: space.m }}>
              <T
                variant="reading"
                color={colors.gold}
                style={{
                  fontFamily: fonts.serifBold,
                  fontSize: 44 * settings.readingScale,
                  lineHeight: 21 * settings.readingScale * 1.55,
                }}>
                {initial}
              </T>
              {rest}
            </T>
          ) : (
            <T variant="body" muted style={{ marginTop: space.m }}>
              …
            </T>
          )}
          <Ornament style={{ marginTop: space.l, marginBottom: space.s }} />
          <T variant="label" muted style={{ textAlign: 'right' }}>
            {reference}
          </T>
        </View>
      </View>

      <View style={styles.actions}>
        <Button label={ui('Pročitaj u Bibliji')} icon="book-outline" onPress={openInBible} style={{ flex: 1 }} />
        <IconButton
          icon={favorite ? 'heart' : 'heart-outline'}
          label={ui(favorite ? 'Ukloni iz omiljenih' : 'Dodaj u omiljene')}
          active={!!favorite}
          onPress={toggleFavorite}
        />
        <IconButton icon="share-social-outline" label={ui('Podeli citat')} onPress={share} />
      </View>

      <View style={[styles.streak, { borderColor: colors.line }]}>
        <View style={{ flex: 1 }}>
          <T variant="title">{state ? `${state.streak} ${ui(daysLabel(state.streak))}` : ' '}</T>
          <T variant="small" muted>
            {ui('zaredom pročitan citat dana')}
          </T>
        </View>
        {state?.readToday ? (
          <View style={styles.readDone} accessible accessibilityLabel={ui('Danas je pročitano')}>
            <Ionicons name="checkmark-circle" size={22} color={colors.gold} />
            <T variant="label" color={colors.gold}>
              {ui('Pročitano')}
            </T>
          </View>
        ) : (
          <Button label={ui('Pročitano')} icon="checkmark" kind="secondary" onPress={markRead} />
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ui('Otvori kalendar')}
        onPress={() => router.navigate('/calendar')}
        style={({ pressed }) => [styles.feast, { borderColor: colors.line, opacity: pressed ? 0.7 : 1 }]}>
        <T variant="label" muted>
          {ui('Danas se praznuje')}
        </T>
        {day && !day.day?.available ? (
          <T variant="body" muted>
            {ui('Podaci za ovaj datum nisu dostupni.')}
          </T>
        ) : (
          shownEvents.map((e, i) => (
            <T key={i} variant={i === 0 ? 'title' : 'body'} color={e.is_red ? colors.red : undefined}>
              {c(e.title)}
            </T>
          ))
        )}
        {day?.day?.folk ? (
          <T variant="small" muted>
            {c(day.day.folk)}
          </T>
        ) : null}
        {day?.day?.available ? (
          <View style={{ marginTop: space.s, gap: space.xs }}>
            <FastBadge type={day.day.fast_type} name={day.day.fast_name} />
            {day.day.fast_type !== 'none' ? (
              <T variant="caption" muted>
                {ui(FAST_DISCLAIMER)}
              </T>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.s, marginBottom: space.l },
  page: { borderWidth: 1, borderRadius: radius.m, padding: 5 },
  pageInner: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.m - 4, paddingHorizontal: space.l, paddingVertical: space.xl },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.l },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    marginTop: space.xl,
    paddingTop: space.l,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  readDone: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 48, paddingHorizontal: space.s },
  feast: { marginTop: space.xl, paddingTop: space.l, borderTopWidth: StyleSheet.hairlineWidth, gap: space.xs },
});
