import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Empty, Row, Screen, SectionTitle, T } from '@/components/ui';
import { getPrayers, searchPrayers, type Prayer } from '@/db/content';
import { useLoader } from '@/hooks/use-content';
import { normalizeForSearch } from '@/lib/text/translit';
import { useApp } from '@/state/app';
import { fonts, radius, space } from '@/theme/tokens';

const CATEGORIES: { id: Prayer['category']; title: string }[] = [
  { id: 'morning', title: 'Jutarnje' },
  { id: 'evening', title: 'Večernje' },
  { id: 'meal', title: 'Pre i posle jela' },
  { id: 'other', title: 'Ostale molitve' },
];

export default function PrayersScreen() {
  const { content, colors, ui, c } = useApp();
  const [query, setQuery] = useState('');
  const norm = normalizeForSearch(query);
  const [prayers] = useLoader(useCallback(() => (norm ? searchPrayers(content, norm) : getPrayers(content)), [content, norm]));

  return (
    <Screen>
      <T variant="display" accessibilityRole="header" style={{ marginTop: space.s }}>
        {ui('Molitve')}
      </T>
      <T variant="small" muted style={{ marginTop: space.xs }}>
        {ui('Molitve iz Svetog pisma, u prevodu Daničić-Karadžić.')}
      </T>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={ui('Pretraži molitve')}
        placeholderTextColor={colors.inkMuted}
        accessibilityLabel={ui('Pretraži molitve')}
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink }]}
      />
      {prayers && !prayers.length ? <Empty icon="search-outline" text={ui('Nijedna molitva ne sadrži tražene reči.')} /> : null}
      {CATEGORIES.map((cat) => {
        const items = prayers?.filter((p) => p.category === cat.id) ?? [];
        if (!items.length) return null;
        return (
          <View key={cat.id}>
            <SectionTitle>{ui(cat.title)}</SectionTitle>
            {items.map((p) => (
              <Row
                key={p.id}
                title={c(p.title)}
                subtitle={p.note ? c(p.note) : undefined}
                onPress={() => router.push({ pathname: '/prayer/[id]', params: { id: p.id } })}
              />
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    marginTop: space.l,
    minHeight: 50,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.l,
    fontFamily: fonts.sans,
    fontSize: 17,
  },
});
