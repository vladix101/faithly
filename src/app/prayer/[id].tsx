import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, View } from 'react-native';

import { IconButton, Ornament, Screen, T } from '@/components/ui';
import { getPrayer, getPrayerParts } from '@/db/content';
import { isPrayerFavorite, togglePrayerFavorite } from '@/db/user';
import { useBooks, useLoader } from '@/hooks/use-content';
import { formatRef, shareMessage } from '@/lib/format';
import { useApp } from '@/state/app';
import { space } from '@/theme/tokens';

export default function PrayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { content, user, colors, ui, c, settings, update } = useApp();
  const books = useBooks();
  const [favorite, setFavorite] = useState(false);
  const [data] = useLoader(
    useCallback(async () => {
      const [prayer, parts] = await Promise.all([getPrayer(content, id), getPrayerParts(content, id)]);
      setFavorite(await isPrayerFavorite(user, id));
      return { prayer, parts };
    }, [content, user, id]),
  );

  const scale = settings.readingScale;
  const setScale = (delta: number) => update('readingScale', Math.round(Math.min(1.8, Math.max(0.8, scale + delta)) * 10) / 10);
  const refs =
    data?.parts.map((p) => {
      const b = books?.find((x) => x.id === p.bookId);
      return b ? c(formatRef(b.short_name, p.chapter, p.verseStart, p.verseEnd)) : '';
    }) ?? [];
  const fullText = data ? c(data.parts.flatMap((p) => p.verses.map((v) => v.text)).join(' ')) : '';

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="remove" label={ui('Smanji tekst')} onPress={() => setScale(-0.1)} />
              <IconButton icon="add" label={ui('Povećaj tekst')} onPress={() => setScale(0.1)} />
              <IconButton
                icon={favorite ? 'heart' : 'heart-outline'}
                active={favorite}
                label={ui(favorite ? 'Ukloni iz omiljenih' : 'Dodaj u omiljene')}
                onPress={async () => setFavorite(await togglePrayerFavorite(user, id))}
              />
              <IconButton
                icon="share-social-outline"
                label={ui('Podeli molitvu')}
                onPress={() => Share.share({ message: shareMessage(fullText, refs.join('; ')) }).catch(() => undefined)}
              />
            </View>
          ),
        }}
      />
      {data?.prayer ? (
        <>
          <T variant="heading" accessibilityRole="header">
            {c(data.prayer.title)}
          </T>
          {data.prayer.note ? (
            <T variant="small" muted style={{ marginTop: space.xs }}>
              {c(data.prayer.note)}
            </T>
          ) : null}
          <Ornament style={{ marginVertical: space.l }} />
          {data.parts.map((part, i) => (
            <View key={i} style={{ marginBottom: space.l }}>
              <T variant="reading" style={{ fontSize: 19 * scale, lineHeight: 19 * scale * 1.65 }}>
                {c(part.verses.map((v) => v.text).join(' '))}
              </T>
              <T variant="caption" color={colors.gold} style={{ marginTop: space.xs }}>
                {refs[i]}
              </T>
            </View>
          ))}
          <T variant="caption" muted>
            {ui('Izvor: Sveto pismo, prevod Daničić-Karadžić (javno vlasništvo).')}
          </T>
        </>
      ) : null}
    </Screen>
  );
}
