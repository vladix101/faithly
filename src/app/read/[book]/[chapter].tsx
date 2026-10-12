import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, View, type ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, IconButton, T } from '@/components/ui';
import { getChapter, getHeadings, type Heading, type Verse } from '@/db/content';
import { getFavoriteVerseKeys, getNotedVerses, saveReadingPosition, toggleVerseFavorite } from '@/db/user';
import { useBooks, useLoader } from '@/hooks/use-content';
import { formatRef, shareMessage } from '@/lib/format';
import { useApp } from '@/state/app';
import { fonts, radius, space } from '@/theme/tokens';

type Item = { kind: 'heading'; key: string; heading: Heading } | { kind: 'verse'; key: string; verse: Verse };

export default function ReaderScreen() {
  const params = useLocalSearchParams<{ book: string; chapter: string; hl?: string; at?: string }>();
  const bookId = Number(params.book);
  const chapter = Number(params.chapter);
  const { content, user, colors, ui, c, settings, update } = useApp();
  const books = useBooks();
  const book = books?.find((b) => b.id === bookId);
  const [hlStart, hlEnd] = (params.hl ?? '').split('-').map(Number);
  const [selected, setSelected] = useState<number | null>(null);
  const list = useRef<FlatList<Item>>(null);

  const [data] = useLoader(
    useCallback(async () => {
      const [verses, headings] = await Promise.all([getChapter(content, bookId, chapter), getHeadings(content, bookId, chapter)]);
      const items: Item[] = [];
      for (const v of verses) {
        headings
          .filter((h) => h.before_verse === v.verse)
          .forEach((h, i) => items.push({ kind: 'heading', key: `h${v.verse}-${i}`, heading: h }));
        items.push({ kind: 'verse', key: `v${v.verse}`, verse: v });
      }
      return { items, verses };
    }, [content, bookId, chapter]),
  );

  const [marks, reloadMarks] = useLoader(
    useCallback(async () => {
      const [favorites, notes] = await Promise.all([getFavoriteVerseKeys(user, bookId, chapter), getNotedVerses(user, bookId, chapter)]);
      return { favorites, notes };
    }, [user, bookId, chapter]),
  );

  // Remember the reading position (chapter opened, then the first visible verse).
  const lastSaved = useRef(0);
  useEffect(() => {
    saveReadingPosition(user, { book_id: bookId, chapter, verse: Number(params.at ?? hlStart) || 1 }).catch(() => undefined);
  }, [user, bookId, chapter, params.at, hlStart]);
  // FlatList does not allow changing this callback, so it is created once.
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ViewToken<Item>[] }) => {
    const first = viewableItems.find((t) => t.item.kind === 'verse')?.item;
    if (first?.kind !== 'verse' || first.verse.verse === lastSaved.current) return;
    lastSaved.current = first.verse.verse;
    saveReadingPosition(user, { book_id: first.verse.book_id, chapter: first.verse.chapter, verse: first.verse.verse }).catch(
      () => undefined,
    );
  });

  // Scroll to the highlighted (or remembered) verse once loaded.
  const target = Number(params.at ?? hlStart) || 0;
  useEffect(() => {
    if (!data || target <= 1) return;
    const index = data.items.findIndex((i) => i.kind === 'verse' && i.verse.verse === target);
    if (index > 0) setTimeout(() => list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.1 }), 50);
  }, [data, target]);

  const neighbours = useMemo(() => {
    if (!books || !book) return { prev: null, next: null };
    const i = books.findIndex((b) => b.id === book.id);
    const prev =
      chapter > 1 ? { book: book.id, chapter: chapter - 1 } : i > 0 ? { book: books[i - 1].id, chapter: books[i - 1].chapter_count } : null;
    const next =
      chapter < book.chapter_count
        ? { book: book.id, chapter: chapter + 1 }
        : i < books.length - 1
          ? { book: books[i + 1].id, chapter: 1 }
          : null;
    return { prev, next };
  }, [books, book, chapter]);

  const go = (to: { book: number; chapter: number } | null) => {
    if (to) router.replace({ pathname: '/read/[book]/[chapter]', params: { book: String(to.book), chapter: String(to.chapter) } });
  };

  const scale = settings.readingScale;
  const setScale = (delta: number) => update('readingScale', Math.round(Math.min(1.8, Math.max(0.8, scale + delta)) * 10) / 10);

  const selectedVerse = data?.verses.find((v) => v.verse === selected);
  const refOf = (v: Verse) => (book ? c(formatRef(book.short_name, v.chapter, v.verse)) : '');

  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      if (item.kind === 'heading') {
        return (
          <T
            variant={item.heading.kind === 'title' ? 'small' : 'label'}
            muted={item.heading.kind === 'title'}
            style={[styles.heading, item.heading.kind === 'section' && { color: colors.gold }]}>
            {c(item.heading.text)}
          </T>
        );
      }
      const v = item.verse;
      const highlighted = v.verse >= hlStart && v.verse <= (hlEnd || hlStart);
      const isSelected = selected === v.verse;
      const fav = marks?.favorites.has(v.verse);
      const noted = marks?.notes.has(v.verse);
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${ui('Stih')} ${v.verse}. ${c(v.text)}`}
          accessibilityHint={ui('Otvara radnje za stih')}
          accessibilityState={{ selected: isSelected }}
          onPress={() => setSelected(isSelected ? null : v.verse)}
          style={[styles.verse, (highlighted || isSelected) && { backgroundColor: isSelected ? colors.sunk : colors.goldSoft }]}>
          <T variant="reading" style={{ fontSize: 19 * scale, lineHeight: 19 * scale * 1.6 }}>
            <T variant="caption" color={colors.gold} style={{ fontFamily: fonts.sansBold, fontSize: 12.5 * scale }}>
              {v.verse}{' '}
            </T>
            {c(v.text)}
            {fav ? <T color={colors.gold}> ♥</T> : null}
            {noted ? <T color={colors.gold}> ✎</T> : null}
          </T>
        </Pressable>
      );
    },
    [c, ui, colors, hlStart, hlEnd, selected, marks, scale],
  );

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          title: book ? c(formatRef(book.short_name, chapter)) : '',
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="remove" label={ui('Smanji tekst')} onPress={() => setScale(-0.1)} />
              <IconButton icon="add" label={ui('Povećaj tekst')} onPress={() => setScale(0.1)} />
            </View>
          ),
        }}
      />
      <FlatList
        ref={list}
        data={data?.items ?? []}
        keyExtractor={(i) => i.key}
        renderItem={renderItem}
        extraData={[selected, marks, scale, settings.script]}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onScrollToIndexFailed={(info) => {
          // Rows have variable height: jump close by estimate, then retry once after layout.
          list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          setTimeout(() => list.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.1 }), 250);
        }}
        contentContainerStyle={{ paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: space.xl }}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button
              label={ui('Prethodna')}
              icon="chevron-back"
              kind="secondary"
              disabled={!neighbours.prev}
              onPress={() => go(neighbours.prev)}
              style={{ flex: 1 }}
            />
            <Button
              label={ui('Sledeća')}
              icon="chevron-forward"
              kind="secondary"
              disabled={!neighbours.next}
              onPress={() => go(neighbours.next)}
              style={{ flex: 1 }}
            />
          </View>
        }
      />
      {selectedVerse ? (
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <T variant="label" style={{ flex: 1 }} numberOfLines={1}>
            {refOf(selectedVerse)}
          </T>
          <IconButton
            icon={marks?.favorites.has(selectedVerse.verse) ? 'heart' : 'heart-outline'}
            active={marks?.favorites.has(selectedVerse.verse)}
            label={ui('Omiljeni stih')}
            onPress={async () => {
              await toggleVerseFavorite(user, { bookId, chapter, verseStart: selectedVerse.verse, verseEnd: selectedVerse.verse });
              reloadMarks();
            }}
          />
          <IconButton
            icon="create-outline"
            label={ui('Beleška uz stih')}
            onPress={() =>
              router.push({
                pathname: '/note/[book]/[chapter]/[verse]',
                params: { book: String(bookId), chapter: String(chapter), verse: String(selectedVerse.verse) },
              })
            }
          />
          <IconButton
            icon="share-social-outline"
            label={ui('Podeli stih')}
            onPress={() => Share.share({ message: shareMessage(c(selectedVerse.text), refOf(selectedVerse)) }).catch(() => undefined)}
          />
          <IconButton icon="close" label={ui('Zatvori')} onPress={() => setSelected(null)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: space.l, marginBottom: space.xs, paddingHorizontal: space.s },
  verse: { paddingVertical: 3, paddingHorizontal: space.s, borderRadius: radius.s },
  footer: { flexDirection: 'row', gap: space.m, marginTop: space.xl },
  sheet: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.l,
    paddingRight: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 60,
  },
});
