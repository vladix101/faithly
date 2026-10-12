import { router } from 'expo-router';

import { PlatformSections } from '@/components/platform-sections';
import { ReminderSettings } from '@/components/reminder-settings';
import { Stepper } from '@/components/stepper';
import { Row, Screen, Segmented, SectionTitle, T } from '@/components/ui';
import { useApp, type Script, type ThemePref } from '@/state/app';
import { space } from '@/theme/tokens';

export default function SettingsScreen() {
  const { settings, update, ui } = useApp();

  return (
    <Screen edges={['bottom']}>
      <SectionTitle style={{ marginTop: space.s }}>{ui('Pismo')}</SectionTitle>
      <Segmented<Script>
        value={settings.script}
        onChange={(v) => update('script', v)}
        options={[
          { value: 'lat', label: 'Latinica' },
          { value: 'cyr', label: 'Ћирилица' },
        ]}
      />
      <T variant="caption" muted style={{ marginTop: space.s }}>
        {ui('Tekst Biblije se čuva u originalu (ćirilica) i preslovljava samo pri prikazu.')}
      </T>

      <SectionTitle>{ui('Tema')}</SectionTitle>
      <Segmented<ThemePref>
        value={settings.theme}
        onChange={(v) => update('theme', v)}
        options={[
          { value: 'system', label: ui('Sistemska') },
          { value: 'light', label: ui('Svetla') },
          { value: 'dark', label: ui('Tamna') },
        ]}
      />

      <SectionTitle>{ui('Veličina teksta za čitanje')}</SectionTitle>
      <Stepper
        label={ui('veličina')}
        value={`${Math.round(settings.readingScale * 100)}%`}
        minusLabel={ui('Smanji tekst')}
        plusLabel={ui('Povećaj tekst')}
        onMinus={() => update('readingScale', Math.max(0.8, Math.round((settings.readingScale - 0.1) * 10) / 10))}
        onPlus={() => update('readingScale', Math.min(1.8, Math.round((settings.readingScale + 0.1) * 10) / 10))}
      />
      <T variant="caption" muted style={{ marginTop: space.s }}>
        {ui('Aplikacija prati i sistemsko povećanje teksta.')}
      </T>

      <SectionTitle>{ui('Podsetnici')}</SectionTitle>
      <ReminderSettings />

      <PlatformSections />

      <SectionTitle>{ui('Više')}</SectionTitle>
      <Row icon="information-circle-outline" title={ui('O aplikaciji i izvorima')} onPress={() => router.push('/about')} />
    </Screen>
  );
}
