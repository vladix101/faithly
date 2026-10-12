import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Empty, T } from '@/components/ui';
import { getBookAliases, searchVerses, type Verse } from '@/db/content';
import { useBooks } from '@/hooks/use-content';
import { formatRef } from '@/lib/format';
import { ftsQuery, parseReference, type BookAlias, type ParsedReference } from '@/lib/reference';
import { useApp } from '@/state/app';
import { fonts, radius, space } from '@/theme/tokens';

const LIMIT = 100;

export default function SearchScreen() {
  const { content, colors, ui, c } = useApp();
  const books = useBooks();
  const [query, setQuery] = useState('');
  const [aliases, setAliases] = useState<BookAlias[]>([]);
  const [results, setResults] = useState<(Verse & { book_short: string })[] | null>(null);
  const [reference, setReference] = useState<ParsedReference | null>(null);

  useEffect(() => {
    getBookAliases(content).then(setAliases);
  }, [content]);

  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      const ref = parseReference(query, aliases);
      const book = ref && books?.find((b) => b.id === ref.bookId);
      setReference(ref && book && (!ref.chapter || ref.chapter <= book.chapter_count) ? ref : null);
      const fts = ftsQuery(query);
      const rows = fts ? await searchVerses(content, fts, LIMIT).catch(() => []) : null;
      if (active) setResults(rows);
    }, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, aliases, books, content]);

  const refBook = reference && books?.find((b) => b.id === reference.bookId);
  const openReference = () => {
    if (!reference || !refBook) return;
    if (!reference.chapter) router.push({ pathname: '/book/[id]', params: { id: String(refBook.id) } });
    else
      router.push({
        pathname: '/read/[book]/[chapter]',
        params: {
          book: String(refBook.id),
          chapter: String(reference.chapter),
          ...(reference.verseStart ? { hl: `${reference.verseStart}-${reference.verseEnd}` } : {}),
        },
      });
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: space.l, paddingBottom: space.s }}>
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder={ui('Reč, izraz ili referenca (npr. Jn 3:16)')}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={ui('Pretraga Biblije')}
          returnKeyType="search"
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink }]}
        />
      </View>
      <FlatList
        data={results ?? []}
        keyExtractor={(v) => String(v.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <>
            {reference && refBook ? (
              <Pressable
                accessibilityRole="button"
                onPress={openReference}
                style={({ pressed }) => [styles.refHit, { backgroundColor: colors.goldSoft, opacity: pressed ? 0.7 : 1 }]}>
                <T variant="caption" muted>
                  {ui('Idi na')}
                </T>
                <T variant="title">
                  {c(
                    reference.chapter
                      ? formatRef(refBook.short_name, reference.chapter, reference.verseStart, reference.verseEnd)
                      : refBook.short_name,
                  )}
                </T>
              </Pressable>
            ) : null}
            {results && results.length >= LIMIT ? (
              <T variant="caption" muted style={{ marginBottom: space.s }}>
                {ui(`Prikazano je prvih ${LIMIT} rezultata. Suzite pretragu.`)}
              </T>
            ) : null}
          </>
        }
        ListEmptyComponent={
          results && !reference ? (
            <Empty icon="search-outline" text={ui('Nema stihova koji sadrže sve tražene reči.')} />
          ) : !query ? (
            <Empty icon="search-outline" text={ui('Pretraga radi na latinici i ćirilici, sa ili bez kvačica.')} />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/read/[book]/[chapter]',
                params: { book: String(item.book_id), chapter: String(item.chapter), hl: `${item.verse}-${item.verse}` },
              })
            }
            style={({ pressed }) => [styles.hit, { borderBottomColor: colors.line, opacity: pressed ? 0.6 : 1 }]}>
            <T variant="label" color={colors.gold}>
              {c(formatRef(item.book_short, item.chapter, item.verse))}
            </T>
            <T variant="body" style={{ fontFamily: fonts.serif }} numberOfLines={3}>
              {c(item.text)}
            </T>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 50,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.l,
    fontFamily: fonts.sans,
    fontSize: 17,
  },
  refHit: { padding: space.l, borderRadius: radius.m, marginBottom: space.l },
  hit: { paddingVertical: space.m, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
});
