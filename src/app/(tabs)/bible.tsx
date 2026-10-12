import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton, Segmented, T } from '@/components/ui';
import { getReadingPosition } from '@/db/user';
import { useBooks, useLoader } from '@/hooks/use-content';
import { formatRef } from '@/lib/format';
import { useApp } from '@/state/app';
import { radius, space } from '@/theme/tokens';

export default function BibleScreen() {
  const { user, colors, ui, c } = useApp();
  const books = useBooks();
  const [testament, setTestament] = useState<'OT' | 'NT'>('OT');
  const [position] = useLoader(useCallback(() => getReadingPosition(user), [user]));
  const lastBook = position ? books?.find((b) => b.id === position.book_id) : undefined;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={books?.filter((b) => b.testament === testament) ?? []}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ gap: space.l, marginBottom: space.m }}>
            <View style={styles.titleRow}>
              <T variant="display" accessibilityRole="header" style={{ flex: 1 }}>
                {ui('Biblija')}
              </T>
              <IconButton icon="search-outline" label={ui('Pretraga Biblije')} onPress={() => router.push('/search')} />
            </View>
            {position && lastBook ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ui(`Nastavi čitanje: ${c(formatRef(lastBook.short_name, position.chapter))}`)}
                onPress={() =>
                  router.push({
                    pathname: '/read/[book]/[chapter]',
                    params: { book: String(position.book_id), chapter: String(position.chapter), at: String(position.verse) },
                  })
                }
                style={({ pressed }) => [styles.resume, { backgroundColor: colors.goldSoft, opacity: pressed ? 0.75 : 1 }]}>
                <Ionicons name="bookmark" size={22} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <T variant="caption" muted>
                    {ui('Nastavi čitanje')}
                  </T>
                  <T variant="title">{c(formatRef(lastBook.short_name, position.chapter))}</T>
                </View>
                <Ionicons name="arrow-forward" size={20} color={colors.ink} />
              </Pressable>
            ) : null}
            <Segmented
              value={testament}
              onChange={setTestament}
              options={[
                { value: 'OT', label: ui('Stari zavet') },
                { value: 'NT', label: ui('Novi zavet') },
              ]}
            />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={c(item.name)}
            onPress={() => router.push({ pathname: '/book/[id]', params: { id: String(item.id) } })}
            style={({ pressed }) => [styles.book, { borderBottomColor: colors.line, opacity: pressed ? 0.6 : 1 }]}>
            <View style={{ flex: 1 }}>
              <T variant="body" style={{ fontSize: 18 }}>
                {c(item.short_name)}
              </T>
              {item.name !== item.short_name ? (
                <T variant="caption" muted numberOfLines={1}>
                  {c(item.name)}
                </T>
              ) : null}
            </View>
            <T variant="caption" muted>
              {item.chapter_count}
            </T>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.s },
  resume: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l, borderRadius: radius.m },
  book: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: space.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.m,
  },
});
