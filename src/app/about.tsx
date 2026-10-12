import Constants from 'expo-constants';
import { useCallback } from 'react';
import { Linking, Platform, View } from 'react-native';

import { Ornament, Screen, SectionTitle, T } from '@/components/ui';
import { getMeta, getSources } from '@/db/content';
import { useLoader } from '@/hooks/use-content';
import { useApp } from '@/state/app';
import { radius, space } from '@/theme/tokens';

export default function AboutScreen() {
  const { content, colors, ui, c } = useApp();
  const [data] = useLoader(useCallback(async () => ({ meta: await getMeta(content), sources: await getSources(content) }), [content]));
  const counts = data ? (JSON.parse(data.meta.counts ?? '{}') as Record<string, number>) : null;

  return (
    <Screen edges={['bottom']}>
      <T variant="display" style={{ marginTop: space.s }}>
        Faithly
      </T>
      <T variant="body" muted>
        {ui(`Verzija ${Constants.expoConfig?.version ?? ''}, sadržaj ${data?.meta.content_version ?? ''}`)}
      </T>
      <Ornament style={{ marginVertical: space.l }} />

      <View style={{ backgroundColor: colors.goldSoft, borderRadius: radius.m, padding: space.l, gap: space.s }}>
        <T variant="body">{ui('Faithly nije zvanična aplikacija Srpske pravoslavne crkve i ne koristi njena zvanična obeležja.')}</T>
        <T variant="small" muted>
          {ui(
            Platform.OS === 'web'
              ? 'Nema naloga, analitike ni oglasa. Omiljeni stihovi, beleške i istorija čitanja čuvaju se samo u ovom pregledaču. Ako uključiš podsetnik, Faithly server čuva samo adresu za notifikacije, izabrano vreme i vremensku zonu; isključivanjem podsetnika ti podaci se brišu.'
              : 'Sav sadržaj je u aplikaciji. Nema naloga, analitike ni oglasa; omiljeni stihovi, beleške i istorija čitanja ostaju samo na ovom telefonu.',
          )}
        </T>
      </View>

      <SectionTitle>{ui('Obuhvat sadržaja')}</SectionTitle>
      {counts ? (
        <T variant="body">
          {ui(
            `Biblija: ${counts.books} knjiga, ${counts.chapters} glava, ${counts.verses} stihova. Citata dana: ${counts.daily_quotes}. Molitava: ${counts.prayers}. Kalendar: ${data?.meta.calendar_years?.replace(',', ', ')}.`,
          )}
        </T>
      ) : null}
      <T variant="small" muted style={{ marginTop: space.s }}>
        {ui(
          'Prevod Daničić-Karadžić sadrži 66 knjiga. Nekanonske (anagignoskomene) knjige pravoslavnog Starog zaveta – Tovit, Judita, Premudrost Solomonova, Premudrost Isusa sina Sirahova, Varuh, Makavejske i druge – nisu uključene jer nije pronađen njihov tekst sa jasnim pravom distribucije.',
        )}
      </T>

      <SectionTitle>{ui('Izvori i licence')}</SectionTitle>
      {data?.sources.map((s) => (
        <View key={s.id} style={{ paddingVertical: space.m, borderBottomColor: colors.line, borderBottomWidth: 1, gap: 2 }}>
          <T variant="label">{c(s.title)}</T>
          {s.edition ? (
            <T variant="small" muted>
              {c(s.edition)}
            </T>
          ) : null}
          <T variant="small">{c(s.license)}</T>
          {s.coverage ? (
            <T variant="small" muted>
              {c(s.coverage)}
            </T>
          ) : null}
          {s.notes ? (
            <T variant="small" muted>
              {c(s.notes)}
            </T>
          ) : null}
          <T variant="caption" muted>
            {ui(`Preuzeto: ${s.retrieved_at}`)}
          </T>
          {s.url ? (
            <T variant="caption" color={colors.gold} accessibilityRole="link" onPress={() => Linking.openURL(s.url!)}>
              {s.url.length > 70 ? `${s.url.slice(0, 70)}…` : s.url}
            </T>
          ) : null}
        </View>
      ))}
      <T variant="caption" muted style={{ marginTop: space.l }}>
        {ui('Fontovi Alegreya i Alegreya Sans (Huerta Tipográfica), SIL Open Font License 1.1.')}
      </T>
    </Screen>
  );
}
