import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen, T } from '@/components/ui';
import { useBook } from '@/hooks/use-content';
import { useApp } from '@/state/app';
import { radius, space } from '@/theme/tokens';

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, ui, c } = useApp();
  const book = useBook(Number(id));
  const chapters = book ? Array.from({ length: book.chapter_count }, (_, i) => i + 1) : [];

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: book ? c(book.short_name) : '' }} />
      {book ? (
        <T variant="small" muted style={{ marginBottom: space.l }}>
          {c(book.name)}
        </T>
      ) : null}
      <T variant="label" muted style={{ marginBottom: space.s }}>
        {ui(book?.code === 'PSA' ? 'Psalmi' : 'Glave')}
      </T>
      <View style={styles.grid}>
        {chapters.map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={ui(`${book?.code === 'PSA' ? 'Psalam' : 'Glava'} ${n}`)}
            onPress={() => router.push({ pathname: '/read/[book]/[chapter]', params: { book: id, chapter: String(n) } })}
            style={({ pressed }) => [
              styles.cell,
              { backgroundColor: colors.surface, borderColor: colors.line, opacity: pressed ? 0.6 : 1 },
            ]}>
            <T variant="body" style={{ fontVariant: ['tabular-nums'] }}>
              {n}
            </T>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  cell: {
    width: 56,
    height: 52,
    borderRadius: radius.s,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
