import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Empty, IconButton, Screen, Segmented, T } from '@/components/ui';
import { getPrayer, getVerses } from '@/db/content';
import { deleteFavorite, getFavorites, getNotes } from '@/db/user';
import { useBooks, useLoader } from '@/hooks/use-content';
import { formatRef } from '@/lib/format';
import { useApp } from '@/state/app';
import { fonts, space } from '@/theme/tokens';

type Tab = 'verses' | 'prayers' | 'notes';

export default function FavoritesScreen() {
  const { content, user, colors, ui, c } = useApp();
  const books = useBooks();
  const [tab, setTab] = useState<Tab>('verses');
  const bookName = (id: number | null) => books?.find((b) => b.id === id)?.short_name ?? '';

  const [data, reload] = useLoader(
    useCallback(async () => {
      const favorites = await getFavorites(user);
      const verses = await Promise.all(
        favorites
          .filter((f) => f.kind === 'verse' && f.book_id && f.chapter && f.verse_start)
          .map(async (f) => ({
            fav: f,
            text: (
              await getVerses(content, {
                bookId: f.book_id!,
                chapter: f.chapter!,
                verseStart: f.verse_start!,
                verseEnd: f.verse_end ?? f.verse_start!,
              })
            )
              .map((v) => v.text)
              .join(' '),
          })),
      );
      const prayers = (
        await Promise.all(
          favorites
            .filter((f) => f.kind === 'prayer' && f.prayer_id)
            .map(async (f) => ({ fav: f, prayer: await getPrayer(content, f.prayer_id!) })),
        )
      ).filter((p) => p.prayer);
      const notes = await getNotes(user);
      return { verses, prayers, notes };
    }, [content, user]),
  );

  const remove = async (id: number) => {
    await deleteFavorite(user, id);
    reload();
  };

  return (
    <Screen>
      <T variant="display" accessibilityRole="header" style={{ marginTop: space.s, marginBottom: space.l }}>
        {ui('Omiljeni')}
      </T>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'verses', label: ui('Stihovi') },
          { value: 'prayers', label: ui('Molitve') },
          { value: 'notes', label: ui('Beleške') },
        ]}
      />
      <View style={{ marginTop: space.m }}>
        {tab === 'verses' &&
          (data?.verses.length ? (
            data.verses.map(({ fav, text }) => (
              <View key={fav.id} style={[styles.item, { borderBottomColor: colors.line }]}>
                <Pressable
                  accessibilityRole="button"
                  style={{ flex: 1 }}
                  onPress={() =>
                    router.push({
                      pathname: '/read/[book]/[chapter]',
                      params: { book: String(fav.book_id), chapter: String(fav.chapter), hl: `${fav.verse_start}-${fav.verse_end}` },
                    })
                  }>
                  <T variant="label" color={colors.gold}>
                    {c(formatRef(bookName(fav.book_id), fav.chapter!, fav.verse_start, fav.verse_end))}
                  </T>
                  <T variant="body" style={{ fontFamily: fonts.serif }}>
                    {c(text)}
                  </T>
                </Pressable>
                <IconButton icon="heart-dislike-outline" label={ui('Ukloni iz omiljenih')} onPress={() => remove(fav.id)} />
              </View>
            ))
          ) : (
            <Empty icon="heart-outline" text={ui('Dodirnite stih u Bibliji ili srce uz citat dana da ga sačuvate ovde.')} />
          ))}
        {tab === 'prayers' &&
          (data?.prayers.length ? (
            data.prayers.map(({ fav, prayer }) => (
              <View key={fav.id} style={[styles.item, { borderBottomColor: colors.line }]}>
                <Pressable
                  accessibilityRole="button"
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/prayer/[id]', params: { id: prayer!.id } })}>
                  <T variant="body">{c(prayer!.title)}</T>
                </Pressable>
                <IconButton icon="heart-dislike-outline" label={ui('Ukloni iz omiljenih')} onPress={() => remove(fav.id)} />
              </View>
            ))
          ) : (
            <Empty icon="flame-outline" text={ui('Otvorite molitvu i dodirnite srce da je sačuvate ovde.')} />
          ))}
        {tab === 'notes' &&
          (data?.notes.length ? (
            data.notes.map((n) => (
              <Pressable
                key={`${n.book_id}-${n.chapter}-${n.verse}`}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/note/[book]/[chapter]/[verse]',
                    params: { book: String(n.book_id), chapter: String(n.chapter), verse: String(n.verse) },
                  })
                }
                style={[styles.item, { borderBottomColor: colors.line, flexDirection: 'column', alignItems: 'stretch' }]}>
                <T variant="label" color={colors.gold}>
                  {c(formatRef(bookName(n.book_id), n.chapter, n.verse))}
                </T>
                <T variant="body">{n.text}</T>
              </Pressable>
            ))
          ) : (
            <Empty icon="create-outline" text={ui('Dodirnite stih u Bibliji i izaberite belešku.')} />
          ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.m, borderBottomWidth: StyleSheet.hairlineWidth, gap: space.s },
});
